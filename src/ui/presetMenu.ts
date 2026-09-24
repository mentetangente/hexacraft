// Menú desplegable de presets. Se abre con la tecla `P` y ofrece los cuatro
// presets con parámetros por defecto. Para parámetros personalizados se puede
// usar la consola: `hexacraft.preset('torre', { radio: 4 })`.

import type { PresetName } from '../presets/presets';

const OPTIONS: ReadonlyArray<{ readonly name: PresetName; readonly label: string }> = [
  { name: 'torre', label: 'Torre' },
  { name: 'casa', label: 'Casa' },
  { name: 'tunel', label: 'Túnel' },
  { name: 'fuente', label: 'Fuente' },
];

export class PresetMenu {
  private readonly panel: HTMLElement;
  private open = false;

  constructor(onPick: (name: PresetName) => void) {
    this.panel = document.createElement('div');
    this.panel.style.cssText =
      'position:fixed;bottom:72px;right:8px;background:rgba(0,0,0,0.7);' +
      'padding:6px;border-radius:6px;display:none;flex-direction:column;gap:4px;' +
      'font:12px ui-monospace,Consolas,monospace;color:#fff;z-index:900;';
    for (const { name, label } of OPTIONS) {
      const btn = document.createElement('button');
      btn.textContent = label;
      btn.style.cssText =
        'background:rgba(255,255,255,0.1);color:#fff;border:1px solid rgba(255,255,255,0.3);' +
        'padding:4px 10px;font:12px ui-monospace,Consolas,monospace;cursor:pointer;';
      btn.addEventListener('click', () => {
        onPick(name);
        this.setOpen(false);
      });
      this.panel.appendChild(btn);
    }
    const hint = document.createElement('div');
    hint.style.cssText = 'margin-top:4px;opacity:0.7;';
    hint.textContent = 'consola: hexacraft.preset("torre", {radio: 4})';
    this.panel.appendChild(hint);
    document.body.appendChild(this.panel);
  }

  toggle(): void {
    this.setOpen(!this.open);
  }

  isOpen(): boolean {
    return this.open;
  }

  setCinema(cinema: boolean): void {
    if (cinema) this.setOpen(false);
  }

  private setOpen(v: boolean): void {
    this.open = v;
    this.panel.style.display = v ? 'flex' : 'none';
  }
}
