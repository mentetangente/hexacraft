import { describe, expect, it } from 'vitest';
import { HEX_R, HexGrid } from '../src/grid/HexGrid';
import type { Cell } from '../src/grid/Grid';

const grid = new HexGrid();

describe('HexGrid', () => {
  it('R hace que el hexágono tenga área 1', () => {
    // Área regular = 3·√3/2 · R²
    const area = (3 * Math.sqrt(3) * HEX_R * HEX_R) / 2;
    expect(area).toBeCloseTo(1, 12);
  });

  it('ring(c, n) tiene 6·n celdas para n > 0', () => {
    const c: Cell = { a: 2, b: -1 };
    for (let n = 1; n <= 6; n++) {
      const r = grid.ring(c, n);
      expect(r.length).toBe(6 * n);
      for (const cell of r) {
        expect(grid.distance(c, cell)).toBe(n);
      }
    }
  });

  it('disk(c, n) tiene 3·n·(n+1) + 1 celdas', () => {
    const c: Cell = { a: -2, b: 3 };
    for (let n = 0; n <= 6; n++) {
      const d = grid.disk(c, n);
      expect(d.length).toBe(3 * n * (n + 1) + 1);
    }
  });

  it('distance con la fórmula cúbica', () => {
    expect(grid.distance({ a: 0, b: 0 }, { a: 3, b: -1 })).toBe(3);
    expect(grid.distance({ a: 0, b: 0 }, { a: -2, b: -2 })).toBe(4);
    expect(grid.distance({ a: 1, b: 2 }, { a: 1, b: 2 })).toBe(0);
  });

  it('cubeRound normaliza -0 en cellAt', () => {
    // Un punto muy pequeño cerca del origen pero con signo negativo en x.
    const c = grid.cellAt({ x: -1e-9, z: 0 });
    expect(c).toEqual({ a: 0, b: 0 });
    expect(Object.is(c.a, -0)).toBe(false);
    expect(Object.is(c.b, -0)).toBe(false);
  });

  it('cellsInCircle: radio 0 devuelve solo la celda del centro exacto', () => {
    // Centro de la celda (0,0) es (0,0). Radio 0 debe devolver esa celda.
    expect(grid.cellsInCircle({ x: 0, z: 0 }, 0)).toEqual([{ a: 0, b: 0 }]);
  });

  it('cellsInCircle: radio pequeño devuelve solo la celda del origen', () => {
    // El vecino más cercano está a distancia sqrt(3)·R ≈ 1.0746. Con radio 1
    // solo cabe la celda (0,0).
    const cells = grid.cellsInCircle({ x: 0, z: 0 }, 1);
    expect(cells).toEqual([{ a: 0, b: 0 }]);
  });

  it('cellsInCircle: radio mayor incluye vecinos por distancia euclídea', () => {
    // Con radio 1.5 caben la celda central y sus 6 vecinos (todos a ≈1.0746).
    const cells = grid.cellsInCircle({ x: 0, z: 0 }, 1.5);
    expect(cells.length).toBe(7);
  });

  it('cellsInCircle: todas las celdas devueltas cumplen la distancia', () => {
    const centro = { x: 3.7, z: -2.1 };
    const radio = 4.2;
    const cells = grid.cellsInCircle(centro, radio);
    for (const c of cells) {
      const p = grid.center(c);
      const d = Math.hypot(p.x - centro.x, p.z - centro.z);
      expect(d).toBeLessThanOrEqual(radio + 1e-9);
    }
    // Y ninguna celda cercana por fuera del radio quedó dentro.
    // Comprobación auxiliar: el conjunto es único.
    const key = (c: Cell): string => `${c.a},${c.b}`;
    const set = new Set(cells.map(key));
    expect(set.size).toBe(cells.length);
  });
});
