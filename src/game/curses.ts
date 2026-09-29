/**
 * Curse effects keyed by id; `p` = design params from public/data/curses.json (the wiki leaves them as int1/float1).
 * Pure-UI curses (gate_of_mist, bewilderment, aphasia, nocturnal_blindness) are read by the renderer/HUD.
 */
import { M } from '../core/math';
import { Enemy, ENEMIES } from './enemies';
import type { RunState } from './run';
import type { PlayerStats } from './stats';
import type { World } from './world';

export interface CurseImpl {
  stats?(s: PlayerStats, p: number[], run: RunState): void;
  tick?(w: World, p: number[], dt: number): void;
  onHurt?(w: World, p: number[]): void;
  onCoin?(w: World, p: number[]): void;
  onRoomEnter?(w: World, p: number[]): void;
  onGain?(w: World, p: number[]): void;
  onKill?(w: World, p: number[], e: Enemy): void;
}

/** Antique Timepiece position history per world. */
const TIMEPIECE = new WeakMap<World, { t: number; x: number; y: number }[]>();

const NORMAL_POOL = ['fragile', 'sluggishness', 'impatience', 'magic_suppression', 'inefficient_casting', 'near_sighted', 'heartburn', 'muscle_atrophy'];

export const CURSES: Record<string, CurseImpl> = {
  expired_bounty: {},
  enhanced_traps: { stats: (s, p) => void (s.trapDmgMult *= 1 + p[0] / 100) },
  bloodthirsty_underlings: { stats: (s, p) => void (s.enemySpeedMult *= 1 + p[0] / 100) },
  unstable_rifts: {
    onHurt: (w) => {
      const r = w.room;
      for (let i = 0; i < 20; i++) {
        const x = w.rng.range(2, r.w - 2) * M;
        const y = w.rng.range(3, r.h - 2) * M;
        if (!w.blocked(x, y, w.player.r, false)) {
          w.player.x = x;
          w.player.y = y;
          break;
        }
      }
    },
  },
  muscle_atrophy: { stats: (s, p) => void (s.speed -= p[0]) },
  timid: { onRoomEnter: (w, p) => void (w.player.timidT = p[0]) },
  heartburn: { stats: (s, p) => void (s.projSpeedMult *= 1 - p[0] / 100) },
  fragile: { stats: (s, p) => void (s.dmgAdd -= p[0] / 100) },
  sluggishness: { stats: (s, p) => void (s.intervalMult *= 1 + p[0] / 100) },
  thorned_entry: { onRoomEnter: (w, p) => w.hurtPlayer(p[0], { trap: true, ignoreInvuln: true }) },
  complex_locks: { stats: (s) => void (s.keyCost = Math.max(s.keyCost, 2)) },
  tattered_pouch: { onRoomEnter: (w, p) => void (w.run.coins = Math.max(0, w.run.coins - p[0])) },
  impatience: { stats: (s, p) => void (s.regenMult *= 1 - p[0] / 100) },
  magic_suppression: { stats: (s, p) => void (s.maxMpMult *= 1 - p[0] / 100) },
  inefficient_casting: { stats: (s, p) => void (s.mpCostMult *= p[0] / 100) },
  unstable_balance: { stats: (s, p) => void (s.recoilMult *= 1 + p[0] / 100) },
  profanity: { stats: (s, p) => void (s.relicOptions = Math.max(1, s.relicOptions - p[0])) },
  raging_blood: { stats: (s, p) => void (s.enemyRegen += p[0]) },
  misfortune: {
    onRoomEnter: (w) => {
      // A curse that changes over time: swaps itself for a random common curse effect each room.
      w.run.spellKills.__misfortune = w.rng.int(0, NORMAL_POOL.length - 1);
      w.hooks.onDoor?.('stats');
    },
    stats: (s, _p, run) => {
      const id = NORMAL_POOL[run.spellKills.__misfortune ?? 0];
      const def = { fragile: [10], sluggishness: [15], impatience: [20], magic_suppression: [15], inefficient_casting: [120], near_sighted: [15], heartburn: [20], muscle_atrophy: [0.5] } as Record<string, number[]>;
      CURSES[id]?.stats?.(s, def[id], run);
    },
  },
  shrinking_backpack: { stats: (s, p) => void (s.backpackAdd -= p[0]) },
  potion_allergy: {},
  explosive_pursuit: {
    tick: (w, _p, dt) => {
      if (w.cleared) return;
      w.run.spellKills.__bomb = (w.run.spellKills.__bomb ?? 0) + dt;
      if (w.run.spellKills.__bomb < 7) return;
      w.run.spellKills.__bomb = 0;
      const x = w.player.x + w.rng.range(-3, 3) * M;
      const y = w.player.y + w.rng.range(-3, 3) * M;
      w.vis?.timed('effects/telegraph_circle.png', x, y, 1, { scale: 1.2, layer: w.vis.shadows, fade: false });
      w.after(1, () => w.explode(x, y, 1.6 * M, 12, 0, { faction: 'enemy', tint: 0xf03cb4 }));
    },
  },
  feebleness: { stats: (s, p) => void (s.maxHp -= p[0]) },
  grim_wager: {},
  antique_timepiece: {
    tick: (w, p, dt) => {
      let hist = TIMEPIECE.get(w);
      if (!hist) TIMEPIECE.set(w, (hist = []));
      hist.push({ t: w.time, x: w.player.x, y: w.player.y });
      while (hist.length && hist[0].t < w.time - p[0] - 0.1) hist.shift();
      w.run.spellKills.__clock = (w.run.spellKills.__clock ?? 0) + dt;
      if (w.run.spellKills.__clock > 12 && hist.length) {
        w.run.spellKills.__clock = 0;
        w.player.x = hist[0].x;
        w.player.y = hist[0].y;
        w.vis?.oneShot('effects/spawn', w.player.x, w.player.y);
      }
    },
  },
  weakness: { stats: (s, p) => void (s.critAdd += p[0] / 100) },
  lethargic_shop: { stats: (s, p) => void (s.shopItemsAdd -= p[0]) },
  near_sighted: { stats: (s, p) => void (s.scatterAdd += p[0]) },
  gate_of_mist: {},
  vengeful_spirits: {
    onKill: (w, p, e) => {
      if (e.minion || e.boss || !w.rng.chance(p[0] / 100)) return;
      const wraith = new Enemy(w, ENEMIES.phantom, e.x, e.y, { minion: true });
      wraith.hp = wraith.maxHp = 40;
      w.addEnemy(wraith);
      w.after(p[1], () => {
        wraith.hp = 0;
        w.killEnemy(wraith);
      });
    },
  },
  frantic_fumble: {
    onHurt: (w, p) => {
      const n = Math.min(w.run.coins, p[0]);
      w.run.coins -= n;
      for (let i = 0; i < n; i++) w.spawnPickup('coin', w.player.x, w.player.y);
    },
  },
  perpetual_harm: {
    onHurt: (w, p) => {
      if (w.rng.chance(p[0] / 100)) {
        w.run.maxHpBonus -= 2;
        w.hooks.onDoor?.('stats');
      }
    },
  },
  stiffened: { onHurt: (w, p) => void (w.player.stiffT = p[0]) },
  depleted_diamonds: {},
  savage_proliferation: {},
  corroded_currency: {
    onCoin: (w, p) => {
      if (w.rng.chance(p[0] / 100)) w.hurtPlayer(p[1], { trap: true, ignoreInvuln: true });
    },
  },
  toppling_balance: { stats: (s) => void (s.knockbackMult *= -1) },
  nocturnal_blindness: {},
  bewilderment: {},
  // a creeping hex: hurts a little more with every room you survive
  doom: { stats: (s, _p, run) => void (s.dmgTakenMult *= 1 + Math.min(1, (run.chapter - 1) * 0.1 + run.room * 0.02)) },
  aphasia: {},
  shackles: { stats: (s) => void (s.speed -= 1) },
  vanished: {
    onGain: (w) => {
      if (w.run.relics.length) {
        const i = w.rng.int(0, w.run.relics.length - 1);
        const r = w.run.relics.splice(i, 1)[0];
        w.toast(`${w.content.relic[r.id]?.name ?? r.id} vanished!`, 0xa855f7);
      }
      w.run.curses = w.run.curses.filter((c) => c !== 'vanished');
      w.hooks.onDoor?.('stats');
    },
  },
  magic_dissipation: {
    onRoomEnter: (w) => {
      for (const wand of w.run.wands) wand.mp = 0;
    },
  },
  slovenliness: { stats: (s, p) => void (s.summonLimitMult /= p[0]) },
  relentless_snail: {
    onRoomEnter: (w) => {
      const e = new Enemy(w, ENEMIES.snail, w.room.spawn.x, w.room.spawn.y + 2 * M);
      e.passive = true;
      w.addEnemy(e);
    },
  },
};
