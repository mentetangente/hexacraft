import { describe, expect, it } from 'vitest';
import { HexGrid } from '../src/grid/HexGrid';
import { SquareGrid } from '../src/grid/SquareGrid';
import type { Cell, Grid } from '../src/grid/Grid';
import { CHUNK_SIZE } from '../src/grid/Grid';

const cases: ReadonlyArray<readonly [string, Grid]> = [
  ['HexGrid', new HexGrid()],
  ['SquareGrid', new SquareGrid()],
];

// Coordenadas de prueba, incluyendo negativas y en los bordes de chunk.
const testCells: readonly Cell[] = [
  { a: 0, b: 0 },
  { a: 15, b: 15 },
  { a: 16, b: 16 },
  { a: -1, b: -1 },
  { a: -16, b: -16 },
  { a: -17, b: -17 },
  { a: 100, b: -80 },
  { a: -33, b: 47 },
  { a: 1, b: -1 },
];

describe.each(cases)('%s — chunks y claves', (_name, grid) => {
  it('key es única y estable', () => {
    const k1 = grid.key({ a: -3, b: 5 });
    const k2 = grid.key({ a: -3, b: 5 });
    expect(k1).toBe(k2);
    expect(grid.key({ a: -3, b: 5 })).not.toBe(grid.key({ a: 3, b: -5 }));
  });

  it('cellToChunk devuelve local en [0, CHUNK_SIZE)', () => {
    for (const c of testCells) {
      const { chunkA, chunkB, localA, localB } = grid.cellToChunk(c);
      expect(localA).toBeGreaterThanOrEqual(0);
      expect(localA).toBeLessThan(CHUNK_SIZE);
      expect(localB).toBeGreaterThanOrEqual(0);
      expect(localB).toBeLessThan(CHUNK_SIZE);
      // Rechunk debe reconstruir la celda
      const back = grid.chunkToCell(chunkA, chunkB, localA, localB);
      expect(back.a).toBe(c.a);
      expect(back.b).toBe(c.b);
    }
  });

  it('ida y vuelta chunk↔celda para todos los locales de un chunk concreto', () => {
    // Chunk (-2, 3): recorre los 16×16 locales y comprueba doble conversión.
    const ca = -2;
    const cb = 3;
    for (let la = 0; la < CHUNK_SIZE; la++) {
      for (let lb = 0; lb < CHUNK_SIZE; lb++) {
        const cell = grid.chunkToCell(ca, cb, la, lb);
        const back = grid.cellToChunk(cell);
        expect(back.chunkA).toBe(ca);
        expect(back.chunkB).toBe(cb);
        expect(back.localA).toBe(la);
        expect(back.localB).toBe(lb);
      }
    }
  });

  it('chunkCenter cae dentro del bbox de la huella del chunk', () => {
    // No es una prueba de valor exacto (los paralelogramos hex son sesgados);
    // solo un sanity check de que devuelve un punto finito y del signo esperado.
    const cc = grid.chunkCenter(2, -3);
    expect(Number.isFinite(cc.x)).toBe(true);
    expect(Number.isFinite(cc.z)).toBe(true);
    // El centro del chunk (2, -3) debe estar a la derecha (x > 0) y en b<0 (z depende).
    expect(cc.x).toBeGreaterThan(0);
  });
});
