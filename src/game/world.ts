import { Container, Sprite } from 'pixi.js';
import type { Art } from '../core/art';
import type { Audio, SfxName } from '../core/audio';
import { clamp, dist2, TILE } from '../core/math';
import { Rng } from '../core/rng';
import type { Content } from './content';
import { applyCritAndDebuff } from './damage';
import type { Actor, Faction } from './entities';
import { Enemy } from './enemies';
import { Player } from './player';
import { Proj } from './projectiles';
import { completeProj } from './spells';
import type { Room } from './rooms';
import { DOOR_ICON, solidAtPx, T_PIT, T_SPIKES, T_WALL, tileAt } from './rooms';
import type { RunState } from './run';
import { RELICS } from './relics';
import { CURSES } from './curses';
import type { PlayerStats } from './stats';
import type { Summon } from './summons';
import { AnimSprite, type Visuals } from './visuals';
import type { ElementMod } from './wand';

/** Damage per second of one poison stack. The wiki gives no number (design value; fitted against the Builds page). */
export const POISON_DPS_PER_STACK = 1;

export type PickupKind = 'coin' | 'heart' | 'key' | 'shield' | 'crystal' | 'blood' | 'diamond' | 'potion';

/** A step that moves a body further than this (px) is a teleport or room change: it is drawn there at once, not glided to. */
const TELEPORT_PX = 24;

export interface Pickup {
  kind: PickupKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  amount: number;
  potionId?: string;
  age: number;
  view: Container | null;
  dead: boolean;
}

/** Interactable object (pedestal item, NPC, chest, portal, forge, shop item…). */
export interface Prop {
  x: number;
  y: number;
  r: number;
  label: string;
  /** Returns true when consumed. */
  use: ((w: World) => boolean) | null;
  view: Container | null;
  solid: boolean;
  dead: boolean;
  /** Breakable by spells (pots). */
  hp?: number;
  onBreak?: (w: World) => void;
  tick?: (w: World, dt: number) => void;
  price?: number;
  /** Shown by the HUD when the player stands next to it. */
  info?: PropInfo;
}

export interface PropInfo {
  title: string;
  lines: string[];
  icon?: string;
  price?: number;
  rarity?: string;
  action?: string;
}

interface Timer {
  t: number;
  fn: () => void;
}

export interface HitInfo {
  crit?: boolean;
  elements?: ElementMod[];
  src?: Proj | null;
  spellId?: string;
  noNumber?: boolean;
  /** Fractional per-frame damage (auras, cords): remainders accumulate on the enemy instead of rounding to 0. */
  dot?: boolean;
  /** Skip crit roll / debuff multiply — the value is final. */
  raw?: boolean;
  indiscriminate?: boolean;
  knock?: { x: number; y: number; f: number };
}

export interface WorldHooks {
  onRoomCleared?: () => void;
  onPlayerDeath?: () => void;
  onDoor?: (kind: string) => void;
  onBossDefeated?: (e: Enemy) => void;
  toast?: (msg: string, color?: number) => void;
}

/** The simulation of one room: player, enemies, spells, pickups. Rendering is optional (`vis` null = headless). */
export class World {
  readonly rng: Rng;
  time = 0;
  room!: Room;
  player: Player;
  enemies: Enemy[] = [];
  projs: Proj[] = [];
  summons: Summon[] = [];
  pickups: Pickup[] = [];
  props: Prop[] = [];
  private timers: Timer[] = [];
  hooks: WorldHooks = {};
  stats!: PlayerStats;
  cleared = false;
  /** Damage dealt (for DPS meter / dummies). */
  dmgLog: { t: number; v: number }[] = [];
  /** Total damage dealt to enemies since this world was created. */
  dmgTotal = 0;
  paused = false;
  /** Runtime toggles from the meta save that affect spells. */
  meta = { summonLimitStop: false };
  onProjectileEnd: ((p: Proj) => void) | null = null;
  slowmo = 1;
  darkness = 0;

  constructor(
    readonly content: Content,
    readonly run: RunState,
    readonly vis: Visuals | null,
    readonly audio: Audio | null,
    seed: number,
    stats: PlayerStats,
  ) {
    this.rng = new Rng(seed);
    this.stats = stats;
    this.player = new Player(this);
    this.onProjectileEnd = (p) => completeProj(this, p);
  }

  get art(): Art | null {
    return this.vis?.art ?? null;
  }

  sfx(name: SfxName, vol = 1) {
    this.audio?.play(name, vol);
  }

  toast(msg: string, color = 0xffffff) {
    this.hooks.toast?.(msg, color);
  }

  after(t: number, fn: () => void) {
    this.timers.push({ t, fn });
  }

  // ---------------------------------------------------------------- room

  loadRoom(room: Room) {
    this.room = room;
    for (const e of this.enemies) e.destroyView();
    for (const p of this.projs) p.destroyView();
    for (const s of this.summons) if (!s.persistent) s.destroyView();
    this.enemies = [];
    this.projs = [];
    this.summons = this.summons.filter((s) => s.persistent && !s.dead);
    this.pickups = [];
    this.props = [];
    this.timers = [];
    this.cleared = false;
    this.player.x = room.spawn.x;
    this.player.y = room.spawn.y;
    for (const s of this.summons) {
      s.x = room.spawn.x + this.rng.range(-12, 12);
      s.y = room.spawn.y - 10;
    }
    if (this.vis) this.drawRoom();
    this.player.attachView();
    for (const s of this.summons) s.attachView();
  }

  private drawRoom() {
    const vis = this.vis!;
    vis.clearAll();
    const r = this.room;
    const art = vis.art;
    for (let y = 0; y < r.h; y++) {
      for (let x = 0; x < r.w; x++) {
        const t = r.grid[y * r.w + x];
        const v = r.variant[y * r.w + x];
        const floorPath = v ? art.pick(`tiles/floor_${r.tileset}_v${v}.png`, `tiles/floor_${r.tileset}.png`) : art.pick(`tiles/floor_${r.tileset}.png`);
        let path = floorPath;
        if (t === T_WALL) {
          const below = tileAt(r, x, y + 1);
          path = below !== T_WALL ? art.pick(`tiles/wallface_${r.tileset}.png`, 'tiles/wall.png') : art.pick(`tiles/wall_${r.tileset}.png`, 'tiles/wall.png');
        } else if (t === T_PIT) path = 'tiles/pit.png';
        else if (t === T_SPIKES) {
          const f = new Sprite(art.tex(floorPath));
          f.position.set(x * TILE, y * TILE);
          vis.floor.addChild(f);
          path = 'tiles/spikes.png';
        }
        const s = new Sprite(art.tex(path));
        s.position.set(x * TILE, y * TILE);
        vis.floor.addChild(s);
      }
    }
    for (const d of r.decor) {
      const p = `tiles/decor_${r.tileset}_${d.i}.png`;
      if (!art.has(p)) continue;
      const s = new Sprite(art.tex(p));
      s.position.set(d.tx * TILE, d.ty * TILE);
      vis.decor.addChild(s);
    }
    for (const d of r.doors) this.drawDoor(d);
  }

  drawDoor(d: Room['doors'][number]) {
    const vis = this.vis;
    if (!vis) return;
    const art = vis.art;
    const s = new Sprite(art.tex(d.open ? 'tiles/door_open.png' : 'tiles/door_closed.png'));
    s.position.set(d.tx * TILE, d.ty * TILE);
    vis.decor.addChild(s);
    const hidden = this.run.curses.includes('gate_of_mist');
    const iconPath = `ui/door_icon_${hidden ? 'unknown' : DOOR_ICON[d.kind]}.png`;
    const icon = new Sprite(art.tex(art.pick(iconPath, 'ui/door_icon_unknown.png')));
    icon.anchor.set(0.5);
    icon.position.set(d.tx * TILE + 8, d.ty * TILE - 6);
    icon.alpha = d.open ? 1 : 0.55;
    vis.overhead.addChild(icon);
  }

  openDoors() {
    for (const d of this.room.doors) {
      d.open = true;
      this.drawDoor(d);
    }
    this.sfx('door');
  }

  // ---------------------------------------------------------------- update

  update(dt: number) {
    if (this.paused) return;
    dt *= this.slowmo;
    this.time += dt;
    this.run.time += dt;
    this.run.temp.regenT = Math.max(0, this.run.temp.regenT - dt);
    for (const s of this.summons) {
      s.prevX = s.x;
      s.prevY = s.y;
    }
    for (const e of this.enemies) {
      e.prevX = e.x;
      e.prevY = e.y;
    }
    for (const p of this.projs) {
      p.prevX = p.x;
      p.prevY = p.y;
    }
    this.player.update(dt);
    for (const s of this.summons) s.update(dt);
    for (const e of this.enemies) e.update(dt);
    this.separateEnemies();
    for (const p of this.projs) p.update(dt);
    this.statusTick(dt);
    this.updatePickups(dt);
    for (const p of this.props) p.tick?.(this, dt);
    for (const r of this.run.relics) RELICS[r.id]?.tick?.(this, r.lv, dt);
    for (const c of this.run.curses) {
      const def = this.content.curse[c];
      if (def) CURSES[c]?.tick?.(this, def.params, dt);
    }
    const due = this.timers.filter((t) => (t.t -= dt) <= 0);
    this.timers = this.timers.filter((t) => t.t > 0);
    for (const t of due) t.fn();

    this.enemies = this.enemies.filter((e) => {
      if (e.dead) e.destroyView();
      return !e.dead;
    });
    this.projs = this.projs.filter((p) => {
      if (p.dead) p.destroyView();
      return !p.dead;
    });
    this.summons = this.summons.filter((s) => {
      if (s.dead) s.destroyView();
      return !s.dead;
    });
    this.pickups = this.pickups.filter((p) => {
      if (p.dead) p.view?.destroy();
      return !p.dead;
    });
    this.props = this.props.filter((p) => {
      if (p.dead) p.view?.destroy({ children: true });
      return !p.dead;
    });
    const cutoff = this.time - 5;
    if (this.dmgLog.length && this.dmgLog[0].t < cutoff) this.dmgLog = this.dmgLog.filter((d) => d.t >= cutoff);
    if (this.vis) this.syncViews(dt);
  }

  /** Remove every hostile bullet (room cleared, boss defeated). */
  clearEnemyProjectiles() {
    for (const p of this.projs) if (p.faction === 'enemy' && !p.dead) p.kill();
  }

  /** Soft push so enemies do not stack on one pixel. */
  private separateEnemies() {
    const list = this.enemies;
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      if (a.dead || a.def.dummy) continue;
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        if (b.dead || b.def.dummy) continue;
        const min = (a.r + b.r) * 0.9;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d2 = dx * dx + dy * dy;
        if (d2 >= min * min) continue;
        const d = Math.sqrt(d2) || 0.01;
        const push = (min - d) * 0.25;
        const ux = d2 < 0.0001 ? Math.cos(i) : dx / d;
        const uy = d2 < 0.0001 ? Math.sin(i) : dy / d;
        if (!a.boss && a.def.speed > 0) this.moveActor(a, -ux * push, -uy * push);
        if (!b.boss && b.def.speed > 0) this.moveActor(b, ux * push, uy * push);
      }
    }
  }

  /** DPS over the last `window` seconds. */
  dps(window = 3): number {
    let sum = 0;
    for (const d of this.dmgLog) if (d.t >= this.time - window) sum += d.v;
    return sum / window;
  }

  private syncViews(dt: number) {
    const vis = this.vis!;
    this.player.sync(dt);
    for (const s of this.summons) s.sync(dt);
    for (const e of this.enemies) e.sync(dt);
    for (const p of this.projs) p.sync(dt);
    for (const p of this.pickups) {
      if (!p.view) continue;
      p.view.position.set(Math.round(p.x), Math.round(p.y - Math.abs(Math.sin(p.age * 4)) * 2));
      if (p.view instanceof AnimSprite) p.view.step(dt);
    }
    vis.step(dt);
  }

  /**
   * Called once per rendered frame. The simulation steps at a fixed 60 Hz but frames do not line up with steps (vsync
   * jitter, 120/144 Hz displays), so a frame sees 0, 1 or 2 new steps: drawn at the step position, the player froze for
   * a frame and then lurched. Instead the player and the camera are placed between the last two step positions
   * (`alpha` = how far the current frame is into the next step), snapped to whole screen pixels rather than source pixels.
   */
  renderFrame(alpha: number) {
    const vis = this.vis;
    if (!vis) return;
    const pl = this.player;
    const s = vis.root.scale.x;
    const a = this.paused ? 1 : Math.max(0, Math.min(1, alpha));
    // teleports (room changes, curses) are not interpolated
    const jump = Math.abs(pl.x - pl.prevX) > TELEPORT_PX || Math.abs(pl.y - pl.prevY) > TELEPORT_PX;
    const x = jump ? pl.x : pl.prevX + (pl.x - pl.prevX) * a;
    const y = jump ? pl.y : pl.prevY + (pl.y - pl.prevY) * a;
    pl.placeView(x, y, s);
    const r = this.room;
    const halfW = vis.viewW / 2;
    const halfH = vis.viewH / 2;
    const rw = r.w * TILE;
    const rh = r.h * TILE;
    vis.camera(rw <= vis.viewW ? rw / 2 : clamp(x, halfW, rw - halfW), rh <= vis.viewH ? rh / 2 : clamp(y, halfH, rh - halfH));
    // Everything else that moves is drawn between its last two step positions too, on the same screen-pixel grid:
    // snapped to whole art pixels instead, slow movers hopped 4 screen px at a time and stalled every few frames.
    for (const e of this.enemies) {
      if (e.dead) continue;
      const dx = e.x - e.prevX;
      const dy = e.y - e.prevY;
      if ((dx !== 0 || dy !== 0) && Math.abs(dx) <= TELEPORT_PX && Math.abs(dy) <= TELEPORT_PX) e.place(e.prevX + dx * a, e.prevY + dy * a);
    }
    for (const s of this.summons) {
      if (s.dead) continue;
      const dx = s.x - s.prevX;
      const dy = s.y - s.prevY;
      if ((dx !== 0 || dy !== 0) && Math.abs(dx) <= TELEPORT_PX && Math.abs(dy) <= TELEPORT_PX) s.placeAt(s.prevX + dx * a, s.prevY + dy * a);
    }
    for (const p of this.projs) {
      if (p.dead) continue;
      const dx = p.x - p.prevX;
      const dy = p.y - p.prevY;
      if ((dx !== 0 || dy !== 0) && Math.abs(dx) <= TELEPORT_PX && Math.abs(dy) <= TELEPORT_PX) p.placeView(p.prevX + dx * a, p.prevY + dy * a);
    }
  }

  /** Round a world coordinate to a whole screen pixel. Actors sit on the screen grid, not the art grid, so they glide. */
  snap(v: number): number {
    const s = this.vis!.root.scale.x;
    return Math.round(v * s) / s;
  }

  // ---------------------------------------------------------------- movement

  /** Move an actor with wall/pit collision (axis separated). */
  moveActor(a: Actor, dx: number, dy: number): { hitX: boolean; hitY: boolean } {
    const fly = a.flying;
    let hitX = false;
    let hitY = false;
    const r = a.r;
    const nx = a.x + dx;
    if (!this.blocked(nx, a.y, r, fly)) a.x = nx;
    else hitX = true;
    const ny = a.y + dy;
    if (!this.blocked(a.x, ny, r, fly)) a.y = ny;
    else hitY = true;
    return { hitX, hitY };
  }

  blocked(x: number, y: number, r: number, flying: boolean): boolean {
    const room = this.room;
    if (
      solidAtPx(room, x - r, y - r, flying) || solidAtPx(room, x + r, y - r, flying) ||
      solidAtPx(room, x - r, y + r, flying) || solidAtPx(room, x + r, y + r, flying)
    ) return true;
    for (const p of this.props) if (p.solid && !p.dead && dist2(x, y, p.x, p.y) < (r + p.r) ** 2) return true;
    return false;
  }

  tileUnder(x: number, y: number): number {
    return tileAt(this.room, Math.floor(x / TILE), Math.floor(y / TILE));
  }

  inWall(x: number, y: number): boolean {
    return tileAt(this.room, Math.floor(x / TILE), Math.floor(y / TILE)) === T_WALL;
  }

  // ---------------------------------------------------------------- queries

  nearestEnemy(x: number, y: number, maxDist = 9999, exclude?: Set<Enemy>): Enemy | null {
    let best: Enemy | null = null;
    let bd = maxDist * maxDist;
    for (const e of this.enemies) {
      if (e.dead || e.untargetable || exclude?.has(e)) continue;
      const d = dist2(x, y, e.x, e.y);
      if (d < bd) {
        bd = d;
        best = e;
      }
    }
    return best;
  }

  enemiesAlive(): number {
    let n = 0;
    for (const e of this.enemies) if (!e.dead && !e.passive) n++;
    return n;
  }

  // ---------------------------------------------------------------- spawning

  addProj(p: Proj) {
    this.projs.push(p);
    p.prevX = p.x;
    p.prevY = p.y;
    p.attachView();
  }

  addEnemy(e: Enemy) {
    this.enemies.push(e);
    e.prevX = e.x;
    e.prevY = e.y;
    e.attachView();
  }

  addSummon(s: Summon) {
    this.summons.push(s);
    s.prevX = s.x;
    s.prevY = s.y;
    s.attachView();
  }

  addProp(p: Prop) {
    this.props.push(p);
    if (p.view && this.vis) this.vis.actors.addChild(p.view);
  }

  spawnPickup(kind: PickupKind, x: number, y: number, amount = 1, potionId?: string) {
    const a = this.rng.range(0, Math.PI * 2);
    const sp = this.rng.range(20, 60);
    const p: Pickup = { kind, x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, amount, potionId, age: 0, view: null, dead: false };
    if (this.vis) {
      const base = pickupArt(kind, potionId, this.content);
      const s = this.vis.art.hasAnim(base) ? this.vis.sprite(base) : this.vis.staticSprite(`${base}.png`);
      s.position.set(x, y);
      this.vis.actors.addChild(s);
      p.view = s;
    }
    this.pickups.push(p);
  }

  private updatePickups(dt: number) {
    const pl = this.player;
    const expire = this.run.curses.includes('expired_bounty') ? this.content.curse.expired_bounty?.params[0] ?? 8 : 0;
    for (const p of this.pickups) {
      p.age += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.9;
      p.vy *= 0.9;
      if (this.inWall(p.x, p.y)) {
        // never leave loot stuck in a wall: slide it back towards the room centre
        const c = this.room.center;
        const d = Math.hypot(c.x - p.x, c.y - p.y) || 1;
        p.x += ((c.x - p.x) / d) * 90 * dt;
        p.y += ((c.y - p.y) / d) * 90 * dt;
        p.vx = p.vy = 0;
      }
      if (expire && p.age > expire && p.kind !== 'potion') {
        p.dead = true;
        continue;
      }
      const d2 = dist2(p.x, p.y, pl.x, pl.y);
      // after a fight all currency flies to the player; keys, hearts and potions must be walked over
      const currency = p.kind === 'coin' || p.kind === 'crystal' || p.kind === 'blood' || p.kind === 'diamond';
      const magnet = this.cleared && currency ? 9999 : p.kind === 'coin' ? 40 : 18;
      if (p.age > 0.3 && d2 < magnet * magnet) {
        const d = Math.sqrt(d2) || 1;
        p.x += ((pl.x - p.x) / d) * 140 * dt;
        p.y += ((pl.y - p.y) / d) * 140 * dt;
      }
      if (p.age > 0.3 && d2 < 64) this.collect(p);
    }
  }

  private collect(p: Pickup) {
    const run = this.run;
    switch (p.kind) {
      case 'coin':
        run.coins += p.amount;
        this.sfx('coin');
        for (const r of run.relics) RELICS[r.id]?.onCoin?.(this, r.lv, p.amount);
        for (const c of run.curses) {
          const def = this.content.curse[c];
          if (def) CURSES[c]?.onCoin?.(this, def.params);
        }
        break;
      case 'heart':
        if (this.player.hp >= this.stats.maxHp) return;
        this.player.heal(p.amount);
        break;
      case 'shield':
        run.shield += p.amount;
        this.sfx('pickup');
        break;
      case 'key':
        run.keys += p.amount;
        this.sfx('pickup');
        break;
      case 'crystal':
        run.crystals += p.amount;
        this.sfx('pickup', 0.6);
        break;
      case 'blood':
        run.blood += p.amount;
        this.sfx('levelUp');
        this.toast('+1 Old Blood', 0xdc2626);
        break;
      case 'diamond':
        run.diamonds += p.amount;
        this.sfx('coin');
        break;
      case 'potion':
        if (run.potions.length >= run.potionSlots) return;
        run.potions.push(p.potionId!);
        this.sfx('pickup');
        this.toast(this.content.potion[p.potionId!]?.name ?? 'Potion', 0x4ade80);
        break;
    }
    p.dead = true;
  }

  // ---------------------------------------------------------------- damage

  /** Roll crit and apply the enemy debuff; returns final damage. */
  rollHit(base: number, critChance: number, target: Actor): { dmg: number; crit: boolean } {
    const crit = this.rng.chance(clamp(critChance, 0, 1));
    return { dmg: applyCritAndDebuff(base, crit, this.stats.critMult, target.status.vulnT > 0 ? target.status.vulnMult : 1), crit };
  }

  damageEnemy(e: Enemy, amount: number, info: HitInfo = {}) {
    if (e.dead || e.invuln > 0) return;
    let dmg: number;
    if (info.dot) {
      e.dotAcc += amount;
      dmg = Math.floor(e.dotAcc);
      e.dotAcc -= dmg;
      if (dmg <= 0) return;
    } else dmg = Math.max(0, Math.round(amount));
    this.dmgTotal += dmg;
    this.player.onDealt(dmg);
    if (e.def.dummy) {
      this.dmgLog.push({ t: this.time, v: dmg });
    } else {
      e.hp -= dmg;
      this.dmgLog.push({ t: this.time, v: dmg });
    }
    e.flashT = 0.08;
    if (info.knock && !e.boss && !e.def.dummy) {
      e.vx += info.knock.x * info.knock.f;
      e.vy += info.knock.y * info.knock.f;
    }
    if (info.elements) for (const el of info.elements) this.applyElement(e, el, amount);
    if (!info.noNumber && this.vis && dmg > 0) {
      this.vis.hitNumber(e.x + this.rng.range(-4, 4), e.y - e.hr - 4, info.crit ? `${dmg}!` : String(dmg), info.crit ? 0xfacc15 : 0xffffff);
      if (info.crit) this.vis.timed('effects/crit_star.png', e.x, e.y - 6, 0.25, { vy: -20 });
    }
    this.sfx(info.crit ? 'crit' : 'hit', 0.5);
    if (e.hp <= 0 && !e.def.dummy) this.killEnemy(e, info);
    else if (!e.boss && !e.def.dummy && this.rng.chance(0.01) && this.run.relics.some((r) => r.id === 'reaper_mask')) this.killEnemy(e, info);
  }

  private applyElement(e: Enemy, el: ElementMod, hitDmg: number) {
    if (el.chance < 1 && !this.rng.chance(el.chance)) return;
    const st = e.status;
    switch (el.element) {
      case 'venom': {
        const stacks = Math.round(el.power * this.stats.poisonMult);
        st.poison.push({ stacks, t: el.duration });
        const total = e.poisonTotal();
        if (total > this.run.venomPeak) this.run.venomPeak = total;
        break;
      }
      case 'frost':
        if (!e.boss) st.freezeT = Math.max(st.freezeT, el.power);
        else {
          st.slowMult = Math.min(st.slowMult, 0.7);
          st.slowT = Math.max(st.slowT, 1);
        }
        break;
      case 'slime':
        st.slowMult = Math.min(st.slowMult, el.power);
        st.slowT = Math.max(st.slowT, el.duration);
        break;
      case 'fire':
        st.burnDps = Math.max(st.burnDps, el.power);
        st.burnT = Math.max(st.burnT, el.duration);
        break;
      case 'thunder': {
        const r = el.radius * TILE * this.stats.radiusMult;
        const extra = Math.round(hitDmg * el.extra);
        for (const o of this.enemies) {
          if (o.dead || dist2(o.x, o.y, e.x, e.y) >= r * r) continue;
          this.damageEnemy(o, extra, { raw: true, noNumber: o !== e });
          if (o !== e) this.vis?.beam(e.x, e.y, o.x, o.y, { color: 0xfacc15, core: 0xffffff, jitter: 3, life: 0.22 });
        }
        this.vis?.ring(e.x, e.y, r, { color: 0xfacc15, width: 1, life: 0.3, scaleTo: 1.05, fill: 0.12 });
        this.vis?.oneShot('effects/impact_medium', e.x, e.y, { tint: 0xfacc15 });
        break;
      }
    }
  }

  private statusTick(dt: number) {
    const actors: Actor[] = this.enemies;
    for (const a of actors) {
      const st = a.status;
      st.freezeT = Math.max(0, st.freezeT - dt);
      st.slowT = Math.max(0, st.slowT - dt);
      if (st.slowT <= 0) st.slowMult = 1;
      st.vulnT = Math.max(0, st.vulnT - dt);
      st.tick += dt;
      if (st.poison.length) {
        for (const p of st.poison) p.t -= dt;
        st.poison = st.poison.filter((p) => p.t > 0);
      }
      if (st.burnT > 0) st.burnT -= dt;
      if (st.tick >= 1) {
        st.tick -= 1;
        const e = a as Enemy;
        const poison = e.poisonTotal();
        // Poison: 1 damage per stack per second; ignores damage multipliers and cannot crit (wiki).
        if (poison > 0) {
          this.damageEnemy(e, poison * POISON_DPS_PER_STACK, { raw: true });
          this.vis?.timed('effects/poison_bubbles.png', e.x, e.y - 6, 0.5, { vy: -10 });
        }
        if (st.burnT > 0) {
          const pct = e.boss ? 0.003 : 0.05;
          this.damageEnemy(e, Math.max(st.burnDps, e.maxHp * pct), { raw: true });
          this.vis?.timed('effects/burn_flames.png', e.x, e.y - 6, 0.5, { vy: -8 });
        }
        if (this.stats.enemyRegen > 0 && !e.def.dummy) e.hp = Math.min(e.maxHp, e.hp + this.stats.enemyRegen);
      }
    }
  }

  killEnemy(e: Enemy, info: HitInfo = {}) {
    if (e.dead) return;
    e.dead = true;
    e.onDeath();
    this.run.kills++;
    if (info.spellId) this.run.spellKills[info.spellId] = (this.run.spellKills[info.spellId] ?? 0) + 1;
    this.vis?.oneShot('effects/death_puff', e.x, e.y);
    this.sfx('die', 0.6);
    if (!e.minion) this.dropLoot(e);
    for (const r of this.run.relics) RELICS[r.id]?.onKill?.(this, r.lv, e);
    for (const c of this.run.curses) {
      const def = this.content.curse[c];
      if (def) CURSES[c]?.onKill?.(this, def.params, e);
    }
    this.player.onKill(e);
    if (e.boss && info.spellId === 'sword_of_judgement') this.run.spellKills.__judgeBoss = 1;
    if (e.boss) this.hooks.onBossDefeated?.(e);
  }

  private dropLoot(e: Enemy) {
    const r = this.rng;
    const coins = e.boss ? r.int(12, 20) : e.elite ? r.int(5, 9) : r.chance(0.45) ? r.int(1, 2) : 0;
    for (let i = 0; i < coins; i++) this.spawnPickup('coin', e.x, e.y, 1);
    const crystals = e.boss ? 12 + this.run.chapter * 6 : e.elite ? 5 + this.run.chapter * 2 : r.chance(0.35) ? 1 : 0;
    for (let i = 0; i < Math.min(crystals, 12); i++) this.spawnPickup('crystal', e.x, e.y, crystals > 12 ? Math.ceil(crystals / 12) : 1);
    if (e.boss) this.spawnPickup('blood', e.x, e.y, 1 + (this.run.difficulty >= 2 ? 1 : 0));
    if (e.elite && r.chance(0.5)) this.spawnPickup('key', e.x, e.y);
    if (!e.boss && r.chance(0.03)) this.spawnPickup('heart', e.x, e.y, 5);
    if (!e.boss && r.chance(0.015)) this.spawnPickup('potion', e.x, e.y, 1, r.pick(this.content.data.potions).id);
  }

  /** Damage the player (enemy bullets, contact, traps, own indiscriminate spells). */
  hurtPlayer(amount: number, opts: { indiscriminate?: boolean; trap?: boolean; ignoreInvuln?: boolean } = {}) {
    const pl = this.player;
    if (pl.dead || (pl.invuln > 0 && !opts.ignoreInvuln) || pl.setInvuln > 0) return;
    if (!opts.trap && !opts.indiscriminate && this.rng.chance(this.stats.dodge)) {
      this.vis?.number(pl.x, pl.y - 14, 'DODGE', 0x93c5fd);
      pl.invuln = 0.3;
      return;
    }
    let dmg = amount * this.stats.dmgTakenMult;
    if (opts.indiscriminate) dmg *= this.stats.indiscriminateMult;
    if (opts.trap) dmg *= this.stats.trapDmgMult;
    dmg = Math.max(1, Math.round(dmg));
    // Arcane Barrier: damage is paid with wand MP (3% of max MP per point).
    if (pl.absorbWithBarrier(dmg)) return;
    const run = this.run;
    const fromTemp = Math.min(run.tempShield, dmg);
    run.tempShield -= fromTemp;
    dmg -= fromTemp;
    const fromShield = Math.min(run.shield, dmg);
    run.shield -= fromShield;
    dmg -= fromShield;
    if (dmg > 0) {
      pl.hp -= dmg;
      run.bossHit = true;
    }
    pl.invuln = 0.8;
    pl.flashT = 0.15;
    pl.onDamaged();
    this.vis?.shake(3, 0.2);
    this.vis?.flash(0xff2050, 0.12);
    this.vis?.number(pl.x, pl.y - 14, `-${amount | 0}`, 0xff6b81);
    this.sfx('hurt');
    for (const r of run.relics) RELICS[r.id]?.onHurt?.(this, r.lv);
    for (const c of run.curses) {
      const def = this.content.curse[c];
      if (def) CURSES[c]?.onHurt?.(this, def.params);
    }
    if (pl.hp <= 0) {
      const hourglass = run.relics.find((r) => r.id === 'hourglass_of_time');
      if (hourglass) {
        run.relics = run.relics.filter((r) => r !== hourglass);
        pl.hp = Math.round(this.stats.maxHp * (hourglass.lv >= 2 ? 0.8 : 0.5));
        pl.invuln = 2;
        this.toast('The hourglass turns back time!', 0xfacc15);
        this.sfx('levelUp');
        this.hooks.onDoor?.('stats');
        return;
      }
      pl.hp = 0;
      run.spellKills.__diedIndisc = opts.indiscriminate ? 1 : 0;
      pl.die();
      this.hooks.onPlayerDeath?.();
    }
  }

  /** Area damage at a point. Indiscriminate spells also hit the player. */
  explode(x: number, y: number, radius: number, dmg: number, crit: number, opts: { faction?: Faction; elements?: ElementMod[]; indiscriminate?: boolean; spellId?: string; fx?: string; tint?: number } = {}) {
    const r2 = radius * radius;
    if ((opts.faction ?? 'player') === 'player') {
      for (const e of this.enemies) {
        if (e.dead || dist2(x, y, e.x, e.y) > (radius + e.hr) ** 2) continue;
        const h = this.rollHit(dmg, crit, e);
        const dx = e.x - x;
        const dy = e.y - y;
        const d = Math.hypot(dx, dy) || 1;
        this.damageEnemy(e, h.dmg, { crit: h.crit, elements: opts.elements, spellId: opts.spellId, knock: { x: dx / d, y: dy / d, f: 60 * this.stats.knockbackMult } });
      }
      this.breakPropsIn(x, y, radius);
    }
    if (opts.faction === 'enemy' || opts.indiscriminate) {
      if (dist2(x, y, this.player.x, this.player.y) < r2) this.hurtPlayer(opts.faction === 'enemy' ? dmg : Math.round(dmg * 0.25), { indiscriminate: opts.indiscriminate });
    }
    if (this.vis) {
      const size = radius > 30 ? 'large' : radius > 14 ? 'medium' : 'small';
      this.vis.oneShot(opts.fx ?? `effects/impact_${size}`, x, y, { scale: Math.max(1, (radius * 2) / 32 / (size === 'large' ? 1.4 : 1)), tint: opts.tint });
      if (radius > 20) this.vis.shake(2, 0.12);
    }
    this.sfx('explode', 0.5);
  }

  /** A player projectile at (x, y) touched a breakable prop. Returns true if it hit one. */
  hitProps(x: number, y: number, r: number): boolean {
    let hit = false;
    for (const p of this.props) {
      if (p.hp === undefined || p.dead || dist2(x, y, p.x, p.y) > (r + p.r + 1) ** 2) continue;
      hit = true;
      p.hp -= 1;
      if (p.hp <= 0) {
        p.dead = true;
        p.onBreak?.(this);
        this.vis?.oneShot('effects/death_puff', p.x, p.y);
        this.sfx('die', 0.5);
      }
    }
    return hit;
  }

  breakPropsIn(x: number, y: number, r: number) {
    for (const p of this.props) {
      if (p.hp === undefined || p.dead) continue;
      if (dist2(x, y, p.x, p.y) < (r + p.r) ** 2) {
        p.hp -= 1;
        if (p.hp <= 0) {
          p.dead = true;
          p.onBreak?.(this);
          this.vis?.oneShot('effects/death_puff', p.x, p.y);
          this.sfx('die', 0.5);
        }
      }
    }
  }

  /** Spike tiles hurt walkers. */
  checkHazards(a: Actor): boolean {
    return !a.flying && this.tileUnder(a.x, a.y) === T_SPIKES;
  }

  isPit(x: number, y: number): boolean {
    return this.tileUnder(x, y) === T_PIT;
  }
}

function pickupArt(kind: PickupKind, potionId: string | undefined, content: Content): string {
  switch (kind) {
    case 'coin': return 'pickups/coin';
    case 'heart': return 'pickups/heart';
    case 'key': return 'pickups/key';
    case 'shield': return 'pickups/shield_cell';
    case 'crystal': return 'pickups/crystal_meta';
    case 'blood': return 'pickups/blood_drop';
    case 'diamond': return 'pickups/diamond';
    case 'potion': return (content.potion[potionId ?? '']?.icon ?? 'pickups/potion_red.png').replace(/\.png$/, '');
  }
}
