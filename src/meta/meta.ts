/**
 * Camp progression tables. Costs/levels follow the wiki pages for the camp NPCs (wiki/corpus.md: Vivian, Lyon, Lilian,
 * Gina, Leah, Soul Set); labels and descriptions are our own wording.
 */
import type { Save } from './save';

export interface Tiered {
  id: string;
  label: string;
  /** What each level does, for the description line. */
  effect: string;
  /** Cost of each successive level (Crystals for Vivian, Old Blood for Lyon). */
  costs: number[];
  /** Effect value at each level. */
  values: number[];
}

/** Vivian: talents. Tier 0 is open; higher tiers are unlocked once with Old Blood (5 / 20 / 40 / 60). */
export const VIVIAN_TIERS = [0, 5, 20, 40, 60];
export const VIVIAN: (Tiered & { tier: number })[] = [
  { id: 'hands', tier: 0, label: 'Extra wand hands', effect: '+{v} wand slot(s)', costs: [1, 200, 900], values: [1, 2, 3] },
  { id: 'pack', tier: 0, label: 'Deeper backpack', effect: '+{v} backpack slot(s)', costs: [6, 12, 21, 33, 48, 66, 87, 111, 138, 168], values: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] },
  { id: 'entry', tier: 0, label: 'Doorway mending', effect: 'Heal {v} HP on each room entry', costs: [15, 60, 240], values: [2, 4, 6] },
  { id: 'hp', tier: 1, label: 'Sturdy body', effect: '+{v} max HP', costs: [8, 17, 29, 44, 62, 83, 107, 134, 164, 197, 233, 272], values: [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60] },
  { id: 'hproom', tier: 1, label: 'Better remedies', effect: '+{v} HP from health rooms', costs: [20, 40, 80, 140, 220], values: [3, 6, 9, 12, 15] },
  { id: 'coins', tier: 2, label: 'Fatter purse', effect: '+{v} starting coins', costs: [9, 18, 30, 45, 63, 84, 108, 135, 165, 198, 234, 273], values: [7, 14, 21, 28, 35, 42, 49, 56, 63, 70, 77, 84] },
  { id: 'coinroom', tier: 2, label: 'Golden hauls', effect: '+{v}% gold-room coins', costs: [18, 36, 72, 144, 288, 576], values: [10, 20, 30, 40, 50, 60] },
  { id: 'relicrare', tier: 3, label: 'Relic seeker', effect: 'Rare relic odds x{v}%', costs: [24, 60, 150, 375], values: [125, 150, 175, 200] },
  { id: 'spellrare', tier: 3, label: 'Spell seeker', effect: 'Rare spell odds x{v}%', costs: [24, 60, 150, 375], values: [125, 150, 175, 200] },
  { id: 'mp', tier: 4, label: 'Deep wells', effect: '+{v} max MP on every wand', costs: [30, 60, 100, 150, 210, 280, 360, 450, 550, 660], values: [10, 20, 30, 40, 50, 60, 70, 80, 90, 100] },
  { id: 'regen', tier: 4, label: 'Quick springs', effect: '+{v} MP regen on every wand', costs: [60, 120, 200, 300, 420], values: [1, 2, 3, 4, 5] },
];

/** Lyon: research, paid in Old Blood. */
export const LYON: Tiered[] = [
  { id: 'spring', label: 'Hidden springs', effect: 'Fountains heal {v}% HP', costs: [1, 10], values: [50, 80] },
  { id: 'bandolier', label: 'Potion bandolier', effect: '+{v} potion slot(s)', costs: [6, 18, 56], values: [1, 2, 3] },
  { id: 'refill', label: 'Shop restock', effect: 'Shops restock up to {v} times', costs: [2, 7, 24, 72], values: [2, 4, 6, 8] },
  { id: 'anvil', label: 'Reinforced forge', effect: 'Forge rerolls cost {v}% less', costs: [5, 15], values: [30, 60] },
  { id: 'keychain', label: 'Key ring', effect: 'Start each run with {v} key(s)', costs: [4, 12, 48], values: [1, 2, 3] },
  { id: 'berries', label: 'Berry bushes', effect: 'Forest rooms sometimes grow healing berries', costs: [3], values: [1] },
  { id: 'vault', label: 'Treasure vaults', effect: 'Purgatory rooms sometimes hide a chest', costs: [5], values: [1] },
  { id: 'codex', label: 'Field notes', effect: 'Shows every foe\'s HP bar and numbers from the start', costs: [3], values: [1] },
];

export interface Pack {
  id: string;
  label: string;
  cost: number;
  spells: string[];
  relics: string[];
  focus?: boolean;
}

/** Lilian: activating a pack adds its items to the reward pool (they are locked out until then). Paid in Chaotic Cores. */
export const LILIAN: Pack[] = [
  { id: 'focus', label: 'Spell focus', cost: 1, spells: [], relics: [], focus: true },
  { id: 'elemental', label: 'Elemental pack', cost: 1, spells: ['high_pressure_stream', 'core_of_thunder', 'core_of_flame'], relics: [] },
  { id: 'supply', label: 'Supply pack', cost: 1, spells: ['evil_slayer_sword', 'boomerang_blade', 'capacity_expansion_stone'], relics: [] },
  { id: 'trigger', label: 'Trigger pack', cost: 1, spells: ['duet', 'dazzling_fireworks', 'serial', 'echo'], relics: [] },
  { id: 'relic', label: 'Relic pack', cost: 2, spells: [], relics: ['lucky_bunny_ear', 'octagonal_die'] },
  { id: 'channel', label: 'Channeling pack', cost: 3, spells: ['shining_star_arrow', 'condensed_water_bubble', 'fierce_dragon_breath'], relics: [] },
  { id: 'summoner', label: 'Master summoner pack', cost: 4, spells: ['cadaver_explosion', 'indomitability', 'essence_of_soul', 'fusion_summon'], relics: [] },
  { id: 'inspiration', label: 'Inspiration pack', cost: 3, spells: ['reflection', 'sword_of_judgement', 'arcane_barrier'], relics: [] },
];

export const GINA_FREE = 5;
export const GINA_MAX = 20;
/** Cost of the n-th disabled spell (1-based): the first five are free, then 10 * (n - 5) Crystals. */
export const ginaCost = (n: number) => (n <= GINA_FREE ? 0 : 10 * (n - GINA_FREE));

export const level = (s: Record<string, number>, id: string) => s[id] ?? 0;
export const valueAt = (t: Tiered, lv: number) => (lv > 0 ? t.values[lv - 1] : 0);

export interface MetaBonuses {
  maxHp: number;
  maxMp: number;
  regen: number;
  wands: number;
  backpack: number;
  entryHeal: number;
  hpRoom: number;
  startCoins: number;
  coinRoomPct: number;
  relicRare: number;
  spellRare: number;
  potionSlots: number;
  springPct: number;
  refills: number;
  anvilDiscount: number;
  keys: number;
  berries: boolean;
  vault: boolean;
  showHp: boolean;
}

export function bonuses(save: Save): MetaBonuses {
  const v = (id: string) => {
    const t = VIVIAN.find((x) => x.id === id)!;
    return valueAt(t, level(save.vivian, id));
  };
  const l = (id: string) => {
    const t = LYON.find((x) => x.id === id)!;
    return valueAt(t, level(save.lyon, id));
  };
  return {
    maxHp: v('hp'), maxMp: v('mp'), regen: v('regen'), wands: v('hands'), backpack: v('pack'), entryHeal: v('entry'),
    hpRoom: v('hproom'), startCoins: v('coins'), coinRoomPct: v('coinroom'), relicRare: v('relicrare') || 100,
    spellRare: v('spellrare') || 100, potionSlots: l('bandolier'), springPct: l('spring') || 30, refills: l('refill'),
    anvilDiscount: l('anvil'), keys: l('keychain'), berries: l('berries') > 0, vault: l('vault') > 0, showHp: l('codex') > 0,
  };
}

export interface AchievementDef {
  id: string;
  name: string;
  desc: string;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'launch', name: 'First Steps', desc: 'Launch the game' },
  { id: 'kingdom', name: 'Cursed Crown', desc: 'Carry 15 curses at once' },
  { id: 'twostar', name: 'Twice Refined', desc: 'Get a two-star spell' },
  { id: 'epic', name: 'Jackpot', desc: 'Get an epic spell' },
  { id: 'special', name: 'Oddity', desc: 'Get a special (unique) spell' },
  { id: 'easy', name: 'Warm-up', desc: 'Finish Easy mode' },
  { id: 'normal', name: 'Getting Serious', desc: 'Finish Normal mode' },
  { id: 'hard', name: 'Hardened', desc: 'Finish Hard mode' },
  { id: 'nm1', name: 'Nightmare I', desc: 'Finish Nightmare mode' },
  { id: 'nm2', name: 'Nightmare II', desc: 'Finish Nightmare 2 mode' },
  { id: 'nm3', name: 'Nightmare III', desc: 'Finish Nightmare 3 mode' },
  { id: 'coins', name: 'Small Fortune', desc: 'Hold 1000 coins' },
  { id: 'dps', name: 'Firepower Theory', desc: 'Reach 100,000 DPS on the training dummy' },
  { id: 'friendly', name: 'Friendly Fire', desc: 'Die to your own indiscriminate spell' },
  { id: 'author', name: 'Fourth Wall', desc: 'Defeat the Scribe' },
];

export const DIFFICULTY_NAMES = ['Easy', 'Normal', 'Hard', 'Nightmare', 'Nightmare 2', 'Nightmare 3'];
export const DIFFICULTY_ACH = ['easy', 'normal', 'hard', 'nm1', 'nm2', 'nm3'];
