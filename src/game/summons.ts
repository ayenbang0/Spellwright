import { Graphics, Sprite } from 'pixi.js';
import { angleTo, clamp, dist, dist2, M } from '../core/math';
import { Actor } from './entities';
import type { Enemy } from './enemies';
import { Proj } from './projectiles';
import { castGroup, type CastCtx } from './spells';
import { areaRing, BONE, cadaverBlast, CYAN, GOLD, GREEN, PINK, RingAura, summonSpawn, VOID, YELLOW } from './spellfx';
import type { CastItem } from './wand';
import type { World } from './world';

type Kind = 'pop' | 'pillar' | 'grimoire' | 'hand' | 'skull' | 'parasite';

const ART: Record<Kind, string> = {
  pop: 'projectiles/pop_minion',
  pillar: 'projectiles/pillar_light',
  grimoire: 'projectiles/grimoire',
  hand: 'projectiles/cthulhu_hand',
  skull: 'projectiles/skull_minion',
  parasite: 'projectiles/wisp',
};

/** Each summon dies in its own way (visual only). */
const DEATH: Record<Kind, { anim: string; scale: number; tint?: number }> = {
  pop: { anim: 'effects/sx_bubble', scale: 0.8 },
  pillar: { anim: 'effects/sx_rays', scale: 0.8 },
  grimoire: { anim: 'effects/sx_star', scale: 0.7 },
  hand: { anim: 'effects/sx_smoke', scale: 0.9 },
  skull: { anim: 'effects/sx_wisp', scale: 0.8 },
  parasite: { anim: 'effects/sx_spark', scale: 0.6, tint: 0x84cc16 },
};

const SICK = 0xa3e635;

/** Player-allied creatures created by Summon spells. */
export class Summon extends Actor {
  dmg = 10;
  crit = 0;
  life: number;
  age = 0;
  cd = 0;
  blocksBullets: boolean;
  persistent: boolean;
  spellId: string;
  mp = 0;
  afterlife = 0;
  merged = false;
  private target: Enemy | null = null;
  private readonly afterlifeMax: number;
  // ---- visual-only state (never read by the simulation)
  private dripT = 0;
  private regenT = 0;
  private regenPulse = 0;
  private ghostShown = false;
  private halo: Sprite | null = null;
  private crown: Sprite | null = null;
  private ghostArc: Graphics | null = null;
  private tether: Graphics | null = null;
  private tetherOff: number[] = [];
  private tetherT = 0;
  private cordFrom: { x: number; y: number } | null = null;
  private cordPulse = 0;
  private cordLast = -9;
  private rangeRing: RingAura | null = null;
  private cadRing: RingAura | null = null;
  private pages: Sprite[] = [];

  constructor(
    private readonly w: World,
    readonly kind: Kind,
    readonly item: CastItem | null,
    private readonly ctx: CastCtx | null,
    x: number,
    y: number,
    hp: number,
  ) {
    super();
    this.x = x;
    this.y = y;
    this.hp = this.maxHp = hp;
    this.r = 3;
    this.hr = kind === 'pillar' ? 6 : 5;
    this.spellId = item?.spell.id ?? kind;
    this.blocksBullets = kind === 'pillar';
    this.persistent = kind === 'skull';
    this.flying = kind === 'grimoire' || kind === 'parasite';
    this.life =
      kind === 'hand' ? [20, 30, 40][item?.lv ?? 0] : kind === 'pillar' ? 12 : kind === 'parasite' ? 6 : 9999;
    if (kind === 'grimoire' && ctx?.wandStats) this.mp = ctx.wandStats.maxMp;
    this.afterlife = item?.mods.summonAfterlife ?? 0;
    this.afterlifeMax = this.afterlife;
  }

  attachView() {
    const vis = this.w.vis;
    if (!vis) return;
    this.view = vis.sprite(vis.art.hasAnim(ART[this.kind]) ? ART[this.kind] : 'projectiles/pop_minion');
    this.shadow = vis.shadow(this.kind === 'skull' ? 1.2 : 0.8);
    vis.actors.addChild(this.view);
    if (this.kind === 'skull') this.rangeRing = new RingAura(this.w, VOID, 16);
    if (this.kind === 'grimoire') {
      for (let i = 0; i < 2; i++) {
        const s = vis.staticSprite('effects/px_glint.png');
        vis.actors.addChild(s);
        this.pages.push(s);
      }
    }
  }

  sync(dt: number) {
    if (!this.view) return;
    this.view.step(dt);
    const bob = this.flying ? Math.sin(this.age * 4) * 2 : 0;
    const gx = this.w.snap(this.x);
    const gy = this.w.snap(this.y - 6 + bob);
    this.view.position.set(gx, gy);
    this.view.zIndex = this.y;
    this.decorate(dt, gx, gy);
    this.shadow?.position.set(this.w.snap(this.x), this.w.snap(this.y + 3));
  }

  /** Redraw at an interpolated world position (render time): the same placement as `sync`, with no animation or timer advance. */
  placeAt(x: number, y: number) {
    const sx = this.x;
    const sy = this.y;
    this.x = x;
    this.y = y;
    this.sync(0);
    this.x = sx;
    this.y = sy;
  }

  /** Per-kind auras and boost cues (parasite, troll, cord, fusion, cadaver, essence, indomitability). */
  private decorate(dt: number, gx: number, gy: number) {
    const vis = this.w.vis!;
    const view = this.view!;
    const m = this.item?.mods;
    const ghost = this.hp <= 0 && this.afterlife > 0;
    let tint = this.flashT > 0 ? 0xff8080 : 0xffffff;
    let alpha = 1;
    let scale = 1;
    const calm = this.flashT <= 0;

    if (this.kind === 'skull') this.rangeRing?.update(this.x, this.y - 2, (this.item?.spell.radius[this.item.lv] || 2.2) * M, dt, 0.5);
    else if (this.kind === 'grimoire') {
      for (let i = 0; i < this.pages.length; i++) {
        const a = this.age * 3 + i * Math.PI;
        this.pages[i].position.set(gx + Math.cos(a) * 9, gy + Math.sin(a) * 4 - 1);
        this.pages[i].zIndex = this.y + (Math.sin(a) > 0 ? 0.5 : -0.5);
        this.pages[i].alpha = 0.5 + 0.5 * clamp(this.mp / Math.max(1, this.ctx?.wandStats?.maxMp ?? 100), 0, 1);
      }
    } else if (this.kind === 'pillar' && this.life - this.age < 2 && Math.floor(this.age * 10) % 2) alpha = 0.5;

    const sick = this.kind === 'parasite' || (m?.summonDrain ?? 0) > 0;
    if (sick) {
      if (calm) tint = SICK;
      this.dripT -= dt;
      if (this.dripT <= 0) {
        this.dripT = 0.2 + Math.random() * 0.15;
        vis.timed('effects/px_drop.png', gx + (Math.random() - 0.5) * 6, gy + 2, 0.5, { vy: 22 });
      }
    }

    if (m) {
      if (m.summonRegen > 0) {
        scale *= 1.2;
        if (calm && !sick) tint = 0xbbf7d0;
        this.regenPulse = Math.max(0, this.regenPulse - dt);
        scale *= 1 + this.regenPulse * 0.4;
        if (this.hp > 0 && this.hp < this.maxHp) {
          this.regenT -= dt;
          if (this.regenT <= 0) {
            this.regenT = 0.8;
            this.regenPulse = 0.3;
            vis.ring(this.x, this.y - 4, 4, { color: GREEN, life: 0.4, scaleTo: 2.6 });
            vis.timed('effects/heal_cross.png', gx, gy - 6, 0.5, { vy: -14, scale: 0.6, tint: GREEN });
          }
        }
      }
      if (this.merged) {
        scale *= 1.3;
        if (calm && !sick) tint = 0xfff0b0;
        if (!this.crown) {
          this.crown = vis.staticSprite('effects/px_crown.png');
          vis.actors.addChild(this.crown);
        }
        this.crown.position.set(gx, gy - 9 * scale);
        this.crown.zIndex = this.y + 1;
      }
      if (m.essence) {
        if (!this.halo) {
          this.halo = vis.staticSprite('effects/px_halo.png');
          vis.actors.addChild(this.halo);
        }
        this.halo.position.set(gx, gy - 10 * scale + Math.sin(this.age * 3) * 1.2);
        this.halo.zIndex = this.y + 1;
        this.halo.alpha = ghost ? 0.4 : 1;
      }
      if (m.cadaver > 0 && this.hp > 0 && this.maxHp > 0) {
        // pulses red faster as the HP ratio nears the burst threshold
        const k = clamp(1 - (this.hp / this.maxHp - m.cadaver) / 0.2, 0, 1);
        if (k > 0) {
          const pulse = 0.5 + 0.5 * Math.sin(this.age * (8 + 14 * k));
          const g = Math.round(255 * (1 - k * pulse));
          if (calm) tint = (255 << 16) | (g << 8) | g;
          this.cadRing ??= new RingAura(this.w, 0xdc2626, 16);
          this.cadRing.update(this.x, this.y, 2.5 * M, dt, 0.25 + 0.5 * k * pulse);
        } else this.cadRing?.update(this.x, this.y, 2.5 * M, dt, 0);
      }
      if (m.cordDps > 0) this.drawTether(dt);
    }

    if (ghost) {
      const frac = this.afterlifeMax > 0 ? clamp(this.afterlife / this.afterlifeMax, 0, 1) : 0;
      tint = 0x9fd8ff;
      alpha = 0.3 + 0.3 * frac;
      if (this.afterlife < 1 && Math.floor(this.age * 14) % 2) alpha *= 0.5;
      if (!this.ghostShown) {
        this.ghostShown = true;
        vis.oneShot('effects/sx_wisp', gx, gy);
      }
      this.ghostArc ??= vis.fx.addChild(new Graphics());
      this.ghostArc.visible = true;
      this.ghostArc.clear().arc(0, 0, 9, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac).stroke({ width: 1, color: 0x9fd8ff });
      this.ghostArc.position.set(gx, gy);
      if (Math.random() < 0.15) vis.trail('effects/sx_trail_teal.png', gx + (Math.random() - 0.5) * 6, gy + 2, 0.9);
    } else if (this.ghostArc) this.ghostArc.visible = false;

    view.tint = tint;
    view.alpha = alpha;
    view.scale.set(this.faceLeft ? -scale : scale, scale);
  }

  /** Umbilical Cord: jagged link to the summon before it (or the caster), flaring when it damages a foe. */
  private drawTether(dt: number) {
    const vis = this.w.vis!;
    this.tether ??= vis.fx.addChild(new Graphics());
    const g = this.tether;
    const from = this.cordFrom;
    g.clear();
    if (!from) return;
    this.cordPulse = Math.max(0, this.cordPulse - dt);
    const fx = from.x;
    const fy = from.y - 6;
    const dx = this.x - fx;
    const dy = this.y - 6 - fy;
    const len = Math.hypot(dx, dy) || 1;
    const segs = Math.max(2, Math.round(len / 8));
    const jitter = this.cordPulse > 0 ? 2.5 : 1.2;
    this.tetherT -= dt;
    if (this.tetherT <= 0 || this.tetherOff.length < segs) {
      this.tetherT = 0.05;
      for (let i = 0; i < segs; i++) this.tetherOff[i] = (Math.random() * 2 - 1) * jitter;
    }
    const nx = -dy / len;
    const ny = dx / len;
    const path = (width: number, color: number) => {
      g.moveTo(fx, fy);
      for (let i = 1; i < segs; i++) g.lineTo(fx + (dx * i) / segs + nx * this.tetherOff[i], fy + (dy * i) / segs + ny * this.tetherOff[i]);
      g.lineTo(fx + dx, fy + dy);
      g.stroke({ width, color });
    };
    if (this.cordPulse > 0) {
      path(3, GOLD);
      path(1.5, 0xffffff);
    } else {
      path(2, CYAN);
      path(1, 0xffffff);
    }
  }

  destroyView() {
    this.view?.destroy();
    this.shadow?.destroy();
    this.halo?.destroy();
    this.crown?.destroy();
    this.ghostArc?.destroy();
    this.tether?.destroy();
    this.rangeRing?.destroy();
    this.cadRing?.destroy();
    for (const p of this.pages) p.destroy();
    this.view = null;
    this.shadow = null;
  }

  /** Fusion Summon: +100% stats, once. */
  merge() {
    if (this.merged) return;
    this.merged = true;
    this.maxHp *= 2;
    this.hp = this.maxHp;
    this.dmg *= 2;
    this.hr *= 1.3;
  }

  hurt(n: number) {
    this.hp -= n;
    this.flashT = 0.1;
    if (this.hp <= 0 && this.afterlife <= 0) this.kill();
  }

  kill() {
    if (this.dead) return;
    this.dead = true;
    const w = this.w;
    const death = DEATH[this.kind];
    w.vis?.oneShot(death.anim, this.x, this.y, { scale: death.scale, tint: death.tint });
    const m = this.item?.mods;
    if (!m) return;
    if (m.summonDrain > 0 && this.kind !== 'parasite') {
      const n = m.summonDrain >= 8 ? 5 : m.summonDrain >= 4 ? 3 : 2;
      w.vis?.ring(this.x, this.y - 4, 5, { color: SICK, width: 2, life: 0.35, scaleTo: 3.5 });
      w.vis?.timed('effects/poison_bubbles.png', this.x, this.y - 8, 0.5, { vy: -10 });
      for (let i = 0; i < n; i++) {
        const p = new Summon(w, 'parasite', null, null, this.x, this.y, 5);
        p.dmg = 15;
        p.crit = this.crit;
        w.addSummon(p);
        summonSpawn(w, 'parasite', p.x, p.y);
      }
    }
  }

  update(dt: number) {
    const w = this.w;
    this.age += dt;
    this.flashT = Math.max(0, this.flashT - dt);
    this.cd -= dt;
    const m = this.item?.mods;
    if (m) {
      if (m.summonRegen) this.hp = Math.min(this.maxHp, this.hp + m.summonRegen * dt);
      if (m.summonDrain) this.hp -= m.summonDrain * dt;
      if (m.cordDps) this.cord(dt, m.cordDps);
      // Cadaver Explosion: below the threshold the summon bursts for its remaining HP.
      if (m.cadaver > 0 && this.hp > 0 && this.hp < this.maxHp * m.cadaver) {
        w.explode(this.x, this.y, 2.5 * M, Math.round(this.hp), this.crit, { elements: m.elements, spellId: 'cadaver_explosion', fx: 'effects/sx_blast_red' });
        cadaverBlast(w, this.x, this.y, 2.5 * M);
        this.hp = 0;
        this.afterlife = 0;
        this.kill();
        return;
      }
    }
    if (this.hp <= 0) {
      this.afterlife -= dt;
      if (this.afterlife <= 0) {
        this.kill();
        return;
      }
    }
    if (this.age >= this.life) {
      this.kill();
      return;
    }
    const speedMult = m?.summonSpeedMult ?? 1;
    if (!this.target || this.target.dead) this.target = w.nearestEnemy(this.x, this.y, 12 * M);
    const t = this.target;
    const pl = w.player;
    switch (this.kind) {
      case 'pop': {
        const goal = t ?? pl;
        const d = dist(this.x, this.y, goal.x, goal.y);
        const want = t ? 3.5 * M : 1.5 * M;
        if (d > want) {
          const a = angleTo(this.x, this.y, goal.x, goal.y);
          w.moveActor(this, Math.cos(a) * 4 * M * speedMult * dt, Math.sin(a) * 4 * M * speedMult * dt);
          this.faceLeft = Math.cos(a) < 0;
        }
        if (t && this.cd <= 0 && d < 6 * M) {
          this.cd = 0.8 / speedMult;
          const bomb = !!this.item?.mods.essence && w.rng.chance(0.2);
          const p = new Proj(w, {
            faction: 'player', x: this.x, y: this.y - 6, angle: angleTo(this.x, this.y, t.x, t.y), speed: 8 * M, life: 1, r: 3,
            dmg: this.dmg * (bomb ? 3 : 1), crit: this.crit, art: 'projectiles/pop_shot', elements: this.item?.mods.elements, trail: 'effects/sx_trail_pink',
            scale: bomb ? 1.8 : 1, tags: bomb ? ['enlarge'] : [],
          });
          p.onEnd = (pp) => w.vis?.oneShot(bomb ? 'effects/sx_blast' : 'effects/sx_bubble', pp.x, pp.y, { scale: bomb ? 0.6 : 0.5 });
          if (w.vis) {
            const ma = p.angle;
            w.vis.ring(this.x + Math.cos(ma) * 6, this.y - 6 + Math.sin(ma) * 6, 3, { color: PINK, life: 0.2, scaleTo: 2 });
          }
          w.addProj(p);
        }
        break;
      }
      case 'pillar': {
        // Blocks enemy bullets; burns enemies that touch it.
        for (const e of w.enemies) {
          if (e.dead || dist2(e.x, e.y, this.x, this.y) > (this.hr + e.hr + 2) ** 2) continue;
          if (this.cd > 0) continue;
          const pct = [0, 0.4, 0.8][this.item?.lv ?? 0];
          const big = pct && !e.def.dummy ? e.maxHp * pct * (e.boss ? 0.02 : 1) : 0;
          // pillars also pass their boosts' elements on to whatever touches them
          w.damageEnemy(e, Math.max(this.dmg, big), { elements: this.item?.mods.elements, spellId: 'pillar_of_light' });
          w.vis?.oneShot('effects/sx_rays', e.x, e.y, { scale: 0.5 });
          this.cd = 0.5;
        }
        break;
      }
      case 'grimoire': {
        const stats = this.ctx?.wandStats;
        const regen = (stats?.regen ?? 10) * [0.5, 0.75, 1.1][this.item?.lv ?? 0];
        this.mp = Math.min(stats?.maxMp ?? 100, this.mp + regen * dt);
        const hx = pl.x + Math.cos(this.age * 1.3 + this.maxHp) * 18;
        const hy = pl.y - 14 + Math.sin(this.age * 1.3 + this.maxHp) * 8;
        const a = angleTo(this.x, this.y, hx, hy);
        const d = dist(this.x, this.y, hx, hy);
        if (d > 2) w.moveActor(this, Math.cos(a) * Math.min(d, 90 * dt), Math.sin(a) * Math.min(d, 90 * dt));
        const payload = this.item?.payload;
        if (payload && this.ctx && this.cd <= 0 && this.mp >= payload.mp) {
          const summonsPayload = payload.items.some((i) => i.spell.type === 'Summon');
          if (!summonsPayload && !t) break;
          this.mp -= payload.mp;
          // a Grimoire behaves like a one-group wand: after each cast it waits the wand's recharge
          this.cd = Math.max(1 / 60, (stats?.cd ?? 0.5) + payload.cdAdd);
          const ang = t ? angleTo(this.x, this.y, t.x, t.y) : 0;
          const maxMp = stats?.maxMp ?? 100;
          if (w.vis) {
            w.vis.ring(this.x, this.y - 6, 4, { color: YELLOW, life: 0.25, scaleTo: 3 });
            if (t) w.vis.beam(this.x, this.y - 6, t.x, t.y, { color: YELLOW, jitter: 0, life: 0.12 });
          }
          castGroup(w, payload, this.x, this.y - 6, ang, {
            ...this.ctx, depth: this.ctx.depth + 1, channel: null, refund: payload.mp, mirrored: 0, dmgScale: 1, wand: null,
            refundSink: (n) => void (this.mp = Math.min(maxMp, this.mp + n)),
          });
        }
        break;
      }
      case 'hand': {
        if (t && this.cd <= 0) {
          this.cd = 1.1 / speedMult;
          const tx = t.x;
          const ty = t.y;
          w.vis?.zone(tx, ty, 10, { life: 0.3, color: VOID });
          w.after(0.3, () => {
            w.vis?.oneShot('projectiles/cthulhu_hand', tx, ty - 6);
            w.explode(tx, ty, 10, this.dmg, this.crit, { elements: this.item?.mods.elements, spellId: 'hand_of_the_cthulhu', fx: 'effects/sx_crack' });
            areaRing(w, tx, ty, 10, VOID);
          });
        }
        break;
      }
      case 'skull': {
        const goal = t ?? pl;
        const d = dist(this.x, this.y, goal.x, goal.y);
        if (d > (t ? 10 : 22)) {
          const a = angleTo(this.x, this.y, goal.x, goal.y);
          w.moveActor(this, Math.cos(a) * 3.5 * M * speedMult * dt, Math.sin(a) * 3.5 * M * speedMult * dt);
          this.faceLeft = Math.cos(a) < 0;
        }
        const tick = 1 / 3;
        if (this.cd <= 0 && t) {
          this.cd = tick / speedMult;
          const radius = (this.item?.spell.radius[this.item.lv] || 2.2) * M;
          const bonus = this.item && this.item.lv > 0 && this.ctx?.wandStats ? 1 + this.ctx.wandStats.maxMp * (this.item.lv === 1 ? 0.001 : 0.002) : 1;
          let healed = 0;
          let beams = 0;
          for (const e of w.enemies) {
            if (e.dead || dist2(e.x, e.y, this.x, this.y) > radius * radius) continue;
            const h = w.rollHit((this.dmg * tick) * bonus, this.crit, e);
            w.damageEnemy(e, h.dmg, { crit: h.crit, elements: this.item?.mods.elements, spellId: 'skull_of_the_cthulhu', noNumber: true });
            healed += 1;
            if (w.vis && beams++ < 3) w.vis.beam(e.x, e.y - 2, this.x, this.y - 6, { color: VOID, core: BONE, jitter: 2, life: 0.14 });
          }
          this.hp = Math.min(this.maxHp, this.hp + healed);
          if (healed > 0 && w.vis) {
            w.vis.ring(this.x, this.y, radius, { color: VOID, life: 0.25 });
            w.vis.timed('effects/heal_cross.png', this.x, this.y - 10, 0.4, { vy: -14, scale: 0.6 });
          }
        }
        break;
      }
      case 'parasite': {
        if (!t) break;
        const a = angleTo(this.x, this.y, t.x, t.y);
        w.moveActor(this, Math.cos(a) * 6 * M * dt, Math.sin(a) * 6 * M * dt);
        if (dist2(this.x, this.y, t.x, t.y) < (t.hr + 4) ** 2) {
          w.damageEnemy(t, this.dmg, {});
          this.kill();
        }
        break;
      }
    }
    // contact damage from enemies
    for (const e of w.enemies) {
      if (e.dead || e.passive) continue;
      if (dist2(e.x, e.y, this.x, this.y) < (e.hr + this.hr) ** 2 && this.kind !== 'pillar') {
        this.hurt(e.def.contact * dt * 2);
      }
    }
  }

  /**
   * Umbilical Cord: summons form a chain — the first is tied to the caster, every later one to the summon before it —
   * and each link damages enemies along it, so a cluster of summons weaves a net.
   */
  private cord(dt: number, dps: number) {
    const w = this.w;
    const list = w.summons;
    const idx = list.indexOf(this);
    let from: { x: number; y: number } = w.player;
    for (let i = idx - 1; i >= 0; i--) {
      if (list[i].spellId === this.spellId && !list[i].dead) {
        from = list[i];
        break;
      }
    }
    const len = dist(from.x, from.y, this.x, this.y);
    if (len < 4) {
      this.cordFrom = null;
      return;
    }
    this.cordFrom = from;
    const ax = (this.x - from.x) / len;
    const ay = (this.y - from.y) / len;
    let struck: Enemy | null = null;
    for (const e of w.enemies) {
      if (e.dead) continue;
      const t = Math.max(0, Math.min(len, (e.x - from.x) * ax + (e.y - from.y) * ay));
      if (dist2(from.x + ax * t, from.y + ay * t, e.x, e.y) < (e.hr + 3) ** 2) {
        w.damageEnemy(e, dps * dt, { raw: true, noNumber: true, dot: true });
        struck = e;
      }
    }
    // flare the link (and spark on the foe) at most every 0.3 s while it burns something
    if (struck && w.vis && this.age - this.cordLast > 0.3) {
      this.cordLast = this.age;
      this.cordPulse = 0.18;
      w.vis.burst(struck.x, struck.y, { color: CYAN, rays: 5, r0: 2, r1: 7, life: 0.18 });
    }
  }
}
