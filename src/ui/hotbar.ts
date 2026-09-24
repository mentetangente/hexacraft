import type { Grid, Point2 } from '../grid';
import { Block, BLOCKS, def } from '../world/blocks';
import type { Inventory } from '../game/inventory';

// Barra de bloques con 9 huecos, teclas 1..9 y rueda del ratón. Los iconos se
// dibujan por código en un canvas 2D con proyección isométrica de la forma
// de la rejilla activa. Los huecos leen del inventario del jugador (fase 7c);
// muestran también la cuenta.

const SLOTS = 9;
const ICON_SIZE = 48;

export class Hotbar {
  private grid: Grid;
  private readonly root: HTMLElement;
  private readonly container: HTMLElement;
  private readonly slotEls: HTMLElement[] = [];
  private readonly countEls: HTMLElement[] = [];
  private readonly iconContainers: HTMLElement[] = [];
  private readonly label: HTMLElement;
  private readonly crosshair: HTMLElement;
  private selected = 0;
  private labelTimer: number | null = null;
  private inventory: Inventory | null = null;
  private lastBlocks: Array<Block | null> = new Array(SLOTS).fill(null);
  private lastCounts: number[] = new Array(SLOTS).fill(-1);

  constructor(root: HTMLElement, grid: Grid) {
    this.grid = grid;
    this.root = root;

    this.crosshair = document.createElement('div');
    this.crosshair.style.cssText =
      'position:fixed;top:50%;left:50%;width:16px;height:16px;transform:translate(-50%,-50%);color:#fff;text-shadow:0 0 3px rgba(0,0,0,0.9);font:16px monospace;line-height:16px;text-align:center;pointer-events:none;';
    this.crosshair.textContent = '+';
    root.appendChild(this.crosshair);

    this.container = document.createElement('div');
    this.container.style.cssText =
      'position:fixed;bottom:8px;left:50%;transform:translateX(-50%);display:flex;gap:4px;padding:4px;background:rgba(0,0,0,0.35);border-radius:6px;pointer-events:none;';
    root.appendChild(this.container);

    for (let i = 0; i < SLOTS; i++) {
      const slot = document.createElement('div');
      slot.style.cssText = `position:relative;width:${ICON_SIZE}px;height:${ICON_SIZE}px;background:rgba(0,0,0,0.35);border:2px solid transparent;border-radius:4px;box-sizing:border-box;display:flex;align-items:center;justify-content:center;`;
      const iconHolder = document.createElement('div');
      iconHolder.style.cssText = 'width:100%;height:100%;display:flex;align-items:center;justify-content:center;';
      slot.appendChild(iconHolder);
      const count = document.createElement('div');
      count.style.cssText =
        'position:absolute;bottom:2px;right:4px;font:bold 12px ui-monospace,Consolas,monospace;color:#fff;text-shadow:0 1px 2px #000;pointer-events:none;';
      slot.appendChild(count);
      this.container.appendChild(slot);
      this.slotEls.push(slot);
      this.iconContainers.push(iconHolder);
      this.countEls.push(count);
    }

    this.label = document.createElement('div');
    this.label.style.cssText =
      'position:fixed;bottom:72px;left:50%;transform:translateX(-50%);font:14px ui-monospace,Consolas,monospace;color:#fff;background:rgba(0,0,0,0.55);padding:4px 10px;border-radius:4px;pointer-events:none;opacity:0;transition:opacity 0.25s ease;';
    root.appendChild(this.label);

    this.select(0, false);
  }

  bindInventory(inv: Inventory): void {
    this.inventory = inv;
    this.refresh();
  }

  // Bloque seleccionado. Devuelve null si la casilla activa está vacía.
  currentBlock(): Block | null {
    if (!this.inventory) return null;
    return this.inventory.get(this.selected)?.block ?? null;
  }

  currentIndex(): number {
    return this.selected;
  }

  swapGrid(grid: Grid): void {
    this.grid = grid;
    // Fuerza el redibujado de todos los iconos con la nueva forma.
    for (let i = 0; i < SLOTS; i++) this.lastBlocks[i] = null;
    this.refresh();
  }

  select(index: number, showLabel = true): void {
    if (index < 0 || index >= SLOTS) return;
    this.slotEls[this.selected].style.borderColor = 'transparent';
    this.selected = index;
    this.slotEls[index].style.borderColor = '#fff';
    if (showLabel) {
      const b = this.currentBlock();
      if (b !== null) this.showLabel(def(b).name);
    }
  }

  // Redibuja iconos y actualiza cuentas leyendo del inventario. Sólo redibuja
  // los que hayan cambiado para no saturar el hilo.
  refresh(): void {
    if (!this.inventory) return;
    for (let i = 0; i < SLOTS; i++) {
      const slot = this.inventory.get(i);
      const block = slot?.block ?? null;
      const count = slot?.count ?? 0;
      if (block !== this.lastBlocks[i]) {
        const holder = this.iconContainers[i];
        while (holder.firstChild) holder.removeChild(holder.firstChild);
        if (block !== null) holder.appendChild(drawBlockIcon(this.grid, block));
        this.lastBlocks[i] = block;
      }
      if (count !== this.lastCounts[i]) {
        this.countEls[i].textContent = count > 1 ? String(count) : '';
        this.lastCounts[i] = count;
      }
    }
  }

  onKey(code: string): boolean {
    if (code.length === 6 && code.startsWith('Digit')) {
      const d = parseInt(code.slice(5), 10);
      if (d >= 1 && d <= 9) {
        this.select(d - 1);
        return true;
      }
    }
    return false;
  }

  onWheel(deltaY: number): void {
    const dir = deltaY > 0 ? 1 : -1;
    this.select((this.selected + dir + SLOTS) % SLOTS);
  }

  setVisible(v: boolean): void {
    const disp = v ? '' : 'none';
    this.container.style.display = v ? 'flex' : 'none';
    this.crosshair.style.display = disp;
    if (!v) this.label.style.opacity = '0';
  }

  private showLabel(text: string): void {
    this.label.textContent = text;
    this.label.style.opacity = '1';
    if (this.labelTimer !== null) window.clearTimeout(this.labelTimer);
    this.labelTimer = window.setTimeout(() => {
      this.label.style.opacity = '0';
      this.labelTimer = null;
    }, 1000);
  }

  dispose(): void {
    if (this.labelTimer !== null) window.clearTimeout(this.labelTimer);
    this.root.removeChild(this.container);
    this.root.removeChild(this.label);
    this.root.removeChild(this.crosshair);
  }
}

// -------- dibujo del icono --------

// Proyección iso muy sencilla: mira al bloque desde arriba-derecha-frente.
// Devuelve píxeles del canvas.
function isoProject(
  x: number,
  y: number,
  z: number,
  cx: number,
  cy: number,
  scale: number,
): { x: number; y: number } {
  const cos30 = 0.8660254;
  const sin30 = 0.5;
  return {
    x: cx + (x - z) * scale * cos30,
    y: cy - y * scale + (x + z) * scale * sin30,
  };
}

function toCss(rgb: readonly [number, number, number], shade: number): string {
  const r = clamp255(rgb[0] * shade * 255);
  const g = clamp255(rgb[1] * shade * 255);
  const b = clamp255(rgb[2] * shade * 255);
  return `rgb(${r},${g},${b})`;
}

const clamp255 = (v: number): number => Math.max(0, Math.min(255, Math.round(v)));

function drawBlockIcon(grid: Grid, block: Block): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = ICON_SIZE;
  c.height = ICON_SIZE;
  const ctx = c.getContext('2d');
  if (!ctx) return c;

  const fp = grid.footprintLocal();
  const n = fp.length;
  const d = BLOCKS[block];

  // Escala automática: el bloque cabe con margen.
  // Ancho máximo del bloque en iso ≈ 2 * (max |x|+|z|) * cos30. Estimación segura.
  const halfWorld = fpMaxRadius(fp) + 0.5;
  const iconRadius = ICON_SIZE * 0.42;
  const scale = iconRadius / halfWorld;
  const cx = ICON_SIZE * 0.5;
  const cy = ICON_SIZE * 0.55;

  const yTop = 0.5;
  const yBot = -0.5;
  const topProj = fp.map((p) => isoProject(p.x, yTop, p.z, cx, cy, scale));
  const botProj = fp.map((p) => isoProject(p.x, yBot, p.z, cx, cy, scale));

  // Dirección de cámara en XZ para decidir qué laterales pintar (los que
  // tienen normal exterior con dot positivo).
  const camX = 0.7071;
  const camZ = 0.7071;

  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(0,0,0,0.6)';

  // Laterales de fondo primero, delanteros después (orden Painter simple).
  // Ordenar por profundidad iso descendente para minimizar solapes.
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
    const dot = nx * camX + nz * camZ;
    if (dot <= 1e-6) continue;
    // Profundidad iso ≈ (x + z) del punto medio de la arista.
    const depth = (a.x + b.x + a.z + b.z) * 0.5;
    sides.push({ i, depth, dot });
  }
  sides.sort((p, q) => p.depth - q.depth);

  for (const s of sides) {
    const j = (s.i + 1) % n;
    const nLen = Math.hypot(fp[s.i].z - fp[j].z, fp[j].x - fp[s.i].x);
    const shade = 0.55 + 0.35 * (s.dot / nLen);
    ctx.fillStyle = toCss(d.side, shade);
    ctx.beginPath();
    ctx.moveTo(topProj[s.i].x, topProj[s.i].y);
    ctx.lineTo(botProj[s.i].x, botProj[s.i].y);
    ctx.lineTo(botProj[j].x, botProj[j].y);
    ctx.lineTo(topProj[j].x, topProj[j].y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  // Tapa superior encima.
  ctx.fillStyle = toCss(d.top, 1.0);
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
