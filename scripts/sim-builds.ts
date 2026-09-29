/**
 * Headless DPS harness: simulates wand builds against the training dummy without rendering.
 *   npm run sim            # prints a table for the community builds on the wiki (PLAN §4.6)
 * Uses the same World/Player/spell code as the game (vis = null).
 */
import { readFileSync } from 'node:fs';
import { Content } from '../src/game/content';
import { computeStats } from '../src/game/stats';
import { ENEMIES, Enemy } from '../src/game/enemies';
import { genRoom } from '../src/game/rooms';
import type { RunState } from '../src/game/run';
import { newWand, type SpellInst } from '../src/game/wand';
import { World } from '../src/game/world';

const read = (f: string) => JSON.parse(readFileSync(new URL(`../public/data/${f}.json`, import.meta.url), 'utf8'));
export const content = new Content(
  { spells: read('spells'), wands: read('wands'), relics: read('relics'), curses: read('curses'), potions: read('potions') },
  read('names'),
);

/**
 * Stand-in for the wiki's "Standardization wand" (its stats are not documented). Grid-fitted so that most community builds
 * land near their published DPS range; see PLAN.md section 14.
 */
export const STANDARD_WAND = { mp: 250, regen: 25, interval: 0.02, cd: 0.2, scatter: 0, slots: 12, simul: 1 };

export interface Build {
  name: string;
  spells: (string | [string, number])[];
  wand?: string;
  dummies?: number;
  wiki: string;
  seconds?: number;
  mp?: number;
  wandOverride?: Partial<import('../src/data/types').WandDef>;
}

export function makeRun(): RunState {
  return {
    seed: 1, setId: 'original', difficulty: 1, chapter: 1, room: 0, hp: 0, maxHpBonus: 0, shield: 0, tempShield: 0, coins: 0, keys: 0, diamonds: 0,
    crystals: 0, blood: 0, cores: 0, wands: [], wandLimit: 1, active: 0, backpack: [], relics: [], curses: [], potions: [], potionSlots: 1, kills: 0,
    spellKills: {}, bossHit: false, perm: { speed: 0, regen: 0, maxHp: 0, maxMp: 0, scale: 1 }, temp: { flight: false, regenT: 0 }, time: 0,
    maxDps: 0, venomPeak: 0, finished: false,
  };
}

/** Simulate a build on N dummies; returns { dps, peak, mpLeft }. */
export function simulate(b: Build): { dps: number; peak: number; mp: number; sustained: number; early: number } {
  const run = makeRun();
    content.wand.__test = { ...content.wand.old_wand, id: '__test', ...STANDARD_WAND, mp: b.mp ?? STANDARD_WAND.mp, ...b.wandOverride };
  const wandId = b.wand ?? '__test';
  const spells: SpellInst[] = b.spells.map((s) => (typeof s === 'string' ? { id: s, lv: 0 } : { id: s[0], lv: s[1] }));
  const def = content.wand[wandId];
  const wand = newWand(def, [], 8);
  spells.forEach((s, i) => (wand.slots[i] = s));
  run.wands.push(wand);
  const stats = computeStats(run, content, { maxHp: 0, maxMp: 0, regen: 0 });
  const w = new World(content, run, null, null, 7, stats);
  w.meta.summonLimitStop = true;
  w.loadRoom(genRoom('camp', 'camp', 1, []));
  w.player.x = 100;
  w.player.y = 100;
  w.player.hp = 1e9;
  w.stats.maxHp = 1e9;
  w.player.invalidateWands();
  const n = b.dummies ?? 1;
  for (let i = 0; i < n; i++) {
    const d = new Enemy(w, ENEMIES.dummy, 190 + i * 6, 100 + (i - (n - 1) / 2) * 10);
    d.passive = true;
    d.invuln = 0;
    w.addEnemy(d);
  }
  w.player.intent.aimX = 190;
  w.player.intent.aimY = 100 + 6;
  w.player.intent.fire = true;
  const seconds = b.seconds ?? 20;
  let peak = 0;
  let earlyDps = 0;
  let tailDps = 0;
  let mark = 0;
  const dt = 1 / 60;
  for (let t = 0; t < seconds * 60; t++) {
    if (t === 3 * 60) earlyDps = w.dmgTotal / 3;
    if (t === Math.floor(seconds * 0.5) * 60) mark = w.dmgTotal;
    w.player.intent.fire = true;
    w.player.recoilX = w.player.recoilY = 0; // hold position like a player who strafes back
    w.update(dt);
    if (t > 60) peak = Math.max(peak, w.dps(1));
  }
  tailDps = (w.dmgTotal - mark) / (seconds - Math.floor(seconds * 0.5));
  return { dps: w.dmgTotal / seconds, peak, mp: w.player.activeWand?.mp ?? 0, sustained: tailDps, early: earlyDps };
}

export const BUILDS: Build[] = [
  { name: 'Track + Shadow Serpent', spells: ['track', 'shadow_serpent'], wiki: '120-150' },
  { name: 'Arcane Nova + Mana Absorption (3 dummies)', spells: ['arcane_nova', 'mana_absorption'], dummies: 3, wiki: '400-1300+' },
  { name: 'Track + Fuse + Lightning Dash', spells: ['track', 'fuse', 'lightning_dash'], wiki: '120-357' },
  { name: 'Shadow Serpent + Echo + Mana Absorption', spells: ['shadow_serpent', 'echo', 'mana_absorption'], wiki: '400-520' },
  { name: 'Autonomous Grimoire + Energy Saving + Mana Absorption', spells: ['autonomous_grimoire', 'energy_saving_mode', 'mana_absorption'], wiki: '5800-6000' },
  { name: 'Track + Serpent + Echo + Mana Absorption', spells: ['track', 'shadow_serpent', 'echo', 'mana_absorption'], wiki: '3000-3150' },
  { name: 'Venom + Umbilical + Laser + Fireworks + Pillar', spells: ['venom_crystal', 'umbilical_cord', 'laser', 'dazzling_fireworks', 'pillar_of_light'], wiki: '1100-3700 (1 dummy)' },
  { name: 'Magic Bullet x2 (starting kit)', spells: ['magic_bullet', 'magic_bullet'], wiki: '(baseline)' },
];

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop() ?? '')) {
  console.log('build'.padEnd(58), 'sustained'.padStart(10), 'peak'.padStart(10), '  wiki');
  for (const b of BUILDS) {
    const r = simulate({ ...b, seconds: b.seconds ?? 20 });
    console.log(b.name.padEnd(58), r.sustained.toFixed(0).padStart(10), r.peak.toFixed(0).padStart(10), ' ', b.wiki);
  }
}
