// PRNG determinista basado en hash de coordenadas + semilla. No usa Math.random.
// Se emplea para decidir la posición de los árboles a partir de (semilla, x, z).

// Mezcla de 32 bits estilo splitmix.
function mix32(a: number): number {
  a |= 0;
  a = (a + 0x9e3779b9) | 0;
  a = Math.imul(a ^ (a >>> 16), 0x85ebca6b);
  a = Math.imul(a ^ (a >>> 13), 0xc2b2ae35);
  a ^= a >>> 16;
  return a >>> 0;
}

// Hash determinista de (seed, x, z) → [0, 1). x y z pueden ser negativos.
export function hash01(seed: number, x: number, z: number): number {
  let h = (seed | 0) >>> 0;
  h = mix32(h ^ (x | 0));
  h = mix32(h ^ (z | 0));
  return h / 0x100000000;
}
