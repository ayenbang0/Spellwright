import { describe, expect, it } from 'vitest';
import { BUILDS, simulate } from '../scripts/sim-builds';

const run = (name: string, seconds = 16) => {
  const b = BUILDS.find((x) => x.name.startsWith(name));
  if (!b) throw new Error(`no build ${name}`);
  return simulate({ ...b, seconds });
};

// The wiki's "Standardization wand" is undocumented; these bands only pin builds that land near the published range
// with the fitted stand-in wand (STANDARD_WAND). The others are tracked in PLAN.md section 14.
describe('headless build simulation (wiki "Builds" page)', () => {
  it('the starter kit deals modest damage', () => {
    const r = run('Magic Bullet');
    expect(r.dps).toBeGreaterThan(20);
    expect(r.dps).toBeLessThan(200);
  });

  it('Arcane Nova + Mana Absorption reaches the wiki range on 3 dummies (400-1300+)', () => {
    expect(run('Arcane Nova').sustained).toBeGreaterThan(400);
  });

  it('Shadow Serpent + Echo + Mana Absorption is inside the wiki band (400-520, +-25%)', () => {
    const r = run('Shadow Serpent + Echo');
    const mid = (r.sustained + r.peak) / 2;
    expect(mid).toBeGreaterThan(300);
    expect(mid).toBeLessThan(650);
  });

  it('a Grimoire casting Mana Absorption reaches the multi-thousand DPS the wiki reports (5800-6000, -25%)', () => {
    expect(run('Autonomous Grimoire').sustained).toBeGreaterThan(4350);
  });

  it('the simulation is deterministic', () => {
    const b = BUILDS[0];
    expect(simulate({ ...b, seconds: 6 }).dps).toBe(simulate({ ...b, seconds: 6 }).dps);
  });
});
