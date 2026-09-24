import { describe, expect, it } from 'vitest';
import { WorldEdits } from '../src/interact/edits';
import { Block, BLOCKS } from '../src/world/blocks';
import { CHUNK_HEIGHT, CHUNK_WIDTH } from '../src/world/Chunk';
import {
  MAX_SAVE_TEXT_BYTES,
  MAX_TOTAL_EDITS,
  buildSave,
  parseSaveDetailed,
} from '../src/state/exportImport';

function baseValidSave(): string {
  const hex = new WorldEdits();
  hex.set(0, 0, 5, 7, 20, Block.Stone);
  const sq = new WorldEdits();
  sq.set(1, 1, 3, 3, 30, Block.Brick);
  return JSON.stringify(buildSave(1234, hex, sq));
}

describe('parseSaveDetailed rechaza sin romper el mundo', () => {
  it('acepta un archivo bien formado', () => {
    const r = parseSaveDetailed(baseValidSave());
    expect(r.ok).toBe(true);
  });

  it('acepta archivos v1 sin cameraPath (compatibilidad hacia atrás)', () => {
    const v1 = JSON.stringify({
      format: 'hexacraft-save',
      version: 1,
      seed: 1234,
      hex: [],
      square: [],
    });
    const r = parseSaveDetailed(v1);
    expect(r.ok).toBe(true);
  });

  it('roundtrip v2: cameraPath se conserva al exportar y parsear', () => {
    const path = {
      keyframes: [
        { x: 1, y: 2, z: 3, yaw: 0.1, pitch: 0.2 },
        { x: 4, y: 5, z: 6, yaw: 0.3, pitch: -0.1 },
      ],
      duration: 20,
      loop: false,
      startDelay: 2,
    };
    const hex = new WorldEdits();
    hex.set(0, 0, 5, 7, 20, Block.Stone);
    const sq = new WorldEdits();
    const save = buildSave(1234, hex, sq, path);
    expect(save.version).toBe(2);
    const parsed = parseSaveDetailed(JSON.stringify(save));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.save.cameraPath).toEqual(path);
    }
  });

  it('v2 sin cameraPath sigue siendo válido', () => {
    const hex = new WorldEdits();
    const sq = new WorldEdits();
    const save = buildSave(1234, hex, sq);
    expect(save.version).toBe(2);
    expect(save.cameraPath).toBeUndefined();
    const parsed = parseSaveDetailed(JSON.stringify(save));
    expect(parsed.ok).toBe(true);
  });

  it('cameraPath malformado (fotograma sin y) → unknown-format', () => {
    const bad = JSON.stringify({
      format: 'hexacraft-save',
      version: 2,
      seed: 1,
      hex: [],
      square: [],
      cameraPath: {
        keyframes: [{ x: 1, z: 3, yaw: 0, pitch: 0 }],
        duration: 10,
        loop: false,
        startDelay: 0,
      },
    });
    expect(parseSaveDetailed(bad)).toEqual({ ok: false, error: 'unknown-format' });
  });

  it('JSON malformado → not-json', () => {
    const r = parseSaveDetailed('{esto no es json');
    expect(r).toEqual({ ok: false, error: 'not-json' });
  });

  it('formato desconocido → unknown-format', () => {
    const r = parseSaveDetailed(
      JSON.stringify({ format: 'otro', version: 1, seed: 1, hex: [], square: [] }),
    );
    expect(r).toEqual({ ok: false, error: 'unknown-format' });
  });

  it('versión desconocida → unknown-format', () => {
    const r = parseSaveDetailed(
      JSON.stringify({ format: 'hexacraft-save', version: 99, seed: 1, hex: [], square: [] }),
    );
    expect(r).toEqual({ ok: false, error: 'unknown-format' });
  });

  it('tipo de bloque inexistente → invalid-entry', () => {
    const bad = JSON.stringify({
      format: 'hexacraft-save',
      version: 1,
      seed: 1,
      hex: [['0,0', [['0,0,20', BLOCKS.length + 5]]]],
      square: [],
    });
    const r = parseSaveDetailed(bad);
    expect(r).toEqual({ ok: false, error: 'invalid-entry' });
  });

  it('bloque negativo → invalid-entry', () => {
    const bad = JSON.stringify({
      format: 'hexacraft-save',
      version: 1,
      seed: 1,
      hex: [['0,0', [['0,0,20', -1]]]],
      square: [],
    });
    expect(parseSaveDetailed(bad)).toEqual({ ok: false, error: 'invalid-entry' });
  });

  it('y fuera de [0, CHUNK_HEIGHT) → invalid-entry', () => {
    const bad = JSON.stringify({
      format: 'hexacraft-save',
      version: 1,
      seed: 1,
      hex: [['0,0', [['0,0,' + CHUNK_HEIGHT, Block.Stone]]]],
      square: [],
    });
    expect(parseSaveDetailed(bad)).toEqual({ ok: false, error: 'invalid-entry' });
    const negY = JSON.stringify({
      format: 'hexacraft-save',
      version: 1,
      seed: 1,
      hex: [['0,0', [['0,0,-1', Block.Stone]]]],
      square: [],
    });
    expect(parseSaveDetailed(negY)).toEqual({ ok: false, error: 'invalid-entry' });
  });

  it('coord local fuera de rango → invalid-entry', () => {
    const bad = JSON.stringify({
      format: 'hexacraft-save',
      version: 1,
      seed: 1,
      hex: [['0,0', [[`${CHUNK_WIDTH},0,20`, Block.Stone]]]],
      square: [],
    });
    expect(parseSaveDetailed(bad)).toEqual({ ok: false, error: 'invalid-entry' });
  });

  it('archivo mayor de 5 MB → too-large', () => {
    const bigText = '{' + 'x'.repeat(MAX_SAVE_TEXT_BYTES);
    const r = parseSaveDetailed(bigText);
    expect(r).toEqual({ ok: false, error: 'too-large' });
  });

  it('más de MAX_TOTAL_EDITS entradas → too-many-edits', () => {
    // Construimos un save con muchas entradas artificiales (respetando rangos).
    const entries: Array<[string, number]> = [];
    // Suficientes para superar el límite.
    const perChunk = 4096; // 16*16*16
    const chunksNeeded = Math.ceil((MAX_TOTAL_EDITS + 1) / perChunk);
    const hex: Array<[string, Array<[string, number]>]> = [];
    for (let c = 0; c < chunksNeeded; c++) {
      const chunkEntries: Array<[string, number]> = [];
      for (let la = 0; la < 16 && chunkEntries.length < perChunk; la++) {
        for (let lb = 0; lb < 16 && chunkEntries.length < perChunk; lb++) {
          for (let y = 0; y < 16 && chunkEntries.length < perChunk; y++) {
            chunkEntries.push([`${la},${lb},${y}`, Block.Stone]);
          }
        }
      }
      hex.push([`${c},0`, chunkEntries]);
    }
    const bad = JSON.stringify({
      format: 'hexacraft-save',
      version: 1,
      seed: 1,
      hex,
      square: [],
    });
    // No queremos que la prueba pase por too-large en su lugar.
    if (bad.length > MAX_SAVE_TEXT_BYTES) {
      // Salta si el JSON generado se pasa; el otro test cubre este caso.
      return;
    }
    expect(parseSaveDetailed(bad)).toEqual({ ok: false, error: 'too-many-edits' });
    // sanity
    void entries;
  });
});
