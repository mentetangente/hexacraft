import type { Block } from '../world/blocks';
import { Chunk } from '../world/Chunk';
import { chunkKey } from '../grid';

// Diferencias del jugador sobre la generación, indexadas por chunk. Cada rejilla
// mantiene su propio almacén (hex y cuadrada tienen árboles y celdas distintas,
// así que las modificaciones no se comparten). Al generar un chunk, aplicamos
// los edits de esta rejilla al final; así, descargar y recargar el chunk
// conserva los cambios sin persistir la geometría entera.

type LocalKey = string; // "la,lb,y"

const localKey = (la: number, lb: number, y: number): LocalKey => `${la},${lb},${y}`;

export class WorldEdits {
  private readonly byChunk = new Map<string, Map<LocalKey, Block>>();

  set(chunkA: number, chunkB: number, localA: number, localB: number, y: number, block: Block): void {
    const ck = chunkKey(chunkA, chunkB);
    let m = this.byChunk.get(ck);
    if (!m) {
      m = new Map();
      this.byChunk.set(ck, m);
    }
    m.set(localKey(localA, localB, y), block);
  }

  applyToChunk(chunk: Chunk, chunkA: number, chunkB: number): void {
    const m = this.byChunk.get(chunkKey(chunkA, chunkB));
    if (!m) return;
    for (const [k, block] of m) {
      const parts = k.split(',');
      const la = parseInt(parts[0], 10);
      const lb = parseInt(parts[1], 10);
      const y = parseInt(parts[2], 10);
      chunk.set(la, lb, y, block);
    }
  }

  // Utilidades para tests.
  size(): number {
    let n = 0;
    for (const m of this.byChunk.values()) n += m.size;
    return n;
  }

  clear(): void {
    this.byChunk.clear();
  }

  // Serialización estable para localStorage/JSON. Estructura:
  //   [ [chunkKey, [ [localKey, blockId], ... ] ], ... ]
  serialize(): SerializedEdits {
    const out: SerializedEdits = [];
    for (const [ck, m] of this.byChunk) {
      const entries: Array<[string, number]> = [];
      for (const [lk, block] of m) entries.push([lk, block]);
      out.push([ck, entries]);
    }
    return out;
  }

  deserialize(data: SerializedEdits): void {
    this.byChunk.clear();
    for (const [ck, entries] of data) {
      const m = new Map<LocalKey, Block>();
      for (const [lk, block] of entries) m.set(lk, block as Block);
      this.byChunk.set(ck, m);
    }
  }
}

export type SerializedEdits = Array<[string, Array<[string, number]>]>;

export function isValidSerializedEdits(v: unknown): v is SerializedEdits {
  if (!Array.isArray(v)) return false;
  for (const item of v) {
    if (!Array.isArray(item) || item.length !== 2) return false;
    if (typeof item[0] !== 'string') return false;
    if (!Array.isArray(item[1])) return false;
    for (const entry of item[1]) {
      if (!Array.isArray(entry) || entry.length !== 2) return false;
      if (typeof entry[0] !== 'string') return false;
      if (typeof entry[1] !== 'number') return false;
    }
  }
  return true;
}
