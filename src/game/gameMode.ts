// Modo de juego del jugador. Independiente del modo de movimiento
// (andar/vuelo). Se guarda en la URL y en el JSON exportado.

export type GameMode = 'creative' | 'survival';

export function isValidGameMode(v: unknown): v is GameMode {
  return v === 'creative' || v === 'survival';
}
