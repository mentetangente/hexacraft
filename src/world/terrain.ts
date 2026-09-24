import { createNoise2D } from 'simplex-noise';
import type { Grid } from '../grid';
import type { WorldEdits } from '../interact/edits';
import { Block } from './blocks';
import { Chunk, CHUNK_HEIGHT, CHUNK_WIDTH } from './Chunk';
import { hash01 } from './rng';

// Nivel del mar y perfil del ruido. La altura f(x, z) no depende de la rejilla:
// así el paisaje es idéntico en hex y en cuadrados en cualquier punto del mundo.
export const SEA_LEVEL = 20;
const BASE_HEIGHT = 24;
const AMPLITUDE_LOW = 8;
const AMPLITUDE_HIGH = 4;
const NOISE_SCALE_LOW = 0.03;
const NOISE_SCALE_HIGH = 0.09;

// Árboles en espacio de mundo. Rejilla gruesa de 5×5 unidades: a lo sumo un árbol
// por celda gruesa; el desplazamiento se limita a [1.5, 3.5] para garantizar que
// dos árboles vecinos estén siempre a ≥ 3 unidades. La decisión (existencia,
// posición, altura del tronco, forma de la copa) sale de la semilla del punto,
// nunca de la celda de la rejilla — así hex y cuadrados generan los mismos árboles.
export const COARSE_SIZE = 5;
const OFFSET_MIN = 1.5;
const OFFSET_MAX = 3.5;
const TREE_DENSITY = 0.35; // por celda gruesa
const TREE_MIN_TOP_ABOVE_SEA = 2; // no plantar en playa (top ≥ SEA_LEVEL + 2)
const TREE_MAX_TRUNK = 4;
const CANOPY_RADIUS = 1; // en celdas de la rejilla
// Margen mundano suficiente para que la copa entera se genere si el punto está
// cerca del borde del chunk: 2 * ancho_flat_to_flat_hex ≈ 2.15 → usamos 3.
export const TREE_WORLD_MARGIN = 3;

// Semillas derivadas de la maestra, con máscaras distintas para no correlacionar.
const TREE_MASK_EXIST = 0x51ef1a5b;
const TREE_MASK_OFFX = 0x9e3779b9 | 0;
const TREE_MASK_OFFZ = 0x85ebca6b | 0;
const TREE_MASK_TRUNK = 0xc2b2ae35 | 0;

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

export interface TreeCandidate {
  readonly gx: number;
  readonly gz: number;
  readonly px: number; // posición del tronco en el mundo (X)
  readonly pz: number; // posición del tronco en el mundo (Z)
  readonly top: number; // y del bloque de suelo bajo el tronco
  readonly trunkH: number; // altura del tronco (bloques)
  readonly canopyRadius: number;
}

export class Terrain {
  private readonly noise2D: (x: number, y: number) => number;
  private readonly seedExist: number;
  private readonly seedOffX: number;
  private readonly seedOffZ: number;
  private readonly seedTrunk: number;

  constructor(public readonly seed: number) {
    this.noise2D = createNoise2D(mulberry32(seed));
    this.seedExist = (seed ^ TREE_MASK_EXIST) | 0;
    this.seedOffX = (seed ^ TREE_MASK_OFFX) | 0;
    this.seedOffZ = (seed ^ TREE_MASK_OFFZ) | 0;
    this.seedTrunk = (seed ^ TREE_MASK_TRUNK) | 0;
  }

  heightAt(x: number, z: number): number {
    const n1 = this.noise2D(x * NOISE_SCALE_LOW, z * NOISE_SCALE_LOW);
    const n2 = this.noise2D(x * NOISE_SCALE_HIGH, z * NOISE_SCALE_HIGH);
    const h = BASE_HEIGHT + n1 * AMPLITUDE_LOW + n2 * AMPLITUDE_HIGH;
    return Math.max(1, Math.min(CHUNK_HEIGHT - 1, Math.floor(h)));
  }

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
    for (let y = top + 1; y < SEA_LEVEL; y++) {
      chunk.set(la, lb, y, Block.Water);
    }
  }

  // Candidato de árbol en la celda gruesa (gx, gz). Devuelve `null` si esa celda
  // no tiene árbol o si el punto elegido cae en agua/playa/techo del mundo.
  candidateAt(gx: number, gz: number): TreeCandidate | null {
    if (hash01(this.seedExist, gx, gz) >= TREE_DENSITY) return null;
    const ox = OFFSET_MIN + hash01(this.seedOffX, gx, gz) * (OFFSET_MAX - OFFSET_MIN);
    const oz = OFFSET_MIN + hash01(this.seedOffZ, gx, gz) * (OFFSET_MAX - OFFSET_MIN);
    const px = gx * COARSE_SIZE + ox;
    const pz = gz * COARSE_SIZE + oz;
    const top = this.heightAt(px, pz) - 1;
    if (top < SEA_LEVEL + TREE_MIN_TOP_ABOVE_SEA) return null;
    if (top >= CHUNK_HEIGHT - (TREE_MAX_TRUNK + 2)) return null;
    // Altura del tronco 3 ó 4; podríamos añadir más variedad de copa aquí.
    const trunkH = 3 + (hash01(this.seedTrunk, gx, gz) < 0.5 ? 0 : 1);
    return { gx, gz, px, pz, top, trunkH, canopyRadius: CANOPY_RADIUS };
  }

  // Enumera árboles aceptados en un rango de celdas gruesas (ambos extremos
  // inclusivos). Es independiente de la rejilla, así el listado es idéntico
  // para hex y cuadrados con la misma semilla.
  enumerateTrees(gxMin: number, gzMin: number, gxMax: number, gzMax: number): TreeCandidate[] {
    const out: TreeCandidate[] = [];
    for (let gz = gzMin; gz <= gzMax; gz++) {
      for (let gx = gxMin; gx <= gxMax; gx++) {
        const c = this.candidateAt(gx, gz);
        if (c !== null) out.push(c);
      }
    }
    return out;
  }
}

// Bbox en coordenadas de mundo del paralelogramo (hex) o cuadrado (sq) que ocupa
// un chunk, calculado desde los 4 centros de celda de las esquinas.
function chunkWorldBbox(
  grid: Grid,
  chunkA: number,
  chunkB: number,
): { xmin: number; xmax: number; zmin: number; zmax: number } {
  const w = CHUNK_WIDTH - 1;
  const cs = [
    grid.center(grid.chunkToCell(chunkA, chunkB, 0, 0)),
    grid.center(grid.chunkToCell(chunkA, chunkB, w, 0)),
    grid.center(grid.chunkToCell(chunkA, chunkB, 0, w)),
    grid.center(grid.chunkToCell(chunkA, chunkB, w, w)),
  ];
  let xmin = Infinity;
  let xmax = -Infinity;
  let zmin = Infinity;
  let zmax = -Infinity;
  for (const c of cs) {
    if (c.x < xmin) xmin = c.x;
    if (c.x > xmax) xmax = c.x;
    if (c.z < zmin) zmin = c.z;
    if (c.z > zmax) zmax = c.z;
  }
  return { xmin, xmax, zmin, zmax };
}

// Genera un chunk: relieve + árboles cuyos puntos caen en las coarse cells que
// solapan el chunk (con margen de mundo suficiente para incluir copas que
// entran desde árboles cuyo tronco está fuera).
export function generateChunk(
  grid: Grid,
  terrain: Terrain,
  chunkA: number,
  chunkB: number,
  edits?: WorldEdits,
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

  // 2) Árboles: iteramos las coarse cells que solapan el chunk + margen mundano
  // para que copas de árboles vecinos entren correctamente en este chunk.
  const bbox = chunkWorldBbox(grid, chunkA, chunkB);
  const gxMin = Math.floor((bbox.xmin - TREE_WORLD_MARGIN) / COARSE_SIZE);
  const gxMax = Math.floor((bbox.xmax + TREE_WORLD_MARGIN) / COARSE_SIZE);
  const gzMin = Math.floor((bbox.zmin - TREE_WORLD_MARGIN) / COARSE_SIZE);
  const gzMax = Math.floor((bbox.zmax + TREE_WORLD_MARGIN) / COARSE_SIZE);

  for (let gz = gzMin; gz <= gzMax; gz++) {
    for (let gx = gxMin; gx <= gxMax; gx++) {
      const cand = terrain.candidateAt(gx, gz);
      if (cand === null) continue;
      plantTree(grid, chunk, chunkA, chunkB, cand);
    }
  }

  // 3) Diferencias del jugador (romper/colocar) sobre la generación. Se
  // aplican al final para que sobrevivan a la descarga y regeneración.
  if (edits) edits.applyToChunk(chunk, chunkA, chunkB);

  return chunk;
}

function plantTree(
  grid: Grid,
  chunk: Chunk,
  chunkA: number,
  chunkB: number,
  cand: TreeCandidate,
): void {
  const treeCell = grid.cellAt({ x: cand.px, z: cand.pz });
  const setIfInChunk = (worldA: number, worldB: number, y: number, block: Block): void => {
    const cl = grid.cellToChunk({ a: worldA, b: worldB });
    if (cl.chunkA !== chunkA || cl.chunkB !== chunkB) return;
    if (y < 0 || y >= CHUNK_HEIGHT) return;
    chunk.set(cl.localA, cl.localB, y, block);
  };

  // Tronco.
  for (let dy = 1; dy <= cand.trunkH; dy++) {
    setIfInChunk(treeCell.a, treeCell.b, cand.top + dy, Block.Log);
  }
  // Copa: dos niveles alrededor del tronco + copa central por encima.
  const canopyTop = cand.top + cand.trunkH;
  const ring = grid.disk(treeCell, cand.canopyRadius);
  for (const leaf of ring) {
    if (leaf.a === treeCell.a && leaf.b === treeCell.b) {
      setIfInChunk(leaf.a, leaf.b, canopyTop + 1, Block.Leaves);
    } else {
      setIfInChunk(leaf.a, leaf.b, canopyTop, Block.Leaves);
      setIfInChunk(leaf.a, leaf.b, canopyTop + 1, Block.Leaves);
    }
  }
}
