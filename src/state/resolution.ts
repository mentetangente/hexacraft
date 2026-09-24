// Resolución fija para grabar con OBS. Se activa con ?res=1920x1080
// (o cualquier ancho×alto) y opcionalmente ?escala= para el devicePixelRatio.
// El canvas se mantiene siempre a la resolución fijada; se centra en la
// ventana con bandas negras si el aspect ratio no encaja.

export interface FixedResolution {
  readonly width: number;
  readonly height: number;
  readonly pixelRatio: number;
}

export function parseResolutionFromURL(): FixedResolution | null {
  const p = new URLSearchParams(window.location.search);
  const res = p.get('res');
  if (!res) return null;
  const m = /^(\d+)[xX](\d+)$/.exec(res);
  if (!m) return null;
  const width = parseInt(m[1], 10);
  const height = parseInt(m[2], 10);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 32 || height < 32) return null;
  let pixelRatio = 1;
  const esc = p.get('escala');
  if (esc !== null) {
    const n = parseFloat(esc);
    if (Number.isFinite(n) && n > 0 && n <= 4) pixelRatio = n;
  }
  return { width, height, pixelRatio };
}

// Aplica el letterbox: el canvas se centra en la ventana con transform.
export function applyLetterbox(canvas: HTMLCanvasElement, res: FixedResolution): void {
  const winW = window.innerWidth;
  const winH = window.innerHeight;
  const canvasAspect = res.width / res.height;
  const winAspect = winW / winH;
  let cssW: number;
  let cssH: number;
  if (winAspect > canvasAspect) {
    cssH = winH;
    cssW = cssH * canvasAspect;
  } else {
    cssW = winW;
    cssH = cssW / canvasAspect;
  }
  canvas.style.position = 'absolute';
  canvas.style.top = '50%';
  canvas.style.left = '50%';
  canvas.style.transform = 'translate(-50%, -50%)';
  canvas.style.width = `${cssW}px`;
  canvas.style.height = `${cssH}px`;
  // Fondo negro en el body para que las bandas se vean limpias.
  document.body.style.background = '#000';
}
