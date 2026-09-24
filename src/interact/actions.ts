import type { Cell, Grid } from '../grid';
import { Block } from '../world/blocks';
import { CHUNK_HEIGHT } from '../world/Chunk';
import type { PlayerConfig } from '../player/config';
import type { PlayerState } from '../player/physics';
import { circleTouchesCell } from '../player/physics';
import type { RayHit, RaySampler } from './raycast';

// Resultado propuesto por una acción; el mundo real lo aplica con setBlock.
// Devolver la propuesta en lugar de mutar mantiene actions.ts puro y testeable.

export interface EditAction {
  readonly cell: Cell;
  readonly y: number;
  readonly block: Block; // Air si es romper
}

// Rompe el bloque apuntado. La capa y=0 no se puede romper (queda como suelo
// del mundo).
export function tryBreak(hit: RayHit): EditAction | null {
  if (hit.yLayer <= 0) return null;
  return { cell: hit.cell, y: hit.yLayer, block: Block.Air };
}

// Coloca el bloque seleccionado en `hit.placeCell/placeYLayer`. Solo se puede
// colocar sobre aire o agua (el agua queda sustituida). Nunca dentro del
// cilindro del jugador.
export function tryPlace(
  hit: RayHit,
  block: Block,
  grid: Grid,
  sampler: RaySampler,
  playerState: PlayerState,
  cfg: PlayerConfig,
): EditAction | null {
  const { placeCell, placeYLayer } = hit;
  if (placeYLayer < 0 || placeYLayer >= CHUNK_HEIGHT) return null;

  const existing = sampler.getBlock(placeCell.a, placeCell.b, placeYLayer);
  if (existing !== Block.Air && existing !== Block.Water) return null;

  if (wouldCollideWithPlayer(grid, placeCell, placeYLayer, playerState, cfg)) return null;

  return { cell: placeCell, y: placeYLayer, block };
}

// ¿Un bloque sólido en (cell, y) chocaría con el cilindro del jugador?
function wouldCollideWithPlayer(
  grid: Grid,
  cell: Cell,
  y: number,
  state: PlayerState,
  cfg: PlayerConfig,
): boolean {
  const yBot = Math.floor(state.position.y + 1e-6);
  const yTop = Math.floor(state.position.y + cfg.height - 1e-6);
  if (y < yBot || y > yTop) return false;
  return circleTouchesCell(grid, cell, state.position.x, state.position.z, cfg.radius);
}
