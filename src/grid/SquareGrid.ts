import type { Cell, ChunkLocal, Grid, Point2 } from './Grid';
import {
  CHUNK_SIZE,
  cellKey,
  cellToChunkLocal,
  chunkLocalToCell,
  makeCell,
  makePoint,
} from './Grid';

// Solo 4 vecinos: las diagonales no cuentan a propósito (parte del contraste del vídeo).
// El orden se elige para que DIRS[i] sea el vecino que hay al otro lado de la arista i
// de footprintLocal(): el mesher lo aprovecha para saber qué cara laterales culling.
const DIRS: readonly Cell[] = [
  { a: 0, b: -1 }, // arista 0: (0.5,-0.5)→(-0.5,-0.5) mira a -Z
  { a: -1, b: 0 }, // arista 1: (-0.5,-0.5)→(-0.5,+0.5) mira a -X
  { a: 0, b: +1 }, // arista 2: (-0.5,+0.5)→(+0.5,+0.5) mira a +Z
  { a: +1, b: 0 }, // arista 3: (+0.5,+0.5)→(+0.5,-0.5) mira a +X
];

export class SquareGrid implements Grid {
  readonly kind = 'square' as const;
  readonly neighborCount = 4 as const;

  center(c: Cell): Point2 {
    return makePoint(c.a, c.b);
  }

  cellAt(p: Point2): Cell {
    return makeCell(Math.round(p.x), Math.round(p.z));
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
    return this.center({ a: midA, b: midB });
  }

  neighborDirections(): readonly Cell[] {
    return DIRS;
  }

  neighbors(c: Cell): Cell[] {
    return DIRS.map((d) => makeCell(c.a + d.a, c.b + d.b));
  }

  footprintLocal(): readonly Point2[] {
    // CCW visto desde +Y: signedAreaXZ da +1.
    return [
      makePoint(+0.5, -0.5),
      makePoint(-0.5, -0.5),
      makePoint(-0.5, +0.5),
      makePoint(+0.5, +0.5),
    ];
  }

  footprint(c: Cell): Point2[] {
    return this.footprintLocal().map((p) => makePoint(p.x + c.a, p.z + c.b));
  }

  // Distancia Manhattan: coherente con 4-conectividad.
  distance(a: Cell, b: Cell): number {
    return Math.abs(a.a - b.a) + Math.abs(a.b - b.b);
  }

  // Línea 4-conexa: cada paso es de un solo eje. Nunca pasos en diagonal.
  line(a: Cell, b: Cell): Cell[] {
    const dx = b.a - a.a;
    const dy = b.b - a.b;
    const ax = Math.abs(dx);
    const ay = Math.abs(dy);
    const sx = Math.sign(dx);
    const sy = Math.sign(dy);
    let x = a.a;
    let y = a.b;
    const cells: Cell[] = [makeCell(x, y)];
    let ix = 0;
    let iy = 0;
    while (ix < ax || iy < ay) {
      // Elegimos eje minimizando avance normalizado: comparamos (2·ix+1)/ax vs (2·iy+1)/ay
      // multiplicando en cruz para evitar divisiones.
      const stepX = ix < ax && (iy >= ay || (2 * ix + 1) * ay < (2 * iy + 1) * ax);
      if (stepX) {
        x += sx;
        ix++;
      } else {
        y += sy;
        iy++;
      }
      cells.push(makeCell(x, y));
    }
    return cells;
  }

  // Anillo Manhattan: rombo de perímetro 4·radius.
  ring(c: Cell, radius: number): Cell[] {
    if (radius <= 0) return radius === 0 ? [makeCell(c.a, c.b)] : [];
    const walk: ReadonlyArray<readonly [number, number]> = [
      [-1, +1],
      [-1, -1],
      [+1, -1],
      [+1, +1],
    ];
    const results: Cell[] = [];
    let x = radius;
    let y = 0;
    for (const [dx, dy] of walk) {
      for (let j = 0; j < radius; j++) {
        results.push(makeCell(c.a + x, c.b + y));
        x += dx;
        y += dy;
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
    const r2 = radius * radius;
    const aMin = Math.floor(centerWorld.x - radius);
    const aMax = Math.ceil(centerWorld.x + radius);
    const bMin = Math.floor(centerWorld.z - radius);
    const bMax = Math.ceil(centerWorld.z + radius);
    const cells: Cell[] = [];
    for (let b = bMin; b <= bMax; b++) {
      for (let a = aMin; a <= aMax; a++) {
        const dx = a - centerWorld.x;
        const dz = b - centerWorld.z;
        if (dx * dx + dz * dz <= r2) cells.push(makeCell(a, b));
      }
    }
    return cells;
  }
}
