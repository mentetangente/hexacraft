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
}
