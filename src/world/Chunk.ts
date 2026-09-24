import { Block } from './blocks';

// Altura del mundo (Y): 64 celdas. Ancho: CHUNK_SIZE (16, ver grid/Grid.ts).
export const CHUNK_HEIGHT = 64;
export const CHUNK_WIDTH = 16;

// Índice en el Uint8Array: (y * 16 + b) * 16 + a. Elegido para localidad al
// recorrer filas horizontales durante el mallado.
export function blockIndex(a: number, b: number, y: number): number {
  return (y * CHUNK_WIDTH + b) * CHUNK_WIDTH + a;
}

export class Chunk {
  readonly data: Uint8Array;
  readonly chunkA: number;
  readonly chunkB: number;

  constructor(chunkA: number, chunkB: number) {
    this.chunkA = chunkA;
    this.chunkB = chunkB;
    this.data = new Uint8Array(CHUNK_WIDTH * CHUNK_WIDTH * CHUNK_HEIGHT);
  }

  get(a: number, b: number, y: number): Block {
    if (a < 0 || a >= CHUNK_WIDTH || b < 0 || b >= CHUNK_WIDTH) return Block.Air;
    if (y < 0 || y >= CHUNK_HEIGHT) return Block.Air;
    return this.data[blockIndex(a, b, y)] as Block;
  }

  set(a: number, b: number, y: number, block: Block): void {
    this.data[blockIndex(a, b, y)] = block;
  }
}
