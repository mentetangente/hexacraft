import { describe, expect, it } from 'vitest';
import {
  buildArcLengthTable,
  makeEmptyPath,
  samplePath,
  samplePositionRaw,
  sampleOrientationRaw,
  type CameraPath,
  type Keyframe,
} from '../src/state/cameraPath';

const KFS: Keyframe[] = [
  { x: 0, y: 0, z: 0, yaw: 0, pitch: 0 },
  { x: 10, y: 5, z: 3, yaw: 0.5, pitch: -0.2 },
  { x: 20, y: 8, z: 6, yaw: 1.0, pitch: 0 },
  { x: 30, y: 4, z: 9, yaw: 1.5, pitch: 0.3 },
];

describe('cameraPath: interpolación', () => {
  it('pasa exactamente por cada fotograma clave (posición)', () => {
    const segs = KFS.length - 1;
    for (let i = 0; i < KFS.length; i++) {
      const u = i / segs;
      const [x, y, z] = samplePositionRaw(KFS, u);
      expect(x).toBeCloseTo(KFS[i].x, 6);
      expect(y).toBeCloseTo(KFS[i].y, 6);
      expect(z).toBeCloseTo(KFS[i].z, 6);
    }
  });

  it('pasa exactamente por cada fotograma clave (orientación)', () => {
    const segs = KFS.length - 1;
    for (let i = 0; i < KFS.length; i++) {
      const u = i / segs;
      const { yaw, pitch } = sampleOrientationRaw(KFS, u);
      expect(yaw).toBeCloseTo(KFS[i].yaw, 6);
      expect(pitch).toBeCloseTo(KFS[i].pitch, 6);
    }
  });

  it('es continua: no hay saltos bruscos entre muestras adyacentes', () => {
    let last = samplePositionRaw(KFS, 0);
    for (let i = 1; i < 500; i++) {
      const u = i / 499;
      const cur = samplePositionRaw(KFS, u);
      const jump = Math.hypot(cur[0] - last[0], cur[1] - last[1], cur[2] - last[2]);
      expect(jump).toBeLessThan(1.5);
      last = cur;
    }
  });

  it('velocidad constante: samplePath en t=0 y t=duration/2 recorre aprox la mitad del arco', () => {
    const path: CameraPath = {
      keyframes: KFS,
      duration: 10,
      loop: false,
      startDelay: 0,
    };
    const table = buildArcLengthTable(KFS);
    const total = table.s[table.s.length - 1];
    const half = samplePath(path, table, 5);
    expect(half).not.toBeNull();
    // Con smoothstep, en t=duración/2 (progress=0.5) tenemos eased=0.5, así
    // que estamos aproximadamente a la mitad del arco recorrido.
    const [x, y, z] = half!.pos;
    // Distancia acumulada desde el inicio: acumula muestras densas.
    let acc = 0;
    let [ax, ay, az] = samplePositionRaw(KFS, 0);
    const N = 1000;
    for (let i = 1; i < N; i++) {
      const [nx, ny, nz] = samplePositionRaw(KFS, i / (N - 1));
      const d = Math.hypot(nx - ax, ny - ay, nz - az);
      acc += d;
      if (Math.abs(nx - x) < 0.1 && Math.abs(ny - y) < 0.1 && Math.abs(nz - z) < 0.1) {
        break;
      }
      ax = nx;
      ay = ny;
      az = nz;
    }
    expect(acc / total).toBeGreaterThan(0.3);
    expect(acc / total).toBeLessThan(0.7);
  });

  it('startDelay: durante el retardo, mantiene el primer keyframe', () => {
    const path: CameraPath = { keyframes: KFS, duration: 10, loop: false, startDelay: 2 };
    const table = buildArcLengthTable(KFS);
    const s = samplePath(path, table, 1);
    expect(s).not.toBeNull();
    expect(s!.pos[0]).toBeCloseTo(KFS[0].x, 6);
    expect(s!.pos[1]).toBeCloseTo(KFS[0].y, 6);
    expect(s!.pos[2]).toBeCloseTo(KFS[0].z, 6);
  });

  it('no loop: samplePath(t > startDelay+duration) devuelve null', () => {
    const path: CameraPath = { keyframes: KFS, duration: 5, loop: false, startDelay: 1 };
    const table = buildArcLengthTable(KFS);
    expect(samplePath(path, table, 7)).toBeNull();
  });

  it('loop: samplePath vuelve al principio cíclicamente', () => {
    const path: CameraPath = { keyframes: KFS, duration: 5, loop: true, startDelay: 0 };
    const table = buildArcLengthTable(KFS);
    const s1 = samplePath(path, table, 0.001);
    const s2 = samplePath(path, table, 5.001); // una vuelta completa después
    expect(s1).not.toBeNull();
    expect(s2).not.toBeNull();
    expect(s2!.pos[0]).toBeCloseTo(s1!.pos[0], 3);
    expect(s2!.pos[1]).toBeCloseTo(s1!.pos[1], 3);
    expect(s2!.pos[2]).toBeCloseTo(s1!.pos[2], 3);
  });

  it('path vacío: makeEmptyPath crea uno sin fotogramas', () => {
    const p = makeEmptyPath();
    expect(p.keyframes).toEqual([]);
    expect(p.duration).toBeGreaterThan(0);
    const t = buildArcLengthTable([]);
    expect(samplePath(p, t, 0)).toBeNull();
  });
});
