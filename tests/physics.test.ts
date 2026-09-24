import { describe, expect, it } from 'vitest';
import { HexGrid, SquareGrid } from '../src/grid';
import type { Grid } from '../src/grid';
import { Block } from '../src/world/blocks';
import type { BlockSampler, InputIntent, PlayerState } from '../src/player/physics';
import {
  createInput,
  createPlayer,
  physicsStep,
  placeOnSurface,
  snapOutOfSolid,
} from '../src/player/physics';
import { DEFAULT_PLAYER_CONFIG } from '../src/player/config';

// -------- Sampler falso --------

class MockSampler implements BlockSampler {
  private readonly blocks = new Map<string, Block>();

  hasChunkAt(): boolean {
    return true;
  }

  getBlock(a: number, b: number, y: number): Block {
    return this.blocks.get(`${a},${b},${y}`) ?? Block.Air;
  }

  set(a: number, b: number, y: number, block: Block): void {
    this.blocks.set(`${a},${b},${y}`, block);
  }

  // Rellena una capa (y) sólida en un rango cuadrado de celdas.
  fillLayer(y: number, range: number, block: Block = Block.Stone): void {
    for (let a = -range; a <= range; a++) {
      for (let b = -range; b <= range; b++) {
        this.set(a, b, y, block);
      }
    }
  }
}

// -------- helpers --------

const CFG = DEFAULT_PLAYER_CONFIG;

function runFixedSteps(
  state: PlayerState,
  input: InputIntent,
  grid: Grid,
  sampler: BlockSampler,
  steps: number,
): void {
  for (let i = 0; i < steps; i++) {
    physicsStep(state, input, grid, sampler, CFG, CFG.fixedDt);
  }
}

// Simula frames largos (con dt máximo) para probar tunelizado bajo carga.
function runWorstCaseFrames(
  state: PlayerState,
  input: InputIntent,
  grid: Grid,
  sampler: BlockSampler,
  frames: number,
): void {
  const stepsPerFrame = Math.ceil(CFG.maxFrameDt / CFG.fixedDt);
  for (let i = 0; i < frames; i++) {
    for (let j = 0; j < stepsPerFrame; j++) {
      physicsStep(state, input, grid, sampler, CFG, CFG.fixedDt);
    }
  }
}

const grids: ReadonlyArray<readonly [string, () => Grid]> = [
  ['HexGrid', () => new HexGrid()],
  ['SquareGrid', () => new SquareGrid()],
];

// -------- 1) aterrizaje --------

describe.each(grids)('%s — aterrizaje y descanso sobre el suelo', (_, makeGrid) => {
  it('cae, aterriza en y=20 y se queda quieto con onGround=true', () => {
    const grid = makeGrid();
    const sampler = new MockSampler();
    sampler.fillLayer(19, 3); // suelo continuo
    const state = createPlayer();
    state.position = { x: 0.1, y: 25, z: 0.05 };
    state.velocity = { x: 0, y: 0, z: 0 };
    const input = createInput();

    runFixedSteps(state, input, grid, sampler, 240); // ~4 s

    expect(state.position.y).toBeCloseTo(20, 3);
    expect(state.onGround).toBe(true);
    expect(Math.abs(state.velocity.x)).toBeLessThan(1e-6);
    expect(Math.abs(state.velocity.y)).toBeLessThan(1e-6);
    expect(Math.abs(state.velocity.z)).toBeLessThan(1e-6);
  });
});

// -------- 2) sprint contra pared sin tunelizado --------

describe.each(grids)('%s — sprint contra un muro sin atravesar', (_, makeGrid) => {
  it('no cruza la pared ni con dt máximo (0,1 s de físicas por frame)', () => {
    const grid = makeGrid();
    const sampler = new MockSampler();
    sampler.fillLayer(19, 8); // suelo
    // Muro alto en el eje X: capa completa de bloques a partir de a=2.
    for (let b = -4; b <= 4; b++) {
      for (let y = 20; y <= 25; y++) {
        for (let a = 2; a <= 4; a++) sampler.set(a, b, y, Block.Stone);
      }
    }

    const state = createPlayer();
    state.position = { x: 0, y: 20, z: 0 };
    // Yaw = -π/2 hace que forward = +X (fx = -sin(-π/2) = 1).
    state.yaw = -Math.PI / 2;
    const input = createInput();
    input.forward = 1;
    input.sprint = true;

    runWorstCaseFrames(state, input, grid, sampler, 60);

    // La pared empieza en a=2 (cuadrada: x=1.5; hex: x ≈ 1.6). El centro del
    // jugador nunca puede pasar de esa frontera menos el radio + margen.
    const maxAllowed = grid.kind === 'hex' ? 1.61 - CFG.radius + 0.05 : 1.5 - CFG.radius + 0.05;
    expect(state.position.x).toBeLessThan(maxAllowed);
  });
});

// -------- 3) golpe de cabeza con el techo --------

describe.each(grids)('%s — se golpea la cabeza con un techo', (_, makeGrid) => {
  it('sube al saltar, choca en y+height y la velocidad vertical se anula', () => {
    const grid = makeGrid();
    const sampler = new MockSampler();
    sampler.fillLayer(19, 3);
    sampler.fillLayer(22, 3); // techo justo por encima de la altura del salto

    const state = createPlayer();
    state.position = { x: 0, y: 20, z: 0 };
    state.onGround = true;
    const input = createInput();
    input.vertical = 1; // mantén el salto pulsado

    runFixedSteps(state, input, grid, sampler, 60);

    // Techo a y=22 sólido, cabeza no puede pasar de 22 → pies ≤ 22 - height.
    expect(state.position.y).toBeLessThanOrEqual(22 - CFG.height + 1e-3);
    // No sigue subiendo indefinidamente.
    expect(state.velocity.y).toBeLessThanOrEqual(0 + 1e-6);
  });
});

// -------- 4) deslizamiento --------

describe('SquareGrid — desliza a lo largo de una pared recta', () => {
  it('avanza en X mientras la pared en +Z le impide moverse en Z', () => {
    const grid = new SquareGrid();
    const sampler = new MockSampler();
    sampler.fillLayer(19, 20);
    for (let a = -10; a <= 10; a++) {
      for (let y = 20; y <= 24; y++) sampler.set(a, 1, y, Block.Stone);
    }

    const state = createPlayer();
    state.position = { x: 0, y: 20, z: 0 };
    // Yaw = π hace forward = +Z, right = -X.
    // Con forward=1, strafe=-1: wish = (+1, 0, +1) normalizado.
    state.yaw = Math.PI;
    const input = createInput();
    input.forward = 1;
    input.strafe = -1;

    const startX = state.position.x;
    runFixedSteps(state, input, grid, sampler, 120);

    // Se ha movido en X.
    expect(state.position.x - startX).toBeGreaterThan(2);
    // Z bloqueado por debajo de la pared (celda b=1 → z ∈ [0.5, 1.5]).
    expect(state.position.z).toBeLessThan(1.5 - CFG.radius + 0.05);
  });
});

describe('HexGrid — desliza a lo largo de una pared en zigzag', () => {
  it('avanza sin quedarse atascado en las esquinas hex', () => {
    const grid = new HexGrid();
    const sampler = new MockSampler();
    sampler.fillLayer(19, 20);
    // Muro zigzag: dos filas hex adyacentes desplazadas — típico del vídeo.
    for (let a = -6; a <= 6; a++) {
      for (let y = 20; y <= 24; y++) {
        sampler.set(a, 2, y, Block.Stone);
        sampler.set(a, 3, y, Block.Stone);
      }
    }

    const state = createPlayer();
    state.position = { x: 0, y: 20, z: 0 };
    // Yaw = π: forward = +Z, right = -X. forward=1 + strafe=-1 → diagonal +X, +Z.
    state.yaw = Math.PI;
    const input = createInput();
    input.forward = 1;
    input.strafe = -1;

    const startX = state.position.x;
    runFixedSteps(state, input, grid, sampler, 240);

    // Progreso significativo en X: no se ha quedado atascado en una esquina.
    expect(state.position.x - startX).toBeGreaterThan(3);
    // Sigue por debajo de la pared en Z.
    expect(state.position.z).toBeLessThan(2);
  });
});

// -------- 5) cambio de rejilla / snap out --------

describe('snapOutOfSolid — el jugador nunca queda dentro de un bloque', () => {
  it('al colocarse dentro de una columna sólida, sube a la primera Y libre', () => {
    const grid = new HexGrid();
    const sampler = new MockSampler();
    // Columna sólida en la celda (0, 0), y ∈ [10..20].
    for (let y = 10; y <= 20; y++) sampler.set(0, 0, y, Block.Stone);

    const state = createPlayer();
    state.position = { x: 0, y: 15, z: 0 }; // dentro del bloque

    snapOutOfSolid(state, grid, sampler, CFG);

    // Debe estar por encima del último bloque (y ≥ 21) y con velocidad cero.
    expect(state.position.y).toBeGreaterThanOrEqual(21);
    expect(state.velocity.x).toBe(0);
    expect(state.velocity.y).toBe(0);
    expect(state.velocity.z).toBe(0);
  });

  it('al cambiar de rejilla en el mismo (x, z), no queda dentro de bloque', () => {
    // Punto de mundo (0.5, 0.5): en cuadrados cae en la celda (1, 1); en hex,
    // en axial redondeado. Colocamos bloques de forma que en una rejilla el
    // punto esté en aire y en la otra en piedra, y comprobamos snap-out.
    const hex = new HexGrid();
    const sq = new SquareGrid();
    const sampler = new MockSampler();
    // Solo hay piedra en la celda cuadrada (1, 1) a y=15..17.
    for (let y = 15; y <= 17; y++) sampler.set(1, 1, y, Block.Stone);

    const state = createPlayer();
    state.position = { x: 0.5, y: 16, z: 0.5 };

    // Estando en hex (donde la celda no coincide con cuadrada), no hay
    // colisión: snapOutOfSolid no altera nada.
    snapOutOfSolid(state, hex, sampler, CFG);
    expect(state.position.y).toBe(16);

    // Al cambiar a cuadrada, el jugador queda en piedra: hay que subir.
    snapOutOfSolid(state, sq, sampler, CFG);
    expect(state.position.y).toBeGreaterThanOrEqual(18);
  });
});

// -------- 6) sanity: placeOnSurface --------

describe.each(grids)('%s — placeOnSurface coloca los pies encima', (_, makeGrid) => {
  it('encuentra la primera columna libre por encima del suelo', () => {
    const grid = makeGrid();
    const sampler = new MockSampler();
    sampler.fillLayer(19, 3);
    const state = createPlayer();
    state.position = { x: 0.2, y: 30, z: -0.1 };
    const ok = placeOnSurface(state, grid, sampler, CFG);
    expect(ok).toBe(true);
    expect(state.position.y).toBe(20);
    expect(state.onGround).toBe(true);
  });
});
