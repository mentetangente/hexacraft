import type { Grid } from '../grid';
import { chunkKey } from '../grid';
import { Block, isSolid, isWater, waterBlockAtLevel, waterLevel } from './blocks';
import { CHUNK_HEIGHT, CHUNK_WIDTH } from './Chunk';

// Simulación de agua dirigida por eventos, con niveles de 1 a 7 (más la fuente
// nivel 8 = Block.Water). Reglas:
//  - La fuente (Water) nunca decae.
//  - Si arriba hay agua, esta celda vale nivel 7 (columna que cae).
//  - Si no, se toma el máximo de (nivel del vecino horizontal - 1); solo
//    cuentan los vecinos que están asentados sobre suelo (no cayendo): así
//    "el agua cae antes de extenderse".
//  - Si el resultado es 0, la celda se queda en aire (el agua corriente sin
//    alimentación desaparece).
// Snapshot por tick: se leen todas las celdas activas, se calcula el nuevo
// valor, y se aplican los cambios de golpe. Determinista, sin depender del
// orden de iteración dentro de un tick.
//
// El agua corriente no se guarda en `WorldEdits`; sale de la simulación al
// cargar el chunk (el mar generado son fuentes estáticas).

export const WATER_TICK_MS = 200; // 5 ticks/s

export interface WaterSampler {
  getBlock(a: number, b: number, y: number): Block;
  setSimBlock(a: number, b: number, y: number, block: Block): void;
  hasChunkAt(a: number, b: number): boolean;
}

const keyOf = (a: number, b: number, y: number): string => `${a},${b},${y}`;
const parseKey = (k: string): [number, number, number] => {
  const p = k.split(',');
  return [parseInt(p[0], 10), parseInt(p[1], 10), parseInt(p[2], 10)];
};

export class WaterSim {
  private active = new Set<string>();
  private accumMs = 0;

  constructor(
    private readonly grid: Grid,
    private readonly sampler: WaterSampler,
    private readonly tickMs = WATER_TICK_MS,
  ) {}

  activate(a: number, b: number, y: number): void {
    if (y < 0 || y >= CHUNK_HEIGHT) return;
    this.active.add(keyOf(a, b, y));
  }

  activateNeighbors(a: number, b: number, y: number): void {
    for (const d of this.grid.neighborDirections()) {
      this.activate(a + d.a, b + d.b, y);
    }
    this.activate(a, b, y - 1);
    this.activate(a, b, y + 1);
  }

  onChunkLoaded(chunkA: number, chunkB: number): void {
    for (let lb = 0; lb < CHUNK_WIDTH; lb++) {
      for (let la = 0; la < CHUNK_WIDTH; la++) {
        const worldA = chunkA * CHUNK_WIDTH + la;
        const worldB = chunkB * CHUNK_WIDTH + lb;
        for (let y = 0; y < CHUNK_HEIGHT; y++) {
          const b = this.sampler.getBlock(worldA, worldB, y);
          if (b === Block.Water) {
            // Fuente: activa vecinos (por si hay algo que llenar). La propia
            // fuente no cambia, pero desde ella se propaga a las celdas vacías.
            this.activateNeighbors(worldA, worldB, y);
          }
        }
      }
    }
  }

  update(dtMs: number): Set<string> {
    this.accumMs += dtMs;
    const affected = new Set<string>();
    let iter = 0;
    while (this.accumMs >= this.tickMs && iter < 4) {
      this.tick(affected);
      this.accumMs -= this.tickMs;
      iter++;
    }
    if (this.accumMs >= this.tickMs) this.accumMs = 0;
    return affected;
  }

  // Fuerza un tick (para tests y para la sincronización de split view).
  tick(affected: Set<string> = new Set()): Set<string> {
    if (this.active.size === 0) return affected;
    const snapshot = new Map<string, Block>();
    for (const k of this.active) {
      const [a, b, y] = parseKey(k);
      if (!this.sampler.hasChunkAt(a, b)) continue;
      snapshot.set(k, this.sampler.getBlock(a, b, y));
    }

    const updates: Array<[number, number, number, Block]> = [];
    for (const [k, current] of snapshot) {
      const [a, b, y] = parseKey(k);
      if (current === Block.Water) continue; // fuente: nunca cambia
      if (isSolid(current)) continue;
      const target = this.computeNew(a, b, y);
      if (target !== current) updates.push([a, b, y, target]);
    }

    const next = new Set<string>();
    const dirs = this.grid.neighborDirections();
    for (const [a, b, y, target] of updates) {
      this.sampler.setSimBlock(a, b, y, target);
      for (const d of dirs) next.add(keyOf(a + d.a, b + d.b, y));
      next.add(keyOf(a, b, y - 1));
      next.add(keyOf(a, b, y + 1));
      const cl = this.grid.cellToChunk({ a, b });
      affected.add(chunkKey(cl.chunkA, cl.chunkB));
      if (cl.localA === 0) affected.add(chunkKey(cl.chunkA - 1, cl.chunkB));
      if (cl.localA === CHUNK_WIDTH - 1) affected.add(chunkKey(cl.chunkA + 1, cl.chunkB));
      if (cl.localB === 0) affected.add(chunkKey(cl.chunkA, cl.chunkB - 1));
      if (cl.localB === CHUNK_WIDTH - 1) affected.add(chunkKey(cl.chunkA, cl.chunkB + 1));
    }
    this.active = next;
    return affected;
  }

  private computeNew(a: number, b: number, y: number): Block {
    const above = this.sampler.getBlock(a, b, y + 1);
    if (isWater(above)) return Block.WaterL7; // columna que cae

    let maxLevel = 0;
    for (const d of this.grid.neighborDirections()) {
      const na = a + d.a;
      const nb = b + d.b;
      const neighbor = this.sampler.getBlock(na, nb, y);
      if (!isWater(neighbor)) continue;
      // El vecino solo derrama horizontalmente si tiene **sólido** justo
      // debajo. Si su abajo es aire (columna cayendo) u otra agua (fuente
      // flotando sobre agua) no se extiende: primero cae. Así una fuente
      // flotando cae recta y solo se abre en abanico al tocar suelo sólido.
      const nBelow = this.sampler.getBlock(na, nb, y - 1);
      if (!isSolid(nBelow)) continue;
      const L = waterLevel(neighbor);
      if (L - 1 > maxLevel) maxLevel = L - 1;
    }
    if (maxLevel === 0) return Block.Air;
    return waterBlockAtLevel(maxLevel);
  }

  clear(): void {
    this.active.clear();
    this.accumMs = 0;
  }

  // Para tests.
  activeCount(): number {
    return this.active.size;
  }
}
