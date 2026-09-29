/**
 * Damage formula from the wiki "Damage Calculation" page (PLAN §4.4):
 *
 *   dmg = ( ((Base + BaseIncrease) × SpellDmgMult + Mirrored) × FinalMult × ConditionalFinalMult + BubbleGrowth )
 *         × Crit × EnemyDamageTakenDebuff
 *
 * SpellDmgMult = (1 + Σ additive: relics, curses, DMG Enhanced, …) × Π multiplicative (Reflection, Energy Saving).
 * The original rounds after most operations; we round per step to whole numbers.
 */
export interface DamageParts {
  base: number;
  baseInc: number;
  dmgAdd: number;
  dmgMult: number;
  mirrored: number;
  finalMult: number;
  condFinal: number;
  bubble: number;
}

export function spellDamage(p: DamageParts): number {
  const spellMult = Math.max(0, 1 + p.dmgAdd) * p.dmgMult;
  const a = Math.round((p.base + p.baseInc) * spellMult + p.mirrored);
  return Math.round(a * p.finalMult * p.condFinal + p.bubble);
}

/** Damage handed to a Duet payload (wiki): (((Base+Inc)×SpellMult) + Mirrored + Bubble) × CondFinal × inherit. */
export function duetMirror(p: DamageParts, inherit: number, duetFactor: number): number {
  const spellMult = Math.max(0, 1 + p.dmgAdd) * p.dmgMult;
  return Math.round(((p.base + p.baseInc) * spellMult + p.mirrored + p.bubble) * p.condFinal * inherit * duetFactor);
}

export function applyCritAndDebuff(dmg: number, crit: boolean, critMult: number, vuln: number): number {
  return Math.max(1, Math.round(dmg * (crit ? critMult : 1) * vuln));
}
