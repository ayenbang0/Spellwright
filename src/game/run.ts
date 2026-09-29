import type { SpellInst, WandInst } from './wand';

export interface OwnedRelic {
  id: string;
  lv: number;
}

/** Everything that survives between rooms of one run (lost on death). */
export interface RunState {
  seed: number;
  setId: string;
  difficulty: number;
  chapter: number;
  /** 0-based room index inside the chapter. */
  room: number;
  hp: number;
  maxHpBonus: number;
  shield: number;
  tempShield: number;
  coins: number;
  keys: number;
  diamonds: number;
  crystals: number;
  blood: number;
  cores: number;
  wands: WandInst[];
  wandLimit: number;
  active: number;
  backpack: (SpellInst | null)[];
  relics: OwnedRelic[];
  curses: string[];
  potions: string[];
  potionSlots: number;
  kills: number;
  /** Per-spell kill counters (Adava Keravda levels up from kills). */
  spellKills: Record<string, number>;
  /** Took HP damage during the current boss fight. */
  bossHit: boolean;
  /** Permanent in-run stat changes from potions. */
  perm: { speed: number; regen: number; maxHp: number; maxMp: number; scale: number };
  /** Short-lived buffs: flight until the next door, regen boost seconds. */
  temp: { flight: boolean; regenT: number };
  time: number;
  maxDps: number;
  venomPeak: number;
  finished: boolean;
  /** Crystals / blood / cores already added to the save. */
  banked?: boolean;
}

export const ROOMS_PER_CHAPTER = 8;
export const CHAPTERS = ['forest', 'purgatory', 'void', 'abyss'] as const;
