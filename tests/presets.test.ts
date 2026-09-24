import { describe, expect, it } from 'vitest';
import { HexGrid, SquareGrid } from '../src/grid';
import type { Cell, Grid } from '../src/grid';
import { Block } from '../src/world/blocks';
import { planCasa, planTunel } from '../src/presets/presets';

// Helper: convierte una lista de cambios en un mapa key → block.
function planToMap(changes: Array<{ cell: Cell; y: number; block: Block }>): Map<string, Block> {
  const m = new Map<string, Block>();
  for (const c of changes) m.set(`${c.cell.a},${c.cell.b},${c.y}`, c.block);
  return m;
}

describe.each([
  ['HexGrid', new HexGrid()],
  ['SquareGrid', new SquareGrid()],
] as ReadonlyArray<readonly [string, Grid]>)('%s — preset casa: paredes cerradas', (_name, grid) => {
  it('cada celda interior no-muro tiene TODOS sus vecinos en el interior', () => {
    const plan = planCasa({ x: 0.5, y: 20, z: 0.5 }, { ancho: 7, fondo: 5, altura: 4 });
    const changes = grid.kind === 'hex' ? plan.hex : plan.square;
    const m = planToMap(changes);
    // Extraemos el conjunto interior a la altura baseY: son todas las celdas
    // que tienen algún bloque de la casa en el plan (piedra o tejado).
    const interior = new Set<string>();
    for (const c of changes) {
      if (c.y === 20) interior.add(`${c.cell.a},${c.cell.b}`);
    }
    // Recorremos las celdas que son piedra en y=20 (los muros).
    const wall = new Set<string>();
    for (const c of changes) {
      if (c.y === 20 && c.block === Block.Stone) wall.add(`${c.cell.a},${c.cell.b}`);
    }
    // Añadimos también las celdas de tejado (Planks en y=24) al interior si no
    // están en el mapa base — el interior es lo mismo que las Planks en y=24.
    const roofCells = new Set<string>();
    for (const c of changes) {
      if (c.y === 24 && c.block === Block.Planks) roofCells.add(`${c.cell.a},${c.cell.b}`);
    }
    // Interior = celdas con tejado. Debe ser un superset del muro.
    for (const w of wall) {
      expect(roofCells.has(w)).toBe(true);
    }
    // Para cada celda interior que NO es muro (ni puerta/ventana), sus vecinos
    // deben estar dentro del interior (así el muro cierra todo el perímetro).
    for (const key of roofCells) {
      const [a, b] = key.split(',').map((s) => parseInt(s, 10));
      const cell: Cell = { a, b };
      if (wall.has(key)) continue; // el propio muro sí puede tener vecinos fuera
      for (const n of grid.neighbors(cell)) {
        const nk = `${n.a},${n.b}`;
        expect(roofCells.has(nk)).toBe(true);
      }
    }
    void m;
  });
});

describe('preset túnel a 60°', () => {
  it('en hexágonos es una sola fila recta', () => {
    const plan = planTunel({ x: 0, y: 20, z: 0 }, { angulo: 60, longitud: 10 });
    // Extraemos las celdas del suelo del túnel (y = 20).
    const cells: Cell[] = [];
    for (const c of plan.hex) if (c.y === 20) cells.push(c.cell);
    // Deben ser todas colineales en axial: q constante = 0.
    expect(cells.length).toBeGreaterThan(3);
    const qs = new Set(cells.map((c) => c.a));
    expect(qs.size).toBe(1);
    expect([...qs][0]).toBe(0);
  });

  it('en cuadrados es 4-conexo (cada par consecutivo difiere en 1 en un eje)', () => {
    const plan = planTunel({ x: 0, y: 20, z: 0 }, { angulo: 60, longitud: 10 });
    const cells: Cell[] = [];
    for (const c of plan.square) if (c.y === 20) cells.push(c.cell);
    expect(cells.length).toBeGreaterThan(3);
    for (let i = 1; i < cells.length; i++) {
      const da = Math.abs(cells[i].a - cells[i - 1].a);
      const db = Math.abs(cells[i].b - cells[i - 1].b);
      expect(da + db).toBe(1);
    }
  });
});
