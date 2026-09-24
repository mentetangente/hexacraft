import { createNoise2D } from 'simplex-noise';
import type { Grid } from '../grid';
import { Block } from './blocks';
import { Chunk, CHUNK_HEIGHT, CHUNK_WIDTH } from './Chunk';
import { hash01 } from './rng';

// Constantes de generación. La misma altura f(x, z) se usa en ambas rejillas,
// para que el paisaje sea comparable con hexágonos y con cuadrados.
export const SEA_LEVEL = 20;
const BASE_HEIGHT = 24;
const AMPLITUDE_LOW = 8;
const AMPLITUDE_HIGH = 4;
const NOISE_SCALE_LOW = 0.03;
const NOISE_SCALE_HIGH = 0.09;

// Densidad de árboles y semilla derivada.
const TREE_DENSITY = 0.02;
const TREE_SEED_MASK = 0x51ef1a5b;

function mulberry32(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Terrain {
  private readonly noise2D: (x: number, y: number) => number;
  private readonly treeSeed: number;

  constructor(public readonly seed: number) {
    this.noise2D = createNoise2D(mulberry32(seed));
    this.treeSeed = (seed ^ TREE_SEED_MASK) | 0;
  }

  // Altura de la columna en (x, z) del mundo. Independiente de la rejilla.
  heightAt(x: number, z: number): number {
    const n1 = this.noise2D(x * NOISE_SCALE_LOW, z * NOISE_SCALE_LOW);
    const n2 = this.noise2D(x * NOISE_SCALE_HIGH, z * NOISE_SCALE_HIGH);
    const h = BASE_HEIGHT + n1 * AMPLITUDE_LOW + n2 * AMPLITUDE_HIGH;
    // La columna tiene al menos 1 bloque de suelo; el techo lo limita el chunk.
    return Math.max(1, Math.min(CHUNK_HEIGHT - 1, Math.floor(h)));
  }

  // Rellena la columna (la, lb) según la altura calculada en (worldX, worldZ).
  fillColumn(chunk: Chunk, la: number, lb: number, worldX: number, worldZ: number): void {
    const h = this.heightAt(worldX, worldZ);
    const top = h - 1;
    const underwater = top < SEA_LEVEL - 1;
    const beach = top >= SEA_LEVEL - 1 && top <= SEA_LEVEL + 1;

    for (let y = 0; y <= top; y++) {
      let block: Block;
      if (y === top) {
        block = underwater ? Block.Sand : beach ? Block.Sand : Block.Grass;
      } else if (y >= top - 2) {
        block = underwater || beach ? Block.Sand : Block.Dirt;
      } else {
        block = Block.Stone;
      }
      chunk.set(la, lb, y, block);
    }
    // Agua estática al nivel del mar.
    for (let y = top + 1; y < SEA_LEVEL; y++) {
      chunk.set(la, lb, y, Block.Water);
    }
  }

  // ¿Hay tronco de árbol cuyo pie está en (cellA, cellB), con altura de suelo `top`?
  hasTreeAt(cellA: number, cellB: number, top: number): boolean {
    if (top < SEA_LEVEL + 2) return false; // ni bajo agua ni en playa
    if (top >= CHUNK_HEIGHT - 6) return false; // deja hueco al follaje
    return hash01(this.treeSeed, cellA, cellB) < TREE_DENSITY;
  }
}

// Genera el chunk (relieve + árboles). Los árboles se prueban también en un margen
// de ±2 celdas fuera del chunk para que el follaje de árboles vecinos entre en él.
export function generateChunk(
  grid: Grid,
  terrain: Terrain,
  chunkA: number,
  chunkB: number,
): Chunk {
  const chunk = new Chunk(chunkA, chunkB);

  // 1) Relieve base.
  for (let lb = 0; lb < CHUNK_WIDTH; lb++) {
    for (let la = 0; la < CHUNK_WIDTH; la++) {
      const cell = grid.chunkToCell(chunkA, chunkB, la, lb);
      const w = grid.center(cell);
      terrain.fillColumn(chunk, la, lb, w.x, w.z);
    }
  }

  // 2) Árboles: iteramos con margen 2 fuera del chunk para no cortar follajes.
  const setIfInChunk = (worldA: number, worldB: number, y: number, block: Block): void => {
    const cl = grid.cellToChunk({ a: worldA, b: worldB });
    if (cl.chunkA !== chunkA || cl.chunkB !== chunkB) return;
    if (y < 0 || y >= CHUNK_HEIGHT) return;
    chunk.set(cl.localA, cl.localB, y, block);
  };

  for (let lb = -2; lb < CHUNK_WIDTH + 2; lb++) {
    for (let la = -2; la < CHUNK_WIDTH + 2; la++) {
      const cell = grid.chunkToCell(chunkA, chunkB, la, lb);
      const w = grid.center(cell);
      const top = terrain.heightAt(w.x, w.z) - 1;
      if (!terrain.hasTreeAt(cell.a, cell.b, top)) continue;

      // Tronco.
      for (let dy = 1; dy <= 3; dy++) setIfInChunk(cell.a, cell.b, top + dy, Block.Log);

      // Follaje: disco de radio 1 en la rejilla, dos niveles + copa.
      const ring = grid.disk(cell, 1);
      for (const leaf of ring) {
        if (leaf.a === cell.a && leaf.b === cell.b) {
          setIfInChunk(leaf.a, leaf.b, top + 4, Block.Leaves);
        } else {
          setIfInChunk(leaf.a, leaf.b, top + 3, Block.Leaves);
          setIfInChunk(leaf.a, leaf.b, top + 4, Block.Leaves);
        }
      }
    }
  }

  return chunk;
}
