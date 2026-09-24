import * as THREE from 'three';
import { Block, isWater } from '../world/blocks';

// Texturas procedurales pixel art. Todas las capas son 16×16 px; combinadas con
// UV en unidades de mundo (16 px/unidad) esto da densidad idéntica en hex y en
// cuadrados. Repetición nativa por `RepeatWrapping`, sin sangrado entre capas.

export const TEX_SIZE = 16;

export enum TexLayer {
  Stone = 0,
  Dirt,
  GrassTop,
  GrassSide,
  Sand,
  WaterTop,
  WaterSide,
  LogTop,
  LogSide,
  Leaves,
  Planks,
  Brick,
  Glass,
}

const LAYER_COUNT = 13;

// Hash 32-bit determinista. Sirve para el ruido de las texturas.
function hash(seed: number, x: number, y: number): number {
  let s = seed | 0;
  s = Math.imul(s ^ (x | 0), 0x27d4eb2d);
  s = Math.imul(s ^ (y | 0), 0x85ebca6b);
  s ^= s >>> 16;
  return (s >>> 0) / 0x100000000;
}

const c255 = (v: number): number => Math.max(0, Math.min(255, Math.round(v * 255)));

function setPx(
  data: Uint8Array,
  layer: number,
  x: number,
  y: number,
  r: number,
  g: number,
  b: number,
  a = 255,
): void {
  const idx = (layer * TEX_SIZE * TEX_SIZE + y * TEX_SIZE + x) * 4;
  data[idx] = r;
  data[idx + 1] = g;
  data[idx + 2] = b;
  data[idx + 3] = a;
}

// -------- Generadores individuales ----------

function makeStone(data: Uint8Array, seed: number): void {
  const s = seed ^ 0x11223344;
  for (let y = 0; y < TEX_SIZE; y++) {
    for (let x = 0; x < TEX_SIZE; x++) {
      let v = 0.55 + (hash(s, x, y) - 0.5) * 0.14;
      if (hash(s ^ 0xa1, x, y) < 0.06) v -= 0.12;
      if (hash(s ^ 0xa2, x, y) < 0.02) v += 0.08;
      setPx(data, TexLayer.Stone, x, y, c255(v), c255(v), c255(v));
    }
  }
}

function makeDirt(data: Uint8Array, seed: number): void {
  const s = seed ^ 0x22335577;
  for (let y = 0; y < TEX_SIZE; y++) {
    for (let x = 0; x < TEX_SIZE; x++) {
      const n = hash(s, x, y) - 0.5;
      const R = 0.42 + n * 0.16;
      const G = 0.28 + n * 0.12;
      const B = 0.18 + n * 0.08;
      setPx(data, TexLayer.Dirt, x, y, c255(R), c255(G), c255(B));
    }
  }
}

function makeGrassTop(data: Uint8Array, seed: number): void {
  const s = seed ^ 0x33aabbcc;
  for (let y = 0; y < TEX_SIZE; y++) {
    for (let x = 0; x < TEX_SIZE; x++) {
      const n = hash(s, x, y) - 0.5;
      const R = 0.34 + n * 0.10;
      const G = 0.62 + n * 0.18;
      const B = 0.30 + n * 0.10;
      setPx(data, TexLayer.GrassTop, x, y, c255(R), c255(G), c255(B));
    }
  }
}

function makeGrassSide(data: Uint8Array, seed: number): void {
  // Franja de césped en las filas superiores (y ≥ 12, ≈ 25 % del alto),
  // tierra debajo. Como v crece con world Y y la textura se repite cada
  // unidad, el césped queda en la parte alta de cada bloque.
  const sd = seed ^ 0x448a11f0;
  const sg = seed ^ 0x44e28c22;
  for (let y = 0; y < TEX_SIZE; y++) {
    for (let x = 0; x < TEX_SIZE; x++) {
      if (y >= 12) {
        const n = hash(sg, x, y) - 0.5;
        setPx(
          data,
          TexLayer.GrassSide,
          x,
          y,
          c255(0.34 + n * 0.10),
          c255(0.60 + n * 0.16),
          c255(0.28 + n * 0.10),
        );
      } else {
        const n = hash(sd, x, y) - 0.5;
        setPx(
          data,
          TexLayer.GrassSide,
          x,
          y,
          c255(0.42 + n * 0.16),
          c255(0.28 + n * 0.12),
          c255(0.18 + n * 0.08),
        );
      }
    }
  }
}

function makeSand(data: Uint8Array, seed: number): void {
  const s = seed ^ 0x5599aacc;
  for (let y = 0; y < TEX_SIZE; y++) {
    for (let x = 0; x < TEX_SIZE; x++) {
      const n = hash(s, x, y) - 0.5;
      const R = 0.88 + n * 0.08;
      const G = 0.82 + n * 0.08;
      const B = 0.62 + n * 0.10;
      setPx(data, TexLayer.Sand, x, y, c255(R), c255(G), c255(B));
    }
  }
}

function makeWaterTop(data: Uint8Array, seed: number): void {
  const s = seed ^ 0x6dead001;
  for (let y = 0; y < TEX_SIZE; y++) {
    for (let x = 0; x < TEX_SIZE; x++) {
      const wave = Math.sin((x + y) * 0.5) * 0.08;
      const n = (hash(s, x, y) - 0.5) * 0.06;
      const R = 0.22 + n;
      const G = 0.48 + wave + n;
      const B = 0.85 + wave + n;
      setPx(data, TexLayer.WaterTop, x, y, c255(R), c255(G), c255(B));
    }
  }
}

function makeWaterSide(data: Uint8Array, seed: number): void {
  const s = seed ^ 0x6e00fead;
  for (let y = 0; y < TEX_SIZE; y++) {
    for (let x = 0; x < TEX_SIZE; x++) {
      const n = (hash(s, x, y) - 0.5) * 0.06;
      // Trazos verticales suaves cada ~4 columnas.
      const stripe = ((x + 1) % 5 === 0 ? 0.06 : 0) - (x % 3 === 0 ? 0.02 : 0);
      const R = 0.2 + n + stripe;
      const G = 0.42 + n + stripe;
      const B = 0.8 + n + stripe;
      setPx(data, TexLayer.WaterSide, x, y, c255(R), c255(G), c255(B));
    }
  }
}

function makeLogTop(data: Uint8Array, seed: number): void {
  // Anillos concéntricos: bandas a distancias del centro (7.5, 7.5).
  const s = seed ^ 0x7b31bea1;
  const cx = 7.5;
  const cy = 7.5;
  for (let y = 0; y < TEX_SIZE; y++) {
    for (let x = 0; x < TEX_SIZE; x++) {
      const d = Math.hypot(x - cx, y - cy);
      const ring = (Math.floor(d) + Math.round(hash(s, x, y) * 1.5)) % 3;
      const base = ring === 0 ? 0.5 : ring === 1 ? 0.42 : 0.36;
      const R = base + 0.1;
      const G = base * 0.72;
      const B = base * 0.38;
      setPx(data, TexLayer.LogTop, x, y, c255(R), c255(G), c255(B));
    }
  }
}

function makeLogSide(data: Uint8Array, seed: number): void {
  // Corteza: rayas verticales con variaciones por columna.
  const s = seed ^ 0x7c008a55;
  for (let x = 0; x < TEX_SIZE; x++) {
    const colTone = 0.32 + (hash(s, x, 0) - 0.5) * 0.10;
    for (let y = 0; y < TEX_SIZE; y++) {
      const n = (hash(s, x, y + 100) - 0.5) * 0.06;
      const R = colTone * 1.55 + n;
      const G = colTone * 0.95 + n;
      const B = colTone * 0.55 + n;
      setPx(data, TexLayer.LogSide, x, y, c255(R), c255(G), c255(B));
    }
  }
}

function makeLeaves(data: Uint8Array, seed: number): void {
  const s = seed ^ 0x8fee1a01;
  for (let y = 0; y < TEX_SIZE; y++) {
    for (let x = 0; x < TEX_SIZE; x++) {
      const n = hash(s, x, y);
      let v = 0.35;
      if (n < 0.15) v = 0.28;
      else if (n > 0.85) v = 0.44;
      const R = v * 0.55;
      const G = v * 1.55;
      const B = v * 0.55;
      setPx(data, TexLayer.Leaves, x, y, c255(R), c255(G), c255(B));
    }
  }
}

function makePlanks(data: Uint8Array, seed: number): void {
  // Tablones horizontales de 4 filas con línea oscura entre ellos.
  const s = seed ^ 0x9a337700;
  for (let y = 0; y < TEX_SIZE; y++) {
    const isSeam = y % 4 === 0;
    for (let x = 0; x < TEX_SIZE; x++) {
      const n = (hash(s, x, y) - 0.5) * 0.06;
      let R = 0.68 + n;
      let G = 0.53 + n;
      let B = 0.30 + n;
      if (isSeam) {
        R -= 0.18;
        G -= 0.16;
        B -= 0.12;
      }
      setPx(data, TexLayer.Planks, x, y, c255(R), c255(G), c255(B));
    }
  }
}

function makeBrick(data: Uint8Array, seed: number): void {
  // Ladrillos 8×4 con juntas escalonadas.
  const s = seed ^ 0xa211f177;
  for (let y = 0; y < TEX_SIZE; y++) {
    const row = Math.floor(y / 4);
    const offset = (row % 2) * 4;
    const isMortarY = y % 4 === 0;
    for (let x = 0; x < TEX_SIZE; x++) {
      const isMortarX = (x + offset) % 8 === 0;
      const mortar = isMortarY || isMortarX;
      const n = (hash(s, x, y) - 0.5) * 0.06;
      let R = 0.6 + n;
      let G = 0.28 + n;
      let B = 0.22 + n;
      if (mortar) {
        R = 0.55 + n;
        G = 0.5 + n;
        B = 0.45 + n;
      }
      setPx(data, TexLayer.Brick, x, y, c255(R), c255(G), c255(B));
    }
  }
}

function makeGlass(data: Uint8Array, seed: number): void {
  // Cristal: la textura es opaca (alpha=255) pero el material translúcido
  // aplica `uOpacity` para verlo semi-transparente. Se marca el borde de la
  // baldosa para que se distinga el bloque.
  const s = seed ^ 0xb3aa8123;
  for (let y = 0; y < TEX_SIZE; y++) {
    for (let x = 0; x < TEX_SIZE; x++) {
      const border = x === 0 || y === 0 || x === TEX_SIZE - 1 || y === TEX_SIZE - 1;
      const n = (hash(s, x, y) - 0.5) * 0.05;
      const R = (border ? 0.55 : 0.78) + n;
      const G = (border ? 0.65 : 0.88) + n;
      const B = (border ? 0.75 : 0.96) + n;
      setPx(data, TexLayer.Glass, x, y, c255(R), c255(G), c255(B));
    }
  }
}

export function createBlockTexture(seed: number): THREE.DataArrayTexture {
  const data = new Uint8Array(TEX_SIZE * TEX_SIZE * 4 * LAYER_COUNT);
  makeStone(data, seed);
  makeDirt(data, seed);
  makeGrassTop(data, seed);
  makeGrassSide(data, seed);
  makeSand(data, seed);
  makeWaterTop(data, seed);
  makeWaterSide(data, seed);
  makeLogTop(data, seed);
  makeLogSide(data, seed);
  makeLeaves(data, seed);
  makePlanks(data, seed);
  makeBrick(data, seed);
  makeGlass(data, seed);

  const tex = new THREE.DataArrayTexture(data, TEX_SIZE, TEX_SIZE, LAYER_COUNT);
  tex.format = THREE.RGBAFormat;
  tex.type = THREE.UnsignedByteType;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

export function texLayerFor(block: Block, face: 'top' | 'side' | 'bottom'): number {
  // Todos los niveles de agua (fuente y WaterL1..7) usan las capas de agua.
  if (isWater(block)) return face === 'side' ? TexLayer.WaterSide : TexLayer.WaterTop;
  switch (block) {
    case Block.Stone:
      return TexLayer.Stone;
    case Block.Dirt:
      return TexLayer.Dirt;
    case Block.Grass:
      return face === 'top'
        ? TexLayer.GrassTop
        : face === 'bottom'
          ? TexLayer.Dirt
          : TexLayer.GrassSide;
    case Block.Sand:
      return TexLayer.Sand;
    case Block.Log:
      return face === 'side' ? TexLayer.LogSide : TexLayer.LogTop;
    case Block.Leaves:
      return TexLayer.Leaves;
    case Block.Planks:
      return TexLayer.Planks;
    case Block.Brick:
      return TexLayer.Brick;
    case Block.Glass:
      return TexLayer.Glass;
    default:
      return TexLayer.Stone;
  }
}
