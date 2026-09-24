import { describe, expect, it } from 'vitest';
import { Block } from '../src/world/blocks';
import { HOTBAR_SIZE, INV_SIZE, Inventory, MAX_STACK } from '../src/game/inventory';

describe('Inventory — apilado y reparto', () => {
  it('add rellena pilas existentes antes de ocupar huecos', () => {
    const inv = new Inventory();
    inv.set(0, { block: Block.Stone, count: 30 });
    // 20 stones caben en la casilla 0.
    expect(inv.add(Block.Stone, 20)).toBe(0);
    expect(inv.get(0)!.count).toBe(50);
    expect(inv.get(1)).toBeNull();
  });

  it('add divide en varias pilas cuando supera MAX_STACK', () => {
    const inv = new Inventory();
    expect(inv.add(Block.Dirt, MAX_STACK + 20)).toBe(0);
    expect(inv.get(0)!.count).toBe(MAX_STACK);
    expect(inv.get(1)!.count).toBe(20);
  });

  it('add devuelve el sobrante cuando el inventario está lleno', () => {
    const inv = new Inventory();
    for (let i = 0; i < INV_SIZE; i++) inv.set(i, { block: Block.Brick, count: MAX_STACK });
    expect(inv.add(Block.Brick, 10)).toBe(10);
    expect(inv.add(Block.Stone, 5)).toBe(5);
  });

  it('remove quita hasta agotar la casilla', () => {
    const inv = new Inventory();
    inv.set(3, { block: Block.Sand, count: 40 });
    expect(inv.remove(3, 25)).toBe(25);
    expect(inv.get(3)!.count).toBe(15);
    expect(inv.remove(3, 100)).toBe(15);
    expect(inv.get(3)).toBeNull();
  });

  it('leftClick con mano vacía coge toda la pila', () => {
    const inv = new Inventory();
    inv.set(0, { block: Block.Stone, count: 32 });
    const hand = inv.leftClick(0, null);
    expect(hand).toEqual({ block: Block.Stone, count: 32 });
    expect(inv.get(0)).toBeNull();
  });

  it('leftClick con mano y casilla del mismo tipo fusiona hasta 64', () => {
    const inv = new Inventory();
    inv.set(0, { block: Block.Stone, count: 50 });
    const hand = inv.leftClick(0, { block: Block.Stone, count: 20 });
    expect(inv.get(0)!.count).toBe(MAX_STACK);
    expect(hand).toEqual({ block: Block.Stone, count: 50 + 20 - MAX_STACK });
  });

  it('leftClick intercambia cuando los tipos son distintos', () => {
    const inv = new Inventory();
    inv.set(0, { block: Block.Stone, count: 32 });
    const hand = inv.leftClick(0, { block: Block.Sand, count: 10 });
    expect(inv.get(0)).toEqual({ block: Block.Sand, count: 10 });
    expect(hand).toEqual({ block: Block.Stone, count: 32 });
  });

  it('rightClick con mano vacía coge la mitad (redondeada hacia arriba)', () => {
    const inv = new Inventory();
    inv.set(0, { block: Block.Log, count: 7 });
    const hand = inv.rightClick(0, null);
    expect(hand).toEqual({ block: Block.Log, count: 4 });
    expect(inv.get(0)).toEqual({ block: Block.Log, count: 3 });
  });

  it('rightClick con mano llena deposita 1 si cabe', () => {
    const inv = new Inventory();
    inv.set(0, { block: Block.Log, count: 3 });
    const hand = inv.rightClick(0, { block: Block.Log, count: 10 });
    expect(inv.get(0)!.count).toBe(4);
    expect(hand).toEqual({ block: Block.Log, count: 9 });
  });

  it('rightClick sobre casilla vacía deposita 1', () => {
    const inv = new Inventory();
    const hand = inv.rightClick(0, { block: Block.Stone, count: 5 });
    expect(inv.get(0)).toEqual({ block: Block.Stone, count: 1 });
    expect(hand).toEqual({ block: Block.Stone, count: 4 });
  });

  it('shiftClick mueve de barra al inventario y viceversa', () => {
    const inv = new Inventory();
    inv.set(0, { block: Block.Stone, count: 20 });
    inv.shiftClick(0);
    expect(inv.get(0)).toBeNull();
    // Debe estar en el inventario principal (algún hueco entre HOTBAR_SIZE y INV_SIZE).
    let found = false;
    for (let i = HOTBAR_SIZE; i < INV_SIZE; i++) {
      if (inv.get(i)?.block === Block.Stone) found = true;
    }
    expect(found).toBe(true);
  });

  it('shiftClick fusiona con pilas del mismo tipo en la otra sección', () => {
    const inv = new Inventory();
    inv.set(0, { block: Block.Stone, count: 30 });
    inv.set(HOTBAR_SIZE, { block: Block.Stone, count: 20 });
    inv.shiftClick(0);
    expect(inv.get(HOTBAR_SIZE)!.count).toBe(50);
    expect(inv.get(0)).toBeNull();
  });

  it('freeSpaceFor calcula el espacio disponible para un bloque', () => {
    const inv = new Inventory();
    inv.set(0, { block: Block.Stone, count: 50 });
    // Espacio para stone: 14 en la primera pila + MAX_STACK en cada hueco restante.
    const expected = (MAX_STACK - 50) + MAX_STACK * (INV_SIZE - 1);
    expect(inv.freeSpaceFor(Block.Stone)).toBe(expected);
  });

  it('serialize/deserialize hace roundtrip', () => {
    const inv = new Inventory();
    inv.set(3, { block: Block.Brick, count: 42 });
    inv.set(10, { block: Block.Sand, count: 7 });
    const back = Inventory.fromSerialized(inv.serialize());
    expect(back.get(3)).toEqual(inv.get(3));
    expect(back.get(10)).toEqual(inv.get(10));
    expect(back.get(0)).toBeNull();
  });
});
