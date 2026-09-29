/**
 * Runtime content schema. `scripts/build-data.ts` writes `public/data/*.json` in exactly this shape
 * from `wiki/data/*.json` (+ design values), and the game reads only these files.
 * Units: 1 m = 1 tile = 16 source px. Time in seconds. Percentages as fractions (0.25 = 25%).
 */
export type Rarity = 'Normal' | 'Rare' | 'Epic' | 'Unique';
export type Lv3<T> = [T, T, T];
/** Provenance of tunable numbers: wiki = magicraft.fandom.com, external = outside knowledge, design = ours. */
export type Src = 'wiki' | 'external' | 'design';
export type SpellType = 'Projectile' | 'Summon' | 'Boost' | 'Passive';
export type Element = 'fire' | 'frost' | 'venom' | 'thunder' | 'slime';
export type TriggerKind = 'duet' | 'fuse' | 'echo' | 'serial' | 'fireworks' | 'twine' | 'nova' | 'grimoire';

/** Modifier values applied by Boost/Passive spells. All optional; absent = no effect. */
export interface SpellMods {
  dmgAdd?: number;        // additive spell damage multiplier bucket (+0.25 = +25%)
  dmgMult?: number;       // multiplicative spell damage (Reflection 0.8, Energy Saving 0.75)
  finalMult?: number;     // multiplicative final damage (Capacity Expansion Stone 0.75)
  mpMult?: number;        // multiply MP cost of affected spells
  speedAdd?: number;      // m/s flight speed
  durationAdd?: number;   // s lifetime
  durationMult?: number;
  radiusMult?: number;    // 1.3 = +30%
  pierceAdd?: number;
  reboundAdd?: number;
  reflectAdd?: number;    // bounces to nearest enemy
  critAdd?: number;
  scatterAdd?: number;    // degrees (negative tightens)
  simulAdd?: number;      // simultaneous casting (Volley)
  volleyDiscount?: number;// MP multiplier per extra simultaneous spell (Volley 0.78)
  multicast?: number;     // extra copies per cast (Multi-Shot)
  split?: number;         // copies on completion (Split)
  splitDmg?: number;      // damage per split copy (0.33)
  element?: Element;
  elementPower?: number;  // venom stacks / freeze seconds / slow fraction / thunder chance / burn dps
  elementDuration?: number;
  thunderDmg?: number;    // Core of Thunder extra damage fraction
  trajectory?: 'track' | 'homing' | 'orbit';
  homingDeg?: number;     // deg per meter
  orbitRadius?: number;
  hover?: number;         // s hover at completion
  cdMult?: number;
  cdAdd?: number;
  intervalAdd?: number;
  maxMpMult?: number;
  maxMpAdd?: number;
  regenAdd?: number;
  regenMult?: number;
  slotsAdd?: number;
  chainDmg?: number;      // Chain of Lightning damage between simultaneous spells
  // summon modifiers
  summonHpMult?: number;
  summonRegen?: number;
  summonSpeedMult?: number;
  summonDrain?: number;
  // id-keyed specials
  count?: number;         // Strong Traction pulls, Parasite spawns, Charge Mode max stacks
  speedMult?: number;     // flight speed multiplier (Slime Crystal on enemy projectiles/spells)
  sizeMult?: number;      // projectile size multiplier (Enlarge Spell)
  threshold?: number;     // Cadaver Explosion HP fraction
  summonAfterlife?: number;
  cordDps?: number;
  // passive special behaviour flags (engine keyed by spell id for details)
  chance?: number;
  freeChance?: number;
}

export interface SpellDef {
  id: string;
  wikiName: string;
  name: string;               // clean-room display name
  desc: Lv3<string>;          // original text per level
  type: SpellType;
  rarity: Rarity;
  slots: number;              // wand slots occupied
  castMode: 'instant' | 'continuous' | 'charged';
  mana: Lv3<number>;          // per cast (continuous: per second)
  damage: Lv3<number>;        // per hit (dps spells: per second)
  dps: boolean;
  tickRate: number;           // hits per second for dps spells; 0 otherwise
  duetFactor: number;
  crit: Lv3<number>;          // base crit chance
  radius: Lv3<number>;        // m, 0 if none
  speed: number;              // m/s, design
  lifetime: number;           // s, design
  shots: Lv3<number>;         // projectiles per cast
  scatter: Lv3<number>;       // inherent spread in degrees
  pierce: Lv3<number>;
  cdAdd: Lv3<number>;
  intervalAdd: Lv3<number>;
  hp: Lv3<number>;            // summons, 0 otherwise
  summonLimit: Lv3<number>;   // summons, 0 otherwise
  trigger: TriggerKind | null;
  indiscriminate: boolean;
  upgrade: 'craft' | 'kills' | 'none';
  shop: boolean;              // may appear in shops / starting wands (not Epic/Unique)
  mods: Lv3<SpellMods> | null;// Boost/Passive only
  icon: string;               // asset path relative to assets/, e.g. "icons/spells/magic_bullet.png"
  src: Src;
}

export type PostSlotTrigger = 'cast' | 'hit' | 'kill' | 'meter' | 'second' | 'stillSecond' | 'damaged' | 'dealt45';

export interface WandDef {
  id: string;
  wikiName: string;
  name: string;
  desc: string;
  tier: 1 | 2 | 3 | 4 | 5;    // chapter band it drops in (design, from MP)
  mp: number;
  regen: number;
  interval: number;
  cd: number;
  slots: number;              // design until measured
  scatter: number;
  simul: number;
  finalMult: number;          // 1 = none
  mpMult: number;             // 1 = none
  crit: number;               // additive crit
  global: { mpMult?: number; regenAdd?: number; maxMpMult?: number; radiusMult?: number } | null;
  heldRegen: [number, number] | null; // [held multiplier, stowed multiplier]
  postSlot: { on: PostSlotTrigger; energy: number } | null;
  moveSpeedMult: number;      // 1 = none
  flags: Array<'reverse' | 'flight' | 'quad' | 'randomColor' | 'selfDmg1pct' | 'mpBackup' | 'regenReplenish' | 'reverseRecoil' | 'noRecoilStill'>;
  sprite: string;             // "wands/<id>.png"
  src: Src;
}

export interface RelicDef {
  id: string;
  wikiName: string;
  name: string;
  desc: string[];             // one entry per level
  rarity: Rarity;
  maxLevel: number;
  series: 'Knight' | 'SoulBone' | 'GoldRush' | 'Merlin' | 'TreeSpirit' | null;
  crimsonCost: number | null; // Max HP cost in the crimson room
  setOnly: boolean;           // Unique set relics never drop
  icon: string;               // "icons/relics/<id>.png"
  src: Src;
}

export interface CurseDef {
  id: string;
  wikiName: string;
  name: string;
  desc: string;               // with design params substituted
  rarity: 'Normal' | 'Rare';
  params: number[];           // design values replacing int1/float1/int2
  icon: string;               // "icons/curses/<id>.png"
  src: Src;
}

export interface PotionDef {
  id: string;
  wikiName: string;
  name: string;
  desc: string;
  duration: 'instant' | 'timed' | 'untilDoor' | 'permanentRun';
  seconds: number;            // 0 unless timed
  icon: string;               // "icons/potions/<id>.png"
  src: Src;
}

export interface ContentData {
  spells: SpellDef[];
  wands: WandDef[];
  relics: RelicDef[];
  curses: CurseDef[];
  potions: PotionDef[];
}
