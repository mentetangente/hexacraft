import * as THREE from 'three';
import type { Cell, Grid, Point2 } from '../grid';
import { Chunk, CHUNK_HEIGHT, CHUNK_WIDTH } from '../world/Chunk';
import { Block, def, isOpaque, isSolid, isWater, waterLevel } from '../world/blocks';
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
  // Bloques translúcidos (agua a cualquier nivel, cristal): cara sólo contra
  // vecinos de otra "familia" y no opacos. Dos aguas juntas (cualquier nivel)
  // no dibujan cara entre ellas; el mesher de agua se ocupa aparte.
  if (isOpaque(neighbor)) return false;
  if (isWater(current) && isWater(neighbor)) return false;
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

  // Altura del "techo" del agua para una celda: si arriba hay agua, cae, así
  // que la columna se pinta llena (topRaised = 1); si no, la superficie baja
  // según el nivel.
  const waterTopRaised = (block: Block, above: Block): number => {
    if (isWater(above)) return 1;
    return waterLevel(block) / 8;
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
        const water_ = isWater(block);
        const isTranslucent = !isOpaque(block);
        const buf = isTranslucent ? water : opaque;
        const above = y + 1 >= CHUNK_HEIGHT ? Block.Air : lookup(worldA, worldB, y + 1);

        // Techo Y de este bloque: 1 (bloque lleno) o level/8 para agua sin
        // vecino de agua encima.
        const myTopRaised = water_ ? waterTopRaised(block, above) : 1;
        const yTop = y + myTopRaised;

        // ---- Tapa superior ----
        if (shouldEmitFace(block, above)) {
          const layer = texLayerFor(block, 'top');
          const r = d.top[0];
          const g = d.top[1];
          const bl = d.top[2];
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
            pushVertex(buf, x0, yTop, z0, x0, z0, layer, r, g, bl, TOP_SHADE);
            pushVertex(buf, x1, yTop, z1, x1, z1, layer, r, g, bl, TOP_SHADE);
            pushVertex(buf, x2, yTop, z2, x2, z2, layer, r, g, bl, TOP_SHADE);
          }
        }

        // ---- Tapa inferior (nunca en agua) ----
        if (!water_) {
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
          const shade = sideShades[i];
          const layer = texLayerFor(block, 'side');
          const r = d.side[0];
          const g = d.side[1];
          const bl = d.side[2];
          const pA = fp[i];
          const pB = fp[(i + 1) % n];
          const ax = c.x + pA.x;
          const az = c.z + pA.z;
          const bx = c.x + pB.x;
          const bz = c.z + pB.z;
          const uMax = edgeLens[i];

          let sideBot: number;
          let sideTop = yTop;

          if (water_) {
            // Agua: cara parcial si el vecino es agua de menor altura, o cara
            // desde y=y hasta yTop si el vecino es aire. Sólidos ocultan.
            if (isSolid(nb)) continue;
            if (isWater(nb)) {
              const nAbove =
                y + 1 >= CHUNK_HEIGHT ? Block.Air : lookup(worldA + dir.a, worldB + dir.b, y + 1);
              const nRaised = waterTopRaised(nb, nAbove);
              const nTop = y + nRaised;
              if (nTop >= yTop - 1e-4) continue; // cubierta
              sideBot = nTop;
            } else {
              sideBot = y;
            }
          } else {
            if (!shouldEmitFace(block, nb)) continue;
            sideBot = y;
            sideTop = y + 1;
          }

          pushVertex(buf, ax, sideTop, az, 0, sideTop, layer, r, g, bl, shade);
          pushVertex(buf, ax, sideBot, az, 0, sideBot, layer, r, g, bl, shade);
          pushVertex(buf, bx, sideBot, bz, uMax, sideBot, layer, r, g, bl, shade);

          pushVertex(buf, ax, sideTop, az, 0, sideTop, layer, r, g, bl, shade);
          pushVertex(buf, bx, sideBot, bz, uMax, sideBot, layer, r, g, bl, shade);
          pushVertex(buf, bx, sideTop, bz, uMax, sideTop, layer, r, g, bl, shade);
        }
      }
    }
  }

  const opaqueGeom = makeGeometry(opaque);
  const waterGeom = makeGeometry(water);
  const triangleCount = (opaque.positions.length + water.positions.length) / 9;

  return { opaque: opaqueGeom, water: waterGeom, triangleCount };
}
