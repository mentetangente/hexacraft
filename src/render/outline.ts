import * as THREE from 'three';
import type { Cell, Grid } from '../grid';

// Contorno del bloque apuntado: aristas del prisma o del cubo con LineSegments,
// ligeramente agrandadas para evitar z-fighting contra las caras del mundo.

const OUTLINE_INFLATE_XZ = 1.005;
const OUTLINE_INFLATE_Y = 0.006; // suma directa fuera de las tapas

export class Outline {
  readonly mesh: THREE.LineSegments;

  constructor() {
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(0), 3));
    const mat = new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.85 });
    this.mesh = new THREE.LineSegments(geom, mat);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
  }

  hide(): void {
    this.mesh.visible = false;
  }

  update(grid: Grid, cell: Cell, yLayer: number): void {
    const fp = grid.footprintLocal();
    const n = fp.length;
    const center = grid.center(cell);
    const yBot = yLayer - OUTLINE_INFLATE_Y;
    const yTop = yLayer + 1 + OUTLINE_INFLATE_Y;

    // Vértices en XZ escalados desde el centro para evitar z-fighting.
    const px: number[] = new Array(n);
    const pz: number[] = new Array(n);
    for (let i = 0; i < n; i++) {
      px[i] = center.x + fp[i].x * OUTLINE_INFLATE_XZ;
      pz[i] = center.z + fp[i].z * OUTLINE_INFLATE_XZ;
    }

    const positions: number[] = [];
    const pushEdge = (
      x0: number,
      y0: number,
      z0: number,
      x1: number,
      y1: number,
      z1: number,
    ): void => {
      positions.push(x0, y0, z0, x1, y1, z1);
    };

    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      // Tapa superior.
      pushEdge(px[i], yTop, pz[i], px[j], yTop, pz[j]);
      // Tapa inferior.
      pushEdge(px[i], yBot, pz[i], px[j], yBot, pz[j]);
      // Arista vertical en el vértice i.
      pushEdge(px[i], yBot, pz[i], px[i], yTop, pz[i]);
    }

    const geom = this.mesh.geometry as THREE.BufferGeometry;
    geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
    geom.computeBoundingSphere();
    this.mesh.visible = true;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
