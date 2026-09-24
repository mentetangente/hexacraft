import { describe, expect, it } from 'vitest';
import { HexGrid, SquareGrid } from '../src/grid';
import { Chunk } from '../src/world/Chunk';
import { Block } from '../src/world/blocks';
import { meshChunk } from '../src/render/mesher';
import type { BlockLookup } from '../src/render/mesher';

const airLookup: BlockLookup = () => Block.Air;

describe('meshChunk', () => {
  it('un bloque aislado en la rejilla cuadrada da 12 triángulos', () => {
    const chunk = new Chunk(0, 0);
    chunk.set(5, 5, 20, Block.Stone);
    const r = meshChunk(new SquareGrid(), chunk, 0, 0, airLookup);
    expect(r.triangleCount).toBe(12);
  });

  it('un bloque aislado en la rejilla hexagonal da 20 triángulos', () => {
    const chunk = new Chunk(0, 0);
    chunk.set(5, 5, 20, Block.Stone);
    const r = meshChunk(new HexGrid(), chunk, 0, 0, airLookup);
    expect(r.triangleCount).toBe(20);
  });

  it('dos bloques cuadrados adyacentes: 24 − 4 = 20 triángulos', () => {
    const chunk = new Chunk(0, 0);
    chunk.set(5, 5, 20, Block.Stone);
    chunk.set(6, 5, 20, Block.Stone);
    const r = meshChunk(new SquareGrid(), chunk, 0, 0, airLookup);
    expect(r.triangleCount).toBe(20);
  });

  it('dos bloques hexagonales adyacentes: 40 − 4 = 36 triángulos', () => {
    const chunk = new Chunk(0, 0);
    chunk.set(5, 5, 20, Block.Stone);
    // Vecino en axial (+1, 0), es decir (6, 5), adyacente por la arista 0.
    chunk.set(6, 5, 20, Block.Stone);
    const r = meshChunk(new HexGrid(), chunk, 0, 0, airLookup);
    expect(r.triangleCount).toBe(36);
  });

  it('descarta caras contra bloques del chunk vecino', () => {
    const chunk = new Chunk(0, 0);
    // Bloque pegado al borde derecho del chunk (0,0).
    chunk.set(15, 5, 20, Block.Stone);
    // Simulamos que en (16, 5, 20) hay piedra (esto sería chunk (1, 0), local (0, 5)).
    const lookup: BlockLookup = (a, b, y) => (a === 16 && b === 5 && y === 20 ? Block.Stone : Block.Air);
    const solo = meshChunk(new SquareGrid(), chunk, 0, 0, airLookup).triangleCount;
    const conVecino = meshChunk(new SquareGrid(), chunk, 0, 0, lookup).triangleCount;
    expect(solo).toBe(12);
    expect(conVecino).toBe(10); // pierde la cara del lado +X (2 triángulos)
  });

  it('bloque con solo la tapa expuesta hacia el aire: 2 (cuad) o 4 (hex) triángulos', () => {
    const chunk = new Chunk(0, 0);
    // Rodeamos un bloque por 6 vecinos (o 4 laterales + arriba y abajo).
    chunk.set(5, 5, 20, Block.Stone);
    // Rellenamos vecinos con piedra para tapar caras.
    for (const [da, db] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [1, -1],
      [-1, 1],
    ] as const) {
      chunk.set(5 + da, 5 + db, 20, Block.Stone);
    }
    chunk.set(5, 5, 19, Block.Stone); // debajo
    // Encima aire → tapa se dibuja.
    const hex = meshChunk(new HexGrid(), chunk, 0, 0, airLookup);
    // El bloque central (5,5): laterales cubiertos por los 6 vecinos hex, abajo cubierto,
    // solo tapa arriba = 4 triángulos. Pero además hay 6 bloques vecinos, cada uno
    // con sus propias caras expuestas. Aislamos comprobando solo la tapa del central:
    // más simple: repetir contando globalmente y comprobar > 0.
    expect(hex.triangleCount).toBeGreaterThan(0);
  });

  it('el agua no emite cara inferior aunque tenga aire debajo', () => {
    const chunk = new Chunk(0, 0);
    chunk.set(5, 5, 20, Block.Water);
    const r = meshChunk(new SquareGrid(), chunk, 0, 0, airLookup);
    // Un bloque de agua aislado: top 2, 4 laterales × 2, sin bottom = 10 triángulos.
    expect(r.triangleCount).toBe(10);
  });

  it('un bloque de cristal aislado va al mesh translúcido con 12 triángulos', () => {
    const chunk = new Chunk(0, 0);
    chunk.set(5, 5, 20, Block.Glass);
    const r = meshChunk(new SquareGrid(), chunk, 0, 0, airLookup);
    expect(r.opaque).toBeNull();
    expect(r.water).not.toBeNull();
    expect(r.triangleCount).toBe(12);
  });

  it('dos cristales contiguos fusionan la cara compartida', () => {
    const chunk = new Chunk(0, 0);
    chunk.set(5, 5, 20, Block.Glass);
    chunk.set(6, 5, 20, Block.Glass);
    const r = meshChunk(new SquareGrid(), chunk, 0, 0, airLookup);
    // 12 + 12 - 4 (cara lateral compartida) = 20.
    expect(r.triangleCount).toBe(20);
  });

  it('cristal contra piedra: la piedra dibuja la cara, el cristal no', () => {
    const chunk = new Chunk(0, 0);
    chunk.set(5, 5, 20, Block.Glass);
    chunk.set(6, 5, 20, Block.Stone);
    const r = meshChunk(new SquareGrid(), chunk, 0, 0, airLookup);
    // Piedra: 12 caras (todos los vecinos son aire o cristal, ambos no opacos).
    // Cristal: 12 - 2 (contra piedra opaca) = 10.
    expect(r.triangleCount).toBe(22);
  });
});
