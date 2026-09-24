import * as THREE from 'three';
import { HexGrid, SquareGrid } from './grid';
import { World } from './world/World';
import { FlyControls } from './player/controls';
import { Hud } from './ui/hud';

const SEED = 1234;
const INITIAL_POS = new THREE.Vector3(0, 40, 20);

const canvas = document.createElement('canvas');
canvas.style.cssText = 'display:block;width:100%;height:100%;cursor:crosshair;';
document.body.appendChild(canvas);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x88b4e0);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 500);
camera.position.copy(INITIAL_POS);

const hudRoot = document.getElementById('hud');
if (!hudRoot) throw new Error('#hud no encontrado en index.html');
const hud = new Hud(hudRoot);

const world = new World(new HexGrid(), SEED);
scene.add(world.opaqueGroup);
scene.add(world.waterGroup);

const controls = new FlyControls(camera, canvas);

let wireframe = false;

window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyG') {
    // Cambiar de rejilla conservando posición y orientación.
    const newGrid = world.grid.kind === 'hex' ? new SquareGrid() : new HexGrid();
    world.swapGrid(newGrid);
    // El estado en la URL queda para la fase 5.
  } else if (e.code === 'KeyX') {
    wireframe = !wireframe;
    world.setWireframe(wireframe);
  } else if (e.code === 'F3') {
    e.preventDefault();
    hud.toggleF3();
  } else if (e.code === 'F1') {
    e.preventDefault();
    hud.toggleCinema();
  }
});

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
});

// Estimador simple de fps con ventana móvil.
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
  });

  requestAnimationFrame(tick);
}
tick();
