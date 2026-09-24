import * as THREE from 'three';
import { buildTestScene } from './scene/testScene';

const canvas = document.createElement('canvas');
document.body.appendChild(canvas);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x000000);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 100);

const { cube, hexPrism, cubeTriangles, hexTriangles } = buildTestScene();
cube.position.x = -1.2;
hexPrism.position.x = 1.2;
scene.add(cube);
scene.add(hexPrism);

const key = new THREE.DirectionalLight(0xffffff, 1.1);
key.position.set(3, 5, 2);
scene.add(key);
scene.add(new THREE.AmbientLight(0xffffff, 0.35));

const hud = document.getElementById('hud');
if (hud) {
  const nf = new Intl.NumberFormat('es-ES');
  hud.textContent =
    `Cubo: ${nf.format(cubeTriangles)} triángulos` +
    `  ·  Prisma hex: ${nf.format(hexTriangles)} triángulos`;
}

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
});

const clock = new THREE.Clock();

function tick(): void {
  const t = clock.getElapsedTime();

  cube.rotation.y = t * 0.4;
  hexPrism.rotation.y = t * 0.4;

  const radius = 4.2;
  const orbitSpeed = 0.25;
  camera.position.set(Math.sin(t * orbitSpeed) * radius, 2.2, Math.cos(t * orbitSpeed) * radius);
  camera.lookAt(0, 0, 0);

  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}
tick();
