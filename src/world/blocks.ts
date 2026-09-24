// Tipos de bloque (Uint8) y sus propiedades. Fase 2a: colores planos por cara,
// sin texturas. Se añadirán en la fase 2b.

export enum Block {
  Air = 0,
  Stone = 1,
  Dirt = 2,
  Grass = 3,
  Sand = 4,
  Water = 5, // fuente (nivel 8)
  Log = 6,
  Leaves = 7,
  Planks = 8,
  Brick = 9,
  Glass = 10,
  // Agua corriente por niveles 1..7 (7 = casi llena, 1 = casi vacía).
  WaterL1 = 11,
  WaterL2 = 12,
  WaterL3 = 13,
  WaterL4 = 14,
  WaterL5 = 15,
  WaterL6 = 16,
  WaterL7 = 17,
}

export type RGB = readonly [number, number, number];

export interface BlockDef {
  readonly name: string; // castellano, para UI
  readonly solid: boolean; // participa en colisiones (fase 3)
  readonly opaque: boolean; // culling de caras contra este bloque
  readonly transparent: boolean; // se dibuja en el mesh transparente
  readonly top: RGB;
  readonly side: RGB;
  readonly bottom: RGB;
}

// El aire nunca se dibuja; existe la entrada para simplificar el acceso.
const AIR_DEF: BlockDef = {
  name: 'aire',
  solid: false,
  opaque: false,
  transparent: false,
  top: [0, 0, 0],
  side: [0, 0, 0],
  bottom: [0, 0, 0],
};

export const BLOCKS: readonly BlockDef[] = [
  AIR_DEF,
  {
    name: 'piedra',
    solid: true,
    opaque: true,
    transparent: false,
    top: [0.55, 0.55, 0.55],
    side: [0.5, 0.5, 0.5],
    bottom: [0.45, 0.45, 0.45],
  },
  {
    name: 'tierra',
    solid: true,
    opaque: true,
    transparent: false,
    top: [0.45, 0.3, 0.2],
    side: [0.42, 0.28, 0.18],
    bottom: [0.4, 0.26, 0.16],
  },
  {
    name: 'césped',
    solid: true,
    opaque: true,
    transparent: false,
    top: [0.36, 0.62, 0.32],
    side: [0.42, 0.28, 0.18],
    bottom: [0.4, 0.26, 0.16],
  },
  {
    name: 'arena',
    solid: true,
    opaque: true,
    transparent: false,
    top: [0.88, 0.82, 0.62],
    side: [0.85, 0.79, 0.58],
    bottom: [0.8, 0.74, 0.55],
  },
  {
    name: 'agua',
    solid: false,
    opaque: false,
    transparent: true,
    top: [0.22, 0.45, 0.85],
    side: [0.2, 0.42, 0.8],
    bottom: [0.18, 0.4, 0.75],
  },
  {
    name: 'tronco',
    solid: true,
    opaque: true,
    transparent: false,
    top: [0.55, 0.4, 0.22],
    side: [0.35, 0.25, 0.15],
    bottom: [0.55, 0.4, 0.22],
  },
  {
    name: 'hojas',
    solid: true,
    opaque: true,
    transparent: false,
    top: [0.22, 0.45, 0.18],
    side: [0.2, 0.42, 0.16],
    bottom: [0.18, 0.38, 0.14],
  },
  {
    name: 'tablones',
    solid: true,
    opaque: true,
    transparent: false,
    top: [0.7, 0.55, 0.32],
    side: [0.68, 0.52, 0.3],
    bottom: [0.65, 0.5, 0.28],
  },
  {
    name: 'ladrillo',
    solid: true,
    opaque: true,
    transparent: false,
    top: [0.6, 0.28, 0.22],
    side: [0.55, 0.24, 0.18],
    bottom: [0.5, 0.22, 0.16],
  },
  {
    name: 'cristal',
    solid: true,
    opaque: false,
    transparent: true,
    top: [0.75, 0.85, 0.95],
    side: [0.7, 0.82, 0.92],
    bottom: [0.7, 0.82, 0.92],
  },
  // Agua corriente L1..L7. Nombre, propiedades y colores idénticos a la fuente:
  // el mesher dibuja la tapa a una altura menor según el nivel.
  ...([1, 2, 3, 4, 5, 6, 7].map((n) => ({
    name: `agua L${n}`,
    solid: false,
    opaque: false,
    transparent: true,
    top: [0.22, 0.45, 0.85],
    side: [0.2, 0.42, 0.8],
    bottom: [0.18, 0.4, 0.75],
  })) as BlockDef[]),
];

export function def(block: Block): BlockDef {
  return BLOCKS[block];
}

export const isOpaque = (b: Block): boolean => BLOCKS[b].opaque;
export const isTransparent = (b: Block): boolean => BLOCKS[b].transparent;
export const isSolid = (b: Block): boolean => BLOCKS[b].solid;

// Utilidades de agua por niveles. El bloque `Water` (5) es la fuente
// (nivel 8, altura completa). `WaterL1..WaterL7` (11..17) son agua corriente
// con niveles 1..7. El mesher pinta la tapa a altura level/8 y la física
// trata cualquier `isWater(b)` como agua.
export function isWater(b: Block): boolean {
  return b === Block.Water || (b >= Block.WaterL1 && b <= Block.WaterL7);
}

export function waterLevel(b: Block): number {
  if (b === Block.Water) return 8;
  if (b >= Block.WaterL1 && b <= Block.WaterL7) return b - Block.WaterL1 + 1;
  return 0;
}

export function waterBlockAtLevel(level: number): Block {
  if (level >= 8) return Block.Water;
  if (level >= 1 && level <= 7) return (Block.WaterL1 + level - 1) as Block;
  return Block.Air;
}
