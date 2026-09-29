/**
 * Wand model and cast planner (pure logic — no rendering; used by the game and the headless DPS harness).
 *
 * Semantics (PLAN §4.2–4.3):
 * - Slots are read left→right. A cast group draws `simul` projectile/summon spells.
 * - Boosts apply to every spell drawn after them in the same group (not across payload boundaries).
 *   Volley/Over Scatter add draws to the group they are in.
 * - Projectile triggers (Fuse, Arcane Nova) and the Grimoire summon take a payload group from the spells to their right.
 * - Boost triggers (Duet, Echo, Serial, Dazzling Fireworks, Twine) sit between two spells: the left spell carries a
 *   payload group drawn from the spells right of the trigger.
 * - Payload groups draw the wand's base simultaneous count, with their own boosts.
 * - Passives affect the whole wand regardless of position and are never cast.
 */
import type { Element, SpellDef, SpellMods, TriggerKind, WandDef } from '../data/types';
import type { Content } from './content';

export interface SpellInst {
  id: string;
  /** 0 = base, 1 = +, 2 = ++ */
  lv: number;
}

export interface WandInst {
  uid: number;
  defId: string;
  slots: (SpellInst | null)[];
  /** Post (secondary) slot segment — only for wands with `postSlot`. */
  post: (SpellInst | null)[];
  mp: number;
  energy: number;
  ptr: number;
  wait: number;
}

export interface ElementMod {
  element: Element;
  power: number;
  duration: number;
  chance: number;
  extra: number;
}

/** Flattened modifiers applied to one cast item. */
export interface ModStack {
  dmgAdd: number;
  dmgMult: number;
  finalMult: number;
  mpMult: number;
  speedAdd: number;
  durationAdd: number;
  durationMult: number;
  radiusMult: number;
  pierce: number;
  rebound: number;
  reflect: number;
  crit: number;
  scatter: number;
  multicast: number;
  split: number;
  splitDmg: number;
  elements: ElementMod[];
  trajectory: 'track' | 'homing' | 'orbit' | null;
  homingDeg: number;
  orbitRadius: number;
  hover: number;
  sizeMult: number;
  chainDmg: number;
  summonHpMult: number;
  summonRegen: number;
  summonSpeedMult: number;
  summonDrain: number;
  summonAfterlife: number;
  /** Cadaver Explosion: summon bursts when HP falls below this fraction (0 = off). */
  cadaver: number;
  /** Essence of Soul unlocks summon abilities. */
  essence: boolean;
  /** Strong Traction: on a crit pull `count` other foes within `radius` px and hit them for equal damage. */
  traction: { count: number; radius: number } | null;
  /** Fusion Summon: a new summon merges into an identical unmerged one (+100% stats). */
  fusion: boolean;
  /** Fall: the spell drops from the sky onto the cursor. */
  fall: boolean;
  cordDps: number;
  /** Visual behaviour tags, in stacking order (manifest.visualStacking). */
  tags: string[];
}

export function emptyMods(): ModStack {
  return {
    dmgAdd: 0, dmgMult: 1, finalMult: 1, mpMult: 1, speedAdd: 0, durationAdd: 0, durationMult: 1, radiusMult: 1,
    pierce: 0, rebound: 0, reflect: 0, crit: 0, scatter: 0, multicast: 0, split: 0, splitDmg: 0.33, elements: [],
    trajectory: null, homingDeg: 0, orbitRadius: 0, hover: 0, sizeMult: 1, chainDmg: 0, summonHpMult: 1, summonRegen: 0,
    summonSpeedMult: 1, summonDrain: 0, summonAfterlife: 0, cadaver: 0, essence: false, traction: null, fusion: false, fall: false, cordDps: 0, tags: [],
  };
}

const TAG_BY_SPELL: Record<string, string> = {
  track: 'homing', automatic_navigate: 'homing', rebound: 'rebound', penetration: 'pierce', reflection: 'rebound',
  multi_shot: 'multishot', volley: 'volley', over_scatter: 'volley', split: 'multishot', orbit: 'orbit',
  enlarge_spell: 'enlarge', fall: 'fall',
};

function applyMods(s: ModStack, spell: SpellDef, m: SpellMods) {
  s.dmgAdd += m.dmgAdd ?? 0;
  s.dmgMult *= spell.trigger ? 1 : m.dmgMult ?? 1;
  s.finalMult *= m.finalMult ?? 1;
  s.mpMult *= spell.trigger ? 1 : m.mpMult ?? 1;
  s.speedAdd += m.speedAdd ?? 0;
  s.durationAdd += m.durationAdd ?? 0;
  s.durationMult *= m.durationMult ?? 1;
  s.radiusMult *= m.radiusMult ?? 1;
  s.pierce += m.pierceAdd ?? 0;
  s.rebound += m.reboundAdd ?? 0;
  s.reflect += m.reflectAdd ?? 0;
  s.crit += m.critAdd ?? 0;
  s.scatter += m.scatterAdd ?? 0;
  s.multicast += spell.trigger ? 0 : m.multicast ?? 0;
  if (m.split) {
    s.split = Math.max(s.split, m.split);
    s.splitDmg = m.splitDmg ?? s.splitDmg;
  }
  if (m.element) {
    s.elements.push({
      element: m.element,
      power: m.elementPower ?? 1,
      duration: m.elementDuration ?? 3,
      chance: m.chance ?? 1,
      extra: m.thunderDmg ?? 0,
    });
  }
  if (m.trajectory) {
    // Trajectory enhancements override earlier trajectories (wiki).
    s.trajectory = m.trajectory;
    s.homingDeg = m.homingDeg ?? s.homingDeg;
    s.orbitRadius = m.orbitRadius ?? s.orbitRadius;
  }
  s.hover += m.hover ?? 0;
  s.sizeMult *= m.sizeMult ?? 1;
  s.chainDmg += m.chainDmg ?? 0;
  s.summonHpMult *= m.summonHpMult ?? 1;
  s.summonRegen += m.summonRegen ?? 0;
  s.summonSpeedMult *= m.summonSpeedMult ?? 1;
  s.summonDrain += m.summonDrain ?? 0;
  s.summonAfterlife += m.summonAfterlife ?? 0;
  s.cordDps += m.cordDps ?? 0;
  if (m.threshold) s.cadaver = Math.max(s.cadaver, m.threshold);
  if (spell.id === 'essence_of_soul') s.essence = true;
  if (spell.id === 'strong_traction') s.traction = { count: m.count ?? 1, radius: (7 + ((m.count ?? 1) >= 2 ? 1 : 0) + ((m.count ?? 1) >= 4 ? 1 : 0)) * 16 };
  if (spell.id === 'fusion_summon') s.fusion = true;
  if (spell.id === 'fall') s.fall = true;
  const tag = m.element ?? TAG_BY_SPELL[spell.id];
  if (tag && !s.tags.includes(tag)) s.tags.push(tag);
}

export interface CastItem {
  spell: SpellDef;
  lv: number;
  mods: ModStack;
  /** Copies cast (1 + Multi-Shot). */
  copies: number;
  /** Fuse / Arcane Nova / Grimoire payload. */
  payload: CastGroup | null;
  /** Boost trigger between this spell and the next group (Duet/Echo/Serial/Fireworks/Twine). */
  after: { kind: TriggerKind; spell: SpellDef; lv: number; payload: CastGroup } | null;
  /** MP for this item alone (payloads excluded). */
  mp: number;
}

export interface CastGroup {
  items: CastItem[];
  /** Total MP paid when the group is cast (includes up-front payloads). */
  mp: number;
  intervalAdd: number;
  cdAdd: number;
  scatter: number;
}

interface Card {
  inst: SpellInst;
  def: SpellDef;
}

/**
 * Slot contents as an ordered card list. Magic Upgrade and Mimicry Cube are resolved here (they rewrite neighbouring
 * cards); `extra` are leading copies injected by Area Boost from any carried wand.
 */
export function deckOf(slots: (SpellInst | null)[], content: Content, extra: SpellInst[] = []): Card[] {
  const insts: SpellInst[] = [...extra, ...slots.filter((s): s is SpellInst => !!s && !!content.spell[s.id])].map((s) => ({ ...s }));
  // Magic Upgrade: +1 level (cap ++) to the nearest spell on each side
  insts.forEach((s, i) => {
    if (s.id !== 'magic_upgrade') return;
    for (const dir of [-1, 1]) {
      for (let j = i + dir; j >= 0 && j < insts.length; j += dir) {
        if (insts[j].id === 'magic_upgrade') continue;
        insts[j].lv = Math.min(2, insts[j].lv + 1);
        break;
      }
    }
  });
  // Mimicry Cube: becomes a copy of the first spell on its right, at no more than the cube's own level
  for (let i = 0; i < insts.length; i++) {
    if (insts[i].id !== 'mimicry_cube') continue;
    const cube = insts[i];
    const next = insts.slice(i + 1).find((x) => x.id !== 'mimicry_cube');
    if (next) insts[i] = { id: next.id, lv: Math.min(cube.lv, next.lv) };
  }
  return insts.filter((s) => s.id !== 'magic_upgrade').map((inst) => ({ inst, def: content.spell[inst.id] }));
}

/** Area Boost: the first spell right of each Area Boost, copied (up to its own level) onto every wand. */
export function areaBoostCopies(wands: WandInst[], content: Content): SpellInst[] {
  const out: SpellInst[] = [];
  for (const w of wands) {
    w.slots.forEach((s, i) => {
      if (!s || s.id !== 'area_boost') return;
      const w4 = content.spell.area_boost?.slots ?? 4;
      const next = w.slots.slice(i + w4).find((x) => !!x && content.spell[x.id]?.type !== 'Passive');
      if (next) out.push({ id: next.id, lv: Math.min(s.lv, next.lv) });
    });
  }
  return out;
}

const castable = (d: SpellDef) => d.type === 'Projectile' || d.type === 'Summon';

export interface PlanCtx {
  content: Content;
  baseSimul: number;
  /** Wand + global MP multiplier. */
  mpMult: number;
}

const cloneMods = (m: ModStack): ModStack => ({ ...m, elements: [...m.elements], tags: [...m.tags] });

/**
 * Plan one cast group starting at `start`; returns the group and the index after the last consumed card.
 * `inherit` = boosts that sit left of the trigger this group belongs to: everything except Multi-Shot carries into a
 * payload (wiki Trigger spells: only Multi-Shot and Duet bonuses are separate inside and outside the payload).
 */
export function planGroup(cards: Card[], start: number, draws: number, ctx: PlanCtx, depth = 0, inherit: ModStack | null = null): { group: CastGroup; next: number } {
  const stack = inherit ? cloneMods(inherit) : emptyMods();
  const inh = inherit ? cloneMods(inherit) : emptyMods();
  const items: CastItem[] = [];
  let i = start;
  let remaining = draws;
  let volleyDiscount = 1;
  let extraFromVolley = 0;
  let intervalAdd = 0;
  let cdAdd = 0;
  while (remaining > 0 && i < cards.length) {
    const { inst, def } = cards[i++];
    const m = def.mods?.[inst.lv];
    intervalAdd += def.intervalAdd[inst.lv] ?? 0;
    cdAdd += def.cdAdd[inst.lv] ?? 0;
    if (def.type === 'Passive') continue;
    if (def.type === 'Boost') {
      if (def.trigger) continue; // boost trigger with no spell on its left does nothing
      if (m) {
        applyMods(stack, def, m);
        if (!m.multicast) applyMods(inh, def, m);
        if (m.simulAdd) {
          remaining += m.simulAdd;
          extraFromVolley += m.simulAdd;
        }
        if (m.volleyDiscount) volleyDiscount = Math.min(volleyDiscount, m.volleyDiscount);
        if (m.cdAdd) cdAdd += m.cdAdd;
      }
      continue;
    }
    const mods: ModStack = { ...stack, elements: [...stack.elements], tags: [...stack.tags] };
    const item: CastItem = {
      spell: def,
      lv: inst.lv,
      mods,
      copies: 1 + mods.multicast,
      payload: null,
      after: null,
      mp: def.mana[inst.lv] * mods.mpMult * ctx.mpMult,
    };
    if (depth < 6 && (def.trigger === 'fuse' || def.trigger === 'nova' || def.trigger === 'grimoire')) {
      const r = planGroup(cards, i, def.trigger === 'grimoire' ? 1 : ctx.baseSimul, ctx, depth + 1, inh);
      item.payload = r.group;
      i = r.next;
    }
    const nextCard = cards[i];
    if (depth < 6 && nextCard && nextCard.def.type === 'Boost' && nextCard.def.trigger) {
      i++;
      const r = planGroup(cards, i, ctx.baseSimul, ctx, depth + 1, inh);
      item.after = { kind: nextCard.def.trigger, spell: nextCard.def, lv: nextCard.inst.lv, payload: r.group };
      if (!mods.tags.includes(nextCard.def.trigger)) mods.tags.push(nextCard.def.trigger);
      i = r.next;
    }
    items.push(item);
    remaining--;
  }
  const extra = Math.min(extraFromVolley, Math.max(0, items.length - 1));
  const discount = volleyDiscount ** extra;
  let mp = 0;
  for (const it of items) {
    it.mp *= discount;
    mp += it.mp * it.copies;
    mp += upfrontPayloadCost(it) * it.copies;
  }
  return { group: { items, mp, intervalAdd, cdAdd, scatter: stack.scatter }, next: i };
}

/** MP paid at cast time for payloads (Echo/Serial pay when they trigger; Grimoire runs on its own MP). */
function upfrontPayloadCost(it: CastItem): number {
  let cost = 0;
  const m = it.spell.mods?.[it.lv];
  if (it.payload && it.spell.trigger === 'fuse') cost += it.payload.mp * (m?.mpMult ?? 0.9);
  if (it.payload && it.spell.trigger === 'nova') cost += (it.payload.items[0]?.mp ?? 0) * (m?.mpMult ?? 5);
  if (it.after) {
    const am = it.after.spell.mods?.[it.after.lv];
    if (it.after.kind === 'duet' || it.after.kind === 'twine') cost += it.after.payload.mp;
    if (it.after.kind === 'fireworks') cost += it.after.payload.mp * (am?.multicast ?? 4);
  }
  return cost;
}

/** True if any castable card exists at or after `from`. */
export function hasCastableFrom(cards: Card[], from: number): boolean {
  for (let i = from; i < cards.length; i++) if (castable(cards[i].def)) return true;
  return false;
}

export interface WandGlobals {
  mpMult: number;
  regenAdd: number;
  maxMpMult: number;
  maxMpAdd: number;
  radiusMult: number;
  slotsAdd: number;
}

export interface WandStats {
  maxMp: number;
  regen: number;
  interval: number;
  cd: number;
  simul: number;
  scatter: number;
  finalMult: number;
  mpMult: number;
  crit: number;
  slots: number;
  spirit: number;        // Wand Spirit level, -1 none
  resonance: { chance: number; free: number } | null;
  chargeMode: { max: number; mpMult: number } | null;
  barrier: boolean;
  flyingSwords: number;  // Bi'an Flying Sword count limit, 0 none
}

/** Wand stats after passives and global (all-wand) modifiers. */
export function wandStats(def: WandDef, inst: WandInst, content: Content, g: WandGlobals): WandStats {
  let maxMp = def.mp;
  let maxMpMult = g.maxMpMult;
  let regen = def.regen + g.regenAdd;
  let regenMult = 1;
  let cdMult = 1;
  let finalMult = def.finalMult;
  let slots = def.slots + g.slotsAdd;
  let spirit = -1;
  let resonance: WandStats['resonance'] = null;
  let chargeMode: WandStats['chargeMode'] = null;
  let barrier = false;
  let flyingSwords = 0;
  let mpMult = def.mpMult * g.mpMult;
  const all = [...inst.slots, ...inst.post];
  all.forEach((s, idx) => {
    if (!s) return;
    const sp = content.spell[s.id];
    if (!sp || sp.type !== 'Passive') return;
    const m = sp.mods?.[s.lv] ?? {};
    if (sp.id === 'magic_vine') {
      // Stacks once per consecutive empty slot to its right, counting its own slot.
      let n = 1;
      for (let j = idx + sp.slots; j < all.length && !all[j]; j++) n++;
      regenMult *= 1 + ((m.regenMult ?? 1.2) - 1) * n;
      maxMpMult *= 1 + ((m.maxMpMult ?? 1.1) - 1) * n;
      return;
    }
    maxMp += m.maxMpAdd ?? 0;
    maxMpMult *= m.maxMpMult ?? 1;
    regen += m.regenAdd ?? 0;
    cdMult *= m.cdMult ?? 1;
    finalMult *= m.finalMult ?? 1;
    slots += m.slotsAdd ?? 0;
    if (sp.id === 'wand_spirit') {
      spirit = s.lv;
      regenMult *= m.regenMult ?? 0.5;
    } else regenMult *= m.regenMult ?? 1;
    if (sp.id === 'resonance_rune') resonance = { chance: m.chance ?? 0.25, free: m.freeChance ?? 0.2 };
    if (sp.id === 'charge_mode') {
      chargeMode = { max: m.count ?? [6, 12, 24][s.lv], mpMult: m.mpMult ?? 0.9 };
      mpMult *= m.mpMult ?? 0.9;
    }
    if (sp.id === 'arcane_barrier') barrier = true;
    if (sp.id === 'bian_flying_sword') flyingSwords = 1;
  });
  maxMp *= maxMpMult;
  maxMp += g.maxMpAdd;
  if (flyingSwords) flyingSwords = Math.max(1, Math.floor(maxMp / 25));
  return {
    maxMp: Math.round(maxMp),
    regen: regen * regenMult,
    interval: def.interval,
    cd: def.cd * cdMult,
    simul: Math.max(1, def.simul),
    scatter: def.scatter,
    finalMult,
    mpMult,
    crit: def.crit,
    slots: Math.max(1, slots),
    spirit,
    resonance,
    chargeMode,
    barrier,
    flyingSwords,
  };
}

/** Index of the slot that covers `i` (multi-slot spells cover the following slots). */
export function coveringSlot(slots: (SpellInst | null)[], i: number, content: Content): number {
  for (let j = i; j >= 0 && j > i - 4; j--) {
    const s = slots[j];
    if (s) {
      const w = content.spell[s.id]?.slots ?? 1;
      return j + w > i ? j : -1;
    }
  }
  return -1;
}

/** Can `spell` be placed at slot `i` without overlapping other spells or running past the end? */
export function canPlace(slots: (SpellInst | null)[], i: number, spellId: string, content: Content, ignoreIndex = -1): boolean {
  const w = content.spell[spellId]?.slots ?? 1;
  if (i < 0 || i + w > slots.length) return false;
  for (let j = i; j < i + w; j++) {
    const c = coveringSlot(slots, j, content);
    if (c !== -1 && c !== ignoreIndex) return false;
  }
  return true;
}

let uidSeq = 1;
export function newWand(def: WandDef, spells: SpellInst[] = [], slotsAdd = 0): WandInst {
  const slots: (SpellInst | null)[] = Array(Math.max(1, def.slots + slotsAdd)).fill(null);
  spells.forEach((s, i) => {
    if (i < slots.length) slots[i] = s;
  });
  return {
    uid: uidSeq++,
    defId: def.id,
    slots,
    post: def.postSlot ? [null, null] : [],
    mp: def.mp,
    energy: 0,
    ptr: 0,
    wait: 0,
  };
}

/** Grow/shrink the slot array when slot count changes (Drill, Capacity Stone); overflow spells are returned. */
export function resizeSlots(w: WandInst, count: number): SpellInst[] {
  const out: SpellInst[] = [];
  while (w.slots.length < count) w.slots.push(null);
  while (w.slots.length > count) {
    const s = w.slots.pop();
    if (s) out.push(s);
  }
  return out;
}
