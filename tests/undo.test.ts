import { describe, expect, it } from 'vitest';
import { Block } from '../src/world/blocks';
import { CHUNK_HEIGHT } from '../src/world/Chunk';
import {
  EditableWorld,
  UndoStack,
  applyPlan,
  emptyPlan,
  revertEntry,
} from '../src/presets/build';
import { planCasa } from '../src/presets/presets';

class MockWorld implements EditableWorld {
  private readonly blocks = new Map<string, Block>();
  private readonly key = (a: number, b: number, y: number): string => `${a},${b},${y}`;
  getBlock(a: number, b: number, y: number): Block {
    if (y < 0 || y >= CHUNK_HEIGHT) return Block.Air;
    return this.blocks.get(this.key(a, b, y)) ?? Block.Air;
  }
  setBlock(a: number, b: number, y: number, block: Block): boolean {
    if (y < 0 || y >= CHUNK_HEIGHT) return false;
    if (block === Block.Air) this.blocks.delete(this.key(a, b, y));
    else this.blocks.set(this.key(a, b, y), block);
    return true;
  }
  snapshot(): Map<string, Block> {
    return new Map(this.blocks);
  }
}

function equalMaps(a: Map<string, Block>, b: Map<string, Block>): boolean {
  if (a.size !== b.size) return false;
  for (const [k, v] of a) if (b.get(k) !== v) return false;
  return true;
}

describe('undo — deshacer restaura exactamente el estado previo', () => {
  it('preset casa: revertEntry devuelve el mundo al estado inicial', () => {
    const hex = new MockWorld();
    const sq = new MockWorld();
    // Estado inicial: unos cuantos bloques ya colocados por el "jugador".
    hex.setBlock(5, 5, 20, Block.Brick);
    hex.setBlock(-3, 2, 22, Block.Log);
    sq.setBlock(0, 0, 20, Block.Sand);

    const beforeHex = hex.snapshot();
    const beforeSq = sq.snapshot();

    const plan = planCasa({ x: 0.5, y: 20, z: 0.5 });
    const entry = applyPlan(plan, hex, sq, 'test casa');

    // Después de aplicar, el mundo es distinto.
    expect(equalMaps(beforeHex, hex.snapshot())).toBe(false);

    revertEntry(entry, hex, sq);

    // Tras deshacer, todo debe estar exactamente como al principio.
    expect(equalMaps(beforeHex, hex.snapshot())).toBe(true);
    expect(equalMaps(beforeSq, sq.snapshot())).toBe(true);
  });

  it('UndoStack respeta el máximo (10 entradas por defecto)', () => {
    const stack = new UndoStack(3);
    for (let i = 0; i < 5; i++) {
      stack.push({ label: `p${i}`, hex: [], square: [] });
    }
    expect(stack.size()).toBe(3);
    expect(stack.pop()!.label).toBe('p4');
    expect(stack.pop()!.label).toBe('p3');
    expect(stack.pop()!.label).toBe('p2');
    expect(stack.pop()).toBeUndefined();
  });

  it('secuencia de dos presets: dos undos vuelven al estado inicial', () => {
    const hex = new MockWorld();
    const sq = new MockWorld();
    const before = { hex: hex.snapshot(), sq: sq.snapshot() };
    const stack = new UndoStack(10);

    const p1 = planCasa({ x: 0, y: 20, z: 0 }, { ancho: 5, fondo: 5, altura: 3 });
    stack.push(applyPlan(p1, hex, sq, 'casa1'));
    const p2 = planCasa({ x: 20, y: 20, z: 0 }, { ancho: 7, fondo: 5, altura: 4 });
    stack.push(applyPlan(p2, hex, sq, 'casa2'));

    revertEntry(stack.pop()!, hex, sq);
    revertEntry(stack.pop()!, hex, sq);

    expect(equalMaps(before.hex, hex.snapshot())).toBe(true);
    expect(equalMaps(before.sq, sq.snapshot())).toBe(true);
    expect(stack.size()).toBe(0);
  });

  it('plan vacío no toca el mundo', () => {
    const hex = new MockWorld();
    const sq = new MockWorld();
    hex.setBlock(1, 1, 20, Block.Stone);
    const before = hex.snapshot();
    const entry = applyPlan(emptyPlan(), hex, sq, 'vacío');
    expect(equalMaps(before, hex.snapshot())).toBe(true);
    revertEntry(entry, hex, sq);
    expect(equalMaps(before, hex.snapshot())).toBe(true);
  });
});
