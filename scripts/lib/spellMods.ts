/**
 * Per-spell extraction of SpellMods (and a few SpellDef fields stated only in effect text) from wiki level text.
 * Each spec returns key → per-level values (undefined where the wiki is silent) or a constant for all levels.
 * Keys starting with '$' target SpellDef fields instead of mods ($radius, $pierce).
 */
import type { MaybeLv3 } from './wiki';

export interface SpecCtx {
  /** Infobox `<key>1..3` parsed with parseStat ('%' → fraction). */
  ib(key: string): MaybeLv3;
  /** First capture of `rx` in each level's text (misc_* fields first, then level description), times `scale`. */
  re(rx: RegExp, scale?: number): MaybeLv3;
}

export type SpecValue = MaybeLv3 | number | string;
export type Spec = (c: SpecCtx) => Record<string, SpecValue>;

const PCT = 0.01;
/** "+40%" style bonus → multiplier 1.4 (keeps undefined gaps). */
const onePlus = (v: MaybeLv3): MaybeLv3 => v.map((x) => (x === undefined ? undefined : Math.round((1 + x) * 1e6) / 1e6)) as MaybeLv3;

export const MOD_SPECS: Record<string, Spec> = {
  // ---- trigger projectiles / summons (mods allowed on non-Boost triggers) ----
  fuse: (c) => ({ mpMult: c.re(/x(\d+)% MP cost/, PCT) }),
  arcane_nova: (c) => ({
    mpMult: c.re(/right side x(\d+)%/, PCT),
    dmgMult: onePlus(c.re(/damage decreasing by (\d+)%/, -PCT)),
    multicast: c.re(/scatters (\d+) times/),
  }),
  autonomous_grimoire: (c) => ({ regenMult: c.re(/equivalent to (\d+)% of the summoning wand/, PCT) }),

  // ---- field-only extras on attack spells ----
  laser: (c) => ({ $pierce: c.re(/Penetration \+(\d+)/) }),

  // ---- Boost ----
  volley: (c) => ({
    simulAdd: c.ib('simultaneous_firing'),
    volleyDiscount: c.re(/mana cost x(\d+)%/, PCT),
    scatterAdd: c.re(/scattering \+(\d+)°/),
  }),
  multi_shot: (c) => ({ mpMult: c.re(/MP Cost: x(\d+)%/, PCT), multicast: c.re(/Increases spell cast by (\d+)/) }),
  over_scatter: (c) => ({ cdAdd: c.ib('cd'), scatterAdd: c.ib('scatter'), simulAdd: c.ib('simultaneous_firing') }),
  slime_crystal: (c) => ({
    element: 'slime',
    elementPower: c.re(/Movement Speed of targets hit x(\d+)%/, PCT),
    speedMult: c.re(/Flight Speed of spells x(\d+)%/, PCT),
    elementDuration: c.re(/(?:in|for) (\d+) seconds/),
  }),
  venom_crystal: (c) => ({
    element: 'venom',
    elementPower: c.re(/Applies (\d+) stacks/),
    elementDuration: c.re(/for (\d+) seconds/),
  }),
  penetration: (c) => ({ pierceAdd: c.ib('spell_penetration') }),
  chain_of_lightning: (c) => ({ chainDmg: c.re(/deal (\d+) damage/) }),
  hover: (c) => ({ hover: c.re(/for ([\d.]+) seconds/) }),
  orbit: (c) => ({
    trajectory: 'orbit',
    durationAdd: c.ib('spell_duration'),
    speedAdd: c.ib('spell_flight_speed'),
    orbitRadius: c.re(/Orbit Effect Radius ([\d.]+)m/),
  }),
  track: (c) => ({ trajectory: 'track', speedAdd: c.ib('spell_flight_speed'), durationAdd: c.ib('spell_duration') }),
  automatic_navigate: (c) => ({ trajectory: 'homing', homingDeg: c.re(/angular velocity of (\d+)°/) }),
  rebound: (c) => ({ reboundAdd: c.ib('spell_rebound_count') }),
  split: (c) => ({
    mpMult: c.ib('mp_cost'),
    split: c.re(/Splits into (\d+) spells/),
    splitDmg: c.re(/dealing x?(\d+)% damage/, PCT),
  }),
  frost_crystal: (c) => ({ element: 'frost', elementPower: c.re(/frozen for ([\d.]+) seconds/) }),
  parasite: (c) => ({
    summonSpeedMult: onePlus(c.re(/\+(\d+)% Attack Speed/, PCT)),
    summonDrain: c.re(/losing (\d+) HP per second/),
    count: c.re(/(\d+) parasites are spawned/),
  }),
  core_of_thunder: (c) => ({
    element: 'thunder',
    elementPower: c.re(/(\d+)% chance/, PCT),
    chance: c.re(/(\d+)% chance/, PCT),
    thunderDmg: c.re(/additional (\d+)% damage/, PCT),
    $radius: c.re(/Effect Radius of ([\d.]+)m/),
  }),
  dmg_enhanced: (c) => ({ dmgAdd: c.re(/Spell Damage \+(\d+)%/, PCT) }),
  time_duration_enhanced: (c) => ({ durationAdd: c.ib('spell_duration') }),
  energy_saving_mode: (c) => ({
    mpMult: c.ib('mp_cost'),
    dmgMult: c.ib('spell_damage'),
    durationMult: c.ib('spell_duration'),
  }),
  precise_shot: (c) => ({ critAdd: c.ib('crit_rate'), scatterAdd: c.ib('scatter') }),
  accelerator: (c) => ({ speedAdd: c.ib('spell_flight_speed') }),
  range_enhanced: (c) => ({ radiusMult: onePlus(c.ib('spell_effect_radius')) }),
  troll_serum: (c) => ({
    summonHpMult: onePlus(c.re(/have \+(\d+)% HP/, PCT)),
    summonRegen: c.re(/restore \+([\d.]+) ?HP/),
  }),
  umbilical_cord: (c) => ({ cordDps: c.re(/deals? (\d+) damage per second/) }),
  core_of_flame: (c) => ({
    element: 'fire',
    dmgAdd: c.re(/Spell DMG \+(\d+)%/, PCT),
    elementPower: c.re(/equal to (\d+)% of the target's max HP/, PCT),
    elementDuration: c.re(/per second for (\d+) seconds/),
  }),
  strong_traction: (c) => ({
    critAdd: c.ib('crit_rate'),
    count: c.re(/(?:pulls|traction) (\d+) other/),
    $radius: c.re(/within a radius of (\d+)m/),
  }),
  fusion_summon: (c) => ({ count: c.re(/Maximum merging count: (\d+)/) }),
  cadaver_explosion: (c) => ({
    summonHpMult: c.re(/maximum HP x(\d+)%/, PCT),
    threshold: c.re(/HP falls below (\d+)%/, PCT),
    $radius: c.re(/within a radius of ([\d.]+)m/),
  }),
  reflection: (c) => ({ reflectAdd: c.re(/nearest enemy (\d+) times/), dmgMult: c.ib('spell_damage') }),
  indomitability: (c) => ({ summonAfterlife: c.re(/fight for (\d+) seconds/) }),
  duet: (c) => ({ dmgMult: c.re(/inherits (\d+)% of the damage/, PCT) }),
  dazzling_fireworks: (c) => ({
    multicast: c.re(/right spell (\d+) times/),
    dmgMult: c.re(/released spell x(\d+)%/, PCT),
  }),
  serial: (c) => ({ mpMult: c.re(/with (\d+)% mana cost/, PCT) }),
  echo: (c) => ({
    mpMult: c.re(/mana cost of (\d+)%/, PCT),
    intervalAdd: c.re(/shortest interval of ([\d.]+) seconds/),
  }),
  enlarge_spell: (c) => ({
    slotsAdd: c.ib('spell_slots'),
    sizeMult: onePlus(c.re(/spell size \+(\d+)/, PCT)),
  }),

  // ---- Passive ----
  magic_reservoir: (c) => ({ maxMpMult: onePlus(c.re(/Max MP of the wand \+(\d+)%/, PCT)) }),
  tranquil_bloom: (c) => ({ regenAdd: c.re(/MP Regen of the wand \+(\d+)\/s/) }),
  charge_mode: (c) => ({ mpMult: c.ib('mana_cost'), count: c.re(/maximum of (\d+) times/) }),
  wand_spirit: (c) => ({ regenMult: c.re(/MP Regen of the wand x(\d+)%/, PCT) }),
  forced_cooldown: (c) => ({ cdMult: c.ib('cd') }),
  capacity_expansion_stone: (c) => ({ slotsAdd: c.ib('spell_slots'), finalMult: c.ib('spell_damage') }),
  resonance_rune: (c) => ({
    chance: c.re(/(\d+)% chance of auto-casting/, PCT),
    freeChance: c.re(/(\d+)% chance of not consuming MP/, PCT),
  }),
  arcane_barrier: (c) => ({
    maxMpAdd: c.re(/Max MP of the wand \+(\d+)/),
    $radius: c.re(/within a radius of (\d+)m/),
  }),
  bian_flying_sword: (c) => ({ slotsAdd: c.ib('spell_slots') }),
  magic_vine: (c) => ({
    regenMult: onePlus(c.re(/MP Regen of the wand \+(\d+)%/, PCT)),
    maxMpMult: onePlus(c.re(/Max MP of the wand \+(\d+)%/, PCT)),
  }),
};
