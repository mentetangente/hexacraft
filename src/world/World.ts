import * as THREE from 'three';
import type { Grid } from '../grid';
import { chunkKey } from '../grid';
import { Block } from './blocks';
import { Chunk, CHUNK_HEIGHT, CHUNK_WIDTH } from './Chunk';
import { Terrain, generateChunk } from './terrain';
import {
  BlockLookup,
  ChunkMeshResult,
  createOpaqueMaterial,
  createWaterMaterial,
  meshChunk,
} from '../render/mesher';

interface ChunkMeshEntry {
  opaque?: THREE.Mesh;
  water?: THREE.Mesh;
}

const MAX_TIMINGS = 128;
const CHUNKS_PER_UPDATE = 4;

export interface WorldStats {
  readonly chunksLoaded: number;
  readonly meanGenMs: number;
  readonly meanMeshMs: number;
}

export class World {
  readonly opaqueGroup = new THREE.Group();
  readonly waterGroup = new THREE.Group();

  private readonly chunks = new Map<string, Chunk>();
  private readonly meshes = new Map<string, ChunkMeshEntry>();
  private readonly dirtyMeshes = new Set<string>();
  private readonly terrain: Terrain;

  private readonly opaqueMat = createOpaqueMaterial();
  private readonly waterMat = createWaterMaterial();

  private genTimes: number[] = [];
  private meshTimes: number[] = [];

  constructor(
    public grid: Grid,
    public readonly seed: number,
    public renderDistance = 64,
  ) {
    this.terrain = new Terrain(seed);
    this.opaqueGroup.name = 'chunks-opaque';
    this.waterGroup.name = 'chunks-water';
  }

  get stats(): WorldStats {
    return {
      chunksLoaded: this.chunks.size,
      meanGenMs: mean(this.genTimes),
      meanMeshMs: mean(this.meshTimes),
    };
  }

  private readonly lookupBlock: BlockLookup = (worldA, worldB, y) => {
    if (y < 0 || y >= CHUNK_HEIGHT) return Block.Air;
    const cl = this.grid.cellToChunk({ a: worldA, b: worldB });
    const c = this.chunks.get(chunkKey(cl.chunkA, cl.chunkB));
    if (!c) return Block.Air;
    return c.get(cl.localA, cl.localB, y);
  };

  update(cameraX: number, cameraZ: number): void {
    const cameraCell = this.grid.cellAt({ x: cameraX, z: cameraZ });
    const cc = this.grid.cellToChunk(cameraCell);
    // Alcance en chunks: `renderDistance` en unidades de mundo, dividido por el
    // ancho aproximado de un chunk en cualquier dirección. Sobrecubrir en hex
    // porque los paralelogramos son más estrechos en un eje.
    const span = Math.ceil(this.renderDistance / 14) + 1;
    const r2 = this.renderDistance * this.renderDistance;
    const unloadR2 = (this.renderDistance + CHUNK_WIDTH) ** 2;
    const wanted = new Set<string>();

    // 1) Recorrer un bbox en coord de chunk alrededor de la cámara y decidir
    // cuáles cargar (los que están dentro del radio en unidades de mundo).
    interface Candidate {
      ca: number;
      cb: number;
      d2: number;
    }
    const missing: Candidate[] = [];
    for (let dB = -span; dB <= span; dB++) {
      for (let dA = -span; dA <= span; dA++) {
        const ca = cc.chunkA + dA;
        const cb = cc.chunkB + dB;
        const center = this.grid.chunkCenter(ca, cb);
        const ddx = center.x - cameraX;
        const ddz = center.z - cameraZ;
        const d2 = ddx * ddx + ddz * ddz;
        if (d2 > r2) continue;
        const k = chunkKey(ca, cb);
        wanted.add(k);
        if (!this.chunks.has(k)) missing.push({ ca, cb, d2 });
      }
    }
    missing.sort((a, b) => a.d2 - b.d2);

    // 2) Descargar los que están fuera del radio ampliado.
    for (const [k, entry] of this.meshes) {
      if (wanted.has(k)) continue;
      const chunk = this.chunks.get(k);
      if (!chunk) continue;
      const center = this.grid.chunkCenter(chunk.chunkA, chunk.chunkB);
      const ddx = center.x - cameraX;
      const ddz = center.z - cameraZ;
      if (ddx * ddx + ddz * ddz > unloadR2) {
        this.disposeMeshes(entry);
        this.meshes.delete(k);
        this.chunks.delete(k);
        // Los vecinos vuelven a tener aire enfrente: marcarlos sucios.
        this.markNeighborsDirty(chunk.chunkA, chunk.chunkB);
      }
    }

    // 3) Cargar hasta CHUNKS_PER_UPDATE por frame (los más cercanos primero).
    let loaded = 0;
    for (const c of missing) {
      if (loaded >= CHUNKS_PER_UPDATE) break;
      this.loadChunk(c.ca, c.cb);
      loaded++;
    }

    // 4) Vaciar la cola de mallado. También limitamos para no bloquear el hilo.
    let meshed = 0;
    for (const k of this.dirtyMeshes) {
      if (meshed >= CHUNKS_PER_UPDATE * 3) break;
      this.dirtyMeshes.delete(k);
      const parts = k.split(',');
      const ca = parseInt(parts[0], 10);
      const cb = parseInt(parts[1], 10);
      this.remeshChunk(ca, cb);
      meshed++;
    }
  }

  private loadChunk(ca: number, cb: number): void {
    const t0 = performance.now();
    const chunk = generateChunk(this.grid, this.terrain, ca, cb);
    const t1 = performance.now();
    this.chunks.set(chunkKey(ca, cb), chunk);
    this.record(this.genTimes, t1 - t0);
    this.dirtyMeshes.add(chunkKey(ca, cb));
    this.markNeighborsDirty(ca, cb);
  }

  private markNeighborsDirty(ca: number, cb: number): void {
    for (let dB = -1; dB <= 1; dB++) {
      for (let dA = -1; dA <= 1; dA++) {
        if (dA === 0 && dB === 0) continue;
        const k = chunkKey(ca + dA, cb + dB);
        if (this.chunks.has(k)) this.dirtyMeshes.add(k);
      }
    }
  }

  private remeshChunk(ca: number, cb: number): void {
    const chunk = this.chunks.get(chunkKey(ca, cb));
    if (!chunk) return;
    const t0 = performance.now();
    const result: ChunkMeshResult = meshChunk(this.grid, chunk, ca, cb, this.lookupBlock);
    const t1 = performance.now();
    this.record(this.meshTimes, t1 - t0);

    const old = this.meshes.get(chunkKey(ca, cb));
    if (old) this.disposeMeshes(old);

    const entry: ChunkMeshEntry = {};
    if (result.opaque) {
      const m = new THREE.Mesh(result.opaque, this.opaqueMat);
      m.frustumCulled = true;
      this.opaqueGroup.add(m);
      entry.opaque = m;
    }
    if (result.water) {
      const m = new THREE.Mesh(result.water, this.waterMat);
      m.frustumCulled = true;
      this.waterGroup.add(m);
      entry.water = m;
    }
    this.meshes.set(chunkKey(ca, cb), entry);
  }

  private disposeMeshes(entry: ChunkMeshEntry): void {
    if (entry.opaque) {
      this.opaqueGroup.remove(entry.opaque);
      entry.opaque.geometry.dispose();
    }
    if (entry.water) {
      this.waterGroup.remove(entry.water);
      entry.water.geometry.dispose();
    }
  }

  private record(arr: number[], v: number): void {
    arr.push(v);
    if (arr.length > MAX_TIMINGS) arr.shift();
  }

  setWireframe(on: boolean): void {
    (this.opaqueMat as THREE.MeshBasicMaterial).wireframe = on;
    (this.waterMat as THREE.MeshBasicMaterial).wireframe = on;
  }

  // Cambia la rejilla activa conservando `seed`. Descarga todo y vuelve a empezar.
  swapGrid(newGrid: Grid): void {
    this.grid = newGrid;
    for (const entry of this.meshes.values()) this.disposeMeshes(entry);
    this.meshes.clear();
    this.chunks.clear();
    this.dirtyMeshes.clear();
    this.genTimes.length = 0;
    this.meshTimes.length = 0;
  }

  dispose(): void {
    for (const entry of this.meshes.values()) this.disposeMeshes(entry);
    this.meshes.clear();
    this.chunks.clear();
    this.dirtyMeshes.clear();
    this.opaqueMat.dispose();
    this.waterMat.dispose();
  }

  // Utilidad de test/depuración.
  getBlock(worldA: number, worldB: number, y: number): Block {
    return this.lookupBlock(worldA, worldB, y);
  }
}

function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  let s = 0;
  for (const v of arr) s += v;
  return s / arr.length;
}
