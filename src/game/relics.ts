/**
 * Relic effects keyed by id. Numbers follow the wiki relic table (wiki/data/relics.json);
 * `lv` is 1-based. Relics without an entry here are not in the drop pool.
 */
import { dist2, M } from '../core/math';
import type { Enemy } from './enemies';
import { Proj } from './projectiles';
import type { RunState } from './run';
import type { PlayerStats } from './stats';
import type { CastGroup, WandInst } from './wand';
import type { World } from './world';

export interface RelicImpl {
  stats?(s: PlayerStats, lv: number, run: RunState): void;
  onKill?(w: World, lv: number, e: Enemy): void;
  onHurt?(w: World, lv: number): void;
  onRoomEnter?(w: World, lv: number): void;
  onCoin?(w: World, lv: number, n: number): void;
  onPotion?(w: World, lv: number): void;
  onCast?(w: World, lv: number, wand: WandInst, group: CastGroup, angle: number): void;
  tick?(w: World, lv: number, dt: number): void;
  /** Immediate effect when picked up. */
  onGain?(w: World, lv: number): void;
}

const pick = <T>(arr: T[], lv: number): T => arr[Math.min(arr.length, Math.max(1, lv)) - 1];
const has = (w: World, id: string) => w.run.relics.some((r) => r.id === id);

function soulBonus(w: World) {
  // Soul Bone series: 20% of temporary shields become regular shields on room entry.
  const set = ['casket_of_souls', 'soulbone_armor', 'soulbone_mantle', 'soulbone_crown'];
  if (!set.every((id) => has(w, id))) return;
  const move = Math.floor(w.run.tempShield * 0.2);
  w.run.tempShield -= move;
  w.run.shield += move;
}

export const RELICS: Record<string, RelicImpl> = {
  knights_boots: { stats: (s) => ((s.spikeImmune = true), (s.venomImmune = true)) },
  knights_breastplate: { stats: (s) => void (s.dmgTakenMult *= 0.75) },
  knights_helm: { stats: (s, lv) => void (s.indiscriminateMult *= lv >= 2 ? 0.001 : 0.01) },
  beast_fangs: { stats: (s, lv) => void (s.dmgAdd += pick([0.2, 0.35, 0.5, 0.65, 0.8], lv)) },
  blade_of_fury: { stats: (s, lv) => void (s.critMult = pick([2.5, 3, 3.5, 4, 4.5], lv)) },
  demon_mask: { stats: (s, lv) => void (s.critAdd += pick([0.1, 0.18, 0.26, 0.34, 0.42], lv)) },
  bloodthirsty_gaze: {
    onKill: (w, lv) => {
      if (w.rng.chance(0.2)) w.player.heal(lv);
    },
  },
  casket_of_souls: {
    onKill: (w, lv, e) => {
      if (!w.rng.chance(0.3)) return;
      const p = new Proj(w, { faction: 'player', x: e.x, y: e.y, angle: w.rng.range(0, 6.28), speed: 6 * M, life: 3, r: 4, dmg: 65 * lv, art: 'projectiles/mana_absorb', pierce: 0 });
      p.homingDeg = 90;
      w.addProj(p);
    },
  },
  close_observation: { stats: (s, lv) => void (s.showHpBars = lv) },
  cloud_piercer: { stats: (s) => void (s.wallPierce = true) },
  crimson_anklet: {},
  prospectors_goblet: {
    onRoomEnter: (w) => {
      w.run.coins += Math.min(10, Math.floor(w.run.coins * 0.05));
    },
  },
  dashing_ear: {
    onHurt: (w) => {
      w.player.invuln = Math.max(w.player.invuln, 0.8);
      w.player.sprintT = 0.25;
    },
  },
  demonbone_tail: {
    onKill: (w, _lv, e) => {
      const p = new Proj(w, { faction: 'player', x: e.x, y: e.y, angle: 0, speed: 7 * M, life: 4, r: 3, dmg: 10 * (1 + w.stats.dmgAdd), art: 'projectiles/magic_bullet' });
      p.homingDeg = 120;
      w.addProj(p);
    },
  },
  drill: { stats: (s, lv) => void (s.slotsAdd += lv) },
  dusty_treasure: { onGain: (w) => w.hooks.onDoor?.('relic:upgrade') },
  electrified_crown: {
    onHurt: (w, lv) => {
      for (const e of w.enemies) if (!e.dead) w.damageEnemy(e, Math.round(e.maxHp * (e.boss ? 0.002 : 0.1) + 30 * lv), { raw: true });
      w.vis?.flash(0xfacc15, 0.1);
    },
  },
  elven_ears: { stats: (s) => void (s.noCastSlow = true) },
  ember_heart: {
    tick: (w, lv, dt) => {
      const r = 3 * M * w.stats.radiusMult;
      for (const e of w.enemies) if (!e.dead && dist2(e.x, e.y, w.player.x, w.player.y) < r * r) w.damageEnemy(e, 16 * lv * dt, { raw: true, noNumber: true, dot: true });
    },
  },
  endless_chest: {},
  endless_elixir: {},
  finite_gloves: {
    tick: (w, _lv, dt) => {
      w.run.spellKills.__finite = (w.run.spellKills.__finite ?? 0) + dt;
      if (w.run.spellKills.__finite < 25 || w.enemiesAlive() < 4) return;
      w.run.spellKills.__finite = 0;
      const targets = w.enemies.filter((e) => !e.dead && !e.boss);
      w.rng.shuffle(targets);
      for (const e of targets.slice(0, Math.floor(targets.length / 2))) w.killEnemy(e);
      w.vis?.flash(0xffffff, 0.2);
      w.toast('Snap!', 0xfacc15);
    },
  },
  fortune_earrings: { stats: (s, lv) => void (s.relicOptions += lv) },
  four_leaf_clover: { stats: (s, lv) => void (s.dodge += 0.11 * lv) },
  guardian_sprite: {
    onRoomEnter: (w, lv) => {
      for (let i = 0; i < 3 * lv; i++) {
        const p = new Proj(w, { faction: 'player', x: w.player.x, y: w.player.y, angle: 0, speed: 3 * M, life: 9999, r: 3, dmg: 5, art: 'projectiles/wisp', pierce: -1, trail: null });
        p.orbit = { r: 16 + (i % 3) * 5, a: (i / (3 * lv)) * Math.PI * 2, w: 2.5 };
        p.blockHp = 1;
        p.stopOnWall = false;
        w.addProj(p);
      }
    },
  },
  healing_belt: {
    onPotion: (w) => {
      w.run.maxHpBonus += 3;
      w.run.perm.maxMp += 2;
      w.hooks.onDoor?.('stats');
    },
  },
  hexagonal_die: {},
  hourglass_of_time: {},
  hunters_talisman: {},
  lucky_bunny_ear: { stats: (s, lv) => void (s.spellOptions += lv) },
  magicians_robe: { stats: (s) => void (s.radiusMult *= 0.7) },
  magnifying_glass: { stats: (s, lv) => void (s.radiusMult *= 1 + 0.2 * lv) },
  mask_of_the_hexer: { stats: (s, lv, run) => void (s.dmgAdd += run.curses.length * (lv >= 2 ? 0.15 : 0.1)) },
  merchants_bauble: {},
  merlins_beard: { stats: (s) => void (s.summonLimitMult *= 2) },
  merlins_boots: {
    onKill: (w, lv) => {
      const wand = w.player.activeWand;
      if (wand) wand.mp = Math.min(w.player.statsOf(wand).maxMp, wand.mp + 4 * lv);
    },
  },
  merlins_hat: { stats: (s, lv) => void (s.maxMpAdd += 30 * lv) },
  merlins_robe: { stats: (s, lv) => void (s.regenAdd += pick([2, 4, 6], lv)) },
  mirror_of_vision: { stats: (s, lv) => ((s.flight = true), (s.wandLimitAdd += lv), (s.forceSpirit = true)) },
  octagonal_die: {},
  pandoras_box: { onRoomEnter: (w, lv) => w.hooks.onDoor?.(`reforge:${lv}`) },
  tree_spirit_pendant: {
    tick: (w, _lv, dt) => {
      if (w.player.hp < 30) w.player.hp = Math.min(30, w.player.hp + 2 * dt);
    },
  },
  prospectors_gloves: {
    onKill: (w, lv, e) => {
      if (w.rng.chance(0.08 * lv)) w.spawnPickup('coin', e.x, e.y);
    },
  },
  prospectors_pickaxe: { stats: (s, lv, run) => void (s.dmgAdd += (lv / 100) * Math.floor(run.coins / (lv + 2))) },
  prospectors_vest: { onCoin: (w, _lv, n) => w.player.heal(n) },
  rageful_eye: {
    stats: () => undefined,
    tick: (w) => {
      // recomputed live: +1% damage per 2 missing HP
      w.stats.dmgAdd = w.stats.dmgAdd - (w.run.spellKills.__rage ?? 0);
      const bonus = Math.max(0, w.stats.maxHp - w.player.hp) / 200;
      w.run.spellKills.__rage = bonus;
      w.stats.dmgAdd += bonus;
    },
  },
  rangers_boots: { stats: (s) => ((s.slowImmune = true), (s.speed += 1)) },
  reaper_mask: {},
  replica_gloves: {
    onCast: (w, lv, wand, group) => {
      if (!w.rng.chance(lv >= 2 ? 0.45 : 0.25) || w.run.spellKills.__replica) return;
      w.run.spellKills.__replica = 1;
      w.player.fireGroup(wand, w.player.statsOf(wand), group, 0, w.rng.range(0, Math.PI * 2));
      w.run.spellKills.__replica = 0;
    },
  },
  resilient_physique: { stats: (s) => ((s.dmgAdd += 1), (s.dmgTakenMult *= 1.7)) },
  rogue_cloak: {},
  seed_of_greed: {},
  silver_compass: {},
  silver_key: { stats: (s) => void (s.keyCost = 0) },
  soulbone_armor: {
    onKill: (w, lv) => {
      if (w.rng.chance(0.2)) w.run.shield += lv;
    },
    onRoomEnter: (w) => soulBonus(w),
  },
  soulbone_crown: {
    onKill: (w, lv) => {
      if (w.run.kills % 3 === 0) w.run.tempShield += lv;
    },
  },
  soulbone_mantle: {
    onGain: (w) => void (w.run.shield += 20),
    onKill: (w) => {
      if (w.run.kills % 3 === 0) w.run.shield += 1;
    },
  },
  sprite_wings: { stats: (s) => void (s.flight = true) },
  stagnant_droplet: {},
  talisman_of_focus: {},
  titans_pauldrons: { stats: (s, lv) => ((s.maxHp += 20 * lv), (s.recoilMult *= 0.67), (s.sizeMult *= 1.15)) },
  treant_circlet: { onRoomEnter: (w) => void (w.run.tempShield += 15) },
  treant_robe: { onRoomEnter: (w, lv) => w.player.heal(5 * lv) },
  treant_shoulderguards: { onRoomEnter: (w, lv) => void (w.run.shield += 3 * lv) },
  wand_lens: { stats: (s) => void (s.knockbackMult *= 1.5) },
  wild_tentacles: { stats: (s, lv) => void (s.speed += 1.5 * lv / 5) },
  explorers_hat: {},
  infusion_hand_seal: { stats: (s, lv) => void (s.postChargeMult *= 1 + 0.2 * lv) },
  colorful_cloak: {},
  ward_charm: {
    onRoomEnter: (w) => {
      if (w.run.curses.length && w.rng.chance(0.33)) {
        const c = w.run.curses.splice(w.rng.int(0, w.run.curses.length - 1), 1)[0];
        w.toast(`Curse lifted: ${w.content.curse[c]?.name ?? c}`, 0xa78bfa);
        w.hooks.onDoor?.('stats');
      }
    },
  },
  invisible_wings: {
    onHurt: (w) => {
      w.run.temp.flight = true;
      w.hooks.onDoor?.('stats');
    },
  },
  berserker: {
    tick: (w) => {
      const low = w.player.hp < w.stats.maxHp * 0.5;
      const had = (w.run.spellKills.__berserk ?? 0) > 0;
      if (low !== had) {
        w.stats.dmgAdd += low ? 0.5 : -0.5;
        w.run.spellKills.__berserk = low ? 1 : 0;
      }
    },
  },
  cardiotonic: {},
  summoning_wealth_bell: {},
  coolant: {},
  swordsman_cloak: {},
  bian: {},
  reaper: { stats: (s, lv) => void (s.poisonMult *= lv >= 2 ? 3 : 2) },
  original_shape: {},
  druids_horn: {
    tick: (w, lv, dt) => {
      const r = (2.5 + 0.5 * lv) * M;
      for (const e of w.enemies) if (!e.dead && dist2(e.x, e.y, w.player.x, w.player.y) < r * r) w.damageEnemy(e, w.stats.maxHp * 0.1 * lv * dt, { raw: true, noNumber: true, dot: true });
      for (const s of w.summons) if (dist2(s.x, s.y, w.player.x, w.player.y) < r * r) s.hp = Math.min(s.maxHp, s.hp + w.stats.maxHp * 0.05 * lv * dt);
    },
  },
  bird_beak_mask: { onPotion: (w, lv) => w.player.heal(lv >= 2 ? 10 : 5) },
  mystical_artifact: { stats: (s, lv) => void (s.maxHp += lv) },
  // handled inline in game.ts (shop pricing, crimson room after the final boss)
  black_mark: {},
  blood_key: {},
  // not offered: rerolling the whole run is not implemented in this clone
  reboot_key: {},
};

/** Relics never offered by relic rooms (no effect in this clone, or special acquisition). */
export const DROPPABLE_EXCLUDE = new Set(['reboot_key', 'hunters_talisman', 'mystical_artifact']);
