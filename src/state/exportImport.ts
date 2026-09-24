import {
  SerializedEdits,
  WorldEdits,
  isValidSerializedEdits,
} from '../interact/edits';

// Formato de archivo JSON para exportar/importar construcciones. Incluye
// versión y validación estricta al importar.

export interface HexacraftSave {
  readonly format: 'hexacraft-save';
  readonly version: 1;
  readonly seed: number;
  readonly hex: SerializedEdits;
  readonly square: SerializedEdits;
}

export function buildSave(
  seed: number,
  hex: WorldEdits,
  square: WorldEdits,
): HexacraftSave {
  return {
    format: 'hexacraft-save',
    version: 1,
    seed,
    hex: hex.serialize(),
    square: square.serialize(),
  };
}

export function isValidSave(v: unknown): v is HexacraftSave {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  if (o.format !== 'hexacraft-save') return false;
  if (o.version !== 1) return false;
  if (typeof o.seed !== 'number' || !Number.isFinite(o.seed)) return false;
  if (!isValidSerializedEdits(o.hex)) return false;
  if (!isValidSerializedEdits(o.square)) return false;
  return true;
}

export function parseSave(text: string): HexacraftSave | null {
  try {
    const parsed: unknown = JSON.parse(text);
    return isValidSave(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function downloadSave(save: HexacraftSave): void {
  const blob = new Blob([JSON.stringify(save, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `hexacraft-${save.seed}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function pickImportFile(cb: (save: HexacraftSave | null) => void): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json,.json';
  input.onchange = (): void => {
    const file = input.files?.[0];
    if (!file) {
      cb(null);
      return;
    }
    file
      .text()
      .then((txt) => cb(parseSave(txt)))
      .catch(() => cb(null));
  };
  input.click();
}
