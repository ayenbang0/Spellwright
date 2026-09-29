/**
 * Builds public/data/{spells,wands,relics,curses,potions,names}.json from the wiki mirror (wiki/data, wiki/corpus.md)
 * plus hand-authored files: data/names.json (clean-room names), data/desc/*.json (original text),
 * data/design.json (values the wiki lacks). Output is validated with zod (scripts/lib/schema.ts) and deterministic.
 *
 * Run: npx tsx scripts/build-data.ts   (npm run build:data)
 *
 * SpellMods key usage beyond the obvious one-to-one wiki mappings:
 * - duet dmgMult          = share of the left spell's damage inherited by the payload (0.3/0.6/1.2).
 * - dazzling_fireworks    multicast = payload releases (4), dmgMult = damage of each release.
 * - echo intervalAdd      = minimum seconds between echo casts (0.3/0.2/0.1).
 * - arcane_nova           mpMult = payload MP multiplier (5), dmgMult = payload damage (0.5), multicast = releases (20).
 * - fuse / serial mpMult  = MP multiplier of the payload spell.
 * - autonomous_grimoire regenMult = grimoire MP regen as a fraction of the summoning wand's regen.
 * - core_of_thunder       elementPower AND chance = proc chance (both set, same value); thunderDmg = extra damage fraction;
 *                         proc radius goes to SpellDef.radius.
 * - core_of_flame         elementPower = burn per second as a fraction of target max HP (0.05; bosses 0.003, engine-keyed),
 *                         elementDuration = burn seconds (from the level text; the older infobox "220 dps / 2 s" is ignored).
 * - slime_crystal         elementPower = target move-speed multiplier, speedMult = the modified spell's flight-speed multiplier.
 * - frost_crystal         elementPower = freeze seconds. venom_crystal elementPower = poison stacks.
 * - parasite count        = parasites spawned on summon death; strong_traction count = extra enemies pulled (radius → SpellDef.radius);
 *   charge_mode count     = max stored casts; fusion_summon count = max merges.
 * - cadaver_explosion     summonHpMult = 0.8 (max HP x80%), threshold = HP fraction that kills the summon, radius → SpellDef.radius.
 * - magic_vine            regenMult/maxMpMult are PER empty slot to its right (incl. its own), stacking additively.
 * - arcane_barrier        radius → SpellDef.radius (MP-burn aura), maxMpAdd = +120.
 * - enlarge_spell / bian_flying_sword slotsAdd = the wiki's "Spell Slots +1".
 *
 * SpellDef.tickRate is also set for Boomerang Blade and Lightning Dash (3 hits/s re-hit rate from the wiki Tick rate
 * table) even though they are not (DPS) spells.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import type {
  CurseDef,
  PostSlotTrigger,
  PotionDef,
  Rarity,
  RelicDef,
  SpellDef,
  SpellMods,
  SpellType,
  TriggerKind,
  WandDef,
} from '../src/data/types';
import * as S from './lib/schema';
import { MOD_SPECS, type SpecCtx } from './lib/spellMods';
import {
  bulletsAfter,
  corpusSections,
  fill,
  norm,
  parseStat,
  r6,
  readJson,
  resolveTokens,
  ROOT,
  tableAfter,
  type IdEntry,
  type Lv3,
  type MaybeLv3,
} from './lib/wiki';

type Group = 'spells' | 'wands' | 'relics' | 'curses' | 'potions';
type NumField = 'mana' | 'damage' | 'crit' | 'radius' | 'shots' | 'scatter' | 'pierce' | 'cdAdd' | 'intervalAdd' | 'hp' | 'summonLimit';

interface Design {
  dpsTickDefault: number;
  setSpells: string[];
  spells: Record<
    string,
    {
      speed?: number;
      lifetime?: number;
      wiki?: Partial<Record<NumField, Lv3<number>>>;
      design?: Partial<Record<NumField, Lv3<number>>>;
      modsDesign?: Lv3<SpellMods>;
    }
  >;
  wandSlotBands: [number, number][];
  wandSlots: Record<string, number>;
  wandTierBands: [number, number][];
  wands: Record<string, Partial<WandDef>>;
  curses: Record<string, number[]>;
  potions: Record<string, PotionDef['duration']>;
}

const ids = readJson<Record<Group, IdEntry[]>>('wiki/data/ids.json');
const design = readJson<Design>('data/design.json');
const names = readJson<Record<string, Record<string, string>>>('data/names.json');
const descSpells = readJson<Record<string, string[]>>('data/desc/spells.json');
const descWands = readJson<Record<string, string>>('data/desc/wands.json');
const descRelics = readJson<Record<string, string[]> & { _designScaled: string[] }>('data/desc/relics.json');
const descCurses = readJson<Record<string, string>>('data/desc/curses.json');
const descPotions = readJson<Record<string, string>>('data/desc/potions.json');
const corpus = readFileSync(resolve(ROOT, 'wiki/corpus.md'), 'utf8');
const sections = corpusSections(corpus);

function section(title: string): string {
  const s = sections.get(norm(title));
  if (!s) throw new Error(`corpus section missing: ${title}`);
  return s;
}

function nameOf(group: Group, id: string): string {
  const n = names[group]?.[id];
  if (!n) throw new Error(`data/names.json: missing ${group}.${id}`);
  return n;
}

const spellIdByName: Record<string, string> = Object.fromEntries(ids.spells.map((e) => [norm(e.wikiName), e.id]));

// ---------------------------------------------------------------- wiki tables (corpus.md)

const tickRates: Record<string, number> = {};
for (const [name, hits] of tableAfter(section('Tick rate'), 'Here is how often each spell can hit per second:')) {
  if (Number.isNaN(Number(hits))) continue; // header row
  const id = spellIdByName[norm(name)];
  if (!id) throw new Error(`Tick rate table: unknown spell ${name}`);
  tickRates[id] = Number(hits);
}

const duetFactors: Record<string, number> = {};
for (const [namesCell, factor] of tableAfter(section('Duet'), 'Here is table of how Duet will affect various spells:')) {
  if (Number.isNaN(Number(factor)) || namesCell.startsWith('Any spell')) continue; // header / default row
  for (const name of namesCell.split(',')) {
    const id = spellIdByName[norm(name)];
    if (!id) throw new Error(`Duet table: unknown spell ${name}`);
    duetFactors[id] = Number(factor);
  }
}

const TRIGGER_KIND: Record<string, TriggerKind> = {
  duet: 'duet',
  fuse: 'fuse',
  echo: 'echo',
  serial: 'serial',
  dazzlingfireworks: 'fireworks',
  twine: 'twine',
  arcanenova: 'nova',
  autonomousgrimoire: 'grimoire',
};
const triggers: Record<string, TriggerKind> = {};
for (const name of bulletsAfter(section('Trigger spells'), 'List of Trigger spells:')) {
  const kind = TRIGGER_KIND[norm(name)];
  if (!kind) throw new Error(`Trigger spells: no TriggerKind for ${name}`);
  const id = spellIdByName[norm(name)];
  if (id) triggers[id] = kind; // Twine has no stats page / id yet
}

// ---------------------------------------------------------------- spells

const SPELL_TYPE: Record<string, SpellType> = {
  'Spell Projectiles': 'Projectile',
  'Spell Summon': 'Summon',
  'Spell Boost': 'Boost',
  'Spell Passive': 'Passive',
};

interface WikiSpell {
  name: string;
  rarity?: string;
  type?: string;
  page?: string;
  levels?: Record<string, string>;
  infobox?: Record<string, string>;
}

const wikiSpells: Record<string, WikiSpell> = {};
for (const s of readJson<WikiSpell[]>('wiki/data/spells.json')) wikiSpells[norm(s.name)] = s;
// 'Spell Absorption' is the level table of Mana Absorption under its in-game name.
{
  const absorb = wikiSpells[norm('Spell Absorption')];
  const mana = wikiSpells[norm('Mana Absorption')];
  wikiSpells[norm('Mana Absorption')] = { ...mana, levels: { ...absorb.levels, ...mana.levels } };
}

/** Per-level text: misc_* fields (specific values) first, then the level description (may hold placeholders). */
function levelTexts(ws: WikiSpell): Lv3<string> {
  const ib = ws.infobox ?? {};
  const out: Lv3<string> = ['', '', ''];
  for (let l = 1; l <= 3; l++) {
    const misc = Object.keys(ib)
      .filter((k) => new RegExp(`^misc_[a-z]_${l}$`).test(k))
      .sort()
      .map((k) => ib[k]);
    out[l - 1] = misc.join('\n');
  }
  for (const [key, text] of Object.entries(ws.levels ?? {})) {
    for (const digit of key.match(/[123]/g) ?? []) out[Number(digit) - 1] += `\n${text}`;
  }
  return out;
}

const designSpells: string[] = [];

function buildSpell({ id, wikiName }: IdEntry): SpellDef {
  const ws = wikiSpells[norm(wikiName)];
  if (!ws) throw new Error(`spells.json: no entry for ${wikiName}`);
  const ib = ws.infobox ?? {};
  const type = SPELL_TYPE[ib.type ?? ws.type ?? ''];
  if (!type) throw new Error(`${id}: unknown spell type`);
  // Page category rarity agrees with the wiki's per-level spell table; infoboxes are stale for Meteor/Reflection.
  const rarity = (ws.rarity ?? ib.rarity) as Rarity;
  const texts = levelTexts(ws);
  const allText = [...texts, ws.page ?? '', sections.get(norm(wikiName)) ?? ''].join('\n');
  const d = design.spells[id] ?? {};
  const isSet = design.setSpells.includes(id);
  const reasons: string[] = [];

  const upgrade: SpellDef['upgrade'] = /Enemy-Killing upgrade/.test(allText)
    ? 'kills'
    : /unable to craft/i.test(allText) || rarity === 'Unique' || isSet
      ? 'none'
      : 'craft';
  const reachable = upgrade !== 'none';
  const lv = (key: string, keep: (raw: string) => boolean = () => true): MaybeLv3 =>
    [1, 2, 3].map((l) => {
      const raw = ib[`${key}${l}`];
      return raw != null && keep(raw.trim()) ? parseStat(raw) : undefined;
    }) as MaybeLv3;
  const filled = (field: string, vals: MaybeLv3): Lv3<number> =>
    fill(vals, reachable, () => reasons.includes(field) || reasons.push(field));

  const combat = type === 'Projectile' || type === 'Summon';
  const none: MaybeLv3 = [undefined, undefined, undefined];
  const unsigned = (raw: string) => !/^[+\-x]/i.test(raw);
  const shotsRaw = combat ? lv('number_of_shots') : none;
  const num: Record<NumField, Lv3<number>> = {
    mana: filled('mana', combat ? lv('mana_cost') : none),
    damage: filled('damage', lv('dmg')),
    crit: filled('crit', lv('crit_rate', unsigned)),
    radius: filled('radius', lv('effect_radius')),
    shots: shotsRaw.every((v) => v === undefined) ? (combat ? [1, 1, 1] : [0, 0, 0]) : filled('shots', shotsRaw),
    scatter: filled('scatter', combat ? lv('scatter') : none),
    pierce: filled('pierce', combat ? lv('spell_penetration') : none),
    cdAdd: filled('cdAdd', combat ? lv('cd') : none),
    intervalAdd: filled('intervalAdd', combat ? lv('cast_interval') : none),
    hp: filled('hp', lv('hp')),
    summonLimit: filled('summonLimit', lv('summon_limit')),
  };

  // Mods (and '$field' extras) from effect text.
  const spec = MOD_SPECS[id];
  let mods: Lv3<SpellMods> | null = type === 'Boost' || type === 'Passive' ? [{}, {}, {}] : null;
  if (spec) {
    const ctx: SpecCtx = {
      ib: (key) => lv(key),
      re: (rx, scale = 1) =>
        texts.map((t) => {
          const m = rx.exec(t);
          return m ? r6(parseFloat(m[1]) * scale) : undefined;
        }) as MaybeLv3,
    };
    for (const [key, val] of Object.entries(spec(ctx))) {
      if (Array.isArray(val) && val.every((v) => v === undefined)) {
        throw new Error(`${id}: mod extractor '${key}' matched nothing in the wiki text`);
      }
      if (key.startsWith('$')) {
        const field = key.slice(1) as NumField;
        num[field] = filled(field, val as MaybeLv3);
        continue;
      }
      mods ??= [{}, {}, {}];
      const perLevel = Array.isArray(val) ? filled(`mods.${key}`, val) : [val, val, val];
      perLevel.forEach((v, i) => ((mods![i] as Record<string, unknown>)[key] = v));
    }
  }
  if (d.modsDesign) {
    mods ??= [{}, {}, {}];
    d.modsDesign.forEach((m, i) => Object.assign(mods![i], m));
    reasons.push(`modsDesign(${[...new Set(d.modsDesign.flatMap((m) => Object.keys(m)))].join(',')})`);
  }
  for (const [field, vals] of Object.entries(d.wiki ?? {})) num[field as NumField] = vals;
  for (const [field, vals] of Object.entries(d.design ?? {})) {
    num[field as NumField] = vals;
    reasons.push(`design.${field}`);
  }

  const dps = [1, 2, 3].some((l) => /\(DPS\)/i.test(ib[`dmg${l}`] ?? ''));
  let tickRate = tickRates[id] ?? 0;
  if (dps && !tickRate) {
    tickRate = design.dpsTickDefault;
    reasons.push('tickRate');
  }
  const slotMatch = /Occupied Slots:\s*(\d+)|Occupies (\d+) wand slots|takes up (\d+) slots/i.exec(allText);
  const castMode: SpellDef['castMode'] = /continuous cast/i.test(allText)
    ? 'continuous'
    : /charged cast/i.test(allText)
      ? 'charged'
      : 'instant';

  const desc = descSpells[id];
  if (!Array.isArray(desc) || desc.length !== 3) throw new Error(`data/desc/spells.json: ${id} needs 3 strings`);
  if (reasons.length) designSpells.push(`${id}: ${reasons.join(', ')}`);

  return {
    id,
    wikiName,
    name: nameOf('spells', id),
    desc: desc.map((t) => resolveTokens(t, names)) as Lv3<string>,
    type,
    rarity,
    slots: slotMatch ? Number(slotMatch[1] ?? slotMatch[2] ?? slotMatch[3]) : 1,
    castMode,
    mana: num.mana,
    damage: num.damage,
    dps,
    tickRate,
    duetFactor: duetFactors[id] ?? 1,
    crit: num.crit,
    radius: num.radius,
    speed: d.speed ?? 0,
    lifetime: d.lifetime ?? 0,
    shots: num.shots,
    scatter: num.scatter,
    pierce: num.pierce,
    cdAdd: num.cdAdd,
    intervalAdd: num.intervalAdd,
    hp: num.hp,
    summonLimit: num.summonLimit,
    trigger: triggers[id] ?? null,
    indiscriminate: /Indiscriminate Damage/i.test(texts.join('\n')),
    upgrade,
    shop: rarity !== 'Epic' && rarity !== 'Unique' && !isSet,
    mods,
    icon: `icons/spells/${id}.png`,
    src: reasons.length ? 'design' : 'wiki',
  };
}

// ---------------------------------------------------------------- wands

interface WikiWand {
  name: string;
  MP: string;
  'Cast Interval': string;
  'MP Regen': string;
  CD: string;
  passive: string;
}
const wikiWands: Record<string, WikiWand> = {};
for (const w of readJson<WikiWand[]>('wiki/data/wands.json')) wikiWands[norm(w.name)] = w;

const POST_SLOT_ON: [RegExp, PostSlotTrigger][] = [
  [/spell cast/i, 'cast'],
  [/enemy hit/i, 'hit'],
  [/every\s*enemy killed/i, 'kill'],
  [/meter/i, 'meter'],
  [/second stood still/i, 'stillSecond'],
  [/every second/i, 'second'],
  [/takes damage/i, 'damaged'],
  [/45 damage/i, 'dealt45'],
];
const WAND_FLAGS: [RegExp, WandDef['flags'][number]][] = [
  [/always cast in reverse/i, 'reverse'],
  [/fly while holding/i, 'flight'],
  [/quadrupled/i, 'quad'],
  [/random (?:base )?colou?r/i, 'randomColor'],
  [/self-inflicted DMG to 1%/i, 'selfDmg1pct'],
  [/use of MP from this wand/i, 'mpBackup'],
  [/chance of immediately replenishing MP/i, 'regenReplenish'],
  [/reversed recoil/i, 'reverseRecoil'],
  [/no recoil while standing/i, 'noRecoilStill'],
];

const designWands: string[] = [];

function buildWand({ id, wikiName }: IdEntry): WandDef {
  const w = wikiWands[norm(wikiName)];
  if (!w) throw new Error(`wands.json: no entry for ${wikiName}`);
  const p = w.passive ?? '';
  const pct = (rx: RegExp): number | undefined => {
    const m = rx.exec(p);
    return m ? r6(Number(m[1]) / 100) : undefined;
  };
  const scatter = [...p.matchAll(/Scatter:\s*([+-]?\d+(?:\.\d+)?)°/g)].reduce((sum, m) => sum + Number(m[1]), 0);
  const simul = /Simultaneous (?:Firing|Casting):\s*(\d+)/i.exec(p);

  const global: NonNullable<WandDef['global']> = {};
  const gMp = pct(/MP consumption for all wands x(\d+)%/i);
  if (gMp !== undefined) global.mpMult = gMp;
  const gRegen = /MP regeneration for all wands \+(\d+(?:\.\d+)?)/i.exec(p);
  if (gRegen) global.regenAdd = Number(gRegen[1]);
  const gMax = pct(/Max MP for all wands:\s*x(\d+)%/i);
  if (gMax !== undefined) global.maxMpMult = gMax;
  const gRad = pct(/effect radius for all wands by (\d+)%/i);
  if (gRad !== undefined) global.radiusMult = r6(1 + gRad);

  const held = pct(/When holding this wand, mp regen x(\d+)%/i);
  const stowed = pct(/When not holding this wand, mp regen x(\d+)%/i);
  let postSlot: WandDef['postSlot'] = null;
  const ps = /Post Slot:.*?charge\s+([\d.]+)\s+energy\s*(.*)/i.exec(p);
  if (ps) {
    const on = POST_SLOT_ON.find(([rx]) => rx.test(ps[2]))?.[1];
    if (on) postSlot = { on, energy: Number(ps[1]) };
  }
  const move = pct(/Movement Speed is increased by (\d+)%/i);
  const mp = Number(w.MP);

  const wand: WandDef = {
    id,
    wikiName,
    name: nameOf('wands', id),
    desc: '',
    tier: 1,
    mp,
    regen: parseFloat(w['MP Regen']),
    interval: Number(w['Cast Interval']),
    cd: Number(w.CD),
    slots: 0,
    scatter,
    simul: simul ? Number(simul[1]) : 1,
    finalMult: pct(/Final (?:DMG|Damage):\s*x(\d+)%/i) ?? 1,
    mpMult: pct(/MP Cost:\s*x(\d+)%/i) ?? 1,
    crit: pct(/CRIT Rate:\s*\+(\d+)%/i) ?? 0,
    global: Object.keys(global).length ? global : null,
    heldRegen: held !== undefined && stowed !== undefined ? [held, stowed] : null,
    postSlot,
    moveSpeedMult: move !== undefined ? r6(1 + move) : 1,
    flags: WAND_FLAGS.filter(([rx]) => rx.test(p)).map(([, f]) => f),
    sprite: `wands/${id}.png`,
    src: 'wiki',
  };
  if (/Post Slot/i.test(p) && !postSlot && !design.wands[id]?.postSlot) {
    throw new Error(`${id}: unparsed post-slot text needs a design.json override: ${p}`);
  }
  const override = design.wands[id];
  if (override) {
    Object.assign(wand, override);
    wand.src = 'design';
    designWands.push(`${id}: ${Object.keys(override).join(', ') || 'truncated passive (no field)'}`);
  }
  wand.slots = design.wandSlots[id] ?? design.wandSlotBands.find(([max]) => wand.mp <= max)![1];
  wand.tier = (design.wandTierBands.find(([max]) => wand.mp <= max)?.[1] ?? 5) as WandDef['tier'];
  const desc = descWands[id];
  if (!desc) throw new Error(`data/desc/wands.json: missing ${id}`);
  wand.desc = resolveTokens(desc, names);
  return wand;
}

// ---------------------------------------------------------------- relics

interface WikiRelic {
  'Relic Name': string;
  Rarity: string;
  'Max Level': string;
  Effect: string;
}
const wikiRelics: Record<string, WikiRelic> = {};
for (const r of readJson<WikiRelic[]>('wiki/data/relics.json')) wikiRelics[norm(r['Relic Name'])] = r;
/** Wiki spelling errors in relics.json 'Relic Name'. */
const RELIC_ALIASES: Record<string, string> = { berserker: 'berseker' };

const SERIES: Record<string, NonNullable<RelicDef['series']>> = {
  knight: 'Knight',
  soulbone: 'SoulBone',
  goldrush: 'GoldRush',
  merlin: 'Merlin',
  treespirit: 'TreeSpirit',
};
const seriesByRelic: Record<string, NonNullable<RelicDef['series']>> = {};
for (const s of readJson<{ 'Series Name': string; 'Series Parts': string }[]>('wiki/data/relic_series.json')) {
  const series = SERIES[norm(s['Series Name'].replace(/series/i, ''))];
  if (!series) throw new Error(`relic_series.json: unknown series ${s['Series Name']}`);
  for (const part of s['Series Parts'].split('\n')) seriesByRelic[norm(part)] = series;
}

const designRelics: string[] = [];

function buildRelic({ id, wikiName }: IdEntry): RelicDef {
  const r = wikiRelics[norm(wikiName)] ?? wikiRelics[RELIC_ALIASES[norm(wikiName)]];
  if (!r) throw new Error(`relics.json: no entry for ${wikiName}`);
  const reasons: string[] = [];
  const rawMax = r['Max Level'].trim();
  // '-' = unbounded (Mystical Artifact); 99 is our cap.
  const maxLevel = rawMax === '-' ? 99 : Number(rawMax);
  let rarity = r.Rarity.trim() as Rarity;
  if (!rarity) {
    rarity = 'Unique'; // Mystical Artifact: special grant, never in the drop pool
    reasons.push('rarity');
  }
  const noted = /Part of the (.+?) Series/i.exec(r.Effect);
  const series = seriesByRelic[norm(wikiName)] ?? (noted ? SERIES[norm(noted[1])] : undefined) ?? null;
  if (noted && SERIES[norm(noted[1])] !== series) throw new Error(`${id}: series note/list disagree`);
  const cost = /Costs -(\d+) Health/i.exec(r.Effect);

  let desc = descRelics[id];
  if (!Array.isArray(desc)) throw new Error(`data/desc/relics.json: missing ${id}`);
  if (desc.length === 1 && maxLevel > 1 && desc[0].includes('{lv}')) {
    desc = Array.from({ length: maxLevel }, (_, i) => desc[0].replaceAll('{lv}', String(i + 1)));
  }
  if (descRelics._designScaled.includes(id)) reasons.push('per-level scaling');
  if (reasons.length) designRelics.push(`${id}: ${reasons.join(', ')}`);
  return {
    id,
    wikiName,
    name: nameOf('relics', id),
    desc: desc.map((t) => resolveTokens(t, names)),
    rarity,
    maxLevel,
    series,
    crimsonCost: cost ? Number(cost[1]) : null,
    setOnly: rarity === 'Unique',
    icon: `icons/relics/${id}.png`,
    src: reasons.length ? 'design' : 'wiki',
  };
}

// ---------------------------------------------------------------- curses

const wikiCurses: Record<string, { Name: string; 'Rarity level': string; 'Curse description': string }> = {};
for (const c of readJson<(typeof wikiCurses)[string][]>('wiki/data/curses.json')) wikiCurses[norm(c.Name)] = c;

function buildCurse({ id, wikiName }: IdEntry): CurseDef {
  const c = wikiCurses[norm(wikiName)];
  if (!c) throw new Error(`curses.json: no entry for ${wikiName}`);
  const params = design.curses[id];
  if (!params) throw new Error(`data/design.json: curses.${id} missing`);
  const placeholders = new Set(c['Curse description'].match(/(?:int|float)\d\b/g) ?? []);
  if (placeholders.size !== params.length) {
    throw new Error(`${id}: wiki has ${placeholders.size} placeholder(s), design gives ${params.length} param(s)`);
  }
  const template = descCurses[id];
  if (!template) throw new Error(`data/desc/curses.json: missing ${id}`);
  const used = new Set<number>();
  const desc = template.replace(/\{(\d+)\}/g, (_, i: string) => {
    if (params[Number(i)] === undefined) throw new Error(`${id}: desc uses {${i}} but has ${params.length} params`);
    used.add(Number(i));
    return String(params[Number(i)]);
  });
  if (used.size !== params.length) throw new Error(`${id}: desc does not show every param`);
  return {
    id,
    wikiName,
    name: nameOf('curses', id),
    desc: resolveTokens(desc, names),
    rarity: c['Rarity level'].trim() as CurseDef['rarity'],
    params,
    icon: `icons/curses/${id}.png`,
    src: params.length ? 'design' : 'wiki',
  };
}

// ---------------------------------------------------------------- potions

const wikiPotions: Record<string, { Name: string; Effect: string }> = {};
for (const p of readJson<(typeof wikiPotions)[string][]>('wiki/data/potions.json')) wikiPotions[norm(p.Name)] = p;

function buildPotion({ id, wikiName }: IdEntry): PotionDef {
  const p = wikiPotions[norm(wikiName)];
  if (!p) throw new Error(`potions.json: no entry for ${wikiName}`);
  const duration = design.potions[id] ?? 'instant';
  let seconds = 0;
  if (duration === 'timed') {
    const m = /(\d+) sec/.exec(p.Effect);
    if (!m) throw new Error(`${id}: timed potion without seconds in wiki text`);
    seconds = Number(m[1]);
  }
  const template = descPotions[id];
  if (!template) throw new Error(`data/desc/potions.json: missing ${id}`);
  if (template.includes('{s}') !== (duration === 'timed')) throw new Error(`${id}: {s} must appear iff timed`);
  return {
    id,
    wikiName,
    name: nameOf('potions', id),
    desc: resolveTokens(template.replaceAll('{s}', String(seconds)), names),
    duration,
    seconds,
    icon: `icons/potions/${id}.png`,
    src: 'wiki',
  };
}

// ---------------------------------------------------------------- validate + write

function checkNames(): void {
  S.Names.parse(names);
  for (const [group, groupNames] of Object.entries(names)) {
    const seen = new Set<string>();
    for (const [id, n] of Object.entries(groupNames)) {
      if (seen.has(n.toLowerCase())) throw new Error(`names.${group}: duplicate name '${n}' (${id})`);
      seen.add(n.toLowerCase());
    }
  }
  for (const group of Object.keys(ids) as Group[]) {
    const want = ids[group].map((e) => e.id).sort();
    const have = Object.keys(names[group]).sort();
    if (want.join() !== have.join()) throw new Error(`names.${group}: id set differs from ids.json`);
    for (const e of ids[group]) {
      if (norm(names[group][e.id]) === norm(e.wikiName)) throw new Error(`names.${group}.${e.id} equals the wiki name`);
    }
  }
}

function checkOrder<T extends { id: string }>(group: Group, rows: T[]): T[] {
  const want = ids[group].map((e) => e.id).join();
  if (rows.map((r) => r.id).join() !== want) throw new Error(`${group}: ids/order differ from ids.json`);
  return rows;
}

checkNames();
const out = {
  spells: checkOrder('spells', z.array(S.SpellDef).parse(ids.spells.map(buildSpell)) as SpellDef[]),
  wands: checkOrder('wands', z.array(S.WandDef).parse(ids.wands.map(buildWand)) as WandDef[]),
  relics: checkOrder('relics', z.array(S.RelicDef).parse(ids.relics.map(buildRelic)) as RelicDef[]),
  curses: checkOrder('curses', z.array(S.CurseDef).parse(ids.curses.map(buildCurse)) as CurseDef[]),
  potions: checkOrder('potions', z.array(S.PotionDef).parse(ids.potions.map(buildPotion)) as PotionDef[]),
};

const outDir = resolve(ROOT, 'public/data');
mkdirSync(outDir, { recursive: true });
for (const [group, rows] of Object.entries(out)) {
  writeFileSync(resolve(outDir, `${group}.json`), `${JSON.stringify(rows, null, 2)}\n`);
}
writeFileSync(resolve(outDir, 'names.json'), `${JSON.stringify(names, null, 2)}\n`);

console.log(
  `build-data: ${Object.entries(out)
    .map(([g, rows]) => `${g} ${rows.length}`)
    .join(', ')} → public/data (+ names.json)`,
);
console.log(`design spells (${designSpells.length}):\n  ${designSpells.join('\n  ')}`);
console.log(`design wands (${designWands.length}):\n  ${designWands.join('\n  ')}`);
console.log(`design relics (${designRelics.length}): ${designRelics.map((s) => s.split(':')[0]).join(', ')}`);
console.log(`design curses: ${out.curses.filter((c) => c.src === 'design').length}/${out.curses.length}`);
