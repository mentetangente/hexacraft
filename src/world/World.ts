import * as THREE from 'three';
import type { Grid } from '../grid';
import { chunkKey } from '../grid';
import { Block } from './blocks';
import { Chunk, CHUNK_HEIGHT } from './Chunk';
import { Terrain, generateChunk } from './terrain';
import { BlockLookup, ChunkMeshResult, meshChunk } from '../render/mesher';
import { WorldMaterials, createWorldMaterials } from '../render/materials';
import { createBlockTexture } from '../render/textures';
import { WorldEdits } from '../interact/edits';
import { CHUNK_SIZE } from '../grid';
import { WaterSim } from './water';

interface ChunkMeshEntry {
  opaque?: THREE.Mesh;
  water?: THREE.Mesh;
}

interface LoadCandidate {
  ca: number;
  cb: number;
  d2: number;
}

const MAX_TIMINGS = 128;
const CHUNKS_PER_UPDATE = 4;
const MESHES_PER_UPDATE = 12;

export interface WorldStats {
  readonly chunksLoaded: number;
  readonly meanGenMs: number;
  readonly meanMeshMs: number;
}

// Mundo por chunks con dos radios: uno para el mallado (`renderDistance`, lo que
// se ve) y uno mayor para la generación (`renderDistance + 1 chunk`). El anillo
// exterior de chunks se genera pero no se malla: sirve para que, al mallar un
// chunk, todos sus 8 vecinos ya estén generados y el culling de caras entre
// chunks sea correcto sin remallar cuando aparece un vecino.
export class World {
  readonly opaqueGroup = new THREE.Group();
  readonly waterGroup = new THREE.Group();

  private readonly chunks = new Map<string, Chunk>();
  private readonly meshes = new Map<string, ChunkMeshEntry>();
  private readonly dirtyMeshes = new Set<string>();
  private readonly terrain: Terrain;

  private readonly texture: THREE.DataArrayTexture;
  readonly materials: WorldMaterials;
  private readonly ownsMaterials: boolean;

  // Diferencias del jugador de esta rejilla. Sobrevive a descargar/recargar
  // chunks; en split view cada World mantiene el suyo.
  readonly edits: WorldEdits;

  // Simulación de agua dirigida por eventos. La creamos en el constructor,
  // usando `this` como sampler (getBlock / setSimBlock / hasChunkAt).
  readonly waterSim: WaterSim;

  private genTimes: number[] = [];
  private meshTimes: number[] = [];

  constructor(
    public grid: Grid,
    public readonly seed: number,
    public renderDistance = 64,
    shared?: {
      readonly materials: WorldMaterials;
      readonly texture: THREE.DataArrayTexture;
    },
    edits?: WorldEdits,
  ) {
    this.terrain = new Terrain(seed);
    if (shared) {
      this.texture = shared.texture;
      this.materials = shared.materials;
      this.ownsMaterials = false;
    } else {
      this.texture = createBlockTexture(seed);
      this.materials = createWorldMaterials(this.texture);
      this.ownsMaterials = true;
    }
    this.edits = edits ?? new WorldEdits();
    this.waterSim = new WaterSim(grid, this);
    this.opaqueGroup.name = `chunks-opaque-${grid.kind}`;
    this.waterGroup.name = `chunks-water-${grid.kind}`;
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
    // Anillo de generación = anillo de mallado + 1 chunk en cada dirección.
    const meshSpan = Math.ceil(this.renderDistance / 14) + 1;
    const genSpan = meshSpan + 1;
    const r2 = this.renderDistance * this.renderDistance;

    const wantedGen = new Set<string>();
    const wantedMesh = new Set<string>();
    const missing: LoadCandidate[] = [];

    for (let dB = -genSpan; dB <= genSpan; dB++) {
      for (let dA = -genSpan; dA <= genSpan; dA++) {
        const ca = cc.chunkA + dA;
        const cb = cc.chunkB + dB;
        const k = chunkKey(ca, cb);
        wantedGen.add(k);
        const cheby = Math.max(Math.abs(dA), Math.abs(dB));
        const center = this.grid.chunkCenter(ca, cb);
        const ddx = center.x - cameraX;
        const ddz = center.z - cameraZ;
        const d2 = ddx * ddx + ddz * ddz;
        if (cheby <= meshSpan && d2 <= r2) wantedMesh.add(k);
        if (!this.chunks.has(k)) missing.push({ ca, cb, d2 });
      }
    }
    missing.sort((a, b) => a.d2 - b.d2);

    // Descarga: chunks fuera del anillo de generación (incluye los de solo-gen).
    for (const [k, chunk] of Array.from(this.chunks)) {
      if (wantedGen.has(k)) continue;
      const entry = this.meshes.get(k);
      if (entry) {
        this.disposeMeshes(entry);
        this.meshes.delete(k);
      }
      this.chunks.delete(k);
      this.dirtyMeshes.delete(k);
      this.markNeighborsDirty(chunk.chunkA, chunk.chunkB);
    }

    // Carga: hasta CHUNKS_PER_UPDATE nuevos chunks por frame.
    let loaded = 0;
    for (const c of missing) {
      if (loaded >= CHUNKS_PER_UPDATE) break;
      this.loadChunk(c.ca, c.cb);
      loaded++;
    }

    // Red de seguridad: cualquier chunk que esté en la zona de mallado y esté
    // generado pero sin malla debe estar en la cola. Cubre el caso de un chunk
    // que estuvo en el anillo (generado, no mallado) y al que el jugador se
    // acerca, y el de un chunk cuya malla se descartó al alejarse y ahora
    // vuelve a estar en rango.
    for (const k of wantedMesh) {
      if (this.chunks.has(k) && !this.meshes.has(k)) this.dirtyMeshes.add(k);
    }

    // Mallado: solo chunks dentro de la zona de mallado. Si es la primera vez
    // que se mallan (aún no hay entrada en `meshes`), esperamos a que los 8
    // vecinos estén generados; después de meshed, la remalla puede hacerse
    // aunque un vecino se descargue (para reexponer sus caras al aire).
    let meshed = 0;
    for (const k of Array.from(this.dirtyMeshes)) {
      if (meshed >= MESHES_PER_UPDATE) break;
      if (!wantedMesh.has(k)) {
        const entry = this.meshes.get(k);
        if (entry) {
          this.disposeMeshes(entry);
          this.meshes.delete(k);
        }
        this.dirtyMeshes.delete(k);
        continue;
      }
      const [caStr, cbStr] = k.split(',');
      const ca = parseInt(caStr, 10);
      const cb = parseInt(cbStr, 10);
      if (!this.meshes.has(k) && !this.allNeighborsLoaded(ca, cb)) continue;
      this.remeshChunk(ca, cb);
      this.dirtyMeshes.delete(k);
      meshed++;
    }
  }

  private loadChunk(ca: number, cb: number): void {
    const t0 = performance.now();
    const chunk = generateChunk(this.grid, this.terrain, ca, cb, this.edits);
    const t1 = performance.now();
    this.chunks.set(chunkKey(ca, cb), chunk);
    this.record(this.genTimes, t1 - t0);
    this.dirtyMeshes.add(chunkKey(ca, cb));
    this.markNeighborsDirty(ca, cb);
    // Reactiva la simulación de agua con las fuentes recién cargadas.
    this.waterSim.onChunkLoaded(ca, cb);
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

  private allNeighborsLoaded(ca: number, cb: number): boolean {
    for (let dB = -1; dB <= 1; dB++) {
      for (let dA = -1; dA <= 1; dA++) {
        if (dA === 0 && dB === 0) continue;
        if (!this.chunks.has(chunkKey(ca + dA, cb + dB))) return false;
      }
    }
    return true;
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
      const m = new THREE.Mesh(result.opaque, this.materials.opaque);
      m.frustumCulled = true;
      this.opaqueGroup.add(m);
      entry.opaque = m;
    }
    if (result.water) {
      const m = new THREE.Mesh(result.water, this.materials.water);
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
    this.materials.setWireframe(on);
  }

  setUseTexture(on: boolean): void {
    this.materials.setUseTexture(on);
  }

  setFog(color: THREE.Color, near: number, far: number): void {
    this.materials.setFog(color, near, far);
  }

  setRenderDistance(d: number): void {
    this.renderDistance = d;
  }

  dispose(): void {
    for (const entry of this.meshes.values()) this.disposeMeshes(entry);
    this.meshes.clear();
    this.chunks.clear();
    this.dirtyMeshes.clear();
    if (this.ownsMaterials) {
      this.materials.dispose();
      this.texture.dispose();
    }
  }

  // Vacía los edits y fuerza remallado de todos los chunks cargados. Se usa al
  // "Borrar mis construcciones" y al importar un archivo distinto.
  reloadFromEdits(newEdits: WorldEdits): void {
    this.edits.clear();
    for (const [k, entries] of newEdits.serialize()) {
      const [caStr, cbStr] = k.split(',');
      const ca = parseInt(caStr, 10);
      const cb = parseInt(cbStr, 10);
      for (const [lk, block] of entries) {
        const parts = lk.split(',');
        const la = parseInt(parts[0], 10);
        const lb = parseInt(parts[1], 10);
        const y = parseInt(parts[2], 10);
        this.edits.set(ca, cb, la, lb, y, block as Block);
      }
    }
    // Descarga todo lo cargado; el siguiente update lo regenera con los
    // edits nuevos aplicados.
    for (const entry of this.meshes.values()) this.disposeMeshes(entry);
    this.meshes.clear();
    this.chunks.clear();
    this.dirtyMeshes.clear();
  }

  getBlock(worldA: number, worldB: number, y: number): Block {
    return this.lookupBlock(worldA, worldB, y);
  }

  hasChunkAt(worldA: number, worldB: number): boolean {
    const cl = this.grid.cellToChunk({ a: worldA, b: worldB });
    return this.chunks.has(chunkKey(cl.chunkA, cl.chunkB));
  }

  // Aplica una modificación del jugador. Guarda el diff, actualiza el chunk
  // cargado y re-encola la malla; si la celda está en el borde del chunk,
  // también remalla el vecino afectado para actualizar el culling.
  setBlock(worldA: number, worldB: number, y: number, block: Block): boolean {
    if (y < 0 || y >= CHUNK_HEIGHT) return false;
    const cl = this.grid.cellToChunk({ a: worldA, b: worldB });
    this.edits.set(cl.chunkA, cl.chunkB, cl.localA, cl.localB, y, block);
    const ck = chunkKey(cl.chunkA, cl.chunkB);
    const chunk = this.chunks.get(ck);
    if (chunk) {
      chunk.set(cl.localA, cl.localB, y, block);
      this.dirtyMeshes.add(ck);
      // Vecinos por borde de chunk.
      if (cl.localA === 0) this.dirtyIfLoaded(cl.chunkA - 1, cl.chunkB);
      if (cl.localA === CHUNK_SIZE - 1) this.dirtyIfLoaded(cl.chunkA + 1, cl.chunkB);
      if (cl.localB === 0) this.dirtyIfLoaded(cl.chunkA, cl.chunkB - 1);
      if (cl.localB === CHUNK_SIZE - 1) this.dirtyIfLoaded(cl.chunkA, cl.chunkB + 1);
    }
    // Activa la simulación de agua alrededor del cambio (rompes fuente, colocas
    // fuente, colocas sólido tapando agua...).
    this.waterSim.activate(worldA, worldB, y);
    this.waterSim.activateNeighbors(worldA, worldB, y);
    return true;
  }

  // Cambio interno impuesto por la simulación de agua: actualiza el chunk y
  // encola la malla, pero NO se persiste en `edits` (el agua corriente se
  // deriva de las fuentes en el próximo tick).
  setSimBlock(worldA: number, worldB: number, y: number, block: Block): void {
    if (y < 0 || y >= CHUNK_HEIGHT) return;
    const cl = this.grid.cellToChunk({ a: worldA, b: worldB });
    const ck = chunkKey(cl.chunkA, cl.chunkB);
    const chunk = this.chunks.get(ck);
    if (!chunk) return;
    chunk.set(cl.localA, cl.localB, y, block);
    this.dirtyMeshes.add(ck);
    if (cl.localA === 0) this.dirtyIfLoaded(cl.chunkA - 1, cl.chunkB);
    if (cl.localA === CHUNK_SIZE - 1) this.dirtyIfLoaded(cl.chunkA + 1, cl.chunkB);
    if (cl.localB === 0) this.dirtyIfLoaded(cl.chunkA, cl.chunkB - 1);
    if (cl.localB === CHUNK_SIZE - 1) this.dirtyIfLoaded(cl.chunkA, cl.chunkB + 1);
  }

  // Un paso de la simulación de agua. Marca los chunks afectados como sucios.
  updateWater(dtMs: number): void {
    const affected = this.waterSim.update(dtMs);
    for (const k of affected) if (this.chunks.has(k)) this.dirtyMeshes.add(k);
  }

  private dirtyIfLoaded(ca: number, cb: number): void {
    const k = chunkKey(ca, cb);
    if (this.chunks.has(k)) this.dirtyMeshes.add(k);
  }
}

function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  let s = 0;
  for (const v of arr) s += v;
  return s / arr.length;
}
