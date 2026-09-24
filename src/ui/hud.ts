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
}

export class Hud {
  private readonly container: HTMLElement;
  private readonly panelF3: HTMLElement;
  private readonly title: HTMLElement;
  private visible = true;
  private cinema = false; // F1

  constructor(root: HTMLElement) {
    // El contenedor (#hud) se dispone como flex column con gap; los hijos se
    // apilan en el flujo, así el panel F3 nunca se solapa con el título aunque
    // este se envuelva a varias líneas.
    this.container = root;

    this.title = document.createElement('div');
    this.title.style.cssText =
      'font:14px ui-monospace,Consolas,monospace;color:#eee;background:rgba(0,0,0,0.5);padding:6px 10px;border-radius:4px;';
    this.title.textContent = 'Haz clic para jugar · G: cambiar rejilla · X: alambre · F3: info · F1: cine';
    this.container.appendChild(this.title);

    this.panelF3 = document.createElement('pre');
    this.panelF3.style.cssText =
      'margin:0;font:12px ui-monospace,Consolas,monospace;color:#dcefff;background:rgba(0,0,0,0.55);padding:6px 10px;border-radius:4px;white-space:pre;';
    this.container.appendChild(this.panelF3);
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

  update(x: HudInputs): void {
    if (!this.visible || this.cinema) return;
    const kind = x.grid.kind === 'hex' ? 'hexágonos' : 'cuadrados';
    const cellLabel = x.grid.kind === 'hex' ? `q=${x.cameraCell.a} r=${x.cameraCell.b}` : `x=${x.cameraCell.a} z=${x.cameraCell.b}`;
    this.panelF3.textContent = [
      `fps            ${nf1.format(x.fps)}`,
      `rejilla        ${kind}`,
      `celda cámara   ${cellLabel} y=${nf0.format(x.cameraY)}`,
      `triángulos     ${nf0.format(x.trianglesRendered)}`,
      `chunks         ${nf0.format(x.chunksLoaded)}`,
      `gen medio      ${nf1.format(x.meanGenMs)} ms`,
      `mesh medio     ${nf1.format(x.meanMeshMs)} ms`,
    ].join('\n');
  }
}
