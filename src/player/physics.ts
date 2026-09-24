import type { Cell, Grid, Point2 } from '../grid';
import { Block, isSolid } from '../world/blocks';
import type { PlayerConfig } from './config';

// Física pura del jugador. No importa three.js. La geometría depende solo de
// `Grid` (que tampoco importa three.js) y de un `BlockSampler` que expone al
// mundo por celda + y. Todo se testea en Vitest.

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export type PlayerMode = 'walk' | 'fly';

export interface PlayerState {
  position: Vec3; // punto de los pies (bottom-center del cilindro)
  velocity: Vec3;
  yaw: number; // radianes
  pitch: number;
  onGround: boolean;
  inWater: boolean;
  mode: PlayerMode;
}

export interface InputIntent {
  forward: number; // -1..1 respecto a la dirección de la cámara (yaw)
  strafe: number; // -1..1 (derecha positivo)
  vertical: number; // >0 salta / nada arriba / sube en vuelo; <0 baja en vuelo
  sprint: boolean;
  toggleFly: boolean; // one-shot: el llamante lo pone a false tras consumirlo
}

export interface BlockSampler {
  getBlock(cellA: number, cellB: number, y: number): Block;
  hasChunkAt(cellA: number, cellB: number): boolean;
}

export function createPlayer(): PlayerState {
  return {
    position: { x: 0, y: 40, z: 0 },
    velocity: { x: 0, y: 0, z: 0 },
    yaw: 0,
    pitch: 0,
    onGround: false,
    inWater: false,
    mode: 'walk',
  };
}

export function createInput(): InputIntent {
  return {
    forward: 0,
    strafe: 0,
    vertical: 0,
    sprint: false,
    toggleFly: false,
  };
}

// ------------- geometría 2D auxiliares -------------

function closestPointOnSegment(
  ax: number,
  az: number,
  bx: number,
  bz: number,
  px: number,
  pz: number,
): [number, number] {
  const dx = bx - ax;
  const dz = bz - az;
  const l2 = dx * dx + dz * dz;
  if (l2 < 1e-12) return [ax, az];
  const t = ((px - ax) * dx + (pz - az) * dz) / l2;
  const clamped = t < 0 ? 0 : t > 1 ? 1 : t;
  return [ax + dx * clamped, az + dz * clamped];
}

// El polígono se asume convexo y en orden CCW visto desde +Y (invariante de
// footprintLocal, ya testeada en la fase 1).
function isInsideConvex(poly: readonly Point2[], px: number, pz: number): boolean {
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    // normal exterior = (a.z - b.z, b.x - a.x); (p - a) · outward > 0 ⇒ fuera.
    const s = (px - a.x) * (a.z - b.z) + (pz - a.z) * (b.x - a.x);
    if (s > 1e-9) return false;
  }
  return true;
}

interface CircleClosest {
  readonly cx: number;
  readonly cz: number;
  readonly d2: number;
}

function closestPointOnPolygon(
  poly: readonly Point2[],
  px: number,
  pz: number,
): CircleClosest {
  let bestD2 = Infinity;
  let cx = 0;
  let cz = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const [tx, tz] = closestPointOnSegment(a.x, a.z, b.x, b.z, px, pz);
    const d2 = (px - tx) ** 2 + (pz - tz) ** 2;
    if (d2 < bestD2) {
      bestD2 = d2;
      cx = tx;
      cz = tz;
    }
  }
  return { cx, cz, d2: bestD2 };
}

interface PushOut {
  readonly nx: number;
  readonly nz: number;
  readonly penetration: number;
}

function pushCircleOutOfPolygon(
  poly: readonly Point2[],
  px: number,
  pz: number,
  radius: number,
): PushOut | null {
  const { cx, cz, d2 } = closestPointOnPolygon(poly, px, pz);
  const dist = Math.sqrt(d2);
  const inside = isInsideConvex(poly, px, pz);
  if (!inside && dist >= radius) return null;

  let nx: number;
  let nz: number;
  let penetration: number;
  if (inside) {
    penetration = radius + dist + 1e-4;
    if (dist < 1e-9) {
      nx = 1;
      nz = 0;
    } else {
      nx = (cx - px) / dist; // hacia fuera
      nz = (cz - pz) / dist;
    }
  } else {
    penetration = radius - dist + 1e-4;
    if (dist < 1e-9) {
      nx = 1;
      nz = 0;
    } else {
      nx = (px - cx) / dist; // hacia fuera desde el punto más cercano
      nz = (pz - cz) / dist;
    }
  }
  return { nx, nz, penetration };
}

function circleTouchesCell(
  grid: Grid,
  cell: Cell,
  px: number,
  pz: number,
  radius: number,
): boolean {
  const poly = grid.footprint(cell);
  if (isInsideConvex(poly, px, pz)) return true;
  return closestPointOnPolygon(poly, px, pz).d2 <= radius * radius;
}

// ------------- candidatos -------------

function candidateCells(grid: Grid, px: number, pz: number): Cell[] {
  const center = grid.cellAt({ x: px, z: pz });
  return [center, ...grid.neighbors(center)];
}

// ------------- consultas de estado -------------

function isSolidBlock(b: Block): boolean {
  return isSolid(b);
}

interface WaterContact {
  readonly feet: boolean;
  readonly head: boolean;
}

function playerWaterContact(
  state: PlayerState,
  grid: Grid,
  sampler: BlockSampler,
  cfg: PlayerConfig,
): WaterContact {
  const cell = grid.cellAt({ x: state.position.x, z: state.position.z });
  const feetLayer = Math.floor(state.position.y + 1e-3);
  const headLayer = Math.floor(state.position.y + cfg.height - 1e-3);
  const feet = sampler.getBlock(cell.a, cell.b, feetLayer) === Block.Water;
  const head = sampler.getBlock(cell.a, cell.b, headLayer) === Block.Water;
  return { feet, head };
}

// ¿Está cargado el chunk bajo el jugador? Congelamos la física si no.
export function chunkUnderPlayerReady(
  state: PlayerState,
  grid: Grid,
  sampler: BlockSampler,
): boolean {
  const cell = grid.cellAt({ x: state.position.x, z: state.position.z });
  return sampler.hasChunkAt(cell.a, cell.b);
}

// ------------- reubicación -------------

// Coloca al jugador sobre la primera columna libre por encima de la superficie
// más alta en (x, z). Devuelve true si consiguió una posición válida.
export function placeOnSurface(
  state: PlayerState,
  grid: Grid,
  sampler: BlockSampler,
  cfg: PlayerConfig,
  maxY = 63,
): boolean {
  const candidates = candidateCells(grid, state.position.x, state.position.z);
  for (let y = maxY; y >= 0; y--) {
    // ¿Es la parte alta de un bloque sólido tocando la huella del círculo?
    let hasSolid = false;
    for (const cell of candidates) {
      if (
        isSolidBlock(sampler.getBlock(cell.a, cell.b, y)) &&
        circleTouchesCell(grid, cell, state.position.x, state.position.z, cfg.radius)
      ) {
        hasSolid = true;
        break;
      }
    }
    if (!hasSolid) continue;
    // Comprobar 2 celdas libres por encima para el cilindro (altura 1.8 → 2).
    if (fitsCylinderAt(state.position.x, state.position.z, y + 1, grid, sampler, cfg)) {
      state.position.y = y + 1;
      state.velocity.x = 0;
      state.velocity.y = 0;
      state.velocity.z = 0;
      state.onGround = true;
      return true;
    }
  }
  return false;
}

// Comprueba que las 2 capas verticales que ocupa el cilindro empezando en yFeet
// están libres (sin bloques sólidos en ninguna celda candidata).
function fitsCylinderAt(
  px: number,
  pz: number,
  yFeet: number,
  grid: Grid,
  sampler: BlockSampler,
  cfg: PlayerConfig,
): boolean {
  const candidates = candidateCells(grid, px, pz);
  const yTop = Math.floor(yFeet + cfg.height - 1e-6);
  for (let y = yFeet; y <= yTop; y++) {
    for (const cell of candidates) {
      if (
        isSolidBlock(sampler.getBlock(cell.a, cell.b, y)) &&
        circleTouchesCell(grid, cell, px, pz, cfg.radius)
      ) {
        return false;
      }
    }
  }
  return true;
}

// Sube al jugador a la primera Y donde el cilindro no colisione, conservando
// x, z. Uso: al salir de vuelo dentro de un bloque o al cambiar de rejilla.
export function snapOutOfSolid(
  state: PlayerState,
  grid: Grid,
  sampler: BlockSampler,
  cfg: PlayerConfig,
  maxY = 63,
): void {
  const yStart = Math.floor(state.position.y);
  for (let y = yStart; y <= maxY; y++) {
    if (fitsCylinderAt(state.position.x, state.position.z, y, grid, sampler, cfg)) {
      state.position.y = y;
      state.velocity.x = 0;
      state.velocity.y = 0;
      state.velocity.z = 0;
      return;
    }
  }
}

// ------------- vertical -------------

function collideVertical(
  state: PlayerState,
  grid: Grid,
  sampler: BlockSampler,
  cfg: PlayerConfig,
  dt: number,
): void {
  const startY = state.position.y;
  let endY = startY + state.velocity.y * dt;
  const candidates = candidateCells(grid, state.position.x, state.position.z);

  if (state.velocity.y < 0) {
    // Cae: comprobar cada capa Y que cruza el pie, de arriba abajo.
    const startLayer = Math.floor(startY - 1e-9);
    const endLayer = Math.floor(endY);
    for (let y = startLayer; y >= endLayer; y--) {
      if (y + 1 > startY + 1e-9) continue; // el techo de la capa está por encima del pie inicial
      let hit = false;
      for (const cell of candidates) {
        if (
          isSolidBlock(sampler.getBlock(cell.a, cell.b, y)) &&
          circleTouchesCell(grid, cell, state.position.x, state.position.z, cfg.radius)
        ) {
          hit = true;
          break;
        }
      }
      if (hit) {
        endY = y + 1;
        state.velocity.y = 0;
        state.onGround = true;
        state.position.y = endY;
        return;
      }
    }
  } else if (state.velocity.y > 0) {
    // Sube: comprobar cada capa Y que cruza la cabeza, de abajo arriba.
    const startHeadLayer = Math.floor(startY + cfg.height - 1e-9);
    const endHeadLayer = Math.floor(endY + cfg.height - 1e-9);
    for (let y = startHeadLayer + 1; y <= endHeadLayer; y++) {
      let hit = false;
      for (const cell of candidates) {
        if (
          isSolidBlock(sampler.getBlock(cell.a, cell.b, y)) &&
          circleTouchesCell(grid, cell, state.position.x, state.position.z, cfg.radius)
        ) {
          hit = true;
          break;
        }
      }
      if (hit) {
        endY = y - cfg.height;
        state.velocity.y = 0;
        state.position.y = endY;
        state.onGround = false;
        return;
      }
    }
  }
  state.position.y = endY;

  // Detección de suelo: sondear si el pie está pegado a un bloque justo debajo.
  state.onGround = detectOnGround(state, grid, sampler, cfg);
}

function detectOnGround(
  state: PlayerState,
  grid: Grid,
  sampler: BlockSampler,
  cfg: PlayerConfig,
): boolean {
  if (state.velocity.y > 1e-3) return false;
  const feetY = state.position.y;
  const belowLayer = Math.floor(feetY - 1e-4);
  if (Math.abs(feetY - (belowLayer + 1)) > 2e-3) return false;
  const candidates = candidateCells(grid, state.position.x, state.position.z);
  for (const cell of candidates) {
    if (
      isSolidBlock(sampler.getBlock(cell.a, cell.b, belowLayer)) &&
      circleTouchesCell(grid, cell, state.position.x, state.position.z, cfg.radius)
    ) {
      return true;
    }
  }
  return false;
}

// ------------- horizontal -------------

function collideHorizontal(
  state: PlayerState,
  grid: Grid,
  sampler: BlockSampler,
  cfg: PlayerConfig,
  dt: number,
): void {
  let px = state.position.x + state.velocity.x * dt;
  let pz = state.position.z + state.velocity.z * dt;

  const yBot = Math.floor(state.position.y + 1e-6);
  const yTop = Math.floor(state.position.y + cfg.height - 1e-6);

  for (let iter = 0; iter < cfg.collisionIterations; iter++) {
    const candidates = candidateCells(grid, px, pz);
    let anyResolved = false;
    for (const cell of candidates) {
      let solidAtAnyLayer = false;
      for (let y = yBot; y <= yTop; y++) {
        if (isSolidBlock(sampler.getBlock(cell.a, cell.b, y))) {
          solidAtAnyLayer = true;
          break;
        }
      }
      if (!solidAtAnyLayer) continue;
      const poly = grid.footprint(cell);
      const push = pushCircleOutOfPolygon(poly, px, pz, cfg.radius);
      if (!push) continue;
      px += push.nx * push.penetration;
      pz += push.nz * push.penetration;
      // Anular componente de velocidad hacia el muro (deslizamiento).
      const vDot = state.velocity.x * push.nx + state.velocity.z * push.nz;
      if (vDot < 0) {
        state.velocity.x -= vDot * push.nx;
        state.velocity.z -= vDot * push.nz;
      }
      anyResolved = true;
    }
    if (!anyResolved) break;
  }

  state.position.x = px;
  state.position.z = pz;
}

// ------------- paso principal -------------

export function physicsStep(
  state: PlayerState,
  input: InputIntent,
  grid: Grid,
  sampler: BlockSampler,
  cfg: PlayerConfig,
  dt: number,
): void {
  // 0) Congelar si el chunk bajo el jugador no está aún generado.
  if (!chunkUnderPlayerReady(state, grid, sampler)) return;

  // 1) Toggle vuelo (one-shot).
  if (input.toggleFly) {
    input.toggleFly = false;
    if (state.mode === 'fly') {
      state.mode = 'walk';
      snapOutOfSolid(state, grid, sampler, cfg);
    } else {
      state.mode = 'fly';
      state.velocity.x = 0;
      state.velocity.y = 0;
      state.velocity.z = 0;
    }
  }

  // 2) Contacto con agua: pies y cabeza por separado para tratar bien la
  //    superficie. `state.inWater` (para el HUD y velocidades) es true si
  //    cualquier parte del cilindro toca agua. La gravedad reducida solo
  //    se aplica si el cuerpo está bien sumergido (cabeza también en agua).
  const water = playerWaterContact(state, grid, sampler, cfg);
  state.inWater = water.feet || water.head;
  const fullySubmerged = water.feet && water.head;

  // 3) Direcciones horizontales en función del yaw.
  const yaw = state.yaw;
  const fx = -Math.sin(yaw);
  const fz = -Math.cos(yaw);
  const rx = Math.cos(yaw);
  const rz = -Math.sin(yaw);
  let wishX = fx * input.forward + rx * input.strafe;
  let wishZ = fz * input.forward + rz * input.strafe;
  const wishLen = Math.hypot(wishX, wishZ);
  if (wishLen > 1) {
    wishX /= wishLen;
    wishZ /= wishLen;
  }

  if (state.mode === 'fly') {
    const speed = cfg.flySpeed * (input.sprint ? cfg.flySprintMul : 1);
    state.velocity.x = wishX * speed;
    state.velocity.z = wishZ * speed;
    state.velocity.y = input.vertical * cfg.flyVerticalSpeed;
    state.position.x += state.velocity.x * dt;
    state.position.y += state.velocity.y * dt;
    state.position.z += state.velocity.z * dt;
    state.onGround = false;
    return;
  }

  // 4) Modo andar.
  const horizontalSpeed = input.sprint ? cfg.sprintSpeed : cfg.walkSpeed;
  const waterHorMul = state.inWater ? cfg.waterHorizontalMul : 1;
  state.velocity.x = wishX * horizontalSpeed * waterHorMul;
  state.velocity.z = wishZ * horizontalSpeed * waterHorMul;

  const gravity = cfg.gravity * (fullySubmerged ? cfg.waterGravityMul : 1);
  state.velocity.y -= gravity * dt;

  // Salto / nado. Prioridades:
  //  1. onGround (dentro o fuera del agua) → salto completo.
  //  2. Pies en agua y cabeza fuera → salto de superficie (para salir a la orilla).
  //  3. Totalmente sumergido → nado suave (waterSwimUpSpeed).
  if (input.vertical > 0) {
    if (state.onGround) {
      state.velocity.y = cfg.jumpSpeed;
    } else if (water.feet && !water.head) {
      state.velocity.y = Math.max(state.velocity.y, cfg.jumpSpeed);
    } else if (fullySubmerged) {
      state.velocity.y = Math.max(state.velocity.y, cfg.waterSwimUpSpeed);
    }
  }

  // 5) Colisiones: primero vertical (suelo/techo), luego horizontal.
  collideVertical(state, grid, sampler, cfg, dt);
  collideHorizontal(state, grid, sampler, cfg, dt);

  // 6) Reaparición si cae por debajo del mundo.
  if (state.position.y < cfg.fallResetY) {
    state.velocity.x = 0;
    state.velocity.y = 0;
    state.velocity.z = 0;
    state.position.y = 40; // por encima; placeOnSurface fijará el suelo si hay
    placeOnSurface(state, grid, sampler, cfg);
  }
}
