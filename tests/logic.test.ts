import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { duetMirror, spellDamage } from '../src/game/damage';
import { applyMerge, mergeCandidates } from '../src/game/loot';
import { areaBoostCopies, deckOf, newWand, planGroup, previewCasts } from '../src/game/wand';
import { content, makeRun } from '../scripts/sim-builds';
import { M } from '../src/core/math';
import { genRoom } from '../src/game/rooms';
import { computeStats } from '../src/game/stats';
import { World } from '../src/game/world';

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

  it('preview: a boost only joins the cast of the spell it precedes (one spell per cast)', () => {
    const plan = previewCasts(deck(['dmg_enhanced', 'magic_bullet', 'magic_bullet']), ctx);
    expect(plan.casts.map((c) => [c.boosts.length, c.spells.length])).toEqual([[1, 1], [0, 1]]);
    expect(plan.idle).toEqual([]);
  });

  it('preview: boosts after the last spell never apply and are reported idle', () => {
    const plan = previewCasts(deck(['magic_bullet', 'dmg_enhanced']), ctx);
    expect(plan.casts.map((c) => [c.boosts.length, c.spells.length])).toEqual([[0, 1]]);
    expect(plan.idle.map((s) => s.id)).toEqual(['dmg_enhanced']);
  });

  it('preview: simultaneous casting puts several spells under one boost', () => {
    const plan = previewCasts(deck(['dmg_enhanced', 'magic_bullet', 'magic_bullet']), { ...ctx, baseSimul: 2 });
    expect(plan.casts.map((c) => [c.boosts.length, c.spells.length])).toEqual([[1, 2]]);
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

describe('walking while firing', () => {
  it('firing along the walking direction slows the caster steadily instead of stalling it between casts', () => {
    const run = makeRun();
    const wand = newWand(content.wand.damaged_excaliwood_wand, [{ id: 'magic_bullet', lv: 0 }, { id: 'magic_bullet', lv: 0 }]);
    run.wands.push(wand);
    const w = new World(content, run, null, null, 7, computeStats(run, content, { maxHp: 0, maxMp: 0, regen: 0 }));
    w.loadRoom(genRoom('camp', 'camp', 1, []));
    w.player.x = 30;
    w.player.y = 100;
    w.player.hp = w.stats.maxHp = 1e9;
    w.player.invalidateWands();
    w.player.intent.mx = 1;
    w.player.intent.aimX = 400;
    w.player.intent.aimY = 100;
    const walk = w.stats.speed * M;
    const speeds: number[] = [];
    let last = w.player.x;
    for (let t = 0; t < 180; t++) {
      w.player.intent.fire = true;
      wand.mp = 999;
      w.update(1 / 60);
      if (t >= 30) speeds.push((w.player.x - last) * 60);
      last = w.player.x;
    }
    const slowest = Math.min(...speeds);
    expect(slowest).toBeGreaterThan(0.45 * walk);
    expect(Math.max(...speeds) / slowest).toBeLessThan(1.6);
  });
});
