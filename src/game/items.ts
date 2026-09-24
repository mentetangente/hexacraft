import * as THREE from 'three';
import type { Grid } from '../grid';
import { Block, BLOCKS, isSolid } from '../world/blocks';
import type { World } from '../world/World';
import { Inventory } from './inventory';

// Objetos que sueltan los bloques al romperse en supervivencia. Cada objeto es
// una miniatura del bloque con la forma de la rejilla activa; cae con gravedad
// reutilizando comprobaciones simples de física, se atrae hacia el jugador si
// está cerca y se recoge si hay hueco en el inventario.

const GRAVITY = 20;
const MAGNET_RADIUS = 1.5;
const MERGE_RADIUS = 0.5;
const PICKUP_RADIUS = 0.5;
const LIFETIME_MS = 5 * 60 * 1000;
const ITEM_RADIUS = 0.15;
const BOB_AMPLITUDE = 0.06;
const ROTATION_SPEED = 1.5; // rad/s

interface Item {
  id: number;
  block: Block;
  x: number;
  y: number;
  z: number;
  vy: number;
  spawnedAt: number;
  bobPhase: number;
  mesh: THREE.Mesh;
}

export class ItemManager {
  private readonly items: Item[] = [];
  private nextId = 1;
  private gridKind: 'hex' | 'square';
  private hexGeom = new THREE.CylinderGeometry(ITEM_RADIUS, ITEM_RADIUS, ITEM_RADIUS * 2, 6);
  private cubeGeom = new THREE.BoxGeometry(ITEM_RADIUS * 2, ITEM_RADIUS * 2, ITEM_RADIUS * 2);

  constructor(private readonly parent: THREE.Object3D, grid: Grid) {
    this.gridKind = grid.kind;
    // Rotamos la geometría hex para que el "vértice arriba" coincida con la
    // forma vista desde arriba del prisma.
    this.hexGeom.rotateY(Math.PI / 6);
  }

  spawn(block: Block, x: number, y: number, z: number): void {
    if (block === Block.Air) return;
    const geom = this.gridKind === 'hex' ? this.hexGeom : this.cubeGeom;
    const col = BLOCKS[block].top;
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(col[0], col[1], col[2]),
    });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.position.set(x, y, z);
    this.parent.add(mesh);
    this.items.push({
      id: this.nextId++,
      block,
      x,
      y,
      z,
      vy: 2, // pequeño empujón hacia arriba al soltar
      spawnedAt: performance.now(),
      bobPhase: Math.random() * Math.PI * 2,
      mesh,
    });
  }

  setGridKind(grid: Grid): void {
    if (grid.kind === this.gridKind) return;
    this.gridKind = grid.kind;
    const geom = this.gridKind === 'hex' ? this.hexGeom : this.cubeGeom;
    for (const it of this.items) it.mesh.geometry = geom;
  }

  clear(): void {
    for (const it of this.items) this.dispose(it);
    this.items.length = 0;
  }

  count(): number {
    return this.items.length;
  }

  private dispose(it: Item): void {
    this.parent.remove(it.mesh);
    (it.mesh.material as THREE.Material).dispose();
  }

  // Actualiza posición, atracción, recogida, fusión y expiración. `world` se
  // usa para comprobar bloques sólidos; `inventory` para intentar recoger.
  update(
    dt: number,
    world: World,
    playerX: number,
    playerY: number,
    playerZ: number,
    inventory: Inventory,
    onPickup: () => void,
  ): void {
    const now = performance.now();
    // 1) Física + atracción.
    for (const it of this.items) {
      it.bobPhase += dt * 2;
      // Distancia al jugador para el imán.
      const dx = playerX - it.x;
      const dy = playerY + 0.5 - it.y;
      const dz = playerZ - it.z;
      const d = Math.hypot(dx, dy, dz);
      if (d < MAGNET_RADIUS && inventory.freeSpaceFor(it.block) > 0) {
        // Imán: mueve el objeto hacia el jugador a velocidad proporcional.
        const speed = 8;
        const inv = 1 / Math.max(d, 0.01);
        it.x += dx * inv * speed * dt;
        it.y += dy * inv * speed * dt;
        it.z += dz * inv * speed * dt;
        // Reset vy para que no acumule caída durante el imán.
        it.vy = 0;
      } else {
        // Gravedad y suelo.
        it.vy -= GRAVITY * dt;
        it.y += it.vy * dt;
        const cell = world.grid.cellAt({ x: it.x, z: it.z });
        const belowY = Math.floor(it.y - ITEM_RADIUS);
        if (
          belowY >= 0 &&
          world.hasChunkAt(cell.a, cell.b) &&
          isSolid(world.getBlock(cell.a, cell.b, belowY))
        ) {
          it.y = belowY + 1 + ITEM_RADIUS;
          if (it.vy < 0) it.vy = 0;
        }
      }
      // Sincroniza la malla con la bobbing y la rotación.
      it.mesh.position.set(
        it.x,
        it.y + Math.sin(it.bobPhase) * BOB_AMPLITUDE,
        it.z,
      );
      it.mesh.rotation.y += ROTATION_SPEED * dt;
    }
    // 2) Fusiones (items iguales cercanos → uno solo).
    for (let i = this.items.length - 1; i >= 0; i--) {
      const a = this.items[i];
      for (let j = i - 1; j >= 0; j--) {
        const b = this.items[j];
        if (a.block !== b.block) continue;
        const dd = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
        if (dd < MERGE_RADIUS) {
          // Fusionar b (más antiguo) queda; a desaparece.
          this.dispose(a);
          this.items.splice(i, 1);
          break;
        }
      }
    }
    // 3) Recogida por proximidad estricta.
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      const dd = Math.hypot(it.x - playerX, it.y - (playerY + 0.9), it.z - playerZ);
      if (dd < PICKUP_RADIUS && inventory.freeSpaceFor(it.block) > 0) {
        const leftover = inventory.add(it.block, 1);
        if (leftover === 0) {
          this.dispose(it);
          this.items.splice(i, 1);
          onPickup();
        }
      }
    }
    // 4) Expiración.
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      if (now - it.spawnedAt > LIFETIME_MS) {
        this.dispose(it);
        this.items.splice(i, 1);
      }
    }
  }
}
