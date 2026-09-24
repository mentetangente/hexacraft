import type { Cell, Grid } from '../grid';
import { Block } from '../world/blocks';
import { CHUNK_HEIGHT } from '../world/Chunk';
import type { World } from '../world/World';
import { CellChange, DualPlan } from './build';

// Traduce las modificaciones (edits) de la rejilla activa a la otra en una
// zona apuntada. Para cada celda de destino, se muestrean N × N puntos en su
// huella; en cada punto se consulta la celda del origen y, si tiene una
// edición registrada, se cuenta. Si el bloque más votado supera el umbral de
// cobertura, se coloca en la celda destino.
//
// Umbral por defecto 0,4 según CLAUDE.md: si más del 40 % de los puntos del
// destino caen en un mismo bloque modificado del origen, se copia.

export const DEFAULT_COVERAGE_THRESHOLD = 0.4;
export const DEFAULT_SAMPLES_PER_AXIS = 5; // 5 × 5 = 25 muestras

export interface TranslateOptions {
  readonly threshold?: number;
  readonly samplesPerAxis?: number;
  readonly radius?: number; // unidades de mundo alrededor del ancla
  readonly yRange?: number; // capas y alrededor del ancla (±)
}

export interface TranslateAnchor {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

// Muestreo por cobertura: enumera puntos regulares en la huella local de la
// celda (aproximada por su bbox) y descarta los que caen fuera del polígono.
function samplesInCell(grid: Grid, cell: Cell, samplesPerAxis: number): Array<{ x: number; z: number }> {
  const center = grid.center(cell);
  const fp = grid.footprintLocal();
  // BBox local del polígono.
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const p of fp) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.z < minZ) minZ = p.z;
    if (p.z > maxZ) maxZ = p.z;
  }
  const step = (maxX - minX) / samplesPerAxis;
  const stepZ = (maxZ - minZ) / samplesPerAxis;
  const out: Array<{ x: number; z: number }> = [];
  for (let iz = 0; iz < samplesPerAxis; iz++) {
    for (let ix = 0; ix < samplesPerAxis; ix++) {
      const localX = minX + step * (ix + 0.5);
      const localZ = minZ + stepZ * (iz + 0.5);
      if (pointInPolygon(fp, localX, localZ)) {
        out.push({ x: center.x + localX, z: center.z + localZ });
      }
    }
  }
  return out;
}

// Punto dentro de un polígono convexo (footprintLocal siempre lo es).
function pointInPolygon(fp: ReadonlyArray<{ x: number; z: number }>, x: number, z: number): boolean {
  for (let i = 0; i < fp.length; i++) {
    const a = fp[i];
    const b = fp[(i + 1) % fp.length];
    // normal exterior CCW-visto-desde-+Y = (a.z - b.z, b.x - a.x).
    const s = (x - a.x) * (a.z - b.z) + (z - a.z) * (b.x - a.x);
    if (s > 1e-9) return false;
  }
  return true;
}

// Traduce edits del origen (rejilla activa) al destino (la otra) alrededor
// del ancla. Devuelve un DualPlan que aplica los cambios solo en el destino.
export function planTranslate(
  source: World,
  dest: World,
  anchor: TranslateAnchor,
  opts?: TranslateOptions,
): DualPlan {
  const threshold = opts?.threshold ?? DEFAULT_COVERAGE_THRESHOLD;
  const samplesPerAxis = opts?.samplesPerAxis ?? DEFAULT_SAMPLES_PER_AXIS;
  const radius = opts?.radius ?? 6;
  const yRange = opts?.yRange ?? 3;

  const destChanges: CellChange[] = [];
  const seen = new Set<string>();

  const destCenter = dest.grid.cellAt({ x: anchor.x, z: anchor.z });
  const destCells = dest.grid.cellsInCircle({ x: anchor.x, z: anchor.z }, radius);
  const yBase = Math.floor(anchor.y);
  const yMin = Math.max(0, yBase - yRange);
  const yMax = Math.min(CHUNK_HEIGHT - 1, yBase + yRange);

  for (const cell of destCells) {
    const samples = samplesInCell(dest.grid, cell, samplesPerAxis);
    if (samples.length === 0) continue;
    for (let y = yMin; y <= yMax; y++) {
      const counts = new Map<Block, number>();
      let modSamples = 0;
      for (const s of samples) {
        const srcCell = source.grid.cellAt({ x: s.x, z: s.z });
        const cl = source.grid.cellToChunk(srcCell);
        if (!source.edits.hasAt(cl.chunkA, cl.chunkB, cl.localA, cl.localB, y)) continue;
        const block = source.getBlock(srcCell.a, srcCell.b, y);
        if (block === Block.Air) continue; // MVP: ignoramos huecos (roturas)
        modSamples++;
        counts.set(block, (counts.get(block) ?? 0) + 1);
      }
      if (modSamples === 0) continue;
      // Bloque más votado.
      let bestBlock: Block = Block.Air;
      let bestCount = 0;
      for (const [b, n] of counts) {
        if (n > bestCount) {
          bestCount = n;
          bestBlock = b;
        }
      }
      if (bestCount / samples.length >= threshold) {
        const k = `${cell.a},${cell.b},${y}`;
        if (!seen.has(k)) {
          seen.add(k);
          destChanges.push({ cell, y, block: bestBlock });
        }
      }
    }
  }

  const isHexDest = dest.grid.kind === 'hex';
  void destCenter;
  return {
    hex: isHexDest ? destChanges : [],
    square: isHexDest ? [] : destChanges,
  };
}
