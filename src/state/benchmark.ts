import * as THREE from 'three';
import type { World } from '../world/World';

// Modo de prueba de rendimiento activable con ?benchmark=1. La cámara vuela
// una órbita fija durante 30 s sobre una semilla fija; al terminar, se
// muestra un resumen de una línea copiable.

export interface BenchmarkOptions {
  readonly durationSec: number; // 30
  readonly gridKind: 'hex' | 'square';
  readonly split: boolean;
}

export class Benchmark {
  active = true;
  private startMs = 0;
  private readonly frameMs: number[] = [];
  private summaryEl: HTMLElement | null = null;

  constructor(private readonly opts: BenchmarkOptions) {}

  start(): void {
    this.startMs = performance.now();
  }

  // Devuelve true si el benchmark sigue vivo y ha tomado el control de la
  // cámara este frame. En ese caso, main.ts NO debe actualizar la física
  // ni el hotbar.
  update(camera: THREE.PerspectiveCamera, world: World, frameMs: number): boolean {
    if (!this.active) return false;
    this.frameMs.push(frameMs);
    const elapsed = (performance.now() - this.startMs) / 1000;
    if (elapsed >= this.opts.durationSec) {
      this.finish(world);
      return false;
    }
    // Vuelo en línea recta a velocidad constante: cada frame entramos en
    // territorio nuevo, así se ejercita generación y mallado de chunks todo
    // el rato (a diferencia de una órbita, que revisita las mismas zonas).
    const speed = 8; // u/s
    const x = elapsed * speed;
    camera.position.set(x, 32, 0);
    camera.lookAt(x + 10, 28, 0);
    return true;
  }

  private finish(world: World): void {
    this.active = false;
    // fps medio ponderado por número de frames.
    const totalMs = this.frameMs.reduce((a, b) => a + b, 0);
    const meanFps = totalMs > 0 ? (this.frameMs.length * 1000) / totalMs : 0;
    const sorted = [...this.frameMs].sort((a, b) => a - b);
    const p95 = sorted.length > 0 ? sorted[Math.floor(sorted.length * 0.95)] : 0;
    const s = world.stats;
    const grid = world.grid.kind === 'hex' ? 'hex' : 'sq';
    const nf1 = new Intl.NumberFormat('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    const nf2 = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const splitTag = this.opts.split ? ' split' : '';
    const summary =
      `benchmark ${grid}${splitTag} · fps=${nf1.format(meanFps)} · p95=${nf1.format(p95)}ms · ` +
      `gen=${nf2.format(s.meanGenMs)}ms · mesh=${nf2.format(s.meanMeshMs)}ms · chunks=${s.chunksLoaded}`;
    this.showSummary(summary);
  }

  private showSummary(text: string): void {
    if (this.summaryEl) return;
    const el = document.createElement('div');
    el.style.cssText =
      'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);' +
      'font:15px ui-monospace,Consolas,monospace;color:#fff;' +
      'background:rgba(0,0,0,0.85);padding:16px 24px;border-radius:8px;' +
      'user-select:text;-webkit-user-select:text;z-index:1000;';
    el.textContent = text;
    document.body.appendChild(el);
    this.summaryEl = el;
    // Selecciona el texto para copiar rápido.
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection();
    if (sel) {
      sel.removeAllRanges();
      sel.addRange(range);
    }
  }
}

export function parseBenchmark(): BenchmarkOptions | null {
  const p = new URLSearchParams(window.location.search);
  if (p.get('benchmark') !== '1') return null;
  const g = p.get('grid');
  const gridKind: 'hex' | 'square' = g === 'square' ? 'square' : 'hex';
  const split = p.get('split') === '1';
  return { durationSec: 30, gridKind, split };
}
