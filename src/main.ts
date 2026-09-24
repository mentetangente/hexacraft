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

const SEED = 1234;
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

function parseDistanceFromURL(): number {
  const raw = new URLSearchParams(window.location.search).get('distancia');
  if (raw === null) return DEFAULT_DISTANCE;
  const n = parseInt(raw, 10);
  if (Number.isNaN(n)) return DEFAULT_DISTANCE;
  return Math.max(MIN_DISTANCE, Math.min(MAX_DISTANCE, n));
}

let renderDistance = parseDistanceFromURL();
const world = new World(new HexGrid(), SEED, renderDistance);
scene.add(world.opaqueGroup);
scene.add(world.waterGroup);

const fogColor = new THREE.Color(SKY_COLOR);
function applyFog(): void {
  world.setFog(fogColor, renderDistance * 0.55, renderDistance);
  camera.far = renderDistance + 40;
  camera.updateProjectionMatrix();
}
applyFog();

const player = new Player(camera, canvas, world.grid, world);
const hotbar = new Hotbar(hudRoot, world.grid);
const outline = new Outline();
scene.add(outline.mesh);

let wireframe = false;
let textured = true;

// Estado de mantenimiento del clic.
let leftDown = false;
let rightDown = false;
let leftNextAt = 0;
let rightNextAt = 0;

canvas.addEventListener('mousedown', (e) => {
  if (!player.isLocked()) return;
  if (e.button === 0) {
    leftDown = true;
    leftNextAt = 0; // primera acción inmediata
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

window.addEventListener('keydown', (e) => {
  if (hotbar.onKey(e.code)) return;
  if (e.code === 'KeyG') {
    const newGrid = world.grid.kind === 'hex' ? new SquareGrid() : new HexGrid();
    world.swapGrid(newGrid);
    player.swapGrid(newGrid);
    hotbar.swapGrid(newGrid);
  } else if (e.code === 'KeyT') {
    textured = !textured;
    world.setUseTexture(textured);
  } else if (e.code === 'KeyX') {
    wireframe = !wireframe;
    world.setWireframe(wireframe);
  } else if (e.code === 'F3') {
    e.preventDefault();
    hud.toggleF3();
  } else if (e.code === 'F1') {
    e.preventDefault();
    hud.toggleCinema();
  } else if (e.code === 'Equal' || e.code === 'NumpadAdd') {
    renderDistance = Math.min(MAX_DISTANCE, renderDistance + DISTANCE_STEP);
    world.setRenderDistance(renderDistance);
    applyFog();
  } else if (e.code === 'Minus' || e.code === 'NumpadSubtract') {
    renderDistance = Math.max(MIN_DISTANCE, renderDistance - DISTANCE_STEP);
    world.setRenderDistance(renderDistance);
    applyFog();
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

function tick(): void {
  const dt = clock.getDelta();
  const frameStart = performance.now();

  world.update(camera.position.x, camera.position.z);
  player.update(dt);

  // Raycast desde la cámara. Cada frame, para el contorno y para las acciones.
  camera.getWorldDirection(camDir);
  let hit: RayHit | null = null;
  if (player.isLocked()) {
    hit = raycast(
      world.grid,
      world,
      { x: camera.position.x, y: camera.position.y, z: camera.position.z },
      { x: camDir.x, y: camDir.y, z: camDir.z },
      REACH,
    );
  }

  const cinema = hud.isCinema();
  if (hit && !cinema) outline.update(world.grid, hit.cell, hit.yLayer);
  else outline.hide();
  hotbar.setVisible(!cinema);

  // Acciones de romper/colocar con repetición cada HOLD_REPEAT_MS.
  const now = performance.now();
  if (leftDown && now >= leftNextAt) {
    if (hit) {
      const act = tryBreak(hit);
      if (act) world.setBlock(act.cell.a, act.cell.b, act.y, act.block);
    }
    leftNextAt = now + HOLD_REPEAT_MS;
  }
  if (rightDown && now >= rightNextAt) {
    if (hit) {
      const act = tryPlace(hit, hotbar.currentBlock(), world.grid, world, player.state, cfg);
      if (act) world.setBlock(act.cell.a, act.cell.b, act.y, act.block);
    }
    rightNextAt = now + HOLD_REPEAT_MS;
  }

  renderer.render(scene, camera);

  const cameraCell = world.grid.cellAt({ x: camera.position.x, z: camera.position.z });
  const s = world.stats;
  const ps = player.state;
  frameSamples.push(performance.now() - frameStart);
  if (frameSamples.length > FRAME_WINDOW) frameSamples.shift();
  const avgMs = frameSamples.reduce((a, b) => a + b, 0) / frameSamples.length;
  fps = avgMs > 0 ? 1000 / avgMs : 0;

  hud.update({
    fps,
    grid: world.grid,
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
  });

  requestAnimationFrame(tick);
}
tick();
