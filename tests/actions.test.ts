import { describe, expect, it } from 'vitest';
import { HexGrid, SquareGrid } from '../src/grid';
import type { Grid } from '../src/grid';
import { Block } from '../src/world/blocks';
import { tryBreak, tryPlace } from '../src/interact/actions';
import { DEFAULT_PLAYER_CONFIG } from '../src/player/config';
import { createPlayer } from '../src/player/physics';
import type { PlayerState } from '../src/player/physics';
import type { RayHit, RaySampler } from '../src/interact/raycast';

const CFG = DEFAULT_PLAYER_CONFIG;

class MockSampler implements RaySampler {
  private readonly blocks = new Map<string, Block>();
  hasChunkAt(): boolean {
    return true;
  }
  getBlock(a: number, b: number, y: number): Block {
    return this.blocks.get(`${a},${b},${y}`) ?? Block.Air;
  }
  set(a: number, b: number, y: number, block: Block): void {
    this.blocks.set(`${a},${b},${y}`, block);
  }
}

function hit(
  cell: { a: number; b: number },
  y: number,
  place: { a: number; b: number },
  placeY: number,
): RayHit {
  return {
    cell,
    yLayer: y,
    placeCell: place,
    placeYLayer: placeY,
    face: 'top',
    point: { x: 0, y, z: 0 },
    distance: 1,
  };
}

const grids: ReadonlyArray<readonly [string, () => Grid]> = [
  ['HexGrid', () => new HexGrid()],
  ['SquareGrid', () => new SquareGrid()],
];

describe.each(grids)('%s — actions', (_, makeGrid) => {
  it('tryBreak devuelve la edición al aire, salvo en y=0', () => {
    const h = hit({ a: 5, b: 3 }, 10, { a: 5, b: 3 }, 11);
    const act = tryBreak(h);
    expect(act).not.toBeNull();
    expect(act!.block).toBe(Block.Air);

    // y=0 no se puede romper.
    const h0 = hit({ a: 5, b: 3 }, 0, { a: 5, b: 3 }, 1);
    expect(tryBreak(h0)).toBeNull();
  });

  it('tryPlace no coloca dentro del cilindro del jugador', () => {
    const grid = makeGrid();
    const s = new MockSampler();
    const state: PlayerState = createPlayer();
    state.position = { x: 0, y: 20, z: 0 };

    // placeCell es la celda del jugador; la Y coincide con su torso.
    const cellAtPlayer = grid.cellAt({ x: 0, z: 0 });
    const h = hit({ a: cellAtPlayer.a + 1, b: cellAtPlayer.b }, 20, cellAtPlayer, 21);
    // y=21 está dentro del cilindro (pies en 20, cabeza en 21.8).
    expect(tryPlace(h, Block.Stone, grid, s, state, CFG)).toBeNull();
  });

  it('tryPlace acepta si el bloque queda por encima del jugador', () => {
    const grid = makeGrid();
    const s = new MockSampler();
    const state: PlayerState = createPlayer();
    state.position = { x: 0, y: 20, z: 0 };
    const cellAtPlayer = grid.cellAt({ x: 0, z: 0 });
    // placeCell = celda del jugador pero MUCHO más arriba (y=25).
    const h = hit({ a: cellAtPlayer.a, b: cellAtPlayer.b }, 26, cellAtPlayer, 25);
    const act = tryPlace(h, Block.Stone, grid, s, state, CFG);
    expect(act).not.toBeNull();
    expect(act!.block).toBe(Block.Stone);
  });

  it('tryPlace sobre agua la sustituye', () => {
    const grid = makeGrid();
    const s = new MockSampler();
    s.set(3, 3, 15, Block.Water);
    const state: PlayerState = createPlayer();
    state.position = { x: 20, y: 20, z: 20 }; // lejos
    const h = hit({ a: 3, b: 3 }, 14, { a: 3, b: 3 }, 15);
    const act = tryPlace(h, Block.Sand, grid, s, state, CFG);
    expect(act).not.toBeNull();
    expect(act!.block).toBe(Block.Sand);
  });

  it('tryPlace rechaza si ya hay bloque sólido en placeCell', () => {
    const grid = makeGrid();
    const s = new MockSampler();
    s.set(4, 4, 20, Block.Stone);
    const state: PlayerState = createPlayer();
    state.position = { x: 20, y: 20, z: 20 };
    const h = hit({ a: 5, b: 4 }, 20, { a: 4, b: 4 }, 20);
    expect(tryPlace(h, Block.Brick, grid, s, state, CFG)).toBeNull();
  });
});
