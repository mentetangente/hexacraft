import type { Cell, ChunkLocal, Grid, Point2 } from './Grid';
import {
  CHUNK_SIZE,
  cellKey,
  cellToChunkLocal,
  chunkLocalToCell,
  makeCell,
  makePoint,
} from './Grid';

// Circumradio (= lado) para que el hexágono tenga área 1.
// Área regular = 3·√3/2 · R²  →  R = √(2 / (3·√3)) ≈ 0.6204.
export const HEX_R = Math.sqrt(2 / (3 * Math.sqrt(3)));

const SQRT3 = Math.sqrt(3);

// Direcciones axiales (q, r). Orden usado por ring/line.
const DIRS: readonly Cell[] = [
  { a: +1, b: 0 },
  { a: +1, b: -1 },
  { a: 0, b: -1 },
  { a: -1, b: 0 },
  { a: -1, b: +1 },
  { a: 0, b: +1 },
];

function cubeRound(qf: number, rf: number): Cell {
  const sf = -qf - rf;
  let q = Math.round(qf);
  let r = Math.round(rf);
  const s = Math.round(sf);
  const dq = Math.abs(q - qf);
  const dr = Math.abs(r - rf);
  const ds = Math.abs(s - sf);
  if (dq > dr && dq > ds) q = -r - s;
  else if (dr > ds) r = -q - s;
  // else s se ajusta pero no forma parte de la celda devuelta
  return makeCell(q, r);
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export class HexGrid implements Grid {
  readonly kind = 'hex' as const;
  readonly neighborCount = 6 as const;

  center(c: Cell): Point2 {
    const x = HEX_R * SQRT3 * (c.a + c.b / 2);
    const z = HEX_R * 1.5 * c.b;
    return makePoint(x, z);
  }

  cellAt(p: Point2): Cell {
    const qf = ((SQRT3 / 3) * p.x - p.z / 3) / HEX_R;
    const rf = ((2 / 3) * p.z) / HEX_R;
    return cubeRound(qf, rf);
  }

  equals(a: Cell, b: Cell): boolean {
    return a.a === b.a && a.b === b.b;
  }

  key(c: Cell): string {
    return cellKey(c);
  }

  cellToChunk(c: Cell): ChunkLocal {
    return cellToChunkLocal(c);
  }

  chunkToCell(chunkA: number, chunkB: number, localA: number, localB: number): Cell {
    return chunkLocalToCell(chunkA, chunkB, localA, localB);
  }

  chunkCenter(chunkA: number, chunkB: number): Point2 {
    const midA = chunkA * CHUNK_SIZE + (CHUNK_SIZE - 1) / 2;
    const midB = chunkB * CHUNK_SIZE + (CHUNK_SIZE - 1) / 2;
    // Se usa center() aunque los argumentos no sean enteros; la fórmula es lineal.
    return this.center({ a: midA, b: midB });
  }

  neighborDirections(): readonly Cell[] {
    return DIRS;
  }

  neighbors(c: Cell): Cell[] {
    return DIRS.map((d) => makeCell(c.a + d.a, c.b + d.b));
  }

  footprintLocal(): readonly Point2[] {
    // Ángulo (30° - 60°·i) para que el orden 0..5 sea antihorario visto desde +Y.
    const pts: Point2[] = [];
    for (let i = 0; i < 6; i++) {
      const angle = ((30 - 60 * i) * Math.PI) / 180;
      pts.push(makePoint(HEX_R * Math.cos(angle), HEX_R * Math.sin(angle)));
    }
    return pts;
  }

  footprint(c: Cell): Point2[] {
    const ctr = this.center(c);
    return this.footprintLocal().map((p) => makePoint(p.x + ctr.x, p.z + ctr.z));
  }

  distance(a: Cell, b: Cell): number {
    const dq = a.a - b.a;
    const dr = a.b - b.b;
    const ds = -dq - dr;
    return (Math.abs(dq) + Math.abs(dr) + Math.abs(ds)) / 2;
  }

  line(a: Cell, b: Cell): Cell[] {
    const n = this.distance(a, b);
    if (n === 0) return [makeCell(a.a, a.b)];
    const cells: Cell[] = [];
    // pequeño ε para desempatar en bordes exactos (redblobgames).
    const eps = 1e-6;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const qf = lerp(a.a, b.a, t) + eps;
      const rf = lerp(a.b, b.b, t) + eps;
      cells.push(cubeRound(qf, rf));
    }
    return cells;
  }

  ring(c: Cell, radius: number): Cell[] {
    if (radius <= 0) return radius === 0 ? [makeCell(c.a, c.b)] : [];
    const results: Cell[] = [];
    let cur = makeCell(c.a + DIRS[4].a * radius, c.b + DIRS[4].b * radius);
    for (let side = 0; side < 6; side++) {
      const d = DIRS[side];
      for (let step = 0; step < radius; step++) {
        results.push(cur);
        cur = makeCell(cur.a + d.a, cur.b + d.b);
      }
    }
    return results;
  }

  disk(c: Cell, radius: number): Cell[] {
    const results: Cell[] = [];
    for (let r = 0; r <= radius; r++) results.push(...this.ring(c, r));
    return results;
  }

  cellsInCircle(centerWorld: Point2, radius: number): Cell[] {
    if (radius < 0) return [];
    const cc = this.cellAt(centerWorld);
    // Caja envolvente holgada en coord axial. rSpan y aSpan cubren de sobra
    // el círculo, luego filtramos por distancia euclídea al centro de cada celda.
    const rSpan = Math.ceil(radius / (HEX_R * 1.5)) + 1;
    const aSpan = rSpan + Math.ceil(radius / (HEX_R * SQRT3)) + 1;
    const r2 = radius * radius;
    const cells: Cell[] = [];
    for (let db = -rSpan; db <= rSpan; db++) {
      for (let da = -aSpan; da <= aSpan; da++) {
        const cand = makeCell(cc.a + da, cc.b + db);
        const ctr = this.center(cand);
        const dx = ctr.x - centerWorld.x;
        const dz = ctr.z - centerWorld.z;
        if (dx * dx + dz * dz <= r2) cells.push(cand);
      }
    }
    return cells;
  }
}
