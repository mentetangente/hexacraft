import type { Grid } from '../grid';

const nf1 = new Intl.NumberFormat('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const nf0 = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 });

export interface HudInputs {
  fps: number;
  grid: Grid;
  cameraCell: { a: number; b: number };
  cameraY: number;
  trianglesRendered: number;
  chunksLoaded: number;
  meanGenMs: number;
  meanMeshMs: number;
  renderDistance: number;
  textured: boolean;
  playerPos: { x: number; y: number; z: number };
  playerVel: { x: number; y: number; z: number };
  onGround: boolean;
  inWater: boolean;
  mode: 'walk' | 'fly';
  pointed: { a: number; b: number; y: number; face: string } | null;
  split: boolean;
}

export class Hud {
  private readonly container: HTMLElement;
  private readonly panelF3: HTMLElement;
  private readonly title: HTMLElement;
  private readonly toast: HTMLElement;
  private toastTimer: number | null = null;
  private visible = true;
  private cinema = false; // F1

  constructor(root: HTMLElement) {
    this.container = root;

    this.title = document.createElement('div');
    this.title.style.cssText =
      'font:14px ui-monospace,Consolas,monospace;color:#eee;background:rgba(0,0,0,0.5);padding:6px 10px;border-radius:4px;';
    this.title.textContent =
      'Clic · WASD · Espacio · Shift · F vuelo · G rejilla · V split · T tex · X alambre · +/− dist · C URL · B/N guardar · Supr borrar · M fuente · P presets · Y traducir · Ctrl+Z deshacer · L agua · K clave · Shift+K borrar recorrido · O play · H mesa · F3 · F1';
    this.container.appendChild(this.title);

    this.panelF3 = document.createElement('pre');
    this.panelF3.style.cssText =
      'margin:0;font:12px ui-monospace,Consolas,monospace;color:#dcefff;background:rgba(0,0,0,0.55);padding:6px 10px;border-radius:4px;white-space:pre;';
    this.container.appendChild(this.panelF3);

    this.toast = document.createElement('div');
    this.toast.style.cssText =
      'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);' +
      'font:14px ui-monospace,Consolas,monospace;color:#fff;' +
      'background:rgba(0,0,0,0.75);padding:8px 16px;border-radius:6px;' +
      'pointer-events:none;opacity:0;transition:opacity 0.2s ease;z-index:1000;';
    document.body.appendChild(this.toast);
  }

  toggleF3(): void {
    this.visible = !this.visible;
    this.panelF3.style.display = this.visible ? 'block' : 'none';
  }

  toggleCinema(): void {
    this.cinema = !this.cinema;
    const display = this.cinema ? 'none' : 'block';
    this.title.style.display = display;
    this.panelF3.style.display = this.cinema ? 'none' : this.visible ? 'block' : 'none';
  }

  isCinema(): boolean {
    return this.cinema;
  }

  flashMessage(text: string, ms = 1000): void {
    this.toast.textContent = text;
    this.toast.style.opacity = '1';
    if (this.toastTimer !== null) window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => {
      this.toast.style.opacity = '0';
      this.toastTimer = null;
    }, ms);
  }

  update(x: HudInputs): void {
    if (!this.visible || this.cinema) return;
    const kind = x.grid.kind === 'hex' ? 'hexágonos' : 'cuadrados';
    const cellLabel = x.grid.kind === 'hex' ? `q=${x.cameraCell.a} r=${x.cameraCell.b}` : `x=${x.cameraCell.a} z=${x.cameraCell.b}`;
    const speed = Math.hypot(x.playerVel.x, x.playerVel.z);
    const pointedLabel = x.pointed
      ? `${x.grid.kind === 'hex' ? `q=${x.pointed.a} r=${x.pointed.b}` : `x=${x.pointed.a} z=${x.pointed.b}`} y=${nf0.format(x.pointed.y)} · ${x.pointed.face}`
      : '—';
    this.panelF3.textContent = [
      `fps             ${nf1.format(x.fps)}`,
      `rejilla         ${kind}${x.split ? ' (split)' : ''}`,
      `modo            ${x.mode === 'walk' ? 'andar' : 'vuelo'}`,
      `celda cámara    ${cellLabel} y=${nf0.format(x.cameraY)}`,
      `posición        (${nf1.format(x.playerPos.x)}, ${nf1.format(x.playerPos.y)}, ${nf1.format(x.playerPos.z)})`,
      `vel horizontal  ${nf1.format(speed)} u/s`,
      `vel vertical    ${nf1.format(x.playerVel.y)} u/s`,
      `en suelo        ${x.onGround ? 'sí' : 'no'}`,
      `en agua         ${x.inWater ? 'sí' : 'no'}`,
      `apuntando       ${pointedLabel}`,
      `triángulos      ${nf0.format(x.trianglesRendered)}`,
      `chunks          ${nf0.format(x.chunksLoaded)}`,
      `distancia       ${nf0.format(x.renderDistance)} u`,
      `texturas        ${x.textured ? 'sí' : 'no'}`,
      `gen medio       ${nf1.format(x.meanGenMs)} ms`,
      `mesh medio      ${nf1.format(x.meanMeshMs)} ms`,
      `guardar         B · importar N · borrar Supr · URL C`,
    ].join('\n');
  }
}
