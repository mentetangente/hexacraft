import * as THREE from 'three';
import { HexGrid, SquareGrid } from './grid';
import { World } from './world/World';
import { FlyControls } from './player/controls';
import { Hud } from './ui/hud';

const SEED = 1234;
const INITIAL_POS = new THREE.Vector3(0, 40, 20);
const SKY_COLOR = 0x88b4e0;
const MIN_DISTANCE = 16;
const MAX_DISTANCE = 256;
const DISTANCE_STEP = 8;
const DEFAULT_DISTANCE = 64;

const canvas = document.createElement('canvas');
canvas.style.cssText = 'display:block;width:100%;height:100%;cursor:crosshair;';
document.body.appendChild(canvas);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(SKY_COLOR);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 800);
camera.position.copy(INITIAL_POS);

const hudRoot = document.getElementById('hud');
if (!hudRoot) throw new Error('#hud no encontrado en index.html');
const hud = new Hud(hudRoot);

// Distancia inicial desde ?distancia=N (con clamp) o valor por defecto.
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

// Niebla lineal: cierra justo en la distancia de render.
const fogColor = new THREE.Color(SKY_COLOR);
function applyFog(): void {
  world.setFog(fogColor, renderDistance * 0.55, renderDistance);
  // Ajustar `far` de la cámara para que no pase de la distancia de render + un
  // par de chunks (evita clipping justo antes de la niebla).
  camera.far = renderDistance + 40;
  camera.updateProjectionMatrix();
}
applyFog();

const controls = new FlyControls(camera, canvas);

let wireframe = false;
let textured = true;

window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyG') {
    const newGrid = world.grid.kind === 'hex' ? new SquareGrid() : new HexGrid();
    world.swapGrid(newGrid);
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
    // '+' (con o sin Shift en teclados típicos).
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

function tick(): void {
  const dt = Math.min(clock.getDelta(), 0.1);
  const frameStart = performance.now();

  controls.update(dt);
  world.update(camera.position.x, camera.position.z);
  renderer.render(scene, camera);

  const cameraCell = world.grid.cellAt({ x: camera.position.x, z: camera.position.z });
  const s = world.stats;
  const now = performance.now();
  frameSamples.push(now - frameStart);
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
  });

  requestAnimationFrame(tick);
}
tick();
