/** Starting sets (wiki "Leah" page): unlock conditions and kits. Names come from public/data/names.json. */
import type { SpellInst } from './wand';

export interface SetDef {
  id: string;
  unlock: string;
  wands: { wand: string; spells: string[]; locked?: string[] }[];
  relic: { id: string; lv: number } | null;
  /** Additional spells placed in the backpack. */
  pack?: string[];
  desc: string;
}

const s = (id: string, lv = 0): SpellInst => ({ id, lv });
export const spellInst = s;

export const SETS: SetDef[] = [
  { id: 'original', unlock: 'Starting set', wands: [{ wand: 'damaged_excaliwood_wand', spells: ['magic_bullet', 'magic_bullet'] }], relic: null, desc: 'A plain wand and two bolts of mana.' },
  { id: 'magician', unlock: 'Rescue Leah (beat the first boss)', wands: [{ wand: 'arcane_staff', spells: ['arcane_explosion'] }], relic: { id: 'magicians_robe', lv: 1 }, desc: 'Cast from up to 5 m away; blasts are 30% smaller.' },
  { id: 'summoner', unlock: 'Finish chapter 2', wands: [{ wand: 'staff_of_conjuring', spells: ['pop'] }], relic: { id: 'druids_horn', lv: 1 }, desc: 'A pulsing aura hurts foes and mends allies.' },
  { id: 'dash', unlock: 'Finish chapter 3 on Hard', wands: [{ wand: 'swiftcaster_wand', spells: ['lightning_dash', 'magic_bullet'] }], relic: null, desc: 'Starts with a lightning dash.' },
  { id: 'soul', unlock: 'Fill 3 wands with a wand spirit', wands: [{ wand: 'ethereal_wand', spells: ['butterfly'], locked: ['wand_spirit'] }], relic: { id: 'mirror_of_vision', lv: 1 }, desc: 'Permanent flight; spirit-driven wands. Upgrade at Leah.' },
  { id: 'melee', unlock: 'Kill 300 foes with the great sword', wands: [{ wand: 'toy_blade', spells: ['evil_slayer_sword'] }], relic: { id: 'swordsman_cloak', lv: 1 }, desc: 'Space sprints and swings a free sword.' },
  { id: 'bian', unlock: 'Kill any boss with the judging sword', wands: [{ wand: 'the_nameless', spells: ['sword_of_judgement', 'bian_flying_sword'] }], relic: { id: 'bian', lv: 1 }, desc: 'Flying swords; Space recalls them.' },
  { id: 'reaper', unlock: 'Reach 1500 venom stacks', wands: [{ wand: 'viscous_fang', spells: ['shadow_serpent', 'venom_crystal'] }], relic: { id: 'reaper', lv: 1 }, desc: 'Double poison; auto-fuses spells between rooms.' },
  { id: 'bing', unlock: 'Unlock 6 sets', wands: [{ wand: 'arc_of_justice', spells: ['bings_arrow', 'bings_arrow', 'bings_arrow'] }], relic: { id: 'original_shape', lv: 1 }, desc: 'A bow and a bottom-first slam.' },
];

export const SET_BY_ID: Record<string, SetDef> = Object.fromEntries(SETS.map((x) => [x.id, x]));

/** Soul set upgrades (Leah): level 1 = +1 wand, 2 = +2, 3 = +3; upgrade costs from the wiki table. */
export const SOUL_UPGRADE_COST = [60, 120];
