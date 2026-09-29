/**
 * Test Mode session (hidden, unlocked by typing the cheat code). Everything here works through public `Game`/`World`
 * members so the simulation files stay untouched. Real progress is protected two ways: `Game` locks `meta/save`
 * writes while a session exists, and the save as it was at activation is restored (in place) when it ends.
 */
import { dist2, TILE } from '../core/math';
import type { Save } from '../meta/save';
import type { Content } from './content';
import { BOSSES, spawnBoss } from './bosses';
import { ENEMIES, Enemy } from './enemies';
import type { Game } from './game';
import { T_FLOOR } from './rooms';
import { canPlace, type SpellInst } from './wand';
import type { World } from './world';

export interface MobEntry {
  key: string;
  kind: 'enemy' | 'boss';
  id: string;
  label: string;
  /** Sprite group the mob is drawn from (static `<art>.png` is used for its list icon). */
  art: string;
  /** Demon Lord phase rows start the fight already below the phase threshold. */
  hpFrac?: number;
}

const titleCase = (id: string) => id.replace(/_/g, ' ').replace(/\b[a-z]/g, (c) => c.toUpperCase());

/** Every enemy archetype and every boss (Demon Lord additionally once per phase). */
export function mobCatalog(content: Content): { enemies: MobEntry[]; bosses: MobEntry[] } {
  const enemies = Object.values(ENEMIES).map((d): MobEntry => ({ key: `e:${d.id}`, kind: 'enemy', id: d.id, label: content.names.bosses[d.id] ?? titleCase(d.id), art: d.art }));
  const bosses: MobEntry[] = [];
  for (const b of Object.values(BOSSES)) {
    const art = b.id === 'demon_lord' ? 'bosses/boss_demon_lord_p1' : `bosses/boss_${b.id}`;
    bosses.push({ key: `b:${b.id}`, kind: 'boss', id: b.id, label: content.bossName(b.id), art });
    b.phases?.forEach((p, i) => bosses.push({ key: `b:${b.id}:${i + 1}`, kind: 'boss', id: b.id, label: `${content.bossName(b.id)} (phase ${i + 2})`, art: p.art, hpFrac: p.below - 0.03 }));
  }
  return { enemies, bosses };
}

export class TestSession {
  god = true;
  infiniteMp = true;
  /** Mobs the panel spawned: their death must not run room-clear / boss-reward logic. */
  readonly spawned = new WeakSet<Enemy>();
  private readonly snapshot: Save;

  constructor(save: Save) {
    this.snapshot = structuredClone(save);
  }

  /** Put the pre-activation save back into the live object (panels and closures keep their reference). */
  restore(save: Save) {
    const live = save as unknown as Record<string, unknown>;
    for (const k of Object.keys(live)) delete live[k];
    Object.assign(save, structuredClone(this.snapshot));
  }

  /** Once per fixed step, before the world updates. Only public fields are touched. */
  tick(game: Game) {
    const w = game.world;
    const pl = w.player;
    if (this.god && !pl.dead) {
      pl.setInvuln = Math.max(pl.setInvuln, 0.1);
      pl.hp = w.stats.maxHp;
    }
    if (this.infiniteMp) for (const wand of game.run.wands) wand.mp = pl.statsOf(wand).maxMp;
  }

  // ---------------------------------------------------------------- spells

  /** First free slot of the held wand where the spell fits, else the backpack (which grows so nothing is lost). */
  giveSpell(game: Game, s: SpellInst): 'wand' | 'pack' {
    const { run, content } = game;
    const inst = { ...s };
    const wand = run.wands[run.active];
    if (wand) {
      const i = wand.slots.findIndex((_, k) => canPlace(wand.slots, k, s.id, content));
      if (i >= 0) {
        wand.slots[i] = inst;
        this.spellAdded(game, inst);
        return 'wand';
      }
    }
    let free = run.backpack.findIndex((x) => !x);
    if (free < 0) free = run.backpack.push(null) - 1;
    run.backpack[free] = inst;
    this.spellAdded(game, inst);
    return 'pack';
  }

  private spellAdded(game: Game, s: SpellInst) {
    game.noteSpell(s.id);
    game.refreshStats();
    game.world.sfx('pickup');
  }

  clearWand(game: Game, wandIndex: number) {
    const wand = game.run.wands[wandIndex];
    if (!wand) return;
    wand.slots.fill(null);
    wand.post.fill(null);
    wand.ptr = 0;
    game.refreshStats();
  }

  clearAllWands(game: Game) {
    game.run.wands.forEach((_, i) => this.clearWand(game, i));
  }

  clearBackpack(game: Game) {
    game.run.backpack.fill(null);
    game.refreshStats();
  }

  // ---------------------------------------------------------------- wands

  /** Hand over a wand regardless of the wand limit and hold it. */
  giveWand(game: Game, id: string) {
    const { run } = game;
    run.wandLimit = Math.max(run.wandLimit, run.wands.length + 1);
    game.giveWand(id);
    game.world.player.swapWand(run.wands.length - 1);
  }

  /** Drop a held wand (its spells go back to the backpack); the last wand cannot be removed. */
  removeWand(game: Game, index: number) {
    const { run } = game;
    const wand = run.wands[index];
    if (!wand || run.wands.length < 2) return;
    for (const s of [...wand.slots, ...wand.post]) {
      if (!s) continue;
      let free = run.backpack.findIndex((x) => !x);
      if (free < 0) free = run.backpack.push(null) - 1;
      run.backpack[free] = s;
    }
    run.wands.splice(index, 1);
    run.active = Math.min(run.active > index ? run.active - 1 : run.active, run.wands.length - 1);
    game.refreshStats();
    game.world.player.updateWandView();
  }

  // ---------------------------------------------------------------- relics

  removeRelic(game: Game, id: string) {
    game.run.relics = game.run.relics.filter((r) => r.id !== id);
    game.refreshStats();
  }

  /** Set a relic to a level without pickup side effects or toasts (used by the bulk buttons). */
  setRelicLevel(game: Game, id: string, lv: number) {
    const have = game.run.relics.find((r) => r.id === id);
    if (have) have.lv = lv;
    else game.run.relics.push({ id, lv });
  }

  maxAllRelics(game: Game) {
    for (const r of game.content.data.relics) this.setRelicLevel(game, r.id, r.maxLevel);
    game.refreshStats();
  }

  removeAllRelics(game: Game) {
    game.run.relics = [];
    game.refreshStats();
  }

  // ---------------------------------------------------------------- potions

  fillPotions(game: Game, id: string) {
    const { run } = game;
    run.potions.length = 0;
    for (let i = 0; i < run.potionSlots; i++) run.potions.push(id);
  }

  // ---------------------------------------------------------------- mobs

  /** Spawn `count` copies in a ring around the player, on free floor. Returns how many were placed. */
  spawn(game: Game, entry: MobEntry, count: number, elite: boolean): number {
    const w = game.world;
    const boss = entry.kind === 'boss';
    const def = boss ? null : ENEMIES[entry.id];
    const size = boss ? 10 : Math.max(6, (def?.r ?? 5) * (elite ? 1.35 : 1));
    const flying = !!def?.flying;
    const ring = (boss ? 7 : 5) * TILE;
    const offset = Math.random() * Math.PI * 2;
    let placed = 0;
    for (let i = 0; i < count; i++) {
      const spot = this.freeSpot(w, offset + (i / count) * Math.PI * 2, ring + (i % 3) * TILE, size, flying);
      if (!spot) continue;
      const e = boss ? spawnBoss(w, entry.id, spot.x, spot.y) : new Enemy(w, ENEMIES[entry.id], spot.x, spot.y, { elite });
      if (entry.hpFrac !== undefined) e.hp = Math.round(e.maxHp * entry.hpFrac);
      if (!boss) w.addEnemy(e);
      this.spawned.add(e);
      if (boss && !w.enemies.some((o) => o.boss && !o.dead && !this.spawned.has(o))) game.ui.setBoss(e, entry.label);
      placed++;
    }
    return placed;
  }

  /** Nearest free floor to the wanted ring position: widen the ring and sweep all around the player before giving up. */
  private freeSpot(w: World, angle: number, radius: number, size: number, flying: boolean): { x: number; y: number } | null {
    const pl = w.player;
    const steps = 16;
    for (const k of [1, 0.75, 1.3, 0.5, 1.6]) {
      for (let s = 0; s < steps; s++) {
        const da = (s % 2 ? -1 : 1) * Math.ceil(s / 2) * ((Math.PI * 2) / steps);
        const x = pl.x + Math.cos(angle + da) * radius * k;
        const y = pl.y + Math.sin(angle + da) * radius * k;
        if (dist2(x, y, pl.x, pl.y) < (2 * TILE) ** 2) continue;
        if (w.tileUnder(x, y) !== T_FLOOR || w.blocked(x, y, size, flying)) continue;
        if (w.enemies.some((o) => !o.dead && dist2(x, y, o.x, o.y) < (size * 1.6) ** 2)) continue;
        return { x, y };
      }
    }
    return null;
  }

  /** Kill every hostile (the training dummy stays). */
  killAll(game: Game): number {
    const w = game.world;
    let n = 0;
    for (const e of [...w.enemies]) {
      if (e.dead || e.def.dummy) continue;
      w.killEnemy(e);
      n++;
    }
    return n;
  }
}
