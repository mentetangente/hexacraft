import { describe, expect, it } from 'vitest';
import { HexGrid, SquareGrid } from '../src/grid';
import { Terrain, generateChunk } from '../src/world/terrain';
import { Block } from '../src/world/blocks';

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

  it('la lista de árboles aceptados es idéntica en las dos rejillas y cada punto tiene tronco en cellAt(punto)', () => {
    const seed = 20260924;
    const terrain = new Terrain(seed);
    const hex = new HexGrid();
    const sq = new SquareGrid();

    // Rango de celdas gruesas -> aprox 40×40 unidades de mundo.
    const trees = terrain.enumerateTrees(-4, -4, 4, 4);
    expect(trees.length).toBeGreaterThan(0);
    // enumerateTrees no toma rejilla: dos llamadas iguales devuelven lo mismo.
    expect(terrain.enumerateTrees(-4, -4, 4, 4)).toEqual(trees);

    // Distancia mínima entre árboles ≥ 3 (dos coarse cells cualesquiera).
    for (let i = 0; i < trees.length; i++) {
      for (let j = i + 1; j < trees.length; j++) {
        const dx = trees[i].px - trees[j].px;
        const dz = trees[i].pz - trees[j].pz;
        const d = Math.hypot(dx, dz);
        expect(d).toBeGreaterThanOrEqual(3);
      }
    }

    // Cada árbol coloca su tronco en cellAt(punto) en ambas rejillas.
    for (const t of trees) {
      for (const grid of [hex, sq]) {
        const treeCell = grid.cellAt({ x: t.px, z: t.pz });
        const cl = grid.cellToChunk(treeCell);
        const chunk = generateChunk(grid, terrain, cl.chunkA, cl.chunkB);
        // El bloque justo encima del suelo (top + 1) debe ser Log.
        expect(chunk.get(cl.localA, cl.localB, t.top + 1)).toBe(Block.Log);
      }
    }
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
