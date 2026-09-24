import { describe, expect, it } from 'vitest';
import { SquareGrid } from '../src/grid/SquareGrid';
import type { Cell } from '../src/grid/Grid';

const grid = new SquareGrid();

describe('SquareGrid', () => {
  it('ring(c, n) tiene 4·n celdas para n > 0', () => {
    const c: Cell = { a: 1, b: 1 };
    for (let n = 1; n <= 5; n++) {
      const r = grid.ring(c, n);
      expect(r.length).toBe(4 * n);
      for (const cell of r) {
        expect(grid.distance(c, cell)).toBe(n);
      }
    }
  });

  it('disk(c, n) tiene 2·n·(n+1) + 1 celdas (rombo Manhattan)', () => {
    const c: Cell = { a: 0, b: 0 };
    for (let n = 0; n <= 5; n++) {
      const d = grid.disk(c, n);
      expect(d.length).toBe(2 * n * (n + 1) + 1);
    }
  });

  it('distance es Manhattan', () => {
    expect(grid.distance({ a: 0, b: 0 }, { a: 3, b: 4 })).toBe(7);
    expect(grid.distance({ a: -2, b: 5 }, { a: 1, b: 5 })).toBe(3);
    expect(grid.distance({ a: 2, b: 2 }, { a: 2, b: 2 })).toBe(0);
  });

  it('line no da pasos en diagonal', () => {
    // Con dx=3, dy=4 la línea Manhattan tiene 8 celdas y ningún paso diagonal.
    const line = grid.line({ a: 0, b: 0 }, { a: 3, b: 4 });
    expect(line.length).toBe(8);
    for (let i = 1; i < line.length; i++) {
      const da = Math.abs(line[i].a - line[i - 1].a);
      const db = Math.abs(line[i].b - line[i - 1].b);
      expect(da + db).toBe(1);
    }
  });

  it('cellsInCircle: radio 0.999 desde el origen solo incluye (0,0)', () => {
    const cells = grid.cellsInCircle({ x: 0, z: 0 }, 0.999);
    expect(cells).toEqual([{ a: 0, b: 0 }]);
  });

  it('cellsInCircle: radio 1 incluye la celda y sus 4 vecinos ortogonales', () => {
    const cells = grid.cellsInCircle({ x: 0, z: 0 }, 1);
    expect(cells.length).toBe(5);
  });

  it('cellsInCircle: radio √2 incluye también los 4 diagonales', () => {
    const cells = grid.cellsInCircle({ x: 0, z: 0 }, Math.SQRT2);
    expect(cells.length).toBe(9);
  });

  it('cellAt normaliza -0 a +0', () => {
    const c = grid.cellAt({ x: -0.1, z: -0.2 });
    expect(c).toEqual({ a: 0, b: 0 });
    expect(Object.is(c.a, -0)).toBe(false);
    expect(Object.is(c.b, -0)).toBe(false);
  });
});
