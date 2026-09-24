// Recorrido de cámara: interpolación pura y testeable, sin three.js.
//
// - Posición: Catmull-Rom (uniforme, endpoints repetidos como controles).
//   La curva pasa exactamente por cada keyframe.
// - Orientación: slerp de cuaterniones (yaw + pitch → quat), asegurando
//   continuidad angular y sin gimbal.
// - Reparametrización por longitud de arco: velocidad constante a lo largo
//   del recorrido.
// - Aceleración/frenado suaves con smoothstep sobre el tiempo.
// - Bucle opcional y retardo inicial.

export interface Keyframe {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly yaw: number;
  readonly pitch: number;
}

export interface CameraPath {
  readonly keyframes: readonly Keyframe[];
  readonly duration: number; // segundos (excluye startDelay)
  readonly loop: boolean;
  readonly startDelay: number; // segundos con la cámara detenida al inicio
}

export const DEFAULT_DURATION = 20;
export const DEFAULT_START_DELAY = 2;

export function makeEmptyPath(): CameraPath {
  return { keyframes: [], duration: DEFAULT_DURATION, loop: false, startDelay: DEFAULT_START_DELAY };
}

// ---------- Catmull-Rom uniforme ----------

function catmull(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return (
    0.5 *
    (2 * p1 +
      (-p0 + p2) * t +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
      (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
  );
}

// Posición cruda por parámetro u ∈ [0, 1] a lo largo de la sucesión de
// keyframes (sin corrección de longitud de arco).
export function samplePositionRaw(
  kfs: readonly Keyframe[],
  u: number,
): [number, number, number] {
  if (kfs.length === 0) return [0, 0, 0];
  if (kfs.length === 1) return [kfs[0].x, kfs[0].y, kfs[0].z];
  const segs = kfs.length - 1;
  const uu = u <= 0 ? 0 : u >= 1 ? 1 - 1e-12 : u;
  const idxF = uu * segs;
  const i = Math.min(Math.floor(idxF), segs - 1);
  const t = idxF - i;
  const p0 = i > 0 ? kfs[i - 1] : kfs[i];
  const p1 = kfs[i];
  const p2 = kfs[i + 1];
  const p3 = i + 2 < kfs.length ? kfs[i + 2] : kfs[i + 1];
  return [
    catmull(p0.x, p1.x, p2.x, p3.x, t),
    catmull(p0.y, p1.y, p2.y, p3.y, t),
    catmull(p0.z, p1.z, p2.z, p3.z, t),
  ];
}

// ---------- Cuaterniones y slerp ----------

type Quat = readonly [number, number, number, number]; // (w, x, y, z)

// Orden YXZ (yaw sobre Y, pitch sobre X), para que coincida con
// player/controls.ts.
function eulerToQuat(yaw: number, pitch: number): Quat {
  const cy = Math.cos(yaw * 0.5);
  const sy = Math.sin(yaw * 0.5);
  const cp = Math.cos(pitch * 0.5);
  const sp = Math.sin(pitch * 0.5);
  return [cy * cp, cy * sp, sy * cp, -sy * sp];
}

function quatToYawPitch(q: Quat): { yaw: number; pitch: number } {
  // Aprovechamos la estructura de eulerToQuat:
  //   w = cy·cp   x = cy·sp   y = sy·cp   z = −sy·sp
  // y/w = sy/cy = tan(yaw/2), x/w = sp/cp = tan(pitch/2). Así, la recuperación
  // no arrastra el término cruzado que aparecería usando la matriz general.
  const [w, x, y] = q;
  const yaw = 2 * Math.atan2(y, w);
  const pitch = 2 * Math.atan2(x, w);
  return { yaw, pitch };
}

function slerp(a: Quat, b: Quat, t: number): Quat {
  let cos = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  let bb: Quat = b;
  if (cos < 0) {
    bb = [-b[0], -b[1], -b[2], -b[3]];
    cos = -cos;
  }
  if (cos > 0.9995) {
    const r: [number, number, number, number] = [
      a[0] + (bb[0] - a[0]) * t,
      a[1] + (bb[1] - a[1]) * t,
      a[2] + (bb[2] - a[2]) * t,
      a[3] + (bb[3] - a[3]) * t,
    ];
    const n = Math.hypot(r[0], r[1], r[2], r[3]);
    return [r[0] / n, r[1] / n, r[2] / n, r[3] / n];
  }
  const angle = Math.acos(cos);
  const sinA = Math.sin(angle);
  const wa = Math.sin((1 - t) * angle) / sinA;
  const wb = Math.sin(t * angle) / sinA;
  return [
    wa * a[0] + wb * bb[0],
    wa * a[1] + wb * bb[1],
    wa * a[2] + wb * bb[2],
    wa * a[3] + wb * bb[3],
  ];
}

export function sampleOrientationRaw(
  kfs: readonly Keyframe[],
  u: number,
): { yaw: number; pitch: number } {
  if (kfs.length === 0) return { yaw: 0, pitch: 0 };
  if (kfs.length === 1) return { yaw: kfs[0].yaw, pitch: kfs[0].pitch };
  const segs = kfs.length - 1;
  const uu = u <= 0 ? 0 : u >= 1 ? 1 - 1e-12 : u;
  const idxF = uu * segs;
  const i = Math.min(Math.floor(idxF), segs - 1);
  const t = idxF - i;
  const a = eulerToQuat(kfs[i].yaw, kfs[i].pitch);
  const b = eulerToQuat(kfs[i + 1].yaw, kfs[i + 1].pitch);
  return quatToYawPitch(slerp(a, b, t));
}

// ---------- Tabla de longitudes de arco ----------

export interface ArcLengthTable {
  readonly u: Float32Array;
  readonly s: Float32Array; // longitud acumulada
}

export function buildArcLengthTable(
  kfs: readonly Keyframe[],
  samples = 400,
): ArcLengthTable {
  const uArr = new Float32Array(samples);
  const sArr = new Float32Array(samples);
  if (kfs.length < 2) return { u: uArr, s: sArr };
  let [px, py, pz] = samplePositionRaw(kfs, 0);
  let cum = 0;
  uArr[0] = 0;
  sArr[0] = 0;
  for (let i = 1; i < samples; i++) {
    const u = i / (samples - 1);
    const [nx, ny, nz] = samplePositionRaw(kfs, u);
    cum += Math.hypot(nx - px, ny - py, nz - pz);
    uArr[i] = u;
    sArr[i] = cum;
    px = nx;
    py = ny;
    pz = nz;
  }
  return { u: uArr, s: sArr };
}

export function arcLengthToU(table: ArcLengthTable, targetS: number): number {
  const N = table.s.length;
  if (N === 0) return 0;
  const total = table.s[N - 1];
  if (total <= 0) return 0;
  const target = Math.max(0, Math.min(total, targetS));
  let lo = 0;
  let hi = N - 1;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (table.s[mid] < target) lo = mid + 1;
    else hi = mid;
  }
  if (lo === 0) return table.u[0];
  const s0 = table.s[lo - 1];
  const s1 = table.s[lo];
  const u0 = table.u[lo - 1];
  const u1 = table.u[lo];
  const frac = s1 > s0 ? (target - s0) / (s1 - s0) : 0;
  return u0 + (u1 - u0) * frac;
}

// ---------- Smoothstep ----------

export function easeInOut(x: number): number {
  const xx = x < 0 ? 0 : x > 1 ? 1 : x;
  return xx * xx * (3 - 2 * xx);
}

// ---------- Muestreo de alto nivel ----------

export interface Sample {
  readonly pos: readonly [number, number, number];
  readonly yaw: number;
  readonly pitch: number;
}

// Muestra el recorrido en el tiempo `t` (segundos desde que empezó la
// reproducción, incluido el retardo). Devuelve null antes de que empiece o
// después de terminar (solo si !loop).
export function samplePath(
  path: CameraPath,
  table: ArcLengthTable,
  t: number,
): Sample | null {
  if (path.keyframes.length === 0) return null;
  const localT = t - path.startDelay;
  if (localT < 0) {
    // Durante el retardo, mantén la cámara en el primer keyframe.
    const k = path.keyframes[0];
    return { pos: [k.x, k.y, k.z], yaw: k.yaw, pitch: k.pitch };
  }
  let progress = path.duration > 0 ? localT / path.duration : 1;
  if (path.loop) progress = progress - Math.floor(progress);
  else if (progress >= 1) return null;
  const eased = easeInOut(progress);
  const total = table.s.length > 0 ? table.s[table.s.length - 1] : 0;
  const u = arcLengthToU(table, eased * total);
  const [x, y, z] = samplePositionRaw(path.keyframes, u);
  const { yaw, pitch } = sampleOrientationRaw(path.keyframes, u);
  return { pos: [x, y, z], yaw, pitch };
}
