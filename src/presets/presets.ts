import type { Cell, Grid } from '../grid';
import { HexGrid, SquareGrid } from '../grid';
import { Block } from '../world/blocks';
import { CHUNK_HEIGHT } from '../world/Chunk';
import { CellChange, DualPlan, emptyPlan } from './build';

// Punto de mundo donde se ancla el preset: si el usuario apuntaba a algo, ese
// es el placeCell del hit (en coord de mundo); si no, la posición de la cámara.
export interface Anchor {
  readonly x: number;
  readonly y: number; // capa Y donde apoyar la base
  readonly z: number;
}

// ---------- helpers ----------

const cellKey = (c: Cell, y: number): string => `${c.a},${c.b},${y}`;

function addChange(list: CellChange[], seen: Set<string>, cell: Cell, y: number, block: Block): void {
  if (y < 0 || y >= CHUNK_HEIGHT) return;
  const k = cellKey(cell, y);
  if (seen.has(k)) return;
  seen.add(k);
  list.push({ cell, y, block });
}

// ---------- Torre ----------

export interface TorreOptions {
  radio?: number; // radio en unidades de mundo (por defecto 4)
  altura?: number; // por defecto 6
}

function torreForGrid(grid: Grid, anchor: Anchor, opts: Required<TorreOptions>): CellChange[] {
  const changes: CellChange[] = [];
  const seen = new Set<string>();
  const inside = grid.cellsInCircle({ x: anchor.x, z: anchor.z }, opts.radio);
  const insideSet = new Set(inside.map((c) => grid.key(c)));
  // Muro: celdas del disco con al menos un vecino fuera.
  const wall = inside.filter((c) =>
    grid.neighbors(c).some((n) => !insideSet.has(grid.key(n))),
  );
  const baseY = Math.floor(anchor.y);
  for (const cell of wall) {
    for (let dy = 0; dy < opts.altura; dy++) {
      addChange(changes, seen, cell, baseY + dy, Block.Stone);
    }
  }
  // Almenas alternas: por índice de recorrido, pares llevan almena arriba.
  wall.forEach((cell, i) => {
    if (i % 2 === 0) addChange(changes, seen, cell, baseY + opts.altura, Block.Stone);
  });
  return changes;
}

export function planTorre(anchor: Anchor, opts?: TorreOptions): DualPlan {
  const full: Required<TorreOptions> = { radio: opts?.radio ?? 4, altura: opts?.altura ?? 6 };
  return {
    hex: torreForGrid(new HexGrid(), anchor, full),
    square: torreForGrid(new SquareGrid(), anchor, full),
  };
}

// ---------- Casa ----------

export interface CasaOptions {
  ancho?: number; // eje X
  fondo?: number; // eje Z
  altura?: number;
}

function pointInRect(
  x: number,
  z: number,
  cx: number,
  cz: number,
  ancho: number,
  fondo: number,
): boolean {
  return (
    x >= cx - ancho / 2 &&
    x <= cx + ancho / 2 &&
    z >= cz - fondo / 2 &&
    z <= cz + fondo / 2
  );
}

// Devuelve las celdas de `grid` cuyo centro cae dentro del rectángulo de
// mundo definido por (cx, cz, ancho, fondo). Se enumera un bbox de celdas
// candidatas y se filtra por centro.
function cellsInRect(grid: Grid, cx: number, cz: number, ancho: number, fondo: number): Cell[] {
  const out: Cell[] = [];
  // Estimación gruesa del bbox en celdas usando cellAt de las 4 esquinas.
  const corners = [
    grid.cellAt({ x: cx - ancho / 2 - 1, z: cz - fondo / 2 - 1 }),
    grid.cellAt({ x: cx + ancho / 2 + 1, z: cz - fondo / 2 - 1 }),
    grid.cellAt({ x: cx - ancho / 2 - 1, z: cz + fondo / 2 + 1 }),
    grid.cellAt({ x: cx + ancho / 2 + 1, z: cz + fondo / 2 + 1 }),
  ];
  let aMin = Infinity;
  let aMax = -Infinity;
  let bMin = Infinity;
  let bMax = -Infinity;
  for (const c of corners) {
    if (c.a < aMin) aMin = c.a;
    if (c.a > aMax) aMax = c.a;
    if (c.b < bMin) bMin = c.b;
    if (c.b > bMax) bMax = c.b;
  }
  for (let b = bMin; b <= bMax; b++) {
    for (let a = aMin; a <= aMax; a++) {
      const cell = { a, b };
      const p = grid.center(cell);
      if (pointInRect(p.x, p.z, cx, cz, ancho, fondo)) out.push(cell);
    }
  }
  return out;
}

// Selección de una arista para la puerta: buscamos la celda de muro cuyo
// centro tenga el menor x (parte oeste) y ponemos la puerta ahí.
function pickDoorCell(wall: Cell[], grid: Grid): Cell | null {
  if (wall.length === 0) return null;
  let best = wall[0];
  let bestX = grid.center(best).x;
  for (const c of wall) {
    const x = grid.center(c).x;
    if (x < bestX) {
      bestX = x;
      best = c;
    }
  }
  return best;
}

// Ventanas: celdas de muro cuyo centro esté cerca de la mitad de las paredes
// norte y sur (mayores/menores z), a altura media.
function pickWindowCells(wall: Cell[], grid: Grid): Cell[] {
  if (wall.length === 0) return [];
  let north = wall[0];
  let south = wall[0];
  for (const c of wall) {
    const z = grid.center(c).z;
    if (z < grid.center(north).z) north = c;
    if (z > grid.center(south).z) south = c;
  }
  return [north, south];
}

export function planCasa(anchor: Anchor, opts?: CasaOptions): DualPlan {
  const full: Required<CasaOptions> = {
    ancho: opts?.ancho ?? 7,
    fondo: opts?.fondo ?? 5,
    altura: opts?.altura ?? 4,
  };
  const forGrid = (grid: Grid): CellChange[] => {
    const changes: CellChange[] = [];
    const seen = new Set<string>();
    const inside = cellsInRect(grid, anchor.x, anchor.z, full.ancho, full.fondo);
    const insideSet = new Set(inside.map((c) => grid.key(c)));
    const wall = inside.filter((c) =>
      grid.neighbors(c).some((n) => !insideSet.has(grid.key(n))),
    );
    const baseY = Math.floor(anchor.y);
    // Muros de piedra hasta baseY + altura - 1.
    for (const cell of wall) {
      for (let dy = 0; dy < full.altura; dy++) {
        addChange(changes, seen, cell, baseY + dy, Block.Stone);
      }
    }
    // Puerta: hueco de 2 de alto en una celda del muro.
    const door = pickDoorCell(wall, grid);
    if (door) {
      addChange(changes, seen, door, baseY, Block.Air);
      addChange(changes, seen, door, baseY + 1, Block.Air);
    }
    // Ventanas: dos celdas de cristal a altura media.
    for (const win of pickWindowCells(wall, grid)) {
      addChange(changes, seen, win, baseY + 1, Block.Glass);
    }
    // Tejado plano de tablones sobre TODAS las celdas del interior.
    for (const cell of inside) {
      addChange(changes, seen, cell, baseY + full.altura, Block.Planks);
    }
    return changes;
  };
  return {
    hex: forGrid(new HexGrid()),
    square: forGrid(new SquareGrid()),
  };
}

// ---------- Túnel ----------

export interface TunelOptions {
  angulo?: number; // en grados desde +X, por defecto 60
  longitud?: number; // en unidades de mundo, por defecto 20
}

function tunelForGrid(grid: Grid, anchor: Anchor, angDeg: number, length: number): CellChange[] {
  const changes: CellChange[] = [];
  const seen = new Set<string>();
  const rad = (angDeg * Math.PI) / 180;
  const start = grid.cellAt({ x: anchor.x, z: anchor.z });
  const end = grid.cellAt({
    x: anchor.x + Math.cos(rad) * length,
    z: anchor.z + Math.sin(rad) * length,
  });
  const line = grid.line(start, end);
  const baseY = Math.floor(anchor.y);
  for (const cell of line) {
    addChange(changes, seen, cell, baseY, Block.Air);
    addChange(changes, seen, cell, baseY + 1, Block.Air);
  }
  return changes;
}

export function planTunel(anchor: Anchor, opts?: TunelOptions): DualPlan {
  const angulo = opts?.angulo ?? 60;
  const longitud = opts?.longitud ?? 20;
  return {
    hex: tunelForGrid(new HexGrid(), anchor, angulo, longitud),
    square: tunelForGrid(new SquareGrid(), anchor, angulo, longitud),
  };
}

// ---------- Fuente ----------

export function planFuente(anchor: Anchor): DualPlan {
  const y = Math.floor(anchor.y);
  const hex = new HexGrid().cellAt({ x: anchor.x, z: anchor.z });
  const sq = new SquareGrid().cellAt({ x: anchor.x, z: anchor.z });
  return {
    hex: [{ cell: hex, y, block: Block.Water }],
    square: [{ cell: sq, y, block: Block.Water }],
  };
}

// ---------- Registro ----------

export type PresetName = 'torre' | 'casa' | 'tunel' | 'fuente';

export function buildPreset(name: PresetName, anchor: Anchor, opts?: object): DualPlan {
  switch (name) {
    case 'torre':
      return planTorre(anchor, opts as TorreOptions);
    case 'casa':
      return planCasa(anchor, opts as CasaOptions);
    case 'tunel':
      return planTunel(anchor, opts as TunelOptions);
    case 'fuente':
      return planFuente(anchor);
    default:
      return emptyPlan();
  }
}
