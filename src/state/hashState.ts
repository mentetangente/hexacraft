// Estado de la aplicación serializable en el hash de la URL. Puro y testeable.
// Números con punto decimal y 2 decimales de precisión.

export type GridKind = 'hex' | 'square';
export type PlayerMode = 'walk' | 'fly';

export interface AppState {
  grid: GridKind;
  seed: number;
  pos: { x: number; y: number; z: number };
  yaw: number;
  pitch: number;
  mode: PlayerMode;
  dist: number;
  textured: boolean;
}

const fmt2 = (n: number): string => n.toFixed(2);

export function stateToHash(s: AppState): string {
  // Construimos manualmente para conservar las comas literales en pos/rot
  // (URLSearchParams las codifica como %2C y queda ilegible).
  const parts = [
    `grid=${s.grid}`,
    `seed=${s.seed}`,
    `pos=${fmt2(s.pos.x)},${fmt2(s.pos.y)},${fmt2(s.pos.z)}`,
    `rot=${fmt2(s.yaw)},${fmt2(s.pitch)}`,
    `mode=${s.mode}`,
    `dist=${s.dist}`,
    `tex=${s.textured ? '1' : '0'}`,
  ];
  return '#' + parts.join('&');
}

export function hashToState(hash: string): Partial<AppState> | null {
  try {
    const s = hash.replace(/^#/, '');
    if (!s) return null;
    const p = new URLSearchParams(s);
    const out: Partial<AppState> = {};

    const grid = p.get('grid');
    if (grid === 'hex' || grid === 'square') out.grid = grid;

    const seed = p.get('seed');
    if (seed !== null) {
      const n = parseInt(seed, 10);
      if (Number.isFinite(n)) out.seed = n;
    }

    const pos = p.get('pos');
    if (pos) {
      const parts = pos.split(',').map((v) => parseFloat(v));
      if (parts.length === 3 && parts.every((n) => Number.isFinite(n))) {
        out.pos = { x: parts[0], y: parts[1], z: parts[2] };
      }
    }

    const rot = p.get('rot');
    if (rot) {
      const parts = rot.split(',').map((v) => parseFloat(v));
      if (parts.length === 2 && parts.every((n) => Number.isFinite(n))) {
        out.yaw = parts[0];
        out.pitch = parts[1];
      }
    }

    const mode = p.get('mode');
    if (mode === 'walk' || mode === 'fly') out.mode = mode;

    const dist = p.get('dist');
    if (dist !== null) {
      const n = parseInt(dist, 10);
      if (Number.isFinite(n)) out.dist = n;
    }

    const tex = p.get('tex');
    if (tex === '1') out.textured = true;
    else if (tex === '0') out.textured = false;

    return out;
  } catch {
    return null;
  }
}
