import * as THREE from 'three';

// Cámara libre con Pointer Lock. Fase 2a: sin gravedad ni colisiones.
// Movimiento en el plano XZ con WASD; Espacio sube; Shift baja.

const SPEED = 8; // unidades/segundo
const MOUSE_SENSITIVITY = 0.0022;
const MIN_PITCH = -Math.PI / 2 + 0.01;
const MAX_PITCH = Math.PI / 2 - 0.01;

export class FlyControls {
  private yaw = 0;
  private pitch = 0;
  private readonly keys = new Set<string>();
  private locked = false;
  private readonly euler = new THREE.Euler(0, 0, 0, 'YXZ');

  constructor(
    public readonly camera: THREE.PerspectiveCamera,
    domElement: HTMLElement,
  ) {
    // Estado inicial: mirando a -Z, y ligeramente hacia abajo.
    this.pitch = -0.15;

    domElement.addEventListener('click', () => {
      if (!this.locked) domElement.requestPointerLock();
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === domElement;
    });
    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.yaw -= e.movementX * MOUSE_SENSITIVITY;
      this.pitch -= e.movementY * MOUSE_SENSITIVITY;
      if (this.pitch < MIN_PITCH) this.pitch = MIN_PITCH;
      if (this.pitch > MAX_PITCH) this.pitch = MAX_PITCH;
    });

    window.addEventListener('keydown', (e) => {
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
    });
    // Al perder el foco (pausa en el navegador, tabout) limpiamos teclas.
    window.addEventListener('blur', () => this.keys.clear());
  }

  isLocked(): boolean {
    return this.locked;
  }

  // Devuelve la celda de la rejilla activa; conveniente para el HUD.
  getPosition(): THREE.Vector3 {
    return this.camera.position.clone();
  }

  update(dt: number): void {
    this.euler.set(this.pitch, this.yaw, 0, 'YXZ');
    this.camera.quaternion.setFromEuler(this.euler);

    if (!this.locked) return;

    // Movimiento horizontal según yaw (ignorando pitch), vertical por Espacio/Shift.
    const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));

    let vx = 0;
    let vy = 0;
    let vz = 0;
    if (this.keys.has('KeyW')) {
      vx += forward.x;
      vz += forward.z;
    }
    if (this.keys.has('KeyS')) {
      vx -= forward.x;
      vz -= forward.z;
    }
    if (this.keys.has('KeyD')) {
      vx += right.x;
      vz += right.z;
    }
    if (this.keys.has('KeyA')) {
      vx -= right.x;
      vz -= right.z;
    }
    if (this.keys.has('Space')) vy += 1;
    if (this.keys.has('ShiftLeft') || this.keys.has('ShiftRight')) vy -= 1;

    const len = Math.hypot(vx, vz);
    if (len > 0) {
      vx /= len;
      vz /= len;
    }
    this.camera.position.x += vx * SPEED * dt;
    this.camera.position.y += vy * SPEED * dt;
    this.camera.position.z += vz * SPEED * dt;
  }
}
