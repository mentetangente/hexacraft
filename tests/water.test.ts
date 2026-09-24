import { describe, expect, it } from 'vitest';
import { HexGrid, SquareGrid } from '../src/grid';
import type { Grid } from '../src/grid';
import { Block, isWater } from '../src/world/blocks';
import { CHUNK_HEIGHT } from '../src/world/Chunk';
import { WaterSampler, WaterSim } from '../src/world/water';

class MockWaterWorld implements WaterSampler {
  private readonly blocks = new Map<string, Block>();
  private readonly loadedChunks: Set<string> | null;

  constructor(loadedChunks?: Set<string>) {
    this.loadedChunks = loadedChunks ?? null;
  }

  private key(a: number, b: number, y: number): string {
    return `${a},${b},${y}`;
  }

  hasChunkAt(a: number, b: number): boolean {
    if (!this.loadedChunks) return true;
    const ca = Math.floor(a / 16);
    const cb = Math.floor(b / 16);
    return this.loadedChunks.has(`${ca},${cb}`);
  }

  getBlock(a: number, b: number, y: number): Block {
    if (y < 0 || y >= CHUNK_HEIGHT) return Block.Air;
    return this.blocks.get(this.key(a, b, y)) ?? Block.Air;
  }

  setSimBlock(a: number, b: number, y: number, block: Block): void {
    this.set(a, b, y, block);
  }

  set(a: number, b: number, y: number, block: Block): void {
    if (block === Block.Air) this.blocks.delete(this.key(a, b, y));
    else this.blocks.set(this.key(a, b, y), block);
  }

  fillLayer(y: number, range: number, block: Block = Block.Stone): void {
    for (let a = -range; a <= range; a++) {
      for (let b = -range; b <= range; b++) {
        this.set(a, b, y, block);
      }
    }
  }

  countWaterAt(y: number, grid: Grid, centerCell = { a: 0, b: 0 }, radius = 10): number {
    let n = 0;
    for (const c of grid.disk(centerCell, radius)) {
      if (isWater(this.getBlock(c.a, c.b, y))) n++;
    }
    return n;
  }
}

function runTicks(sim: WaterSim, n: number): void {
  for (let i = 0; i < n; i++) sim.tick();
}

const grids: ReadonlyArray<readonly [string, () => Grid, number]> = [
  ['HexGrid', () => new HexGrid(), 169],
  ['SquareGrid', () => new SquareGrid(), 113],
];

describe.each(grids)('%s — WaterSim', (_name, makeGrid, discSize) => {
  it('una fuente sobre suelo plano llena exactamente el disco de radio 7', () => {
    const grid = makeGrid();
    const world = new MockWaterWorld();
    world.fillLayer(19, 20); // suelo sólido
    world.set(0, 0, 20, Block.Water);
    const sim = new WaterSim(grid, world);
    sim.activateNeighbors(0, 0, 20);

    runTicks(sim, 20); // suficiente para propagar 7 anillos

    expect(world.countWaterAt(20, grid)).toBe(discSize);
    // El agua no baja al suelo sólido.
    expect(world.getBlock(0, 0, 19)).toBe(Block.Stone);
  });

  it('el agua cae antes de extenderse', () => {
    const grid = makeGrid();
    const world = new MockWaterWorld();
    // Suelo en y=15, gran hueco entre y=16 y y=19 (fuente en y=20 con "aire" debajo).
    world.fillLayer(15, 5);
    world.set(0, 0, 20, Block.Water);
    const sim = new WaterSim(grid, world);
    sim.activateNeighbors(0, 0, 20);

    // Un solo tick: la celda de debajo debe hacerse agua; los laterales al
    // mismo nivel de la fuente NO deben propagar (fuente sobre aire = "cayendo").
    sim.tick();
    expect(isWater(world.getBlock(0, 0, 19))).toBe(true);
    for (const dir of grid.neighborDirections()) {
      const b = world.getBlock(dir.a, dir.b, 20);
      expect(isWater(b)).toBe(false);
    }
  });

  it('al quitar la fuente todo el agua corriente desaparece', () => {
    const grid = makeGrid();
    const world = new MockWaterWorld();
    world.fillLayer(19, 20);
    world.set(0, 0, 20, Block.Water);
    const sim = new WaterSim(grid, world);
    sim.activateNeighbors(0, 0, 20);
    runTicks(sim, 20);
    expect(world.countWaterAt(20, grid)).toBe(discSize);

    // Rompemos la fuente y activamos vecinos.
    world.set(0, 0, 20, Block.Air);
    sim.activateNeighbors(0, 0, 20);
    runTicks(sim, 30);

    expect(world.countWaterAt(20, grid)).toBe(0);
  });

  it('el agua no atraviesa sólidos', () => {
    const grid = makeGrid();
    const world = new MockWaterWorld();
    world.fillLayer(19, 20);
    // Muro alto justo tocando la fuente: los vecinos +A y +B son sólidos.
    const dirs = grid.neighborDirections();
    for (const d of dirs) {
      world.set(d.a, d.b, 20, Block.Stone);
    }
    world.set(0, 0, 20, Block.Water);
    const sim = new WaterSim(grid, world);
    sim.activateNeighbors(0, 0, 20);

    runTicks(sim, 20);

    // Solo la fuente es agua a nivel y=20; los vecinos siguen siendo piedra.
    let waterCount = 0;
    for (const cell of grid.disk({ a: 0, b: 0 }, 3)) {
      if (isWater(world.getBlock(cell.a, cell.b, 20))) waterCount++;
    }
    expect(waterCount).toBe(1); // solo la fuente
    for (const d of dirs) {
      expect(world.getBlock(d.a, d.b, 20)).toBe(Block.Stone);
    }
  });

  it('una fuente flotando cae recta y solo se extiende al tocar sólido', () => {
    const grid = makeGrid();
    const world = new MockWaterWorld();
    // Suelo lejos: fuente en y=25, aire de y=16 a y=24, sólido en y=15.
    world.fillLayer(15, 10);
    world.set(0, 0, 25, Block.Water);
    const sim = new WaterSim(grid, world);
    sim.activateNeighbors(0, 0, 25);

    runTicks(sim, 30);

    // Columna cayendo (y=17..25): solo (0, 0) es agua; los vecinos horizontales
    // siguen aire (el agua NO se extiende mientras cae).
    for (let y = 17; y <= 25; y++) {
      expect(isWater(world.getBlock(0, 0, y))).toBe(true);
      for (const dir of grid.neighborDirections()) {
        expect(isWater(world.getBlock(dir.a, dir.b, y))).toBe(false);
      }
    }
    // Al tocar el sólido (y=16 es la primera capa con suelo sólido debajo),
    // el agua sí se extiende: los 6/4 vecinos horizontales son agua.
    expect(isWater(world.getBlock(0, 0, 16))).toBe(true);
    for (const dir of grid.neighborDirections()) {
      expect(isWater(world.getBlock(dir.a, dir.b, 16))).toBe(true);
    }
  });

  it('el agua cruza bordes de chunk sin cortarse', () => {
    const grid = makeGrid();
    // Simulamos dos chunks cargados adyacentes en +A.
    const loaded = new Set(['0,0', '1,0', '-1,0', '0,1', '0,-1']);
    const world = new MockWaterWorld(loaded);
    world.fillLayer(19, 30);
    // Fuente cerca del borde derecho del chunk (0, 0): celda a=15 (última).
    world.set(15, 0, 20, Block.Water);
    const sim = new WaterSim(grid, world);
    sim.activateNeighbors(15, 0, 20);

    runTicks(sim, 20);

    // Debe haber agua tanto en a=14 (chunk 0,0) como en a=16 (chunk 1,0).
    expect(isWater(world.getBlock(14, 0, 20))).toBe(true);
    expect(isWater(world.getBlock(16, 0, 20))).toBe(true);
  });
});
