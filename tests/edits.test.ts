import { describe, expect, it } from 'vitest';
import { HexGrid, SquareGrid } from '../src/grid';
import type { Grid } from '../src/grid';
import { WorldEdits } from '../src/interact/edits';
import { Block } from '../src/world/blocks';
import { Terrain, generateChunk } from '../src/world/terrain';

const grids: ReadonlyArray<readonly [string, () => Grid]> = [
  ['HexGrid', () => new HexGrid()],
  ['SquareGrid', () => new SquareGrid()],
];

describe.each(grids)('%s — WorldEdits sobreviven a descargar y recargar', (_, makeGrid) => {
  it('un bloque colocado se conserva al regenerar el chunk', () => {
    const grid = makeGrid();
    const terrain = new Terrain(4242);
    const edits = new WorldEdits();
    const chunkA = 0;
    const chunkB = 0;
    const la = 5;
    const lb = 7;
    const y = 40;

    // Generamos una vez sin ediciones (para inspeccionar el terreno base).
    const chunkA0 = generateChunk(grid, terrain, chunkA, chunkB);
    expect(chunkA0.get(la, lb, y)).toBe(Block.Air); // por encima del terreno

    // Registramos una edición y regeneramos: el bloque debe estar.
    edits.set(chunkA, chunkB, la, lb, y, Block.Brick);
    const chunkA1 = generateChunk(grid, terrain, chunkA, chunkB, edits);
    expect(chunkA1.get(la, lb, y)).toBe(Block.Brick);

    // "Descargar y recargar": una tercera regeneración distinta sigue viendo la
    // edición.
    const chunkA2 = generateChunk(grid, terrain, chunkA, chunkB, edits);
    expect(chunkA2.get(la, lb, y)).toBe(Block.Brick);
  });

  it('romper un bloque de terreno se conserva al regenerar', () => {
    const grid = makeGrid();
    const terrain = new Terrain(101);
    const edits = new WorldEdits();
    const chunkA = 0;
    const chunkB = 0;
    const la = 3;
    const lb = 3;

    const chunk0 = generateChunk(grid, terrain, chunkA, chunkB);
    // Encuentra el bloque más alto sólido en la columna.
    let topY = -1;
    for (let y = 63; y >= 0; y--) {
      const b = chunk0.get(la, lb, y);
      if (b !== Block.Air && b !== Block.Water) {
        topY = y;
        break;
      }
    }
    expect(topY).toBeGreaterThanOrEqual(0);

    edits.set(chunkA, chunkB, la, lb, topY, Block.Air);
    const chunk1 = generateChunk(grid, terrain, chunkA, chunkB, edits);
    expect(chunk1.get(la, lb, topY)).toBe(Block.Air);
  });
});
