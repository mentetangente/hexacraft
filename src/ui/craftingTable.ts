// Mesa de crafteo decorativa: panel con rejilla de 3x3 (cuadrada) o flor de
// 7 celdas (hexagonal). Al hacer clic sobre una casilla, se coloca el bloque
// seleccionado en la barra inferior; con clic derecho se vacía. Cuando
// cualquier casilla tenga un bloque se muestra el mensaje "Receta desconocida:
// habrá que reinventarlas todas".

import { Block, BLOCKS } from '../world/blocks';
import type { Grid } from '../grid';

const SLOT_SIZE = 48;

interface Slot {
  el: HTMLElement;
  block: Block | null;
}

export class CraftingTable {
  private readonly panel: HTMLElement;
  private readonly msg: HTMLElement;
  private slots: Slot[] = [];
  private open = false;
  private gridKind: 'hex' | 'square';

  constructor(host: HTMLElement, grid: Grid, private readonly getSelectedBlock: () => Block) {
    this.gridKind = grid.kind;
    this.panel = document.createElement('div');
    this.panel.style.cssText =
      'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);' +
      'padding:16px;background:rgba(0,0,0,0.75);border-radius:8px;' +
      'display:none;flex-direction:column;align-items:center;gap:8px;' +
      'font:12px ui-monospace,Consolas,monospace;color:#fff;z-index:900;';
    host.appendChild(this.panel);

    const title = document.createElement('div');
    title.textContent = 'Mesa de crafteo';
    title.style.cssText = 'font-size:14px;margin-bottom:4px;';
    this.panel.appendChild(title);

    const board = document.createElement('div');
    board.style.cssText = 'position:relative;width:220px;height:220px;';
    this.panel.appendChild(board);

    this.msg = document.createElement('div');
    this.msg.style.cssText = 'margin-top:8px;color:#ffe08a;text-align:center;min-height:16px;';
    this.panel.appendChild(this.msg);

    const hint = document.createElement('div');
    hint.style.cssText = 'margin-top:2px;opacity:0.6;font-size:11px;';
    hint.textContent = 'Clic izq: coloca el bloque seleccionado · Clic der: vacía · H: cerrar';
    this.panel.appendChild(hint);

    this.buildBoard(board);
  }

  swapGrid(grid: Grid): void {
    if (grid.kind === this.gridKind) return;
    this.gridKind = grid.kind;
    // Reconstruye el tablero.
    const board = this.panel.children[1] as HTMLElement;
    board.replaceChildren();
    this.slots = [];
    this.buildBoard(board);
    this.updateMessage();
  }

  toggle(): void {
    this.open = !this.open;
    this.panel.style.display = this.open ? 'flex' : 'none';
  }

  setCinema(cinema: boolean): void {
    if (cinema && this.open) this.toggle();
  }

  isOpen(): boolean {
    return this.open;
  }

  private buildBoard(board: HTMLElement): void {
    if (this.gridKind === 'square') {
      // 3 × 3 con hueco de 12 px.
      const total = 3 * SLOT_SIZE + 2 * 12;
      board.style.width = `${total}px`;
      board.style.height = `${total}px`;
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) {
          const slot = this.mkSlot();
          slot.style.left = `${c * (SLOT_SIZE + 12)}px`;
          slot.style.top = `${r * (SLOT_SIZE + 12)}px`;
          board.appendChild(slot);
          this.slots.push({ el: slot, block: null });
        }
      }
    } else {
      // Flor hex: centro + 6 alrededor.
      const cx = 110;
      const cy = 110;
      const R = 62;
      const positions: Array<[number, number]> = [[cx, cy]];
      for (let i = 0; i < 6; i++) {
        const a = ((30 - 60 * i) * Math.PI) / 180;
        positions.push([cx + R * Math.cos(a), cy + R * Math.sin(a)]);
      }
      for (const [x, y] of positions) {
        const slot = this.mkSlot();
        slot.style.left = `${x - SLOT_SIZE / 2}px`;
        slot.style.top = `${y - SLOT_SIZE / 2}px`;
        board.appendChild(slot);
        this.slots.push({ el: slot, block: null });
      }
    }
  }

  private mkSlot(): HTMLElement {
    const slot = document.createElement('div');
    slot.style.cssText = `position:absolute;width:${SLOT_SIZE}px;height:${SLOT_SIZE}px;background:rgba(0,0,0,0.35);border:2px solid rgba(255,255,255,0.15);border-radius:4px;cursor:pointer;display:flex;align-items:center;justify-content:center;color:#fff;font-size:10px;`;
    slot.addEventListener('click', () => this.onSlotClick(slot));
    slot.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this.onSlotRightClick(slot);
    });
    return slot;
  }

  private onSlotClick(slotEl: HTMLElement): void {
    const s = this.slots.find((x) => x.el === slotEl);
    if (!s) return;
    s.block = this.getSelectedBlock();
    s.el.textContent = BLOCKS[s.block].name;
    s.el.style.background = 'rgba(80,120,200,0.35)';
    this.updateMessage();
  }

  private onSlotRightClick(slotEl: HTMLElement): void {
    const s = this.slots.find((x) => x.el === slotEl);
    if (!s) return;
    s.block = null;
    s.el.textContent = '';
    s.el.style.background = 'rgba(0,0,0,0.35)';
    this.updateMessage();
  }

  private updateMessage(): void {
    const anyFilled = this.slots.some((s) => s.block !== null);
    this.msg.textContent = anyFilled
      ? 'Receta desconocida: habrá que reinventarlas todas.'
      : '';
  }
}
