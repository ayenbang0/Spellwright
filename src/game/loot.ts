/** Reward generation: spell/relic/wand pools, rarity rolls, shop stock and forge rules. */
import type { Rng } from '../core/rng';
import type { RelicDef, Rarity, SpellDef, WandDef } from '../data/types';
import type { MetaBonuses } from '../meta/meta';
import { LILIAN } from '../meta/meta';
import type { Save } from '../meta/save';
import type { Content } from './content';
import { DROPPABLE_EXCLUDE } from './relics';
import type { RunState } from './run';
import type { PlayerStats } from './stats';
import type { SpellInst } from './wand';

/** Spells that never come from rolls (set-only / special acquisition). */
const NEVER_ROLL = new Set(['bian_flying_sword', 'bings_arrow', 'enchanting_coin', 'enlarge_spell', 'spell_prototype']);

export interface PoolCtx {
  content: Content;
  save: Save;
  meta: MetaBonuses;
  run: RunState;
  stats: PlayerStats;
  rng: Rng;
}

/** Spells gated behind Lilian packs and not yet activated. */
export function lockedSpells(save: Save): Set<string> {
  const locked = new Set<string>();
  for (const p of LILIAN) if (!save.lilian[p.id]) for (const s of p.spells) locked.add(s);
  return locked;
}

export function lockedRelics(save: Save): Set<string> {
  const locked = new Set<string>();
  for (const p of LILIAN) if (!save.lilian[p.id]) for (const r of p.relics) locked.add(r);
  return locked;
}

export function spellPool(c: PoolCtx, rarity: Rarity, shop = false): SpellDef[] {
  const locked = lockedSpells(c.save);
  const banned = new Set(c.save.gina);
  return c.content.data.spells.filter(
    (s) => s.rarity === rarity && !NEVER_ROLL.has(s.id) && !locked.has(s.id) && !banned.has(s.id) && (!shop || s.shop),
  );
}

export function rollSpellRarity(c: PoolCtx, shop: boolean): Rarity {
  const nm = c.run.difficulty >= 4 ? 1.5 : 1;
  const nm3 = c.run.difficulty >= 5 ? 2 : nm;
  const focus = c.save.lilian.focus;
  const epic = shop ? 0 : focus ? 0.0066 * 3 * nm3 : 0.01 * nm3;
  const rare = Math.min(0.6, (0.22 + c.run.chapter * 0.03) * (c.meta.spellRare / 100));
  const r = c.rng.next();
  if (r < epic) return 'Epic';
  if (r < epic + rare) return 'Rare';
  return 'Normal';
}

/** One random spell reward. */
export function rollSpell(c: PoolCtx, opts: { shop?: boolean; minRare?: boolean; exclude?: Set<string> } = {}): SpellInst {
  let rarity = opts.minRare ? 'Rare' : rollSpellRarity(c, !!opts.shop);
  let pool = spellPool(c, rarity as Rarity, opts.shop).filter((s) => !opts.exclude?.has(s.id));
  if (!pool.length) {
    rarity = 'Normal';
    pool = spellPool(c, 'Normal', opts.shop).filter((s) => !opts.exclude?.has(s.id));
  }
  const s = c.rng.pick(pool);
  const lv = c.rng.chance(0.06 + c.run.chapter * 0.01) ? (c.rng.chance(0.15) ? 2 : 1) : 0;
  return { id: s.id, lv: s.upgrade === 'kills' || s.upgrade === 'none' ? 0 : lv };
}

/** Distinct spell choices for a spell room. Without Spell Focus the room offers a single spell (wiki). */
export function spellChoices(c: PoolCtx): SpellInst[] {
  const n = c.save.lilian.focus ? c.stats.spellOptions : c.stats.spellOptions - 2;
  const seen = new Set<string>();
  const out: SpellInst[] = [];
  for (let i = 0; i < n * 4 && out.length < n; i++) {
    const s = rollSpell(c, { exclude: seen });
    seen.add(s.id);
    out.push(s);
  }
  return out;
}

export function relicPool(c: PoolCtx, rarity: Rarity): RelicDef[] {
  const locked = lockedRelics(c.save);
  return c.content.data.relics.filter((r) => {
    if (r.rarity !== rarity || r.setOnly || DROPPABLE_EXCLUDE.has(r.id) || locked.has(r.id)) return false;
    const have = c.run.relics.find((x) => x.id === r.id);
    return !have || have.lv < r.maxLevel;
  });
}

export function relicChoices(c: PoolCtx, n: number): RelicDef[] {
  const out: RelicDef[] = [];
  const epic = c.run.difficulty >= 5 ? 0.016 : c.run.difficulty >= 4 ? 0.01 : 0;
  for (let guard = 0; guard < n * 20 && out.length < n; guard++) {
    const rar: Rarity = c.rng.chance(epic) ? 'Epic' : c.rng.chance(Math.min(0.7, 0.25 * (c.meta.relicRare / 100))) ? 'Rare' : 'Normal';
    const pool = relicPool(c, rar).filter((r) => !out.includes(r));
    if (pool.length) out.push(c.rng.pick(pool));
  }
  return out;
}

const CRIMSON_DEFAULT = 40;

export function crimsonChoices(c: PoolCtx): { relic: RelicDef; cost: number }[] {
  const pool = relicPool(c, 'Epic');
  c.rng.shuffle(pool);
  return pool.slice(0, 3).map((relic) => ({ relic, cost: relic.crimsonCost ?? CRIMSON_DEFAULT }));
}

export function rollWand(c: PoolCtx, tier: number): WandDef {
  const pool = c.content.data.wands.filter((w) => w.tier === tier || w.tier === tier - 1 || (w.tier === tier + 1 && c.rng.chance(0.3)));
  return c.rng.pick(pool.length ? pool : c.content.data.wands);
}

// ---------------------------------------------------------------- shop

export type ShopItem =
  | { kind: 'spell'; spell: SpellInst; price: number }
  | { kind: 'wand'; wand: string; price: number }
  | { kind: 'key'; price: number }
  | { kind: 'heart'; price: number }
  | { kind: 'shield'; price: number };

export const spellPrice = (def: SpellDef, lv: number, chapter: number) =>
  Math.round((def.rarity === 'Rare' ? 60 : def.rarity === 'Epic' ? 140 : 30) * (1 + lv * 0.9) * (1 + 0.15 * (chapter - 1)));

export function shopStock(c: PoolCtx): ShopItem[] {
  const count = Math.max(2, 4 + c.stats.shopItemsAdd);
  const items: ShopItem[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < count; i++) {
    const spell = rollSpell(c, { shop: true, minRare: i === 0, exclude: seen });
    seen.add(spell.id);
    items.push({ kind: 'spell', spell, price: spellPrice(c.content.spell[spell.id], spell.lv, c.run.chapter) });
  }
  items.push({ kind: 'wand', wand: rollWand(c, c.run.chapter).id, price: 90 + 45 * c.run.chapter });
  items.push({ kind: 'key', price: 20 });
  items.push({ kind: 'heart', price: 25 });
  if (c.rng.chance(0.5)) items.push({ kind: 'shield', price: 30 });
  return items;
}

// ---------------------------------------------------------------- forge

const isProto = (s: SpellInst | null) => !!s && s.id === 'spell_prototype';

/**
 * Craft: 3 identical spells of the same level become 1 of the next level (max ++). Spell Prototype is a wildcard for
 * Normal/Rare spells whose level matches its own. Only backpack spells are eligible (wiki: not wand-slotted).
 */
export function mergeCandidates(pack: (SpellInst | null)[], content: Content): { id: string; lv: number; idx: number[] }[] {
  const out: { id: string; lv: number; idx: number[] }[] = [];
  const groups = new Map<string, number[]>();
  pack.forEach((s, i) => {
    if (!s || isProto(s)) return;
    const def = content.spell[s.id];
    if (!def || def.upgrade !== 'craft' || s.lv >= 2) return;
    const k = `${s.id}:${s.lv}`;
    groups.set(k, [...(groups.get(k) ?? []), i]);
  });
  for (const [k, idx] of groups) {
    const [id, lv] = [k.slice(0, k.lastIndexOf(':')), Number(k.slice(k.lastIndexOf(':') + 1))];
    const def = content.spell[id];
    const protos = def.rarity === 'Epic' ? [] : pack.map((s, i) => (isProto(s) && s!.lv === lv ? i : -1)).filter((i) => i >= 0);
    if (idx.length >= 3) out.push({ id, lv, idx: idx.slice(0, 3) });
    else if (idx.length + protos.length >= 3) out.push({ id, lv, idx: [...idx, ...protos].slice(0, 3) });
  }
  return out;
}

export function applyMerge(pack: (SpellInst | null)[], m: { id: string; lv: number; idx: number[] }) {
  for (const i of m.idx) pack[i] = null;
  pack[m.idx[0]] = { id: m.id, lv: m.lv + 1 };
}

export function rerollCost(def: SpellDef, meta: MetaBonuses): number {
  const base = def.rarity === 'Epic' ? 90 : def.rarity === 'Rare' ? 45 : 20;
  return Math.round(base * (1 - meta.anvilDiscount / 100));
}
