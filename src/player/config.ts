// Constantes del jugador y de la simulación. Todo lo ajustable vive aquí.

export interface PlayerConfig {
  // Cuerpo (cilindro vertical).
  readonly radius: number;
  readonly height: number;
  readonly eyeHeight: number;

  // Movimiento a pie.
  readonly walkSpeed: number;
  readonly sprintSpeed: number;
  readonly jumpSpeed: number;
  readonly gravity: number;

  // Vuelo (sin gravedad ni colisiones).
  readonly flySpeed: number;
  readonly flySprintMul: number;
  readonly flyVerticalSpeed: number;

  // Agua.
  readonly waterGravityMul: number;
  readonly waterHorizontalMul: number;
  readonly waterSwimUpSpeed: number;

  // Paso fijo.
  readonly fixedDt: number;
  readonly maxFrameDt: number;

  // Colisión horizontal iterativa: nº de pases para deslizar por esquinas hex.
  readonly collisionIterations: number;

  // Reaparición al caer.
  readonly fallResetY: number;
}

export const DEFAULT_PLAYER_CONFIG: PlayerConfig = {
  radius: 0.3,
  height: 1.8,
  eyeHeight: 1.6,

  walkSpeed: 4.5,
  sprintSpeed: 6.5,
  jumpSpeed: 8.5, // supera 1 bloque con margen: h = v²/(2g) = 72.25/56 ≈ 1.29
  gravity: 28,

  flySpeed: 10,
  flySprintMul: 1.8,
  flyVerticalSpeed: 8,

  waterGravityMul: 0.35,
  waterHorizontalMul: 0.55,
  waterSwimUpSpeed: 3.5,

  fixedDt: 1 / 60,
  maxFrameDt: 0.1,

  collisionIterations: 4,

  fallResetY: -8,
};
