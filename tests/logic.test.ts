import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { duetMirror, spellDamage } from '../src/game/damage';
import { applyMerge, mergeCandidates } from '../src/game/loot';
import { areaBoostCopies, deckOf, newWand, planGroup } from '../src/game/wand';
import { content } from '../scripts/sim-builds';

const parts = (over: Partial<Parameters<typeof spellDamage>[0]> = {}) => ({ base: 10, baseInc: 0, dmgAdd: 0, dmgMult: 1, mirrored: 0, finalMult: 1, condFinal: 1, bubble: 0, ...over });

describe('damage formula (wiki "Damage Calculation")', () => {
  it('adds spell-damage bonuses additively, then applies final multipliers', () => {
    // (10 * (1 + 0.25 + 0.5)) * 0.75 final
    expect(spellDamage(parts({ dmgAdd: 0.75, finalMult: 0.75 }))).toBe(Math.round(Math.round(10 * 1.75) * 0.75));
  });
  it('Reflection/Energy Saving multiply instead of adding', () => {
    expect(spellDamage(parts({ dmgAdd: 0.5, dmgMult: 0.8 }))).toBe(12);
  });
  it('Duet hands a fraction of the left spell damage to the payload, scaled per spell', () => {
    expect(duetMirror(parts({ base: 100 }), 0.6, 1)).toBe(60);
    expect(duetMirror(parts({ base: 100 }), 0.6, 0.25)).toBe(15);
  });
});

describe('cast planner', () => {
  const deck = (ids: string[]) => deckOf(ids.map((id) => ({ id, lv: 0 })), content);
  const ctx = { content, baseSimul: 1, mpMult: 1 };

  it('boosts apply to spells on their right only', () => {
    const { group } = planGroup(deck(['magic_bullet', 'dmg_enhanced', 'laser']), 0, 1, ctx);
    expect(group.items).toHaveLength(1);
    expect(group.items[0].mods.dmgAdd).toBe(0);
    const g2 = planGroup(deck(['dmg_enhanced', 'magic_bullet']), 0, 1, ctx).group;
    expect(g2.items[0].mods.dmgAdd).toBeCloseTo(0.25);
  });

  it('Volley adds simultaneous casts and discounts MP per extra spell', () => {
    const { group } = planGroup(deck(['volley', 'magic_bullet', 'magic_bullet', 'magic_bullet']), 0, 1, ctx);
    expect(group.items).toHaveLength(3);
    const base = content.spell.magic_bullet.mana[0];
    expect(group.mp).toBeCloseTo(3 * base * 0.78 ** 2);
  });

  it('Duet takes the following spells as its payload and stops boosts at the boundary', () => {
    const { group } = planGroup(deck(['magic_bullet', 'duet', 'laser']), 0, 1, ctx);
    expect(group.items[0].after?.kind).toBe('duet');
    expect(group.items[0].after?.payload.items[0].spell.id).toBe('laser');
  });

  it('Multi-Shot multiplies casts and MP', () => {
    const { group } = planGroup(deck(['multi_shot', 'magic_bullet']), 0, 1, ctx);
    expect(group.items[0].copies).toBe(2);
    expect(group.items[0].mp).toBeCloseTo(content.spell.magic_bullet.mana[0] * 1.5);
  });
});

describe('forge', () => {
  it('fuses three identical spells into the next level', () => {
    const pack = [{ id: 'magic_bullet', lv: 0 }, { id: 'magic_bullet', lv: 0 }, { id: 'magic_bullet', lv: 0 }, null];
    const m = mergeCandidates(pack, content);
    expect(m).toHaveLength(1);
    applyMerge(pack, m[0]);
    expect(pack.filter(Boolean)).toEqual([{ id: 'magic_bullet', lv: 1 }]);
  });
  it('a Spell Prototype stands in for a missing copy (same level)', () => {
    const pack = [{ id: 'magic_bullet', lv: 0 }, { id: 'magic_bullet', lv: 0 }, { id: 'spell_prototype', lv: 0 }];
    expect(mergeCandidates(pack, content)).toHaveLength(1);
    const wrongLevel = [{ id: 'magic_bullet', lv: 0 }, { id: 'magic_bullet', lv: 0 }, { id: 'spell_prototype', lv: 1 }];
    expect(mergeCandidates(wrongLevel, content)).toHaveLength(0);
  });
  it('never fuses uncraftable spells', () => {
    const pack = Array.from({ length: 3 }, () => ({ id: 'adava_keravda', lv: 0 }));
    expect(mergeCandidates(pack, content)).toHaveLength(0);
  });
});

describe('content data', () => {
  const files = new Set(readFileSync(new URL('../assets/filelist.txt', import.meta.url), 'utf8').split(/\r?\n/).filter(Boolean));
  const d = content.data;
  it('has the wiki-sized content sets', () => {
    expect([d.spells.length, d.wands.length, d.relics.length, d.curses.length, d.potions.length]).toEqual([83, 97, 85, 46, 31]);
  });
  it('every referenced sprite exists in assets/filelist.txt', () => {
    const missing = [...d.spells.map((s) => s.icon), ...d.wands.map((w) => w.sprite), ...d.relics.map((r) => r.icon), ...d.curses.map((c) => c.icon), ...d.potions.map((p) => p.icon)].filter((p) => !files.has(p));
    expect(missing).toEqual([]);
  });
  it('display names are unique per group (clean-room rename map is complete)', () => {
    for (const group of [d.spells, d.wands, d.relics, d.curses, d.potions]) {
      const names = group.map((x) => x.name);
      expect(new Set(names).size).toBe(names.length);
      for (const x of group) expect(x.name).not.toBe(x.wikiName);
    }
  });
});

describe('effect tables cover the whole data set', async () => {
  const { RELICS } = await import('../src/game/relics');
  const { CURSES } = await import('../src/game/curses');
  const { POTIONS } = await import('../src/game/potions');
  const diff = (a: string[], b: string[]) => a.filter((x) => !b.includes(x));
  it('every relic has an entry (empty entries are the ones handled inline)', () => {
    expect(diff(content.data.relics.map((r) => r.id), Object.keys(RELICS))).toEqual([]);
    expect(diff(Object.keys(RELICS), content.data.relics.map((r) => r.id))).toEqual([]);
  });
  it('every curse has an entry', () => {
    expect(diff(content.data.curses.map((c) => c.id), Object.keys(CURSES))).toEqual([]);
    expect(diff(Object.keys(CURSES), content.data.curses.map((c) => c.id))).toEqual([]);
  });
  it('every potion has an implementation', () => {
    expect(diff(content.data.potions.map((p) => p.id), Object.keys(POTIONS))).toEqual([]);
    expect(diff(Object.keys(POTIONS), content.data.potions.map((p) => p.id))).toEqual([]);
  });
});

describe('deck rewriting boosts', () => {
  const inst = (id: string, lv = 0) => ({ id, lv });
  it('Mimicry Cube becomes a copy of the next spell, capped at its own level', () => {
    const cards = deckOf([inst('mimicry_cube', 0), inst('accelerator', 2)], content);
    expect(cards.map((c) => [c.inst.id, c.inst.lv])).toEqual([['accelerator', 0], ['accelerator', 2]]);
    const both = deckOf([inst('mimicry_cube', 1), inst('accelerator', 1)], content);
    expect(both.map((c) => c.inst.lv)).toEqual([1, 1]);
  });
  it('Magic Upgrade raises the nearest spell on each side by one level (cap ++)', () => {
    const cards = deckOf([inst('magic_bullet', 0), inst('magic_upgrade'), inst('laser', 2)], content);
    expect(cards.map((c) => [c.inst.id, c.inst.lv])).toEqual([['magic_bullet', 1], ['laser', 2]]);
  });
  it('Area Boost copies the spell to its right onto every wand, capped at its level', () => {
    const wand = newWand(content.wand.old_wand, [inst('area_boost', 0), null as never, null as never, null as never, inst('laser', 2)].filter(Boolean) as never);
    wand.slots = [inst('area_boost', 0), null, null, null, inst('laser', 2), null];
    expect(areaBoostCopies([wand], content)).toEqual([{ id: 'laser', lv: 0 }]);
  });
});
