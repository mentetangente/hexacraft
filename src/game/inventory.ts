import { Block } from '../world/blocks';

// Inventario del jugador. 9 casillas de barra (0..8) + 27 casillas del panel
// principal (9..35). Pilas de hasta 64 unidades por casilla. Puro y testeable.

export const HOTBAR_SIZE = 9;
export const MAIN_INV_SIZE = 27;
export const INV_SIZE = HOTBAR_SIZE + MAIN_INV_SIZE; // 36
export const MAX_STACK = 64;

export interface Stack {
  block: Block;
  count: number;
}

export interface SerializedInventory {
  readonly version: 1;
  // 36 entradas; null si la casilla está vacía.
  readonly slots: Array<Stack | null>;
}

function stackOrNull(s: Stack | null): Stack | null {
  return s && s.count > 0 ? { block: s.block, count: s.count } : null;
}

export class Inventory {
  private readonly slots: Array<Stack | null>;

  constructor(size = INV_SIZE) {
    this.slots = new Array(size).fill(null);
  }

  static fromSerialized(data: SerializedInventory): Inventory {
    const inv = new Inventory(data.slots.length);
    for (let i = 0; i < data.slots.length; i++) {
      const s = data.slots[i];
      if (s && s.count > 0) inv.slots[i] = { block: s.block, count: Math.min(MAX_STACK, s.count) };
    }
    return inv;
  }

  serialize(): SerializedInventory {
    return {
      version: 1,
      slots: this.slots.map((s) => stackOrNull(s)),
    };
  }

  size(): number {
    return this.slots.length;
  }

  get(i: number): Stack | null {
    return stackOrNull(this.slots[i] ?? null);
  }

  isEmpty(i: number): boolean {
    return this.get(i) === null;
  }

  set(i: number, s: Stack | null): void {
    this.slots[i] = s && s.count > 0 ? { block: s.block, count: Math.min(MAX_STACK, s.count) } : null;
  }

  // Añade `count` unidades de `block`, llenando primero pilas existentes del
  // mismo tipo y luego huecos. Devuelve el sobrante que no cupo.
  add(block: Block, count: number): number {
    if (count <= 0) return 0;
    let remaining = count;
    // 1) Rellenar pilas existentes.
    for (let i = 0; i < this.slots.length && remaining > 0; i++) {
      const s = this.slots[i];
      if (s && s.block === block && s.count < MAX_STACK) {
        const room = MAX_STACK - s.count;
        const take = Math.min(room, remaining);
        s.count += take;
        remaining -= take;
      }
    }
    // 2) Ocupar huecos.
    for (let i = 0; i < this.slots.length && remaining > 0; i++) {
      if (this.slots[i] === null) {
        const take = Math.min(MAX_STACK, remaining);
        this.slots[i] = { block, count: take };
        remaining -= take;
      }
    }
    return remaining;
  }

  // Quita `count` unidades a partir de la casilla `i`; si `i` es -1, busca
  // cualquier casilla con ese bloque. Devuelve cuántas quitó.
  remove(i: number, count: number): number {
    const s = this.slots[i];
    if (!s || s.count <= 0) return 0;
    const take = Math.min(s.count, count);
    s.count -= take;
    if (s.count <= 0) this.slots[i] = null;
    return take;
  }

  // Cuenta total de bloques del tipo `block`.
  countOf(block: Block): number {
    let n = 0;
    for (const s of this.slots) {
      if (s && s.block === block) n += s.count;
    }
    return n;
  }

  // Espacio libre para bloques de tipo `block` considerando pilas existentes.
  freeSpaceFor(block: Block): number {
    let free = 0;
    for (const s of this.slots) {
      if (s === null) free += MAX_STACK;
      else if (s.block === block) free += MAX_STACK - s.count;
    }
    return free;
  }

  // ---- Operaciones con "mano" (cursor) ----
  // El cursor es una pila externa que el llamante mantiene. Devuelve la nueva
  // mano.

  // Clic izquierdo sobre una casilla:
  // - Mano vacía + casilla con pila → coger toda la pila.
  // - Mano llena + casilla vacía → dejar toda la pila.
  // - Mano llena + casilla del mismo tipo → fusionar hasta MAX_STACK; el
  //   sobrante queda en la mano.
  // - Mano llena + casilla de otro tipo → intercambiar.
  leftClick(i: number, hand: Stack | null): Stack | null {
    const cell = this.slots[i];
    if (!hand) {
      this.slots[i] = null;
      return stackOrNull(cell);
    }
    if (!cell) {
      this.slots[i] = { ...hand };
      return null;
    }
    if (cell.block === hand.block) {
      const room = MAX_STACK - cell.count;
      const take = Math.min(room, hand.count);
      cell.count += take;
      const remaining = hand.count - take;
      return remaining > 0 ? { block: hand.block, count: remaining } : null;
    }
    // Intercambio.
    this.slots[i] = { ...hand };
    return { ...cell };
  }

  // Clic derecho: si la mano está vacía, coge la mitad (redondeando hacia
  // arriba) de la casilla; si está llena, deja una unidad si cabe.
  rightClick(i: number, hand: Stack | null): Stack | null {
    const cell = this.slots[i];
    if (!hand) {
      if (!cell) return null;
      const half = Math.ceil(cell.count / 2);
      cell.count -= half;
      if (cell.count <= 0) this.slots[i] = null;
      return { block: cell.block, count: half };
    }
    if (!cell) {
      this.slots[i] = { block: hand.block, count: 1 };
      const rem = hand.count - 1;
      return rem > 0 ? { block: hand.block, count: rem } : null;
    }
    if (cell.block === hand.block && cell.count < MAX_STACK) {
      cell.count += 1;
      const rem = hand.count - 1;
      return rem > 0 ? { block: hand.block, count: rem } : null;
    }
    return hand;
  }

  // Mueve la pila de `from` a la primera casilla adecuada de la sección
  // opuesta (barra ↔ inventario principal). Si no hay hueco, la deja.
  shiftClick(from: number): void {
    const s = this.slots[from];
    if (!s) return;
    const isHotbar = from < HOTBAR_SIZE;
    const start = isHotbar ? HOTBAR_SIZE : 0;
    const end = isHotbar ? this.slots.length : HOTBAR_SIZE;
    // 1) Fusionar con pilas del mismo tipo.
    for (let i = start; i < end && s.count > 0; i++) {
      const c = this.slots[i];
      if (c && c.block === s.block && c.count < MAX_STACK) {
        const room = MAX_STACK - c.count;
        const take = Math.min(room, s.count);
        c.count += take;
        s.count -= take;
      }
    }
    // 2) Ocupar huecos.
    for (let i = start; i < end && s.count > 0; i++) {
      if (this.slots[i] === null) {
        this.slots[i] = { block: s.block, count: s.count };
        s.count = 0;
      }
    }
    if (s.count <= 0) this.slots[from] = null;
  }

  clear(): void {
    for (let i = 0; i < this.slots.length; i++) this.slots[i] = null;
  }
}
