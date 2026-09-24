import * as THREE from 'three';
import type { Point2 } from '../grid';
import { HexGrid, SquareGrid } from '../grid';

// Cubo (12 triángulos) y prisma hexagonal (20 triángulos) del mismo volumen (1),
// construidos extruyendo la huella de cada rejilla en ±0.5 de altura.
// Un polígono de n vértices CCW visto desde +Y da 2·(n-2) + 2·n = 4n - 4 triángulos
// (tapa + tapa + laterales): n=4 → 12, n=6 → 20.

type Vec3 = readonly [number, number, number];
type RGB = readonly [number, number, number];

interface Triangle {
  readonly v0: Vec3;
  readonly v1: Vec3;
  readonly v2: Vec3;
  readonly color: RGB;
}

interface Prism {
  readonly mesh: THREE.Mesh;
  readonly triangles: number;
}

function trisToMesh(triangles: readonly Triangle[]): THREE.Mesh {
  const positions = new Float32Array(triangles.length * 9);
  const colors = new Float32Array(triangles.length * 9);
  for (let i = 0; i < triangles.length; i++) {
    const t = triangles[i];
    const verts: readonly Vec3[] = [t.v0, t.v1, t.v2];
    for (let v = 0; v < 3; v++) {
      const p = verts[v];
      const idx = (i * 3 + v) * 3;
      positions[idx + 0] = p[0];
      positions[idx + 1] = p[1];
      positions[idx + 2] = p[2];
      colors[idx + 0] = t.color[0];
      colors[idx + 1] = t.color[1];
      colors[idx + 2] = t.color[2];
    }
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geom.computeVertexNormals();
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  return new THREE.Mesh(geom, mat);
}

const TOP: RGB = [0.85, 0.85, 0.85];
const BOT: RGB = [0.3, 0.3, 0.3];
const SIDE: RGB = [0.55, 0.55, 0.55];

function buildPrism(footprint: readonly Point2[], halfHeight = 0.5): Prism {
  const n = footprint.length;
  const topOf = (p: Point2): Vec3 => [p.x, +halfHeight, p.z];
  const botOf = (p: Point2): Vec3 => [p.x, -halfHeight, p.z];

  const tris: Triangle[] = [];

  // Tapa superior: abanico desde v0 (normal +Y).
  for (let i = 1; i < n - 1; i++) {
    tris.push({
      v0: topOf(footprint[0]),
      v1: topOf(footprint[i]),
      v2: topOf(footprint[i + 1]),
      color: TOP,
    });
  }

  // Tapa inferior: abanico invertido (normal -Y).
  for (let i = 1; i < n - 1; i++) {
    tris.push({
      v0: botOf(footprint[0]),
      v1: botOf(footprint[i + 1]),
      v2: botOf(footprint[i]),
      color: BOT,
    });
  }

  // Laterales: por cada arista de la huella, un quad con normal hacia fuera.
  for (let i = 0; i < n; i++) {
    const a = footprint[i];
    const b = footprint[(i + 1) % n];
    tris.push(
      { v0: topOf(a), v1: botOf(a), v2: botOf(b), color: SIDE },
      { v0: topOf(a), v1: botOf(b), v2: topOf(b), color: SIDE },
    );
  }

  return { mesh: trisToMesh(tris), triangles: tris.length };
}

export interface TestScene {
  readonly cube: THREE.Mesh;
  readonly hexPrism: THREE.Mesh;
  readonly cubeTriangles: number;
  readonly hexTriangles: number;
}

export function buildTestScene(): TestScene {
  const cube = buildPrism(new SquareGrid().footprintLocal());
  const hex = buildPrism(new HexGrid().footprintLocal());
  return {
    cube: cube.mesh,
    hexPrism: hex.mesh,
    cubeTriangles: cube.triangles,
    hexTriangles: hex.triangles,
  };
}
