// Interfaz Grid y utilidades compartidas. No importa three.js: todo esto debe ser
// testeable en Vitest sin renderizado.

export interface Cell {
  readonly a: number;
  readonly b: number;
}

export interface Point2 {
  readonly x: number;
  readonly z: number;
}

// Tamaño horizontal de un chunk (celdas por lado); altura en world/Chunk.ts.
export const CHUNK_SIZE = 16;

export interface ChunkLocal {
  readonly chunkA: number;
  readonly chunkB: number;
  readonly localA: number;
  readonly localB: number;
}

export interface Grid {
  readonly kind: 'hex' | 'square';
  readonly neighborCount: 6 | 4;

  center(cell: Cell): Point2;
  cellAt(point: Point2): Cell;
  equals(a: Cell, b: Cell): boolean;

  // Clave estable para usar celdas como llaves en Map/Set.
  key(cell: Cell): string;

  neighborDirections(): readonly Cell[];
  neighbors(cell: Cell): Cell[];

  // Polígono de la huella centrado en el origen, en orden antihorario visto desde
  // +Y (con signedAreaXZ da +1). Área = 1 en ambas rejillas.
  footprintLocal(): readonly Point2[];
  footprint(cell: Cell): Point2[];

  distance(a: Cell, b: Cell): number;

  // Línea entre dos celdas, inclusiva en ambos extremos. Cada par consecutivo
  // debe ser vecino (paso simple), y la longitud debe ser distance(a,b) + 1.
  line(a: Cell, b: Cell): Cell[];

  // Anillo: celdas a distancia exactamente `radius`. radius=0 → [center].
  ring(center: Cell, radius: number): Cell[];
  // Disco: unión de anillos 0..radius.
  disk(center: Cell, radius: number): Cell[];

  // Celdas cuyo centro está a distancia euclídea ≤ radius del punto dado (en unidades
  // de mundo). Utilidad para la torre redonda y otras formas circulares (fase 7).
  cellsInCircle(center: Point2, radius: number): Cell[];

  // Celda ↔ (chunk, posición local). Funciona con coordenadas negativas.
  cellToChunk(cell: Cell): ChunkLocal;
  chunkToCell(chunkA: number, chunkB: number, localA: number, localB: number): Cell;
  // Centro geométrico del paralelogramo (hex) o cuadrado (sq) que ocupa el chunk
  // en coordenadas de mundo. Se usa para decidir carga/descarga por distancia.
  chunkCenter(chunkA: number, chunkB: number): Point2;
}

// Normaliza -0 a +0. Uso: floats en Point2 y enteros en Cell.
export const norm0 = (n: number): number => (n === 0 ? 0 : n);

export function makeCell(a: number, b: number): Cell {
  return { a: norm0(a), b: norm0(b) };
}

export function makePoint(x: number, z: number): Point2 {
  return { x: norm0(x), z: norm0(z) };
}

// Área con signo del polígono en el plano XZ (right-handed, Y arriba).
// Positiva ⇔ vértices en orden antihorario visto desde +Y.
export function signedAreaXZ(pts: readonly Point2[]): number {
  let sum = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    sum += a.x * b.z - b.x * a.z;
  }
  return -sum / 2;
}

// Helpers de chunk (mismos para ambas rejillas: la codificación (a,b) es común).

export function cellKey(c: Cell): string {
  return `${c.a},${c.b}`;
}

export function chunkKey(chunkA: number, chunkB: number): string {
  return `${chunkA},${chunkB}`;
}

const floorDiv = (a: number, n: number): number => Math.floor(a / n);
const posMod = (a: number, n: number): number => ((a % n) + n) % n;

export function cellToChunkLocal(c: Cell): ChunkLocal {
  return {
    chunkA: floorDiv(c.a, CHUNK_SIZE),
    chunkB: floorDiv(c.b, CHUNK_SIZE),
    localA: posMod(c.a, CHUNK_SIZE),
    localB: posMod(c.b, CHUNK_SIZE),
  };
}

export function chunkLocalToCell(
  chunkA: number,
  chunkB: number,
  localA: number,
  localB: number,
): Cell {
  return makeCell(chunkA * CHUNK_SIZE + localA, chunkB * CHUNK_SIZE + localB);
}
