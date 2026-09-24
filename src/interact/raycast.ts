import type { Cell, Grid } from '../grid';
import { Block, stopsRay as blockStopsRay } from '../world/blocks';
import { CHUNK_HEIGHT } from '../world/Chunk';

// Recorrido exacto de un rayo por la rejilla, sin three.js. Reemplaza el
// raycast que sustituíamos por el de three.js contra las mallas: aquí
// avanzamos por celdas y capas Y, calculando en cada paso por qué cara del
// prisma sale el rayo (tapa +Y, tapa -Y o arista lateral i, que se corresponde
// con el vecino `neighbors[i]`). El agua no bloquea el rayo.

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export type RayFace = 'top' | 'bottom' | { readonly side: number };

export interface RayHit {
  readonly cell: Cell;
  readonly yLayer: number;
  readonly placeCell: Cell;
  readonly placeYLayer: number;
  readonly face: RayFace;
  readonly point: Vec3;
  readonly distance: number;
}

export interface RaySampler {
  getBlock(cellA: number, cellB: number, y: number): Block;
  hasChunkAt(cellA: number, cellB: number): boolean;
}

const MAX_ITERATIONS = 128;
// Pequeño avance más allá de la cara para que la siguiente iteración empiece
// dentro de la nueva celda y no se quede en bucle sobre una arista o vértice.
const ADVANCE_EPS = 1e-6;

// Detiene el rayo cualquier bloque marcado como sólido (piedra, cristal, etc.).
// El agua no es sólida en blocks.ts, así que no bloquea el rayo.
const stopsRay = blockStopsRay;

export function raycast(
  grid: Grid,
  sampler: RaySampler,
  origin: Vec3,
  direction: Vec3,
  maxDist: number,
): RayHit | null {
  const len = Math.hypot(direction.x, direction.y, direction.z);
  if (len < 1e-12 || maxDist <= 0) return null;
  const dx = direction.x / len;
  const dy = direction.y / len;
  const dz = direction.z / len;

  const fp = grid.footprintLocal();
  const n = fp.length;

  let px = origin.x;
  let py = origin.y;
  let pz = origin.z;
  let cell = grid.cellAt({ x: px, z: pz });
  let yLayer = Math.floor(py);
  let traveled = 0;

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    if (traveled >= maxDist) return null;

    // Distancia hasta la primera cara de salida del prisma actual.
    let bestT = Infinity;
    let bestFace: RayFace = 'top';

    if (dy > 0) {
      const t = (yLayer + 1 - py) / dy;
      if (t >= 0 && t < bestT) {
        bestT = t;
        bestFace = 'top';
      }
    } else if (dy < 0) {
      const t = (yLayer - py) / dy;
      if (t >= 0 && t < bestT) {
        bestT = t;
        bestFace = 'bottom';
      }
    }

    const center = grid.center(cell);
    for (let i = 0; i < n; i++) {
      const a = fp[i];
      const b = fp[(i + 1) % n];
      const ax = a.x + center.x;
      const az = a.z + center.z;
      // Normal exterior de la arista para un polígono CCW visto desde +Y.
      const nx = a.z - b.z;
      const nz = b.x - a.x;
      const dDotN = dx * nx + dz * nz;
      if (dDotN <= 0) continue; // rayo hacia el interior o paralelo: no sale por aquí
      const s = (px - ax) * nx + (pz - az) * nz; // signo negativo si estamos dentro
      const t = -s / dDotN;
      if (t >= 0 && t < bestT) {
        bestT = t;
        bestFace = { side: i };
      }
    }

    if (bestT === Infinity) return null; // dir dentro/paralelo a todo: raro
    if (traveled + bestT > maxDist) return null;

    const prevCell: Cell = { a: cell.a, b: cell.b };
    const prevY = yLayer;

    const advance = bestT + ADVANCE_EPS;
    px += dx * advance;
    py += dy * advance;
    pz += dz * advance;
    traveled += advance;

    // Recomputamos celda y capa Y desde la posición avanzada. Así, si el rayo
    // pasa exactamente por un vértice/arista (dos caras con el mismo t), acaba
    // en la celda diagonal correcta sin quedarse en bucle en las ortogonales.
    cell = grid.cellAt({ x: px, z: pz });
    yLayer = Math.floor(py);

    if (yLayer < 0 || yLayer >= CHUNK_HEIGHT) return null;
    if (!sampler.hasChunkAt(cell.a, cell.b)) return null;

    const block = sampler.getBlock(cell.a, cell.b, yLayer);
    if (stopsRay(block)) {
      return {
        cell: { a: cell.a, b: cell.b },
        yLayer,
        placeCell: prevCell,
        placeYLayer: prevY,
        // Cara del bloque golpeado, vista desde fuera: opuesta a la que salió.
        face: entryFace(bestFace, n),
        point: { x: px, y: py, z: pz },
        distance: traveled,
      };
    }
  }
  return null;
}

function entryFace(exitFace: RayFace, n: number): RayFace {
  if (exitFace === 'top') return 'bottom';
  if (exitFace === 'bottom') return 'top';
  return { side: (exitFace.side + n / 2) % n };
}

export function faceLabel(face: RayFace): string {
  if (face === 'top') return 'arriba';
  if (face === 'bottom') return 'abajo';
  return `lateral ${face.side}`;
}
