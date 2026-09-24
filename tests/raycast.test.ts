import { describe, expect, it } from 'vitest';
import { HexGrid, SquareGrid } from '../src/grid';
import type { Grid } from '../src/grid';
import { Block } from '../src/world/blocks';
import type { RaySampler } from '../src/interact/raycast';
import { faceLabel, raycast } from '../src/interact/raycast';

class MockSampler implements RaySampler {
  private readonly blocks = new Map<string, Block>();
  hasChunkAt(): boolean {
    return true;
  }
  getBlock(a: number, b: number, y: number): Block {
    return this.blocks.get(`${a},${b},${y}`) ?? Block.Air;
  }
  set(a: number, b: number, y: number, block: Block): void {
    this.blocks.set(`${a},${b},${y}`, block);
  }
  fillLayer(y: number, range: number, block: Block = Block.Stone): void {
    for (let a = -range; a <= range; a++) {
      for (let b = -range; b <= range; b++) this.set(a, b, y, block);
    }
  }
}

const grids: ReadonlyArray<readonly [string, () => Grid]> = [
  ['HexGrid', () => new HexGrid()],
  ['SquareGrid', () => new SquareGrid()],
];

describe.each(grids)('%s — raycast: casos sencillos', (_, makeGrid) => {
  it('rayo vertical hacia abajo golpea la tapa superior', () => {
    const grid = makeGrid();
    const s = new MockSampler();
    s.set(0, 0, 19, Block.Stone);
    const hit = raycast(grid, s, { x: 0, y: 25, z: 0 }, { x: 0, y: -1, z: 0 }, 10);
    expect(hit).not.toBeNull();
    expect(hit!.cell).toEqual({ a: 0, b: 0 });
    expect(hit!.yLayer).toBe(19);
    expect(hit!.face).toBe('top');
    // Colocar iría a la celda de encima.
    expect(hit!.placeYLayer).toBe(20);
  });

  it('rayo vertical hacia arriba golpea la tapa inferior', () => {
    const grid = makeGrid();
    const s = new MockSampler();
    s.set(0, 0, 25, Block.Stone);
    const hit = raycast(grid, s, { x: 0, y: 20, z: 0 }, { x: 0, y: 1, z: 0 }, 10);
    expect(hit).not.toBeNull();
    expect(hit!.yLayer).toBe(25);
    expect(hit!.face).toBe('bottom');
    expect(hit!.placeYLayer).toBe(24);
  });

  it('el agua no bloquea el rayo', () => {
    const grid = makeGrid();
    const s = new MockSampler();
    // Agua entre y y la piedra: no debe interceptar.
    s.set(0, 0, 22, Block.Water);
    s.set(0, 0, 23, Block.Water);
    s.set(0, 0, 19, Block.Stone);
    const hit = raycast(grid, s, { x: 0, y: 26, z: 0 }, { x: 0, y: -1, z: 0 }, 10);
    expect(hit).not.toBeNull();
    expect(hit!.yLayer).toBe(19);
  });

  it('rango limitado a 6 unidades', () => {
    const grid = makeGrid();
    const s = new MockSampler();
    s.set(0, 0, 10, Block.Stone); // muy abajo
    const hit = raycast(grid, s, { x: 0, y: 25, z: 0 }, { x: 0, y: -1, z: 0 }, 6);
    expect(hit).toBeNull();
  });
});

describe('SquareGrid — raycast: horizontal contra pared', () => {
  it('rayo horizontal +X golpea la cara -X de la pared', () => {
    const grid = new SquareGrid();
    const s = new MockSampler();
    // Pared en x=3 desde y=20 arriba.
    s.set(3, 0, 20, Block.Stone);
    const hit = raycast(grid, s, { x: 0, y: 20.5, z: 0 }, { x: 1, y: 0, z: 0 }, 6);
    expect(hit).not.toBeNull();
    expect(hit!.cell).toEqual({ a: 3, b: 0 });
    expect(hit!.yLayer).toBe(20);
    // La cara golpeada es la lateral 1 de la rejilla cuadrada (mira a -X).
    expect(faceLabel(hit!.face)).toBe('lateral 1');
    // Colocar dejaría el bloque en la celda inmediatamente anterior en X.
    expect(hit!.placeCell).toEqual({ a: 2, b: 0 });
    expect(hit!.placeYLayer).toBe(20);
  });

  it('rayo diagonal 45º acaba en el bloque correcto', () => {
    const grid = new SquareGrid();
    const s = new MockSampler();
    s.set(2, 2, 20, Block.Stone);
    // Origen ligeramente descentrado para evitar pasar por la esquina exacta.
    const hit = raycast(
      grid,
      s,
      { x: 0.1, y: 20.5, z: 0.1 },
      { x: 1, y: 0, z: 1 },
      6,
    );
    expect(hit).not.toBeNull();
    expect(hit!.cell).toEqual({ a: 2, b: 2 });
  });
});

describe('HexGrid — raycast', () => {
  it('rayo horizontal +X golpea la primera celda hex sólida', () => {
    const grid = new HexGrid();
    const s = new MockSampler();
    // Piedra en la celda (2, 0): centro en world ≈ (2·R√3, 0) ≈ (2.15, 0).
    s.set(2, 0, 20, Block.Stone);
    const hit = raycast(grid, s, { x: 0, y: 20.5, z: 0 }, { x: 1, y: 0, z: 0 }, 6);
    expect(hit).not.toBeNull();
    expect(hit!.cell).toEqual({ a: 2, b: 0 });
    expect(hit!.placeCell).toEqual({ a: 1, b: 0 });
  });
});

describe('raycast: rayos que pasan por vértices/aristas no se atascan', () => {
  it('SquareGrid: rayo que roza la esquina no atraviesa el bloque', () => {
    const grid = new SquareGrid();
    const s = new MockSampler();
    // Un bloque en (1, 1), otro en (2, 2). Un rayo diagonal exacto pasando por
    // (0.5, 0.5) pasaría por vértices; comprobamos que resuelve determinístamente.
    s.set(2, 2, 20, Block.Stone);
    const hit = raycast(grid, s, { x: 0, y: 20.5, z: 0 }, { x: 1, y: 0, z: 1 }, 6);
    expect(hit).not.toBeNull();
    expect(hit!.cell).toEqual({ a: 2, b: 2 });
  });

  it('HexGrid: rayo alineado con la arista q avanza sin bucles', () => {
    const grid = new HexGrid();
    const s = new MockSampler();
    // Piedra lejos en +X, sin nada entre medias.
    s.set(3, 0, 20, Block.Stone);
    // Direcciones que rozan bordes: puramente +X y con leve inclinación.
    const rays = [
      { x: 1, y: 0, z: 0 },
      { x: 1, y: 0.01, z: 0 },
      { x: 1, y: 0, z: 0.02 },
    ];
    for (const d of rays) {
      const hit = raycast(grid, s, { x: 0, y: 20.5, z: 0 }, d, 6);
      expect(hit).not.toBeNull();
      expect(hit!.cell).toEqual({ a: 3, b: 0 });
    }
  });
});
