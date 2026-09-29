import type { Content } from './content';
import type { RunState } from './run';
import { RELICS } from './relics';
import { CURSES } from './curses';
import type { WandGlobals } from './wand';

/** Player-wide modifiers derived from relics, curses, potions and meta upgrades. Rebuilt on change. */
export interface PlayerStats {
  maxHp: number;
  speed: number;           // m/s
  dmgAdd: number;          // additive spell damage bucket
  critAdd: number;
  critMult: number;
  dmgTakenMult: number;
  indiscriminateMult: number;
  dodge: number;
  radiusMult: number;
  mpCostMult: number;
  regenMult: number;
  maxMpMult: number;
  maxMpAdd: number;
  regenAdd: number;
  intervalMult: number;
  scatterAdd: number;
  projSpeedMult: number;
  summonLimitMult: number;
  slotsAdd: number;
  flight: boolean;
  wallPierce: boolean;
  spikeImmune: boolean;
  venomImmune: boolean;
  slowImmune: boolean;
  noCastSlow: boolean;
  relicOptions: number;
  spellOptions: number;
  knockbackMult: number;
  recoilMult: number;
  enemySpeedMult: number;
  enemyRegen: number;
  trapDmgMult: number;
  backpackAdd: number;
  shopItemsAdd: number;
  keyCost: number;
  postChargeMult: number;
  showHpBars: number;
  poisonMult: number;
  wandLimitAdd: number;
  forceSpirit: boolean;
  sizeMult: number;
  globals: WandGlobals;
}

export function baseStats(): PlayerStats {
  return {
    maxHp: 100, speed: 5, dmgAdd: 0, critAdd: 0, critMult: 2, dmgTakenMult: 1, indiscriminateMult: 1, dodge: 0,
    radiusMult: 1, mpCostMult: 1, regenMult: 1, maxMpMult: 1, maxMpAdd: 0, regenAdd: 0, intervalMult: 1, scatterAdd: 0,
    projSpeedMult: 1, summonLimitMult: 1, slotsAdd: 0, flight: false, wallPierce: false, spikeImmune: false,
    venomImmune: false, slowImmune: false, noCastSlow: false, relicOptions: 3, spellOptions: 3, knockbackMult: 1,
    recoilMult: 1, enemySpeedMult: 1, enemyRegen: 0, trapDmgMult: 1, backpackAdd: 0, shopItemsAdd: 0, keyCost: 1,
    postChargeMult: 1, showHpBars: 0, poisonMult: 1, wandLimitAdd: 0, forceSpirit: false, sizeMult: 1,
    globals: { mpMult: 1, regenAdd: 0, maxMpMult: 1, maxMpAdd: 0, radiusMult: 1, slotsAdd: 0 },
  };
}

export interface MetaBonuses {
  maxHp: number;
  maxMp: number;
  regen: number;
}

export function computeStats(run: RunState, content: Content, meta: MetaBonuses): PlayerStats {
  const s = baseStats();
  s.maxHp += meta.maxHp + run.maxHpBonus + run.perm.maxHp;
  s.speed += run.perm.speed;
  s.sizeMult = run.perm.scale;
  if (run.temp.flight) s.flight = true;
  s.globals.maxMpAdd += meta.maxMp + run.perm.maxMp;
  s.globals.regenAdd += meta.regen + run.perm.regen;
  for (const r of run.relics) RELICS[r.id]?.stats?.(s, r.lv, run);
  for (const id of run.curses) {
    const def = content.curse[id];
    if (def) CURSES[id]?.stats?.(s, def.params, run);
  }
  // wand-global stats from player modifiers
  s.globals.mpMult *= s.mpCostMult;
  s.globals.maxMpMult *= s.maxMpMult;
  s.globals.maxMpAdd += s.maxMpAdd;
  s.globals.regenAdd += s.regenAdd;
  s.globals.slotsAdd += s.slotsAdd;
  s.globals.radiusMult *= s.radiusMult;
  // wand passives that affect all wands
  for (const w of run.wands) {
    const g = content.wand[w.defId]?.global;
    if (!g) continue;
    s.globals.mpMult *= g.mpMult ?? 1;
    s.globals.regenAdd += g.regenAdd ?? 0;
    s.globals.maxMpMult *= g.maxMpMult ?? 1;
    s.globals.radiusMult *= g.radiusMult ?? 1;
  }
  s.maxHp = Math.max(1, Math.round(s.maxHp));
  return s;
}
