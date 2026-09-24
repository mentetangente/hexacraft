import type { Cell } from '../grid';
import type { Block } from '../world/blocks';

// Utilidades de construcción: acumula una "transacción" con los bloques a
// colocar y su estado previo, para poder deshacerla más tarde. `apply` graba
// los cambios y devuelve una entrada de deshacer.

// Interfaz mínima que `applyPlan` necesita del mundo: `World` la implementa
// enteramente. Separar la interfaz permite testear sin instanciar three.js.
export interface EditableWorld {
  getBlock(worldA: number, worldB: number, y: number): Block;
  setBlock(worldA: number, worldB: number, y: number, block: Block): boolean;
}

export interface CellChange {
  readonly cell: Cell;
  readonly y: number;
  readonly block: Block;
}

// Lista de cambios por rejilla. Los presets construyen simultáneamente en las
// dos y esto se guarda como una única entrada en la pila de deshacer.
export interface DualPlan {
  hex: CellChange[];
  square: CellChange[];
}

export interface UndoEntry {
  readonly label: string;
  readonly hex: readonly CellChange[]; // bloques originales (para restaurar)
  readonly square: readonly CellChange[];
}

export function emptyPlan(): DualPlan {
  return { hex: [], square: [] };
}

// Aplica `plan` a los dos worlds, y devuelve la entrada de deshacer con los
// bloques originales para restaurar el estado previo.
export function applyPlan(
  plan: DualPlan,
  worldHex: EditableWorld,
  worldSq: EditableWorld,
  label: string,
): UndoEntry {
  const undoHex: CellChange[] = [];
  const undoSq: CellChange[] = [];
  const seenHex = new Set<string>();
  const seenSq = new Set<string>();
  const capture = (
    changes: CellChange[],
    undo: CellChange[],
    seen: Set<string>,
    world: EditableWorld,
  ): void => {
    for (const c of changes) {
      const k = `${c.cell.a},${c.cell.b},${c.y}`;
      if (!seen.has(k)) {
        seen.add(k);
        undo.push({ cell: c.cell, y: c.y, block: world.getBlock(c.cell.a, c.cell.b, c.y) });
      }
      world.setBlock(c.cell.a, c.cell.b, c.y, c.block);
    }
  };
  capture(plan.hex, undoHex, seenHex, worldHex);
  capture(plan.square, undoSq, seenSq, worldSq);
  return { label, hex: undoHex, square: undoSq };
}

export function revertEntry(
  entry: UndoEntry,
  worldHex: EditableWorld,
  worldSq: EditableWorld,
): void {
  for (const c of entry.hex) worldHex.setBlock(c.cell.a, c.cell.b, c.y, c.block);
  for (const c of entry.square) worldSq.setBlock(c.cell.a, c.cell.b, c.y, c.block);
}

// Pila de deshacer con tamaño máximo. Ctrl+Z pops la última entrada.
export class UndoStack {
  private readonly stack: UndoEntry[] = [];
  constructor(private readonly max = 10) {}

  push(entry: UndoEntry): void {
    this.stack.push(entry);
    while (this.stack.length > this.max) this.stack.shift();
  }

  pop(): UndoEntry | undefined {
    return this.stack.pop();
  }

  peek(): UndoEntry | undefined {
    return this.stack[this.stack.length - 1];
  }

  size(): number {
    return this.stack.length;
  }
}
