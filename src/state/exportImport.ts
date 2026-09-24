import {
  SerializedEdits,
  WorldEdits,
  isValidSerializedEdits,
} from '../interact/edits';
import { BLOCKS } from '../world/blocks';
import { CHUNK_HEIGHT, CHUNK_WIDTH } from '../world/Chunk';
import type { CameraPath, Keyframe } from './cameraPath';

// Formato de archivo JSON para exportar/importar construcciones. Incluye
// versión y validación estricta al importar (rechaza malformados sin romper
// el mundo actual).

// Formato v1: solo `seed`, `hex`, `square`. Formato v2 añade opcionalmente
// `cameraPath`. Los archivos v1 siguen aceptándose (compatibilidad hacia
// atrás), y el exportador genera siempre v2.
export interface HexacraftSave {
  readonly format: 'hexacraft-save';
  readonly version: 1 | 2;
  readonly seed: number;
  readonly hex: SerializedEdits;
  readonly square: SerializedEdits;
  readonly cameraPath?: CameraPath;
}

// Límites razonables: 5 MB de texto y 200 000 modificaciones totales.
export const MAX_SAVE_TEXT_BYTES = 5 * 1024 * 1024;
export const MAX_TOTAL_EDITS = 200_000;

export type ImportError =
  | 'too-large'
  | 'not-json'
  | 'unknown-format'
  | 'too-many-edits'
  | 'invalid-entry';

export interface ImportOk {
  readonly ok: true;
  readonly save: HexacraftSave;
}
export interface ImportFail {
  readonly ok: false;
  readonly error: ImportError;
}
export type ImportResult = ImportOk | ImportFail;

export function buildSave(
  seed: number,
  hex: WorldEdits,
  square: WorldEdits,
  cameraPath?: CameraPath,
): HexacraftSave {
  const base: HexacraftSave = {
    format: 'hexacraft-save',
    version: 2,
    seed,
    hex: hex.serialize(),
    square: square.serialize(),
  };
  if (cameraPath) {
    return { ...base, cameraPath };
  }
  return base;
}

function isValidKeyframe(v: unknown): v is Keyframe {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  for (const k of ['x', 'y', 'z', 'yaw', 'pitch']) {
    if (typeof o[k] !== 'number' || !Number.isFinite(o[k] as number)) return false;
  }
  return true;
}

function isValidCameraPath(v: unknown): v is CameraPath {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  if (!Array.isArray(o.keyframes)) return false;
  for (const kf of o.keyframes) if (!isValidKeyframe(kf)) return false;
  if (typeof o.duration !== 'number' || !Number.isFinite(o.duration)) return false;
  if (typeof o.loop !== 'boolean') return false;
  if (typeof o.startDelay !== 'number' || !Number.isFinite(o.startDelay)) return false;
  return true;
}

export function isValidSave(v: unknown): v is HexacraftSave {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  if (o.format !== 'hexacraft-save') return false;
  if (o.version !== 1 && o.version !== 2) return false;
  if (typeof o.seed !== 'number' || !Number.isFinite(o.seed)) return false;
  if (!isValidSerializedEdits(o.hex)) return false;
  if (!isValidSerializedEdits(o.square)) return false;
  // v2 puede llevar cameraPath; si viene, se valida. Si es v1, se ignora.
  if (o.version === 2 && o.cameraPath !== undefined && !isValidCameraPath(o.cameraPath)) {
    return false;
  }
  return true;
}

function countEntries(e: SerializedEdits): number {
  let n = 0;
  for (const [, entries] of e) n += entries.length;
  return n;
}

// Reglas de validación por entrada individual: chunk key con enteros, coord
// locales en [0, CHUNK_WIDTH), y en [0, CHUNK_HEIGHT), block id en el rango
// de la tabla BLOCKS.
function validateEntries(edits: SerializedEdits): boolean {
  const chunkKeyRe = /^-?\d+,-?\d+$/;
  for (const [ck, entries] of edits) {
    if (!chunkKeyRe.test(ck)) return false;
    for (const [lk, blockId] of entries) {
      const parts = lk.split(',');
      if (parts.length !== 3) return false;
      const la = parseInt(parts[0], 10);
      const lb = parseInt(parts[1], 10);
      const y = parseInt(parts[2], 10);
      if (!Number.isInteger(la) || !Number.isInteger(lb) || !Number.isInteger(y)) return false;
      if (la < 0 || la >= CHUNK_WIDTH) return false;
      if (lb < 0 || lb >= CHUNK_WIDTH) return false;
      if (y < 0 || y >= CHUNK_HEIGHT) return false;
      if (!Number.isInteger(blockId) || blockId < 0 || blockId >= BLOCKS.length) return false;
    }
  }
  return true;
}

// Compat: mantiene la vieja signatura para códigos que solo necesitan el save
// (o null). El nuevo `parseSaveDetailed` diferencia motivos del fallo.
export function parseSave(text: string): HexacraftSave | null {
  const r = parseSaveDetailed(text);
  return r.ok ? r.save : null;
}

export function parseSaveDetailed(text: string): ImportResult {
  if (text.length > MAX_SAVE_TEXT_BYTES) return { ok: false, error: 'too-large' };
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: 'not-json' };
  }
  if (!isValidSave(parsed)) return { ok: false, error: 'unknown-format' };
  const total = countEntries(parsed.hex) + countEntries(parsed.square);
  if (total > MAX_TOTAL_EDITS) return { ok: false, error: 'too-many-edits' };
  if (!validateEntries(parsed.hex) || !validateEntries(parsed.square)) {
    return { ok: false, error: 'invalid-entry' };
  }
  return { ok: true, save: parsed };
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

export function pickImportFile(cb: (result: ImportResult) => void): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json,.json';
  input.onchange = (): void => {
    const file = input.files?.[0];
    if (!file) {
      cb({ ok: false, error: 'not-json' });
      return;
    }
    if (file.size > MAX_SAVE_TEXT_BYTES) {
      cb({ ok: false, error: 'too-large' });
      return;
    }
    file
      .text()
      .then((txt) => cb(parseSaveDetailed(txt)))
      .catch(() => cb({ ok: false, error: 'not-json' }));
  };
  input.click();
}

export function importErrorMessage(err: ImportError): string {
  switch (err) {
    case 'too-large':
      return 'Archivo demasiado grande';
    case 'not-json':
      return 'Archivo inválido (no es JSON)';
    case 'unknown-format':
      return 'Formato o versión desconocidos';
    case 'too-many-edits':
      return 'El archivo tiene demasiadas modificaciones';
    case 'invalid-entry':
      return 'El archivo contiene entradas fuera de rango';
  }
}
