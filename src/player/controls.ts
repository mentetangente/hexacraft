import * as THREE from 'three';
import type { Grid } from '../grid';
import type { BlockSampler, InputIntent, PlayerState } from './physics';
import { createInput, createPlayer, physicsStep, placeOnSurface, snapOutOfSolid } from './physics';
import { DEFAULT_PLAYER_CONFIG, PlayerConfig } from './config';

const MOUSE_SENSITIVITY = 0.0022;
const MIN_PITCH = -Math.PI / 2 + 0.01;
const MAX_PITCH = Math.PI / 2 - 0.01;

// Junta física + input DOM: la ventana llama update(dt) cada frame y controls
// lleva el acumulador de paso fijo, dispara los toggles y sincroniza la cámara.
export class Player {
  readonly state: PlayerState = createPlayer();
  private readonly input: InputIntent = createInput();
  private acc = 0;
  private locked = false;
  private readonly keys = new Set<string>();
  private readonly euler = new THREE.Euler(0, 0, 0, 'YXZ');
  private placed = false;

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    domElement: HTMLElement,
    private grid: Grid,
    private sampler: BlockSampler,
    private readonly cfg: PlayerConfig = DEFAULT_PLAYER_CONFIG,
  ) {
    // Aparición inicial: al lado del origen, encima del suelo. Se ubica en el
    // primer tick en que exista chunk cargado ahí (ver update()).
    this.state.position.x = 0;
    this.state.position.z = 0;
    this.state.position.y = 60;
    this.state.pitch = -0.15;

    domElement.addEventListener('click', () => {
      if (!this.locked) domElement.requestPointerLock();
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === domElement;
      if (!this.locked) this.keys.clear();
    });
    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.state.yaw -= e.movementX * MOUSE_SENSITIVITY;
      this.state.pitch -= e.movementY * MOUSE_SENSITIVITY;
      if (this.state.pitch < MIN_PITCH) this.state.pitch = MIN_PITCH;
      if (this.state.pitch > MAX_PITCH) this.state.pitch = MAX_PITCH;
    });
    window.addEventListener('keydown', (e) => {
      // Toggle de vuelo es one-shot; el resto es estado.
      if (e.code === 'KeyF') {
        this.input.toggleFly = true;
        return;
      }
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
    });
    window.addEventListener('blur', () => this.keys.clear());
  }

  swapGrid(newGrid: Grid): void {
    this.grid = newGrid;
    // Solo en modo andar: sube si el jugador quedó dentro de un bloque y
    // fuerza el re-aterrizaje. En modo vuelo, mantén la posición para no
    // teletransportar al suelo.
    if (this.state.mode === 'walk') {
      snapOutOfSolid(this.state, this.grid, this.sampler, this.cfg);
      this.placed = false;
    }
  }

  // Cambia el mundo activo (rejilla + sampler). Se usa cuando main.ts alterna
  // entre worldHex y worldSq con la tecla G, o al importar/borrar guardados.
  setWorld(grid: Grid, sampler: BlockSampler): void {
    this.grid = grid;
    this.sampler = sampler;
    if (this.state.mode === 'walk') {
      snapOutOfSolid(this.state, this.grid, this.sampler, this.cfg);
      this.placed = false;
    }
  }

  // Aplica un estado externo (por ejemplo, cargado del hash de la URL). No
  // llama a placeOnSurface: respeta la Y exacta que venga.
  applyState(
    pos: { x: number; y: number; z: number },
    yaw: number,
    pitch: number,
    mode: 'walk' | 'fly',
  ): void {
    this.state.position = { ...pos };
    this.state.velocity = { x: 0, y: 0, z: 0 };
    this.state.yaw = yaw;
    this.state.pitch = pitch;
    this.state.mode = mode;
    this.state.onGround = false;
    this.placed = true;
  }

  update(dtFrame: number): void {
    // Aparición inicial diferida hasta que el chunk esté cargado.
    if (!this.placed) {
      if (this.sampler.hasChunkAt(0, 0)) {
        placeOnSurface(this.state, this.grid, this.sampler, this.cfg);
        this.placed = true;
      } else {
        return;
      }
    }

    // Refrescar intent de entrada desde el estado de teclas.
    this.readKeys();

    // Acumulador de paso fijo, con dt máximo por frame para no atravesar el
    // suelo al volver de otra pestaña.
    this.acc += Math.min(dtFrame, this.cfg.maxFrameDt);
    let steps = 0;
    while (this.acc >= this.cfg.fixedDt && steps < 8) {
      physicsStep(this.state, this.input, this.grid, this.sampler, this.cfg, this.cfg.fixedDt);
      this.acc -= this.cfg.fixedDt;
      steps++;
    }
    // Si aún queda tiempo (dt muy grande), descartamos el resto para evitar
    // spiral of death: preferimos un pequeño retardo visual a bloquear el hilo.
    if (this.acc >= this.cfg.fixedDt) this.acc = 0;

    // Sincronizar cámara: ojos = pies + eyeHeight.
    this.euler.set(this.state.pitch, this.state.yaw, 0, 'YXZ');
    this.camera.quaternion.setFromEuler(this.euler);
    this.camera.position.set(
      this.state.position.x,
      this.state.position.y + this.cfg.eyeHeight,
      this.state.position.z,
    );
  }

  isLocked(): boolean {
    return this.locked;
  }

  private readKeys(): void {
    let fwd = 0;
    let str = 0;
    if (this.keys.has('KeyW')) fwd += 1;
    if (this.keys.has('KeyS')) fwd -= 1;
    if (this.keys.has('KeyD')) str += 1;
    if (this.keys.has('KeyA')) str -= 1;
    this.input.forward = fwd;
    this.input.strafe = str;

    // Shift hace doble uso según el modo: sprint andando; bajar en vuelo. Se
    // evita Ctrl porque Ctrl+W cierra la pestaña en el navegador.
    const shift = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
    let vert = 0;
    if (this.keys.has('Space')) vert += 1;
    if (shift && this.state.mode === 'fly') vert -= 1;
    this.input.vertical = vert;

    this.input.sprint = shift && this.state.mode === 'walk';
  }
}
