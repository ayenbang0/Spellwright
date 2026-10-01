import { describe, expect, it } from 'vitest';
import { FixedStep } from '../src/core/fixedstep';

/** A clock whose time only moves when a step "costs" something, so the wall-clock budget is deterministic. */
function rig(initialCostMs: number) {
  let now = 0;
  let cost = initialCostMs;
  const clock = new FixedStep(1 / 60, 4, 9, () => now);
  let steps = 0;
  return {
    setCost: (ms: number) => (cost = ms),
    steps: () => steps,
    frame(dt: number) {
      const before = steps;
      const alpha = clock.advance(dt, () => {
        steps++;
        now += cost;
      });
      return { alpha, ran: steps - before };
    },
  };
}

describe('fixed-step clock', () => {
  it.each([60, 75, 144, 165])('runs 60 steps per second of real time at %i Hz', (hz) => {
    const r = rig(0);
    for (let i = 0; i < hz * 5; i++) r.frame(1 / hz);
    expect(Math.abs(r.steps() - 300)).toBeLessThanOrEqual(1);
  });

  it('reports where the frame sits inside the next step, always in [0, 1)', () => {
    const r = rig(0);
    for (let i = 0; i < 500; i++) {
      const { alpha } = r.frame(1 / 144);
      expect(alpha).toBeGreaterThanOrEqual(0);
      expect(alpha).toBeLessThan(1);
    }
  });

  it('after a long stall it catches up at most 4 steps, then is back to real time', () => {
    const r = rig(0);
    expect(r.frame(5).ran).toBe(4); // a 5 s frame is clamped to 0.1 s = 6 steps owed, 4 allowed
    const before = r.steps();
    for (let i = 0; i < 60; i++) r.frame(1 / 60);
    expect(r.steps() - before).toBeLessThanOrEqual(61); // the dropped time is not repaid with extra steps later
  });

  it('when a step costs more than a frame it stops at the wall-clock budget, and recovers without a burst of steps', () => {
    const r = rig(20); // every step costs 20 ms, over the 9 ms budget
    for (let i = 0; i < 10; i++) expect(r.frame(0.1).ran).toBe(1);
    r.setCost(0); // the bullet storm is over
    const before = r.steps();
    for (let i = 0; i < 60; i++) r.frame(1 / 60);
    expect(r.steps() - before).toBeLessThanOrEqual(61); // kept debt would have run 4 steps a frame for ~20 frames
  });
});
