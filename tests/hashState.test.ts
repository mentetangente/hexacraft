import { describe, expect, it } from 'vitest';
import { AppState, hashToState, stateToHash } from '../src/state/hashState';

const sample: AppState = {
  grid: 'hex',
  seed: 1234,
  pos: { x: 1.23, y: 45.67, z: -8.9 },
  yaw: 0.12,
  pitch: -0.05,
  mode: 'walk',
  dist: 96,
  textured: true,
  game: 'creative',
};

describe('hashState', () => {
  it('el hash usa punto decimal y 2 decimales', () => {
    const h = stateToHash(sample);
    expect(h.startsWith('#')).toBe(true);
    expect(h).toContain('pos=1.23,45.67,-8.90');
    expect(h).toContain('rot=0.12,-0.05');
    expect(h).toContain('grid=hex');
    expect(h).toContain('seed=1234');
    expect(h).toContain('mode=walk');
    expect(h).toContain('dist=96');
    expect(h).toContain('tex=1');
  });

  it('ida y vuelta: state → hash → state con precisión de 2 decimales', () => {
    const h = stateToHash(sample);
    const back = hashToState(h);
    expect(back).not.toBeNull();
    expect(back!.grid).toBe(sample.grid);
    expect(back!.seed).toBe(sample.seed);
    expect(back!.mode).toBe(sample.mode);
    expect(back!.dist).toBe(sample.dist);
    expect(back!.textured).toBe(sample.textured);
    expect(back!.pos!.x).toBeCloseTo(sample.pos.x, 2);
    expect(back!.pos!.y).toBeCloseTo(sample.pos.y, 2);
    expect(back!.pos!.z).toBeCloseTo(sample.pos.z, 2);
    expect(back!.yaw!).toBeCloseTo(sample.yaw, 2);
    expect(back!.pitch!).toBeCloseTo(sample.pitch, 2);
  });

  it('hash vacío o inválido devuelve null o parcial', () => {
    expect(hashToState('')).toBeNull();
    expect(hashToState('#')).toBeNull();
    // Un hash con basura no lanza; solo se ignoran los campos no válidos.
    const partial = hashToState('#grid=zzz&seed=foo');
    expect(partial).not.toBeNull();
    expect(partial!.grid).toBeUndefined();
    expect(partial!.seed).toBeUndefined();
  });

  it('valores extremos y negativos se conservan', () => {
    const s: AppState = {
      grid: 'square',
      seed: -1,
      pos: { x: -1000.5, y: 0.01, z: 999.99 },
      yaw: -3.14,
      pitch: 1.57,
      mode: 'fly',
      dist: 256,
      textured: false,
      game: 'survival',
    };
    const back = hashToState(stateToHash(s));
    expect(back!.grid).toBe('square');
    expect(back!.seed).toBe(-1);
    expect(back!.mode).toBe('fly');
    expect(back!.dist).toBe(256);
    expect(back!.textured).toBe(false);
    expect(back!.pos!.x).toBeCloseTo(-1000.5, 2);
    expect(back!.yaw!).toBeCloseTo(-3.14, 2);
  });
});
