/**
 * Small spring helper using Apple's two-parameter model:
 *  - `damping` is a ratio: 1 = critically damped (no overshoot), <1 bounces.
 *  - `response` is how quickly it reaches the target, in seconds.
 * Springs always start from the *current* value and can inherit velocity, so
 * they are interruptible: cancel one and start another from where you are.
 */
export interface SpringConfig {
  response: number;
  damping: number;
  /** Initial velocity in value-units per second. */
  velocity?: number;
  restDelta?: number;
  restSpeed?: number;
}

export interface SpringHandle {
  cancel(): void;
}

/** Pure integrator step, exported for tests. */
export function stepSpring(x: number, v: number, to: number, cfg: SpringConfig, dt: number): [number, number] {
  const omega = (2 * Math.PI) / cfg.response;
  const k = omega * omega;
  const c = 2 * cfg.damping * omega;
  const n = Math.max(1, Math.ceil(dt / 0.004));
  const h = dt / n;
  for (let i = 0; i < n; i++) {
    v += (-k * (x - to) - c * v) * h;
    x += v * h;
  }
  return [x, v];
}

export function springTo(
  from: number,
  to: number,
  cfg: SpringConfig,
  onUpdate: (value: number) => void,
  onDone?: () => void,
): SpringHandle {
  const restDelta = cfg.restDelta ?? 0.001;
  const restSpeed = cfg.restSpeed ?? 0.01;
  let x = from;
  let v = cfg.velocity ?? 0;
  let last = performance.now();
  let raf = 0;
  let cancelled = false;

  const frame = (now: number) => {
    if (cancelled) return;
    const dt = Math.min((now - last) / 1000, 1 / 30);
    last = now;
    [x, v] = stepSpring(x, v, to, cfg, dt);
    if (Math.abs(x - to) < restDelta && Math.abs(v) < restSpeed) {
      onUpdate(to);
      onDone?.();
      return;
    }
    onUpdate(x);
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  return {
    cancel() {
      cancelled = true;
      cancelAnimationFrame(raf);
    },
  };
}

/** Where a flick will come to rest (Apple's exponential-decay projection). */
export function project(velocity: number, decelerationRate = 0.998): number {
  return ((velocity / 1000) * decelerationRate) / (1 - decelerationRate);
}

/** Progressive resistance past a boundary instead of a hard stop. */
export function rubberband(overshoot: number, dimension: number, constant = 0.55): number {
  return (overshoot * dimension * constant) / (dimension + constant * Math.abs(overshoot));
}
