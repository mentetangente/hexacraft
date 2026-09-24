import { WorldEdits, isValidSerializedEdits } from '../interact/edits';
import type { CameraPath } from './cameraPath';
import { Inventory, type SerializedInventory } from '../game/inventory';
import { isValidGameMode, type GameMode } from '../game/gameMode';

// Persistencia de las construcciones del jugador en localStorage. Clave por
// semilla y rejilla. Todos los accesos van con try/catch para que un fallo de
// cuota o de permisos no rompa el mundo.

const KEY_PREFIX = 'hexacraft:v1';
const DEBOUNCE_MS = 3000;

export type GridKind = 'hex' | 'square';

interface StoredEnvelope {
  readonly version: 1;
  readonly entries: unknown; // validado antes de usar
}

export class Persistence {
  private timer: number | null = null;
  private pending = new Set<GridKind>();

  constructor(public readonly seed: number) {}

  private storageKey(kind: GridKind): string {
    return `${KEY_PREFIX}:${this.seed}:${kind}`;
  }

  private safeGetStorage(): Storage | null {
    try {
      return typeof localStorage !== 'undefined' ? localStorage : null;
    } catch {
      return null;
    }
  }

  scheduleSave(kind: GridKind): void {
    this.pending.add(kind);
    if (this.timer !== null) return;
    this.timer = window.setTimeout(() => {
      this.timer = null;
    }, DEBOUNCE_MS);
  }

  // Fuerza una escritura de todos los edits pendientes. El llamante pasa la
  // referencia a los edits de cada rejilla; sólo se guardan los que están en
  // `pending`.
  flush(sources: Record<GridKind, WorldEdits>): void {
    const storage = this.safeGetStorage();
    if (!storage) return;
    for (const kind of this.pending) {
      try {
        const envelope: StoredEnvelope = {
          version: 1,
          entries: sources[kind].serialize(),
        };
        storage.setItem(this.storageKey(kind), JSON.stringify(envelope));
      } catch (err) {
        console.warn(`Hexacraft: no se pudo guardar ${kind}:`, err);
      }
    }
    this.pending.clear();
  }

  load(kind: GridKind): WorldEdits | null {
    const storage = this.safeGetStorage();
    if (!storage) return null;
    try {
      const raw = storage.getItem(this.storageKey(kind));
      if (!raw) return null;
      const parsed = JSON.parse(raw) as unknown;
      if (typeof parsed !== 'object' || parsed === null) return null;
      const env = parsed as { version?: unknown; entries?: unknown };
      if (env.version !== 1) return null;
      if (!isValidSerializedEdits(env.entries)) return null;
      const edits = new WorldEdits();
      edits.deserialize(env.entries);
      return edits;
    } catch (err) {
      console.warn(`Hexacraft: no se pudo cargar ${kind}:`, err);
      return null;
    }
  }

  clear(): void {
    const storage = this.safeGetStorage();
    if (!storage) return;
    try {
      storage.removeItem(this.storageKey('hex'));
      storage.removeItem(this.storageKey('square'));
      storage.removeItem(this.pathKey());
    } catch (err) {
      console.warn('Hexacraft: no se pudo borrar el guardado:', err);
    }
  }

  // Recorrido de cámara (fase 7b): almacenado bajo su propia clave.
  private pathKey(): string {
    return `${KEY_PREFIX}:${this.seed}:cameraPath`;
  }

  savePath(path: CameraPath): void {
    const storage = this.safeGetStorage();
    if (!storage) return;
    try {
      storage.setItem(this.pathKey(), JSON.stringify({ version: 2, path }));
    } catch (err) {
      console.warn('Hexacraft: no se pudo guardar el recorrido:', err);
    }
  }

  loadPath(): CameraPath | null {
    const storage = this.safeGetStorage();
    if (!storage) return null;
    try {
      const raw = storage.getItem(this.pathKey());
      if (!raw) return null;
      const parsed = JSON.parse(raw) as { version?: number; path?: unknown };
      if (parsed.version !== 2) return null;
      // Validación mínima (para no confiar en localStorage): comprobamos que
      // los campos existen y son del tipo esperado.
      const p = parsed.path as CameraPath | undefined;
      if (!p || !Array.isArray(p.keyframes)) return null;
      return p;
    } catch {
      return null;
    }
  }

  clearPath(): void {
    const storage = this.safeGetStorage();
    if (!storage) return;
    try {
      storage.removeItem(this.pathKey());
    } catch {
      /* ignore */
    }
  }

  // Inventario + modo de juego (fase 7c).
  private invKey(): string {
    return `${KEY_PREFIX}:${this.seed}:inventory`;
  }
  private gameKey(): string {
    return `${KEY_PREFIX}:${this.seed}:gameMode`;
  }

  saveInventory(inv: Inventory): void {
    const storage = this.safeGetStorage();
    if (!storage) return;
    try {
      storage.setItem(this.invKey(), JSON.stringify(inv.serialize()));
    } catch (err) {
      console.warn('Hexacraft: no se pudo guardar el inventario:', err);
    }
  }
  loadInventory(): Inventory | null {
    const storage = this.safeGetStorage();
    if (!storage) return null;
    try {
      const raw = storage.getItem(this.invKey());
      if (!raw) return null;
      const parsed = JSON.parse(raw) as SerializedInventory;
      if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.slots)) return null;
      return Inventory.fromSerialized(parsed);
    } catch {
      return null;
    }
  }

  saveGameMode(m: GameMode): void {
    const storage = this.safeGetStorage();
    if (!storage) return;
    try {
      storage.setItem(this.gameKey(), m);
    } catch {
      /* ignore */
    }
  }
  loadGameMode(): GameMode | null {
    const storage = this.safeGetStorage();
    if (!storage) return null;
    try {
      const raw = storage.getItem(this.gameKey());
      return isValidGameMode(raw) ? raw : null;
    } catch {
      return null;
    }
  }
}
