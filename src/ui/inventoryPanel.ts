import type { Grid, Point2 } from '../grid';
import { Block, BLOCKS, def } from '../world/blocks';
import { HOTBAR_SIZE, INV_SIZE, Inventory, MAX_STACK, Stack } from '../game/inventory';
import type { GameMode } from '../game/gameMode';

// Panel de inventario (fase 7c). 3 filas de 9 casillas para el inventario
// principal + una fila para la barra. En modo creativo se muestra una paleta
// lateral con todos los bloques disponibles (arrastrable sin límite).

const SLOT_SIZE = 44;
const GAP = 4;

const PALETTE_BLOCKS: readonly Block[] = [
  Block.Stone,
  Block.Dirt,
  Block.Grass,
  Block.Sand,
  Block.Log,
  Block.Leaves,
  Block.Planks,
  Block.Brick,
  Block.Glass,
  Block.Water,
  Block.CraftingTable,
];

interface SlotView {
  el: HTMLElement;
  iconHolder: HTMLElement;
  countEl: HTMLElement;
  lastBlock: Block | null;
  lastCount: number;
}

export class InventoryPanel {
  private open = false;
  private readonly overlay: HTMLElement;
  private readonly grid: HTMLElement;
  private readonly palette: HTMLElement;
  private readonly cursorEl: HTMLElement;
  private readonly slotViews: SlotView[] = [];
  private hand: Stack | null = null;
  private gridKind: 'hex' | 'square';
  private mode: GameMode;

  constructor(
    host: HTMLElement,
    grid: Grid,
    mode: GameMode,
    private readonly inventory: Inventory,
    private readonly onChange: () => void,
  ) {
    this.gridKind = grid.kind;
    this.mode = mode;

    this.overlay = document.createElement('div');
    this.overlay.style.cssText =
      'position:fixed;inset:0;background:rgba(0,0,0,0.5);' +
      'display:none;align-items:center;justify-content:center;gap:16px;' +
      'font:12px ui-monospace,Consolas,monospace;color:#fff;z-index:850;';
    host.appendChild(this.overlay);

    const wrap = document.createElement('div');
    wrap.style.cssText =
      'background:rgba(24,32,48,0.9);padding:16px;border-radius:8px;' +
      'display:flex;flex-direction:column;gap:8px;align-items:center;';
    this.overlay.appendChild(wrap);

    const title = document.createElement('div');
    title.textContent = 'Inventario';
    title.style.cssText = 'font-size:14px;';
    wrap.appendChild(title);

    this.grid = document.createElement('div');
    this.grid.style.cssText = `display:grid;grid-template-columns:repeat(9, ${SLOT_SIZE}px);gap:${GAP}px;`;
    wrap.appendChild(this.grid);

    // Inventario principal: filas 0..2 (índices 9..35).
    for (let i = HOTBAR_SIZE; i < INV_SIZE; i++) this.slotViews[i] = this.mkSlot(i);
    // Separador.
    const sep = document.createElement('div');
    sep.style.cssText = `grid-column: 1 / span 9;height:2px;background:rgba(255,255,255,0.15);margin:4px 0;`;
    this.grid.appendChild(sep);
    // Barra: fila abajo (índices 0..8).
    for (let i = 0; i < HOTBAR_SIZE; i++) this.slotViews[i] = this.mkSlot(i);

    const hint = document.createElement('div');
    hint.style.cssText = 'opacity:0.7;font-size:11px;text-align:center;max-width:520px;';
    hint.textContent =
      'Clic: coger/soltar pila · Clic der: coger la mitad / dejar 1 · Mayúsculas+clic: mover a la otra sección · E: cerrar';
    wrap.appendChild(hint);

    // Paleta creativa: columna a la derecha.
    this.palette = document.createElement('div');
    this.palette.style.cssText =
      'background:rgba(24,32,48,0.9);padding:12px;border-radius:8px;' +
      'display:flex;flex-direction:column;gap:6px;align-items:center;';
    const palTitle = document.createElement('div');
    palTitle.textContent = 'Paleta';
    palTitle.style.cssText = 'font-size:14px;';
    this.palette.appendChild(palTitle);
    const palGrid = document.createElement('div');
    palGrid.style.cssText = `display:grid;grid-template-columns:repeat(2, ${SLOT_SIZE}px);gap:${GAP}px;`;
    this.palette.appendChild(palGrid);
    for (const b of PALETTE_BLOCKS) palGrid.appendChild(this.mkPaletteButton(b));
    this.overlay.appendChild(this.palette);

    this.cursorEl = document.createElement('div');
    this.cursorEl.style.cssText =
      `position:fixed;pointer-events:none;width:${SLOT_SIZE}px;height:${SLOT_SIZE}px;` +
      'display:none;align-items:center;justify-content:center;z-index:900;';
    host.appendChild(this.cursorEl);
    window.addEventListener('mousemove', (e) => {
      this.cursorEl.style.left = `${e.clientX - SLOT_SIZE / 2}px`;
      this.cursorEl.style.top = `${e.clientY - SLOT_SIZE / 2}px`;
    });
  }

  toggle(): void {
    this.open = !this.open;
    this.overlay.style.display = this.open ? 'flex' : 'none';
    this.palette.style.display = this.open && this.mode === 'creative' ? 'flex' : 'none';
    this.refresh();
    this.updateCursor();
  }

  isOpen(): boolean {
    return this.open;
  }

  setCinema(cinema: boolean): void {
    if (cinema && this.open) this.toggle();
  }

  setMode(mode: GameMode): void {
    this.mode = mode;
    this.palette.style.display = this.open && this.mode === 'creative' ? 'flex' : 'none';
  }

  swapGrid(grid: Grid): void {
    this.gridKind = grid.kind;
    // Forzar redibujo.
    for (const v of this.slotViews) v.lastBlock = null;
    this.refresh();
    this.updateCursor();
  }

  refresh(): void {
    for (let i = 0; i < this.slotViews.length; i++) {
      const v = this.slotViews[i];
      const s = this.inventory.get(i);
      const b = s?.block ?? null;
      const c = s?.count ?? 0;
      if (b !== v.lastBlock) {
        while (v.iconHolder.firstChild) v.iconHolder.removeChild(v.iconHolder.firstChild);
        if (b !== null) v.iconHolder.appendChild(drawIcon(this.gridKindGrid(), b));
        v.lastBlock = b;
      }
      if (c !== v.lastCount) {
        v.countEl.textContent = c > 1 ? String(c) : '';
        v.lastCount = c;
      }
    }
  }

  private mkSlot(index: number): SlotView {
    const el = document.createElement('div');
    el.style.cssText = `position:relative;width:${SLOT_SIZE}px;height:${SLOT_SIZE}px;background:rgba(0,0,0,0.35);border:1px solid rgba(255,255,255,0.15);border-radius:4px;`;
    const iconHolder = document.createElement('div');
    iconHolder.style.cssText = 'width:100%;height:100%;display:flex;align-items:center;justify-content:center;';
    el.appendChild(iconHolder);
    const countEl = document.createElement('div');
    countEl.style.cssText =
      'position:absolute;bottom:2px;right:4px;font:bold 12px ui-monospace,Consolas,monospace;color:#fff;text-shadow:0 1px 2px #000;';
    el.appendChild(countEl);
    el.addEventListener('click', (e) => {
      if (e.shiftKey) {
        this.inventory.shiftClick(index);
      } else {
        this.hand = this.inventory.leftClick(index, this.hand);
      }
      this.refresh();
      this.updateCursor();
      this.onChange();
    });
    el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this.hand = this.inventory.rightClick(index, this.hand);
      this.refresh();
      this.updateCursor();
      this.onChange();
    });
    this.grid.appendChild(el);
    return { el, iconHolder, countEl, lastBlock: null, lastCount: -1 };
  }

  private mkPaletteButton(block: Block): HTMLElement {
    const el = document.createElement('div');
    el.style.cssText = `position:relative;width:${SLOT_SIZE}px;height:${SLOT_SIZE}px;background:rgba(0,0,0,0.35);border:1px solid rgba(255,255,255,0.15);border-radius:4px;display:flex;align-items:center;justify-content:center;cursor:pointer;`;
    el.appendChild(drawIcon(this.gridKindGrid(), block));
    el.title = def(block).name;
    el.addEventListener('click', () => {
      // La paleta rellena la mano con una pila completa; si ya tenías otra
      // cosa en la mano, se sustituye.
      this.hand = { block, count: MAX_STACK };
      this.updateCursor();
    });
    return el;
  }

  private updateCursor(): void {
    while (this.cursorEl.firstChild) this.cursorEl.removeChild(this.cursorEl.firstChild);
    if (!this.open || !this.hand) {
      this.cursorEl.style.display = 'none';
      return;
    }
    this.cursorEl.style.display = 'flex';
    this.cursorEl.appendChild(drawIcon(this.gridKindGrid(), this.hand.block));
    const c = document.createElement('div');
    c.style.cssText =
      'position:absolute;bottom:2px;right:4px;font:bold 12px ui-monospace,Consolas,monospace;color:#fff;text-shadow:0 1px 2px #000;';
    c.textContent = this.hand.count > 1 ? String(this.hand.count) : '';
    this.cursorEl.appendChild(c);
  }

  // El dibujo solo necesita conocer la forma (kind) para pintar hexágono o
  // cuadrado; construimos un "Grid ligero" con la información justa.
  private gridKindGrid(): Grid {
    // Reutiliza HexGrid/SquareGrid instanciándolos lazy si hace falta. Aquí
    // basta con importar los constructores. Para evitar dependencias
    // circulares, hacemos una minifábrica dentro del panel.
    return this.gridKind === 'hex' ? cachedGrids.hex : cachedGrids.square;
  }
}

// Cache global de rejillas para las miniaturas.
import { HexGrid, SquareGrid } from '../grid';
const cachedGrids = { hex: new HexGrid(), square: new SquareGrid() };

// Dibuja un icono isométrico del bloque. Reutilizamos la lógica del hotbar.
function drawIcon(grid: Grid, block: Block): HTMLCanvasElement {
  const c = document.createElement('canvas');
  const size = SLOT_SIZE;
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');
  if (!ctx) return c;
  const fp = grid.footprintLocal();
  const n = fp.length;
  const d = BLOCKS[block];
  const halfWorld = fpMaxRadius(fp) + 0.5;
  const iconRadius = size * 0.42;
  const scale = iconRadius / halfWorld;
  const cx = size * 0.5;
  const cy = size * 0.55;
  const yTop = 0.5;
  const yBot = -0.5;
  const cos30 = 0.8660254;
  const sin30 = 0.5;
  const iso = (x: number, y: number, z: number): { x: number; y: number } => ({
    x: cx + (x - z) * scale * cos30,
    y: cy - y * scale + (x + z) * scale * sin30,
  });
  const topProj = fp.map((p) => iso(p.x, yTop, p.z));
  const botProj = fp.map((p) => iso(p.x, yBot, p.z));
  const rgba = (col: readonly [number, number, number], shade: number): string => {
    const r = Math.round(col[0] * shade * 255);
    const g = Math.round(col[1] * shade * 255);
    const b = Math.round(col[2] * shade * 255);
    return `rgb(${r},${g},${b})`;
  };
  interface Side {
    i: number;
    depth: number;
    dot: number;
  }
  const sides: Side[] = [];
  for (let i = 0; i < n; i++) {
    const a = fp[i];
    const b = fp[(i + 1) % n];
    const nx = a.z - b.z;
    const nz = b.x - a.x;
    const dot = nx * 0.7071 + nz * 0.7071;
    if (dot <= 1e-6) continue;
    const depth = (a.x + b.x + a.z + b.z) * 0.5;
    sides.push({ i, depth, dot });
  }
  sides.sort((p, q) => p.depth - q.depth);
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(0,0,0,0.6)';
  for (const s of sides) {
    const j = (s.i + 1) % n;
    const nLen = Math.hypot(fp[s.i].z - fp[j].z, fp[j].x - fp[s.i].x);
    const shade = 0.55 + 0.35 * (s.dot / nLen);
    ctx.fillStyle = rgba(d.side, shade);
    ctx.beginPath();
    ctx.moveTo(topProj[s.i].x, topProj[s.i].y);
    ctx.lineTo(botProj[s.i].x, botProj[s.i].y);
    ctx.lineTo(botProj[j].x, botProj[j].y);
    ctx.lineTo(topProj[j].x, topProj[j].y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  ctx.fillStyle = rgba(d.top, 1.0);
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const p = topProj[i];
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  return c;
}

function fpMaxRadius(fp: readonly Point2[]): number {
  let r = 0;
  for (const p of fp) {
    const d = Math.hypot(p.x, p.z);
    if (d > r) r = d;
  }
  return r;
}
