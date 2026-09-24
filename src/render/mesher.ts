import * as THREE from 'three';
import type { Cell, Grid, Point2 } from '../grid';
import { Chunk, CHUNK_HEIGHT, CHUNK_WIDTH } from '../world/Chunk';
import { Block, def, isOpaque } from '../world/blocks';

export type BlockLookup = (worldA: number, worldB: number, y: number) => Block;

export interface ChunkMeshResult {
  readonly opaque: THREE.BufferGeometry | null;
  readonly water: THREE.BufferGeometry | null;
  readonly triangleCount: number;
}

// Materiales compartidos: colores en los vértices, sin iluminación (sombreado
// baked). Se instancian una vez desde main.ts.
export function createOpaqueMaterial(): THREE.Material {
  return new THREE.MeshBasicMaterial({ vertexColors: true });
}

export function createWaterMaterial(): THREE.Material {
  return new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.65,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

const TOP_SHADE = 1.0;
const BOTTOM_SHADE = 0.55;

// Sombra por cara lateral, precalculada por rejilla a partir de la normal exterior
// de cada arista de footprintLocal y una dirección de luz fija en XZ.
function computeSideShades(fp: readonly Point2[]): Float32Array {
  const lightX = 0.55;
  const lightZ = 0.83; // dirección casi noreste, normalizada
  const shades = new Float32Array(fp.length);
  for (let i = 0; i < fp.length; i++) {
    const a = fp[i];
    const b = fp[(i + 1) % fp.length];
    const ex = b.x - a.x;
    const ez = b.z - a.z;
    // Normal exterior en XZ para un polígono CCW visto desde +Y.
    const nx = -ez;
    const nz = ex;
    const len = Math.hypot(nx, nz);
    const dot = (nx * lightX + nz * lightZ) / len;
    shades[i] = 0.55 + Math.max(0, dot) * 0.35;
  }
  return shades;
}

// Empuja un triángulo (3 vértices × 3 coords) en arrays de posiciones y colores,
// aplicando un factor de sombreado plano sobre el color base.
function pushTri(
  positions: number[],
  colors: number[],
  v0x: number,
  v0y: number,
  v0z: number,
  v1x: number,
  v1y: number,
  v1z: number,
  v2x: number,
  v2y: number,
  v2z: number,
  cr: number,
  cg: number,
  cb: number,
): void {
  positions.push(v0x, v0y, v0z, v1x, v1y, v1z, v2x, v2y, v2z);
  colors.push(cr, cg, cb, cr, cg, cb, cr, cg, cb);
}

function makeGeometry(positions: number[], colors: number[]): THREE.BufferGeometry | null {
  if (positions.length === 0) return null;
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
  geom.setAttribute('color', new THREE.BufferAttribute(new Float32Array(colors), 3));
  return geom;
}

function shouldEmitFace(current: Block, neighbor: Block): boolean {
  if (current === Block.Water) {
    // El agua solo muestra caras contra el aire.
    return neighbor === Block.Air;
  }
  // Bloques opacos: cara si el vecino no es opaco.
  return !isOpaque(neighbor);
}

export function meshChunk(
  grid: Grid,
  chunk: Chunk,
  chunkA: number,
  chunkB: number,
  getBlockGlobal: BlockLookup,
): ChunkMeshResult {
  const fp = grid.footprintLocal();
  const n = fp.length;
  const dirs = grid.neighborDirections();
  const sideShades = computeSideShades(fp);
  const baseWorldA = chunkA * CHUNK_WIDTH;
  const baseWorldB = chunkB * CHUNK_WIDTH;

  const opaquePositions: number[] = [];
  const opaqueColors: number[] = [];
  const waterPositions: number[] = [];
  const waterColors: number[] = [];

  // Consulta rápida: primero en el chunk actual (evita hash de Map), si no, delega.
  const lookup = (worldA: number, worldB: number, y: number): Block => {
    const dA = worldA - baseWorldA;
    const dB = worldB - baseWorldB;
    if (dA >= 0 && dA < CHUNK_WIDTH && dB >= 0 && dB < CHUNK_WIDTH) {
      return chunk.get(dA, dB, y);
    }
    return getBlockGlobal(worldA, worldB, y);
  };

  for (let y = 0; y < CHUNK_HEIGHT; y++) {
    for (let lb = 0; lb < CHUNK_WIDTH; lb++) {
      for (let la = 0; la < CHUNK_WIDTH; la++) {
        const block = chunk.get(la, lb, y);
        if (block === Block.Air) continue;

        const worldA = baseWorldA + la;
        const worldB = baseWorldB + lb;
        const cell: Cell = { a: worldA, b: worldB };
        const c = grid.center(cell);
        const d = def(block);

        const isWater = block === Block.Water;
        const positions = isWater ? waterPositions : opaquePositions;
        const colors = isWater ? waterColors : opaqueColors;

        // Cara superior.
        const above = y + 1 >= CHUNK_HEIGHT ? Block.Air : lookup(worldA, worldB, y + 1);
        if (shouldEmitFace(block, above)) {
          const yTop = y + 1;
          const r = d.top[0] * TOP_SHADE;
          const g = d.top[1] * TOP_SHADE;
          const bl = d.top[2] * TOP_SHADE;
          const p0 = fp[0];
          for (let i = 1; i < n - 1; i++) {
            const pi = fp[i];
            const pj = fp[i + 1];
            pushTri(
              positions,
              colors,
              c.x + p0.x, yTop, c.z + p0.z,
              c.x + pi.x, yTop, c.z + pi.z,
              c.x + pj.x, yTop, c.z + pj.z,
              r, g, bl,
            );
          }
        }

        // Cara inferior (nunca se emite para el agua).
        if (!isWater) {
          const below = y === 0 ? Block.Air : lookup(worldA, worldB, y - 1);
          if (shouldEmitFace(block, below)) {
            const yBot = y;
            const r = d.bottom[0] * BOTTOM_SHADE;
            const g = d.bottom[1] * BOTTOM_SHADE;
            const bl = d.bottom[2] * BOTTOM_SHADE;
            const p0 = fp[0];
            for (let i = 1; i < n - 1; i++) {
              const pi = fp[i];
              const pj = fp[i + 1];
              // Orden invertido para que la normal apunte a -Y.
              pushTri(
                positions,
                colors,
                c.x + p0.x, yBot, c.z + p0.z,
                c.x + pj.x, yBot, c.z + pj.z,
                c.x + pi.x, yBot, c.z + pi.z,
                r, g, bl,
              );
            }
          }
        }

        // Caras laterales. DIRS[i] es el vecino al otro lado de la arista i.
        for (let i = 0; i < n; i++) {
          const dir = dirs[i];
          const nb = lookup(worldA + dir.a, worldB + dir.b, y);
          if (!shouldEmitFace(block, nb)) continue;

          const pA = fp[i];
          const pB = fp[(i + 1) % n];
          const shade = sideShades[i];
          const r = d.side[0] * shade;
          const g = d.side[1] * shade;
          const bl = d.side[2] * shade;
          const yBot = y;
          const yTop = y + 1;
          // Quad con normal exterior: (topA, botA, botB), (topA, botB, topB)
          pushTri(
            positions,
            colors,
            c.x + pA.x, yTop, c.z + pA.z,
            c.x + pA.x, yBot, c.z + pA.z,
            c.x + pB.x, yBot, c.z + pB.z,
            r, g, bl,
          );
          pushTri(
            positions,
            colors,
            c.x + pA.x, yTop, c.z + pA.z,
            c.x + pB.x, yBot, c.z + pB.z,
            c.x + pB.x, yTop, c.z + pB.z,
            r, g, bl,
          );
        }
      }
    }
  }

  const opaqueGeom = makeGeometry(opaquePositions, opaqueColors);
  const waterGeom = makeGeometry(waterPositions, waterColors);
  const triangleCount = (opaquePositions.length + waterPositions.length) / 9;

  return { opaque: opaqueGeom, water: waterGeom, triangleCount };
}
