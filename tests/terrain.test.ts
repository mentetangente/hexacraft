import { describe, expect, it } from 'vitest';
import { HexGrid, SquareGrid } from '../src/grid';
import { Terrain } from '../src/world/terrain';

describe('Terrain', () => {
  it('la misma semilla da la misma altura en el mismo punto del mundo', () => {
    const seed = 424242;
    const t1 = new Terrain(seed);
    const t2 = new Terrain(seed);
    for (const [x, z] of [
      [0, 0],
      [12.5, -3.2],
      [-40.7, 17.9],
      [200, 200],
    ]) {
      expect(t1.heightAt(x, z)).toBe(t2.heightAt(x, z));
    }
  });

  it('la altura NO depende de la rejilla: se calcula sobre coord de mundo', () => {
    // La rejilla no interviene en heightAt: usamos posiciones del mundo obtenidas
    // por dos caminos distintos (una celda hex, una celda cuadrada) y una tercera
    // arbitraria. El test principal es que heightAt es una función pura de (x, z).
    const seed = 9999;
    const t = new Terrain(seed);
    const hex = new HexGrid();
    const sq = new SquareGrid();
    // Ambas rejillas comparten el punto de mundo (0, 0) (centro de la celda (0,0)).
    const h1 = t.heightAt(hex.center({ a: 0, b: 0 }).x, hex.center({ a: 0, b: 0 }).z);
    const h2 = t.heightAt(sq.center({ a: 0, b: 0 }).x, sq.center({ a: 0, b: 0 }).z);
    expect(h1).toBe(h2);
  });

  it('las alturas son enteros en un rango razonable', () => {
    const t = new Terrain(7);
    let min = Infinity;
    let max = -Infinity;
    for (let x = -50; x <= 50; x += 2) {
      for (let z = -50; z <= 50; z += 2) {
        const h = t.heightAt(x, z);
        expect(Number.isInteger(h)).toBe(true);
        if (h < min) min = h;
        if (h > max) max = h;
      }
    }
    expect(min).toBeGreaterThanOrEqual(1);
    expect(max).toBeLessThan(64);
  });
});
