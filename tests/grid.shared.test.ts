import { describe, expect, it } from 'vitest';
import { HexGrid } from '../src/grid/HexGrid';
import { SquareGrid } from '../src/grid/SquareGrid';
import type { Cell, Grid, Point2 } from '../src/grid/Grid';
import { signedAreaXZ } from '../src/grid/Grid';

const cases: ReadonlyArray<readonly [string, Grid]> = [
  ['HexGrid', new HexGrid()],
  ['SquareGrid', new SquareGrid()],
];

const someCells: readonly Cell[] = [
  { a: 0, b: 0 },
  { a: 1, b: 0 },
  { a: -3, b: 2 },
  { a: 5, b: -2 },
  { a: 4, b: 4 },
  { a: -7, b: -1 },
  { a: 12, b: -8 },
];

function cellsEqual(a: Cell, b: Cell): boolean {
  return a.a === b.a && a.b === b.b;
}

describe.each(cases)('%s — invariantes comunes', (_name, grid) => {
  it('ida y vuelta: cellAt(center(c)) === c', () => {
    for (const c of someCells) {
      const back = grid.cellAt(grid.center(c));
      expect(back).toEqual(c);
    }
  });

  it('el número y la distancia de los vecinos son consistentes', () => {
    expect(grid.neighborDirections().length).toBe(grid.neighborCount);
    for (const c of someCells) {
      const ns = grid.neighbors(c);
      expect(ns.length).toBe(grid.neighborCount);
      for (const n of ns) {
        expect(grid.distance(c, n)).toBe(1);
      }
    }
  });

  it('área con signo de footprintLocal = +1 (CCW visto desde +Y)', () => {
    const area = signedAreaXZ(grid.footprintLocal());
    expect(area).toBeGreaterThan(0);
    expect(area).toBeCloseTo(1, 10);
  });

  it('tres vértices consecutivos de la tapa superior tienen normal con Y > 0', () => {
    // Prueba directa de la convención que usará el mesher: si construimos el
    // triángulo (a, b, c) del abanico de la tapa en y = 1, la normal
    // (b - a) × (c - a) debe apuntar hacia +Y.
    const fp = grid.footprintLocal();
    for (let i = 0; i < fp.length; i++) {
      const a = { x: fp[i].x, y: 1, z: fp[i].z };
      const b = { x: fp[(i + 1) % fp.length].x, y: 1, z: fp[(i + 1) % fp.length].z };
      const c = { x: fp[(i + 2) % fp.length].x, y: 1, z: fp[(i + 2) % fp.length].z };
      // Los tres puntos están a la misma altura y = 1, así que la componente Y
      // del producto vectorial se reduce a (ez * fx - ex * fz).
      const ex = b.x - a.x;
      const ez = b.z - a.z;
      const fx = c.x - a.x;
      const fz = c.z - a.z;
      const ny = ez * fx - ex * fz;
      expect(ny).toBeGreaterThan(0);
    }
  });

  it('footprint(c) coincide con footprintLocal trasladado al centro', () => {
    const local = grid.footprintLocal();
    for (const c of someCells) {
      const ctr = grid.center(c);
      const fp = grid.footprint(c);
      expect(fp).toHaveLength(local.length);
      for (let i = 0; i < local.length; i++) {
        expect(fp[i].x).toBeCloseTo(local[i].x + ctr.x, 12);
        expect(fp[i].z).toBeCloseTo(local[i].z + ctr.z, 12);
      }
    }
  });

  it('cellAt cerca de un vértice devuelve la celda que lo contiene', () => {
    // Para cada vértice de la huella, un punto un poco hacia el centro debe caer
    // en la celda. Repetimos para varias celdas.
    for (const c of someCells) {
      const ctr = grid.center(c);
      const fp = grid.footprint(c);
      for (const v of fp) {
        const towardCenter: Point2 = {
          x: v.x + (ctr.x - v.x) * 0.02,
          z: v.z + (ctr.z - v.z) * 0.02,
        };
        expect(grid.cellAt(towardCenter)).toEqual(c);
      }
    }
  });

  it('cellAt cerca del punto medio de una arista devuelve la celda que lo contiene', () => {
    for (const c of someCells) {
      const ctr = grid.center(c);
      const fp = grid.footprint(c);
      for (let i = 0; i < fp.length; i++) {
        const a = fp[i];
        const b = fp[(i + 1) % fp.length];
        const mid: Point2 = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
        const towardCenter: Point2 = {
          x: mid.x + (ctr.x - mid.x) * 0.02,
          z: mid.z + (ctr.z - mid.z) * 0.02,
        };
        expect(grid.cellAt(towardCenter)).toEqual(c);
      }
    }
  });

  it('line: cada par consecutivo son vecinos y la longitud es distance + 1', () => {
    const pairs: ReadonlyArray<readonly [Cell, Cell]> = [
      [{ a: 0, b: 0 }, { a: 5, b: -3 }],
      [{ a: -2, b: 4 }, { a: 3, b: 3 }],
      [{ a: 1, b: 1 }, { a: 1, b: 1 }],
      [{ a: 0, b: 0 }, { a: 0, b: -6 }],
      [{ a: -4, b: -2 }, { a: 7, b: 5 }],
    ];
    for (const [p, q] of pairs) {
      const line = grid.line(p, q);
      expect(line.length).toBe(grid.distance(p, q) + 1);
      expect(cellsEqual(line[0], p)).toBe(true);
      expect(cellsEqual(line[line.length - 1], q)).toBe(true);
      for (let i = 1; i < line.length; i++) {
        expect(grid.distance(line[i - 1], line[i])).toBe(1);
      }
    }
  });

  it('ring(c, 0) = [c]; disk(c, 0) = [c]', () => {
    const c: Cell = { a: 2, b: -1 };
    expect(grid.ring(c, 0)).toEqual([c]);
    expect(grid.disk(c, 0)).toEqual([c]);
  });

  it('normaliza -0 a +0 en cellAt', () => {
    // Puntos cuyo redondeo produce -0 en al menos una coordenada.
    const pts: readonly Point2[] = [
      { x: -0, z: -0 },
      { x: -0.1, z: -0.05 },
    ];
    for (const p of pts) {
      const c = grid.cellAt(p);
      expect(Object.is(c.a, -0)).toBe(false);
      expect(Object.is(c.b, -0)).toBe(false);
    }
  });
});
