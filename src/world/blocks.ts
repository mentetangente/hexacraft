// Tipos de bloque (Uint8) y sus propiedades. Fase 2a: colores planos por cara,
// sin texturas. Se añadirán en la fase 2b.

export enum Block {
  Air = 0,
  Stone = 1,
  Dirt = 2,
  Grass = 3,
  Sand = 4,
  Water = 5,
  Log = 6,
  Leaves = 7,
  Planks = 8,
  Brick = 9,
  Glass = 10,
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
];

export function def(block: Block): BlockDef {
  return BLOCKS[block];
}

export const isOpaque = (b: Block): boolean => BLOCKS[b].opaque;
export const isTransparent = (b: Block): boolean => BLOCKS[b].transparent;
export const isSolid = (b: Block): boolean => BLOCKS[b].solid;
