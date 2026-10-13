import { describe, expect, it } from 'vitest';
import { project, rubberband, stepSpring } from './motion';

function settle(cfg: { response: number; damping: number }, from = 0, to = 1, v = 0) {
  let x = from;
  let vel = v;
  let peak = from;
  for (let i = 0; i < 600; i++) {
    [x, vel] = stepSpring(x, vel, to, cfg, 1 / 60);
    peak = Math.max(peak, x);
  }
  return { x, vel, peak };
}

describe('spring', () => {
  it('critically damped spring settles without overshoot', () => {
    const r = settle({ response: 0.4, damping: 1 });
    expect(r.x).toBeCloseTo(1, 3);
    expect(r.peak).toBeLessThanOrEqual(1.0005);
  });
  it('under-damped spring overshoots, then settles', () => {
    const r = settle({ response: 0.4, damping: 0.8 });
    expect(r.peak).toBeGreaterThan(1.001);
    expect(r.x).toBeCloseTo(1, 3);
  });
  it('inherits initial velocity', () => {
    const [x] = stepSpring(0, 0, 1, { response: 0.4, damping: 1 }, 1 / 60);
    const [xv] = stepSpring(0, 5, 1, { response: 0.4, damping: 1 }, 1 / 60);
    expect(xv).toBeGreaterThan(x);
  });
});

describe('gesture maths', () => {
  it('projects momentum with exponential decay', () => {
    expect(project(1000)).toBeCloseTo(499, 0);
    expect(project(0)).toBe(0);
  });
  it('rubberband resists progressively and stays below the raw overshoot', () => {
    expect(rubberband(10, 600)).toBeLessThan(10);
    expect(rubberband(400, 600) / 400).toBeLessThan(rubberband(40, 600) / 40);
  });
});
