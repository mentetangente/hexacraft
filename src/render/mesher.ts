import * as THREE from 'three';
import type { Cell, Grid, Point2 } from '../grid';
import { Chunk, CHUNK_HEIGHT, CHUNK_WIDTH } from '../world/Chunk';
import { Block, def, isOpaque } from '../world/blocks';
import { texLayerFor } from './textures';

// El mesher genera dos geometrías por chunk: una opaca y una translúcida (agua
// y cristal). Cada vértice lleva posición en coords de mundo, UV, capa de
// textura (para `sampler2DArray`) y un `blockColor` de 4 canales: rgb con el
// color plano por cara y a con el factor de sombreado por orientación. El
// shader alterna texturas ↔ colores planos con un uniforme, así no hay que
// remallar al pulsar T.

export type BlockLookup = (worldA: number, worldB: number, y: number) => Block;

export interface ChunkMeshResult {
  readonly opaque: THREE.BufferGeometry | null;
  readonly water: THREE.BufferGeometry | null;
  readonly triangleCount: number;
}

interface MeshBuffers {
  positions: number[];
  uvs: number[];
  layers: number[];
  colors: number[]; // vec4 por vértice: rgb + shade
}

const TOP_SHADE = 1.0;
const BOTTOM_SHADE = 0.55;

// Sombra por cara lateral, precalculada por rejilla a partir de la normal
// exterior de cada arista de footprintLocal y una dirección de luz fija en XZ.
function computeSideShades(fp: readonly Point2[]): Float32Array {
  const lightX = 0.55;
  const lightZ = 0.83;
  const shades = new Float32Array(fp.length);
  for (let i = 0; i < fp.length; i++) {
    const a = fp[i];
    const b = fp[(i + 1) % fp.length];
    const ex = b.x - a.x;
    const ez = b.z - a.z;
    const nx = -ez;
    const nz = ex;
    const len = Math.hypot(nx, nz);
    const dot = (nx * lightX + nz * lightZ) / len;
    shades[i] = 0.55 + Math.max(0, dot) * 0.35;
  }
  return shades;
}

function computeEdgeLengths(fp: readonly Point2[]): Float32Array {
  const out = new Float32Array(fp.length);
  for (let i = 0; i < fp.length; i++) {
    const a = fp[i];
    const b = fp[(i + 1) % fp.length];
    out[i] = Math.hypot(b.x - a.x, b.z - a.z);
  }
  return out;
}

function newBuffers(): MeshBuffers {
  return { positions: [], uvs: [], layers: [], colors: [] };
}

function pushVertex(
  buf: MeshBuffers,
  x: number,
  y: number,
  z: number,
  u: number,
  v: number,
  layer: number,
  r: number,
  g: number,
  b: number,
  shade: number,
): void {
  buf.positions.push(x, y, z);
  buf.uvs.push(u, v);
  buf.layers.push(layer);
  buf.colors.push(r, g, b, shade);
}

function makeGeometry(buf: MeshBuffers): THREE.BufferGeometry | null {
  if (buf.positions.length === 0) return null;
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(buf.positions), 3));
  geom.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(buf.uvs), 2));
  geom.setAttribute('layer', new THREE.BufferAttribute(new Float32Array(buf.layers), 1));
  geom.setAttribute('blockColor', new THREE.BufferAttribute(new Float32Array(buf.colors), 4));
  return geom;
}

function shouldEmitFace(current: Block, neighbor: Block): boolean {
  if (isOpaque(current)) return !isOpaque(neighbor);
  // Bloques translúcidos (agua, cristal): cara sólo contra vecinos de tipo
  // distinto y no opacos. Así dos cristales o dos aguas contiguos fusionan sus
  // caras compartidas, y las caras contra opaco las dibuja el opaco.
  if (isOpaque(neighbor)) return false;
  return neighbor !== current;
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
  const edgeLens = computeEdgeLengths(fp);
  const baseWorldA = chunkA * CHUNK_WIDTH;
  const baseWorldB = chunkB * CHUNK_WIDTH;

  const opaque = newBuffers();
  const water = newBuffers();

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
        // El agua y el cristal van al mesh translúcido; el resto al opaco.
        const isWater = block === Block.Water;
        const isTranslucent = !isOpaque(block);
        const buf = isTranslucent ? water : opaque;

        // ---- Tapa superior ----
        const above = y + 1 >= CHUNK_HEIGHT ? Block.Air : lookup(worldA, worldB, y + 1);
        if (shouldEmitFace(block, above)) {
          const layer = texLayerFor(block, 'top');
          const r = d.top[0];
          const g = d.top[1];
          const bl = d.top[2];
          const yTop = y + 1;
          const p0 = fp[0];
          const x0 = c.x + p0.x;
          const z0 = c.z + p0.z;
          for (let i = 1; i < n - 1; i++) {
            const pi = fp[i];
            const pj = fp[i + 1];
            const x1 = c.x + pi.x;
            const z1 = c.z + pi.z;
            const x2 = c.x + pj.x;
            const z2 = c.z + pj.z;
            // UV = (worldX, worldZ): tapas de bloques vecinos comparten píxeles.
            pushVertex(buf, x0, yTop, z0, x0, z0, layer, r, g, bl, TOP_SHADE);
            pushVertex(buf, x1, yTop, z1, x1, z1, layer, r, g, bl, TOP_SHADE);
            pushVertex(buf, x2, yTop, z2, x2, z2, layer, r, g, bl, TOP_SHADE);
          }
        }

        // ---- Tapa inferior (nunca en agua) ----
        if (!isWater) {
          const below = y === 0 ? Block.Air : lookup(worldA, worldB, y - 1);
          if (shouldEmitFace(block, below)) {
            const layer = texLayerFor(block, 'bottom');
            const r = d.bottom[0];
            const g = d.bottom[1];
            const bl = d.bottom[2];
            const yBot = y;
            const p0 = fp[0];
            const x0 = c.x + p0.x;
            const z0 = c.z + p0.z;
            for (let i = 1; i < n - 1; i++) {
              const pi = fp[i];
              const pj = fp[i + 1];
              const x1 = c.x + pi.x;
              const z1 = c.z + pi.z;
              const x2 = c.x + pj.x;
              const z2 = c.z + pj.z;
              // Orden invertido para normal a -Y.
              pushVertex(buf, x0, yBot, z0, x0, z0, layer, r, g, bl, BOTTOM_SHADE);
              pushVertex(buf, x2, yBot, z2, x2, z2, layer, r, g, bl, BOTTOM_SHADE);
              pushVertex(buf, x1, yBot, z1, x1, z1, layer, r, g, bl, BOTTOM_SHADE);
            }
          }
        }

        // ---- Caras laterales ----
        for (let i = 0; i < n; i++) {
          const dir = dirs[i];
          const nb = lookup(worldA + dir.a, worldB + dir.b, y);
          if (!shouldEmitFace(block, nb)) continue;

          const pA = fp[i];
          const pB = fp[(i + 1) % n];
          const shade = sideShades[i];
          const layer = texLayerFor(block, 'side');
          const r = d.side[0];
          const g = d.side[1];
          const bl = d.side[2];
          const yBot = y;
          const yTop = y + 1;
          const ax = c.x + pA.x;
          const az = c.z + pA.z;
          const bx = c.x + pB.x;
          const bz = c.z + pB.z;
          const uMax = edgeLens[i];

          // Quad (topA, botA, botB, topB); split into 2 tris.
          pushVertex(buf, ax, yTop, az, 0, yTop, layer, r, g, bl, shade);
          pushVertex(buf, ax, yBot, az, 0, yBot, layer, r, g, bl, shade);
          pushVertex(buf, bx, yBot, bz, uMax, yBot, layer, r, g, bl, shade);

          pushVertex(buf, ax, yTop, az, 0, yTop, layer, r, g, bl, shade);
          pushVertex(buf, bx, yBot, bz, uMax, yBot, layer, r, g, bl, shade);
          pushVertex(buf, bx, yTop, bz, uMax, yTop, layer, r, g, bl, shade);
        }
      }
    }
  }

  const opaqueGeom = makeGeometry(opaque);
  const waterGeom = makeGeometry(water);
  const triangleCount = (opaque.positions.length + water.positions.length) / 9;

  return { opaque: opaqueGeom, water: waterGeom, triangleCount };
}
