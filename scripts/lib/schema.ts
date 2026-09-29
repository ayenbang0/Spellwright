/**
 * zod mirrors of `src/data/types.ts`. Objects are `.strict()` so any drift between the build output and the
 * runtime types (extra or misspelled keys) fails validation. Keep in lock-step with types.ts.
 */
import { z } from 'zod';

const num = z.number().finite();
const lv3 = <T extends z.ZodTypeAny>(t: T) => z.tuple([t, t, t]);

export const Rarity = z.enum(['Normal', 'Rare', 'Epic', 'Unique']);
export const Src = z.enum(['wiki', 'external', 'design']);
export const SpellType = z.enum(['Projectile', 'Summon', 'Boost', 'Passive']);
export const Element = z.enum(['fire', 'frost', 'venom', 'thunder', 'slime']);
export const TriggerKind = z.enum(['duet', 'fuse', 'echo', 'serial', 'fireworks', 'twine', 'nova', 'grimoire']);

export const SpellMods = z
  .object({
    dmgAdd: num,
    dmgMult: num,
    finalMult: num,
    mpMult: num,
    speedAdd: num,
    durationAdd: num,
    durationMult: num,
    radiusMult: num,
    pierceAdd: num,
    reboundAdd: num,
    reflectAdd: num,
    critAdd: num,
    scatterAdd: num,
    simulAdd: num,
    volleyDiscount: num,
    multicast: num,
    split: num,
    splitDmg: num,
    element: Element,
    elementPower: num,
    elementDuration: num,
    thunderDmg: num,
    trajectory: z.enum(['track', 'homing', 'orbit']),
    homingDeg: num,
    orbitRadius: num,
    hover: num,
    cdMult: num,
    cdAdd: num,
    intervalAdd: num,
    maxMpMult: num,
    maxMpAdd: num,
    regenAdd: num,
    regenMult: num,
    slotsAdd: num,
    chainDmg: num,
    summonHpMult: num,
    summonRegen: num,
    summonSpeedMult: num,
    summonDrain: num,
    count: num,
    speedMult: num,
    sizeMult: num,
    threshold: num,
    summonAfterlife: num,
    cordDps: num,
    chance: num,
    freeChance: num,
  })
  .partial()
  .strict();

export const SpellDef = z
  .object({
    id: z.string(),
    wikiName: z.string(),
    name: z.string().min(1),
    desc: lv3(z.string().min(1)),
    type: SpellType,
    rarity: Rarity,
    slots: z.number().int().min(1),
    castMode: z.enum(['instant', 'continuous', 'charged']),
    mana: lv3(num),
    damage: lv3(num),
    dps: z.boolean(),
    tickRate: num,
    duetFactor: num,
    crit: lv3(num),
    radius: lv3(num),
    speed: num,
    lifetime: num,
    shots: lv3(num),
    scatter: lv3(num),
    pierce: lv3(num),
    cdAdd: lv3(num),
    intervalAdd: lv3(num),
    hp: lv3(num),
    summonLimit: lv3(num),
    trigger: TriggerKind.nullable(),
    indiscriminate: z.boolean(),
    upgrade: z.enum(['craft', 'kills', 'none']),
    shop: z.boolean(),
    mods: lv3(SpellMods).nullable(),
    icon: z.string(),
    src: Src,
  })
  .strict();

export const PostSlotTrigger = z.enum(['cast', 'hit', 'kill', 'meter', 'second', 'stillSecond', 'damaged', 'dealt45']);
export const WandFlag = z.enum([
  'reverse',
  'flight',
  'quad',
  'randomColor',
  'selfDmg1pct',
  'mpBackup',
  'regenReplenish',
  'reverseRecoil',
  'noRecoilStill',
]);

export const WandDef = z
  .object({
    id: z.string(),
    wikiName: z.string(),
    name: z.string().min(1),
    desc: z.string().min(1),
    tier: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
    mp: num,
    regen: num,
    interval: num,
    cd: num,
    slots: z.number().int().min(1),
    scatter: num,
    simul: z.number().int().min(1),
    finalMult: num,
    mpMult: num,
    crit: num,
    global: z
      .object({ mpMult: num, regenAdd: num, maxMpMult: num, radiusMult: num })
      .partial()
      .strict()
      .nullable(),
    heldRegen: z.tuple([num, num]).nullable(),
    postSlot: z.object({ on: PostSlotTrigger, energy: num }).strict().nullable(),
    moveSpeedMult: num,
    flags: z.array(WandFlag),
    sprite: z.string(),
    src: Src,
  })
  .strict();

export const RelicDef = z
  .object({
    id: z.string(),
    wikiName: z.string(),
    name: z.string().min(1),
    desc: z.array(z.string().min(1)).min(1),
    rarity: Rarity,
    maxLevel: z.number().int().min(1),
    series: z.enum(['Knight', 'SoulBone', 'GoldRush', 'Merlin', 'TreeSpirit']).nullable(),
    crimsonCost: num.nullable(),
    setOnly: z.boolean(),
    icon: z.string(),
    src: Src,
  })
  .strict()
  .refine((r) => r.desc.length === r.maxLevel, { message: 'desc length must equal maxLevel' });

export const CurseDef = z
  .object({
    id: z.string(),
    wikiName: z.string(),
    name: z.string().min(1),
    desc: z.string().min(1),
    rarity: z.enum(['Normal', 'Rare']),
    params: z.array(num),
    icon: z.string(),
    src: Src,
  })
  .strict();

export const PotionDef = z
  .object({
    id: z.string(),
    wikiName: z.string(),
    name: z.string().min(1),
    desc: z.string().min(1),
    duration: z.enum(['instant', 'timed', 'untilDoor', 'permanentRun']),
    seconds: num,
    icon: z.string(),
    src: Src,
  })
  .strict();

const nameMap = z.record(z.string(), z.string().min(1).max(18));
export const Names = z
  .object({
    spells: nameMap,
    wands: nameMap,
    relics: nameMap,
    curses: nameMap,
    potions: nameMap,
    bosses: nameMap,
    npcs: nameMap,
    sets: nameMap,
  })
  .strict();
