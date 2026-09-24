import * as THREE from 'three';
import { HexGrid, SquareGrid } from './grid';
import { World } from './world/World';
import { Player } from './player/controls';
import { Hud } from './ui/hud';
import { Hotbar } from './ui/hotbar';
import { Outline } from './render/outline';
import { RayHit, faceLabel, raycast } from './interact/raycast';
import { tryBreak, tryPlace } from './interact/actions';
import { DEFAULT_PLAYER_CONFIG } from './player/config';
import { createBlockTexture } from './render/textures';
import { createWorldMaterials } from './render/materials';
import { AppState, hashToState, stateToHash } from './state/hashState';
import { Persistence } from './state/persistence';
import {
  buildSave,
  downloadSave,
  importErrorMessage,
  pickImportFile,
} from './state/exportImport';
import { WorldEdits } from './interact/edits';
import { UndoStack, applyPlan, revertEntry } from './presets/build';
import { PresetName, buildPreset } from './presets/presets';
import { planTranslate } from './presets/translate';
import { PresetMenu } from './ui/presetMenu';
import { SplitView } from './render/splitView';
import { Benchmark, parseBenchmark } from './state/benchmark';

const SKY_COLOR = 0x88b4e0;
const MIN_DISTANCE = 16;
const MAX_DISTANCE = 256;
const DISTANCE_STEP = 8;
const DEFAULT_DISTANCE = 64;
const REACH = 6;
const HOLD_REPEAT_MS = 250;

const canvas = document.createElement('canvas');
canvas.style.cssText = 'display:block;width:100%;height:100%;cursor:crosshair;';
document.body.appendChild(canvas);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(SKY_COLOR);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 800);

const hudRoot = document.getElementById('hud');
if (!hudRoot) throw new Error('#hud no encontrado en index.html');
const hud = new Hud(hudRoot);

// ---- Parsear URL: ?distancia=, ?benchmark=, y hash ----
function parseDistanceFromURL(): number {
  const raw = new URLSearchParams(window.location.search).get('distancia');
  if (raw === null) return DEFAULT_DISTANCE;
  const n = parseInt(raw, 10);
  if (Number.isNaN(n)) return DEFAULT_DISTANCE;
  return Math.max(MIN_DISTANCE, Math.min(MAX_DISTANCE, n));
}

const bench = parseBenchmark();
const initialHashState = hashToState(window.location.hash);

// Semilla: benchmark fija una; ?semilla= la pisa; el hash tambien; si no, 1234.
let seed = 1234;
if (bench) seed = 424242;
const seedParam = new URLSearchParams(window.location.search).get('semilla');
if (seedParam !== null) {
  const n = parseInt(seedParam, 10);
  if (Number.isFinite(n)) seed = n;
}
if (initialHashState?.seed !== undefined) seed = initialHashState.seed;

let renderDistance = initialHashState?.dist ?? parseDistanceFromURL();
renderDistance = Math.max(MIN_DISTANCE, Math.min(MAX_DISTANCE, renderDistance));

// ---- Persistencia y worlds ----
const persistence = new Persistence(seed);
const hexEdits = persistence.load('hex') ?? new WorldEdits();
const sqEdits = persistence.load('square') ?? new WorldEdits();

const texture = createBlockTexture(seed);
const materials = createWorldMaterials(texture);

const worldHex = new World(new HexGrid(), seed, renderDistance, { materials, texture }, hexEdits);
const worldSq = new World(new SquareGrid(), seed, renderDistance, { materials, texture }, sqEdits);
scene.add(worldHex.opaqueGroup, worldHex.waterGroup);
scene.add(worldSq.opaqueGroup, worldSq.waterGroup);

// Rejilla activa: la del hash, o hex por defecto.
const initialGrid: 'hex' | 'square' =
  bench?.gridKind ?? initialHashState?.grid ?? 'hex';
let activeWorld: World = initialGrid === 'hex' ? worldHex : worldSq;
worldSq.opaqueGroup.visible = initialGrid === 'square';
worldSq.waterGroup.visible = initialGrid === 'square';
worldHex.opaqueGroup.visible = initialGrid === 'hex';
worldHex.waterGroup.visible = initialGrid === 'hex';

const fogColor = new THREE.Color(SKY_COLOR);
function applyFog(): void {
  materials.setFog(fogColor, renderDistance * 0.55, renderDistance);
  camera.far = renderDistance + 40;
  camera.updateProjectionMatrix();
  worldHex.setRenderDistance(renderDistance);
  worldSq.setRenderDistance(renderDistance);
}
applyFog();

const player = new Player(camera, canvas, activeWorld.grid, activeWorld);
const hotbar = new Hotbar(hudRoot, activeWorld.grid);
const outline = new Outline();
scene.add(outline.mesh);
const split = new SplitView(hudRoot);
const benchmark = bench ? new Benchmark(bench) : null;

// Aplicar hash inicial al jugador (posición, orientación, modo).
if (initialHashState?.pos && initialHashState?.yaw !== undefined && initialHashState?.pitch !== undefined) {
  player.applyState(
    initialHashState.pos,
    initialHashState.yaw,
    initialHashState.pitch,
    initialHashState.mode ?? 'walk',
  );
}

let textured = initialHashState?.textured ?? true;
materials.setUseTexture(textured);

// ---- Persistencia: escribir cuando hay cambios ----
const editsByKind: Record<'hex' | 'square', WorldEdits> = {
  hex: hexEdits,
  square: sqEdits,
};
let persistTimer: number | null = null;
function persistSoon(kind: 'hex' | 'square'): void {
  persistence.scheduleSave(kind);
  if (persistTimer !== null) return;
  persistTimer = window.setTimeout(() => {
    persistence.flush(editsByKind);
    persistTimer = null;
  }, 3000);
}
window.addEventListener('beforeunload', () => persistence.flush(editsByKind));

// Wrap setBlock para disparar la persistencia.
const originalSetBlockHex = worldHex.setBlock.bind(worldHex);
const originalSetBlockSq = worldSq.setBlock.bind(worldSq);
worldHex.setBlock = (a, b, y, block): boolean => {
  const ok = originalSetBlockHex(a, b, y, block);
  if (ok) persistSoon('hex');
  return ok;
};
worldSq.setBlock = (a, b, y, block): boolean => {
  const ok = originalSetBlockSq(a, b, y, block);
  if (ok) persistSoon('square');
  return ok;
};

// ---- Entrada ----
let wireframe = false;
let leftDown = false;
let rightDown = false;
let leftNextAt = 0;
let rightNextAt = 0;
// Último hit del raycast, actualizado cada frame; se usa desde los handlers
// de teclado (por ejemplo, la tecla M para poner fuentes en las dos rejillas).
let lastHit: RayHit | null = null;
let waterPaused = false;

const undoStack = new UndoStack(10);

// Punto de anclaje para presets y traducción: el punto apuntado si hay hit,
// o la posición del jugador (proyectada a suelo) si no.
function presetAnchor(): { x: number; y: number; z: number } {
  if (lastHit) {
    const wp = activeWorld.grid.center(lastHit.placeCell);
    return { x: wp.x, y: lastHit.placeYLayer, z: wp.z };
  }
  return {
    x: camera.position.x,
    y: Math.floor(camera.position.y),
    z: camera.position.z,
  };
}

function runPreset(name: PresetName, opts?: object): void {
  const anchor = presetAnchor();
  const plan = buildPreset(name, anchor, opts);
  const entry = applyPlan(plan, worldHex, worldSq, `preset ${name}`);
  undoStack.push(entry);
  hud.flashMessage(`preset ${name}`);
}

function runTranslate(): void {
  const anchor = presetAnchor();
  const other = activeWorld === worldHex ? worldSq : worldHex;
  const plan = planTranslate(activeWorld, other, anchor);
  const entry = applyPlan(plan, worldHex, worldSq, 'traducir');
  undoStack.push(entry);
  hud.flashMessage(`traducido a ${other.grid.kind === 'hex' ? 'hex' : 'cuadrada'}`);
}

function runUndo(): void {
  const entry = undoStack.pop();
  if (!entry) {
    hud.flashMessage('Nada que deshacer');
    return;
  }
  revertEntry(entry, worldHex, worldSq);
  hud.flashMessage(`deshecho: ${entry.label}`);
}

// API de consola: hexacraft.preset('torre', {radio: 4}), .translate(), .undo().
interface HexacraftAPI {
  preset(name: PresetName, opts?: object): void;
  translate(): void;
  undo(): void;
}
declare global {
  interface Window {
    hexacraft?: HexacraftAPI;
  }
}
window.hexacraft = {
  preset: (name, opts) => runPreset(name, opts),
  translate: () => runTranslate(),
  undo: () => runUndo(),
};

const presetMenu = new PresetMenu((name) => runPreset(name));

canvas.addEventListener('mousedown', (e) => {
  if (!player.isLocked()) return;
  if (e.button === 0) {
    leftDown = true;
    leftNextAt = 0;
  } else if (e.button === 2) {
    rightDown = true;
    rightNextAt = 0;
  }
});
canvas.addEventListener('mouseup', (e) => {
  if (e.button === 0) leftDown = false;
  if (e.button === 2) rightDown = false;
});
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('wheel', (e) => {
  if (!player.isLocked()) return;
  e.preventDefault();
  hotbar.onWheel(e.deltaY);
});

function currentGridKind(): 'hex' | 'square' {
  return activeWorld.grid.kind;
}

function swapActiveGrid(): void {
  activeWorld = activeWorld === worldHex ? worldSq : worldHex;
  player.setWorld(activeWorld.grid, activeWorld);
  hotbar.swapGrid(activeWorld.grid);
  if (!split.active) {
    worldHex.opaqueGroup.visible = activeWorld === worldHex;
    worldHex.waterGroup.visible = activeWorld === worldHex;
    worldSq.opaqueGroup.visible = activeWorld === worldSq;
    worldSq.waterGroup.visible = activeWorld === worldSq;
  }
}

function copyStateToUrl(): void {
  const state: AppState = {
    grid: currentGridKind(),
    seed,
    pos: {
      x: player.state.position.x,
      y: player.state.position.y,
      z: player.state.position.z,
    },
    yaw: player.state.yaw,
    pitch: player.state.pitch,
    mode: player.state.mode,
    dist: renderDistance,
    textured,
  };
  const hash = stateToHash(state);
  window.history.replaceState(null, '', hash);
  const full = window.location.href.replace(/#.*$/, '') + hash;
  navigator.clipboard?.writeText(full).catch(() => {});
  hud.flashMessage('Enlace copiado');
}

window.addEventListener('keydown', (e) => {
  // Ctrl+Z deshace lo último; interceptamos siempre.
  if (e.code === 'KeyZ' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    runUndo();
    return;
  }
  if (hotbar.onKey(e.code)) return;
  switch (e.code) {
    case 'KeyG':
      swapActiveGrid();
      break;
    case 'KeyT':
      textured = !textured;
      materials.setUseTexture(textured);
      break;
    case 'KeyX':
      wireframe = !wireframe;
      materials.setWireframe(wireframe);
      break;
    case 'F3':
      e.preventDefault();
      hud.toggleF3();
      break;
    case 'F1':
      e.preventDefault();
      hud.toggleCinema();
      split.setCinema(hud.isCinema());
      break;
    case 'Equal':
    case 'NumpadAdd':
      renderDistance = Math.min(MAX_DISTANCE, renderDistance + DISTANCE_STEP);
      applyFog();
      break;
    case 'Minus':
    case 'NumpadSubtract':
      renderDistance = Math.max(MIN_DISTANCE, renderDistance - DISTANCE_STEP);
      applyFog();
      break;
    case 'KeyC':
      copyStateToUrl();
      break;
    case 'KeyV':
      split.setActive(!split.active);
      // Al desactivar, restauramos visibilidad del world activo.
      if (!split.active) {
        worldHex.opaqueGroup.visible = activeWorld === worldHex;
        worldHex.waterGroup.visible = activeWorld === worldHex;
        worldSq.opaqueGroup.visible = activeWorld === worldSq;
        worldSq.waterGroup.visible = activeWorld === worldSq;
      }
      break;
    case 'KeyB': // Backup (exportar)
      downloadSave(buildSave(seed, worldHex.edits, worldSq.edits));
      hud.flashMessage('Guardado descargado');
      break;
    case 'KeyN': // Nuevo (importar)
      pickImportFile((result) => {
        if (!result.ok) {
          hud.flashMessage(importErrorMessage(result.error));
          return;
        }
        const save = result.save;
        if (save.seed !== seed) {
          const change = window.confirm(
            `El archivo es de la semilla ${save.seed}. ¿Cambiar a esa semilla y cargar el guardado?`,
          );
          if (!change) {
            hud.flashMessage('Importación cancelada');
            return;
          }
          // Guardamos los edits del archivo bajo la nueva semilla en localStorage
          // y recargamos con ?semilla=<nueva>. Al arrancar, se cargarán.
          try {
            localStorage.setItem(
              `hexacraft:v1:${save.seed}:hex`,
              JSON.stringify({ version: 1, entries: save.hex }),
            );
            localStorage.setItem(
              `hexacraft:v1:${save.seed}:square`,
              JSON.stringify({ version: 1, entries: save.square }),
            );
          } catch (err) {
            console.warn('Hexacraft: no se pudo pre-guardar bajo la nueva semilla', err);
          }
          window.location.search = `?semilla=${save.seed}`;
          return;
        }
        const newHex = new WorldEdits();
        newHex.deserialize(save.hex);
        const newSq = new WorldEdits();
        newSq.deserialize(save.square);
        worldHex.reloadFromEdits(newHex);
        worldSq.reloadFromEdits(newSq);
        editsByKind.hex = worldHex.edits;
        editsByKind.square = worldSq.edits;
        persistence.scheduleSave('hex');
        persistence.scheduleSave('square');
        persistence.flush(editsByKind);
        hud.flashMessage('Guardado importado');
      });
      break;
    case 'KeyM':
      // Atajo rápido: fuente en ambas rejillas (equivalente al preset fuente,
      // apuntado al hit si hay o al jugador si no). Guarda en las dos edits
      // aunque la otra rejilla no esté cargada.
      runPreset('fuente');
      break;
    case 'KeyP':
      presetMenu.toggle();
      break;
    case 'KeyY':
      runTranslate();
      break;
    case 'KeyL':
      waterPaused = !waterPaused;
      hud.flashMessage(waterPaused ? 'Agua en pausa' : 'Agua reanudada');
      break;
    case 'Delete':
      if (window.confirm('¿Borrar mis construcciones de esta semilla?')) {
        worldHex.reloadFromEdits(new WorldEdits());
        worldSq.reloadFromEdits(new WorldEdits());
        editsByKind.hex = worldHex.edits;
        editsByKind.square = worldSq.edits;
        persistence.clear();
        hud.flashMessage('Construcciones borradas');
      }
      break;
  }
});

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
});

let fps = 0;
const frameSamples: number[] = [];
const FRAME_WINDOW = 60;

const clock = new THREE.Clock();
const camDir = new THREE.Vector3();
const cfg = DEFAULT_PLAYER_CONFIG;

if (benchmark) {
  if (bench?.split) split.setActive(true);
  benchmark.start();
}

function tick(): void {
  const dt = clock.getDelta();
  const frameStart = performance.now();

  const benchDriving = benchmark ? benchmark.update(camera, activeWorld, dt * 1000) : false;

  // Actualiza chunks. En split view actualizamos ambos worlds; en normal, solo
  // el activo (el inactivo va rezagado, se pone al día si el jugador pulsa G).
  activeWorld.update(camera.position.x, camera.position.z);
  if (split.active) {
    const other = activeWorld === worldHex ? worldSq : worldHex;
    other.update(camera.position.x, camera.position.z);
  }

  // Simulación de agua: siempre el activo; en split, también el otro para
  // que las dos rejillas avancen sincronizadas. Se pausa con L.
  const dtMs = dt * 1000;
  if (!waterPaused) {
    activeWorld.updateWater(dtMs);
    if (split.active) {
      const other = activeWorld === worldHex ? worldSq : worldHex;
      other.updateWater(dtMs);
    }
  }

  if (!benchDriving) player.update(dt);

  // Raycast desde la cámara. Cada frame, para el contorno y para las acciones.
  camera.getWorldDirection(camDir);
  let hit: RayHit | null = null;
  if (!benchDriving && player.isLocked()) {
    hit = raycast(
      activeWorld.grid,
      activeWorld,
      { x: camera.position.x, y: camera.position.y, z: camera.position.z },
      { x: camDir.x, y: camDir.y, z: camDir.z },
      REACH,
    );
  }

  lastHit = hit;
  const cinema = hud.isCinema();
  if (hit && !cinema && !split.active) outline.update(activeWorld.grid, hit.cell, hit.yLayer);
  else outline.hide();
  hotbar.setVisible(!cinema && !benchDriving);

  const now = performance.now();
  if (leftDown && now >= leftNextAt) {
    if (hit) {
      const act = tryBreak(hit);
      if (act) activeWorld.setBlock(act.cell.a, act.cell.b, act.y, act.block);
    }
    leftNextAt = now + HOLD_REPEAT_MS;
  }
  if (rightDown && now >= rightNextAt) {
    if (hit) {
      const act = tryPlace(hit, hotbar.currentBlock(), activeWorld.grid, activeWorld, player.state, cfg);
      if (act) activeWorld.setBlock(act.cell.a, act.cell.b, act.y, act.block);
    }
    rightNextAt = now + HOLD_REPEAT_MS;
  }

  if (split.active) split.render(renderer, scene, camera, worldHex, worldSq);
  else renderer.render(scene, camera);

  const cameraCell = activeWorld.grid.cellAt({ x: camera.position.x, z: camera.position.z });
  const s = activeWorld.stats;
  const ps = player.state;
  frameSamples.push(performance.now() - frameStart);
  if (frameSamples.length > FRAME_WINDOW) frameSamples.shift();
  const avgMs = frameSamples.reduce((a, b) => a + b, 0) / frameSamples.length;
  fps = avgMs > 0 ? 1000 / avgMs : 0;

  hud.update({
    fps,
    grid: activeWorld.grid,
    cameraCell: { a: cameraCell.a, b: cameraCell.b },
    cameraY: camera.position.y,
    trianglesRendered: renderer.info.render.triangles,
    chunksLoaded: s.chunksLoaded,
    meanGenMs: s.meanGenMs,
    meanMeshMs: s.meanMeshMs,
    renderDistance,
    textured,
    playerPos: ps.position,
    playerVel: ps.velocity,
    onGround: ps.onGround,
    inWater: ps.inWater,
    mode: ps.mode,
    pointed: hit
      ? { a: hit.cell.a, b: hit.cell.b, y: hit.yLayer, face: faceLabel(hit.face) }
      : null,
    split: split.active,
  });

  requestAnimationFrame(tick);
}
tick();
