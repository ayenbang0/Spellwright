import { Container, Sprite } from 'pixi.js';
import { angleDiff, angleTo, dist2, M } from '../core/math';
import type { Actor, Faction } from './entities';
import type { Enemy } from './enemies';
import type { CastCtx } from './spells';
import type { CastItem, ElementMod } from './wand';
import type { HitInfo, World } from './world';
import { AnimSprite } from './visuals';

export interface ProjOpts {
  faction: Faction;
  x: number;
  y: number;
  angle: number;
  speed: number;       // px/s
  life: number;        // s
  r: number;           // hit radius px
  dmg: number;         // per hit (or per second when dps)
  crit?: number;
  dps?: boolean;
  tickRate?: number;
  pierce?: number;
  rebound?: number;
  reflect?: number;
  elements?: ElementMod[];
  art?: string;        // anim base, e.g. "projectiles/magic_bullet"
  rotate?: boolean;
  tags?: string[];
  trail?: string | null;
  item?: CastItem | null;
  spellId?: string;
  wandUid?: number;
  indiscriminate?: boolean;
  wallPierce?: boolean;
  scale?: number;
  tint?: number;
}

/**
 * A moving damaging thing (player spells and enemy bullets). Behaviour hooks give each spell its identity;
 * the generic part handles motion, trajectory boosts, walls, rebound, pierce, reflection, hits and completion.
 */
export class Proj {
  faction: Faction;
  x: number;
  y: number;
  vx: number;
  vy: number;
  speed: number;
  life: number;
  age = 0;
  r: number;
  dmg: number;
  crit: number;
  dps: boolean;
  tickRate: number;
  pierce: number;
  rebound: number;
  reflect: number;
  elements: ElementMod[];
  item: CastItem | null;
  /** Cast context that spawned this projectile (payload release, Mana Absorption refund…). */
  ctx: CastCtx | null = null;
  spellId: string;
  wandUid: number;
  indiscriminate: boolean;
  wallPierce: boolean;
  dead = false;
  ended = false;
  hovered = false;
  /** Knockback strength on hit. */
  knock = 40;
  /** Last hit time per target (re-hit gating for dps / pierce re-entry). */
  hits = new Map<Actor, number>();
  inside = new Set<Actor>();
  trajectory: 'track' | 'homing' | 'orbit' | null = null;
  homingDeg = 0;
  orbit: { r: number; a: number; w: number } | null = null;
  /** Hit points vs enemy bullets (Rock 'n' Ball, Pillar); 0 = doesn't block. */
  blockHp = 0;
  /** Destroys enemy bullets it touches (Evil Slayer Sword, Lightning Dash). */
  eraser = false;
  stopOnWall = true;
  /** Extra data for behaviours. */
  data: Record<string, number> = {};
  target: Enemy | null = null;
  onUpdate: ((p: Proj, dt: number) => void) | null = null;
  onHit: ((p: Proj, e: Actor) => void) | null = null;
  onEnd: ((p: Proj) => void) | null = null;
  recall: (() => void) | null = null;
  view: Container | null = null;
  private base: AnimSprite | null = null;
  private rotateView: boolean;
  private trailT = 0;
  private artBase: string;
  private tags: string[];
  private trail: string | null;
  private scale: number;
  private tint: number | undefined;

  constructor(private readonly w: World, o: ProjOpts) {
    this.faction = o.faction;
    this.x = o.x;
    this.y = o.y;
    this.speed = o.speed;
    this.vx = Math.cos(o.angle) * o.speed;
    this.vy = Math.sin(o.angle) * o.speed;
    this.life = o.life;
    this.r = o.r;
    this.dmg = o.dmg;
    this.crit = o.crit ?? 0;
    this.dps = o.dps ?? false;
    this.tickRate = o.tickRate ?? 4;
    this.pierce = o.pierce ?? 0;
    this.rebound = o.rebound ?? 0;
    this.reflect = o.reflect ?? 0;
    this.elements = o.elements ?? [];
    this.item = o.item ?? null;
    this.spellId = o.spellId ?? o.item?.spell.id ?? '';
    this.wandUid = o.wandUid ?? 0;
    this.indiscriminate = o.indiscriminate ?? false;
    this.wallPierce = o.wallPierce ?? false;
    this.artBase = o.art ?? (o.faction === 'enemy' ? 'projectiles/enemy_bullet' : 'projectiles/magic_bullet');
    this.rotateView = o.rotate ?? true;
    this.tags = o.tags ?? [];
    this.trail = o.trail === undefined ? (o.faction === 'player' ? 'effects/trail_cyan' : null) : o.trail;
    this.scale = o.scale ?? 1;
    this.tint = o.tint;
  }

  get angle(): number {
    return Math.atan2(this.vy, this.vx);
  }

  setAngle(a: number, speed = this.speed) {
    this.speed = speed;
    this.vx = Math.cos(a) * speed;
    this.vy = Math.sin(a) * speed;
  }

  // ---------------------------------------------------------------- view

  attachView() {
    const vis = this.w.vis;
    if (!vis) return;
    const art = vis.art;
    const root = new Container();
    if (art.hasAnim(this.artBase)) {
      this.base = vis.sprite(this.artBase);
      this.base.scale.set(this.scale);
      if (this.tint !== undefined) this.base.tint = this.tint;
      root.addChild(this.base);
    }
    // Visual stacking: base → element → behaviour → count pips (manifest.visualStacking).
    for (const tag of this.tags) {
      const p = `overlays/ov_${tag === 'slime' ? 'frost' : tag === 'twine' ? 'duet' : tag}.png`;
      if (!art.has(p)) continue;
      const o = new Sprite(art.tex(p));
      o.anchor.set(0.5);
      o.scale.set(Math.min(1, this.scale));
      if (tag === 'slime') o.tint = 0xbef264;
      root.addChild(o);
    }
    root.position.set(this.x, this.y);
    vis.projectiles.addChild(root);
    this.view = root;
  }

  sync(dt: number) {
    if (!this.view) return;
    this.view.position.set(Math.round(this.x), Math.round(this.y));
    if (this.base) {
      this.base.step(dt);
      if (this.rotateView && this.speed > 0.01) this.base.rotation = this.angle;
    }
    if (this.trail && this.speed > 20) {
      this.trailT -= dt;
      if (this.trailT <= 0) {
        this.trailT = 0.035;
        const vis = this.w.vis!;
        const path = `${this.trail}.png`;
        if (vis.art.has(path)) vis.trail(path, this.x, this.y, Math.max(0.6, this.scale * 0.8));
      }
    }
  }

  destroyView() {
    this.view?.destroy({ children: true });
    this.view = null;
  }

  // ---------------------------------------------------------------- simulation

  update(dt: number) {
    if (this.dead) return;
    const w = this.w;
    this.age += dt;
    if (this.age >= this.life) {
      if (this.data.hover && !this.hovered) {
        this.hovered = true;
        this.life += this.data.hover;
        this.vx = this.vy = 0;
        this.speed = 0;
      } else {
        this.end();
        return;
      }
    }
    this.steer(dt);
    this.onUpdate?.(this, dt);
    if (this.dead) return;
    if (!this.orbit) {
      const nx = this.x + this.vx * dt;
      const ny = this.y + this.vy * dt;
      if (!this.wallPierce && w.inWall(nx, ny)) {
        if (this.rebound > 0) {
          this.rebound--;
          this.life += 1;
          if (w.inWall(nx, this.y)) this.vx = -this.vx;
          if (w.inWall(this.x, ny)) this.vy = -this.vy;
          if (!w.inWall(nx, this.y) && !w.inWall(this.x, ny)) {
            this.vx = -this.vx;
            this.vy = -this.vy;
          }
        } else if (this.stopOnWall) {
          this.end();
          return;
        }
      } else {
        this.x = nx;
        this.y = ny;
      }
    }
    if (this.faction === 'player') {
      this.hitEnemies();
      if (!this.dead && !this.dps && w.hitProps(this.x, this.y, this.r) && this.pierce === 0) this.end();
    } else this.hitPlayer();
  }

  private steer(dt: number) {
    const w = this.w;
    if (this.orbit) {
      const o = this.orbit;
      o.a += o.w * dt;
      this.x = w.player.x + Math.cos(o.a) * o.r;
      this.y = w.player.y - 4 + Math.sin(o.a) * o.r;
      this.vx = -Math.sin(o.a) * this.speed;
      this.vy = Math.cos(o.a) * this.speed;
      return;
    }
    if (this.speed <= 0) return;
    let target: { x: number; y: number } | null = null;
    let turn = 0;
    if (this.trajectory === 'track') {
      target = { x: w.player.intent.aimX, y: w.player.intent.aimY };
      turn = 8;
    } else if (this.trajectory === 'homing' || this.homingDeg > 0) {
      if (!this.target || this.target.dead) this.target = w.nearestEnemy(this.x, this.y, 10 * M);
      target = this.target;
      turn = ((this.homingDeg || 12) * Math.PI) / 180 * (this.speed / M);
    }
    if (!target) return;
    const want = angleTo(this.x, this.y, target.x, target.y);
    const d = angleDiff(this.angle, want);
    const step = turn * dt;
    this.setAngle(this.angle + Math.max(-step, Math.min(step, d)));
  }

  private hitEnemies() {
    const w = this.w;
    const now = w.time;
    for (const e of w.enemies) {
      if (e.dead || e.untargetable) continue;
      const rr = this.r + e.hr;
      const inside = dist2(this.x, this.y, e.x, e.y) < rr * rr;
      if (!inside) {
        this.inside.delete(e);
        continue;
      }
      if (this.dps) {
        const last = this.hits.get(e) ?? -99;
        if (now - last < 1 / this.tickRate) continue;
        this.hits.set(e, now);
        this.applyHit(e, this.dmg / this.tickRate);
        continue;
      }
      // Penetrating spells only re-hit after leaving the hitbox.
      if (this.inside.has(e)) continue;
      this.inside.add(e);
      if (this.hits.has(e) && this.pierce <= 0) continue;
      this.hits.set(e, now);
      this.applyHit(e, this.dmg);
      if (this.dead) return;
      if (this.reflect > 0) {
        this.reflect--;
        const next = w.nearestEnemy(this.x, this.y, 8 * M, new Set([e, ...this.hits.keys()] as Enemy[]));
        if (next) {
          this.setAngle(angleTo(this.x, this.y, next.x, next.y));
          this.life = Math.max(this.life, this.age + 0.8);
          continue;
        }
      }
      if (this.pierce > 0) this.pierce--;
      else if (this.pierce === 0) {
        this.end();
        return;
      }
    }
    if (this.indiscriminate && this.data.hurtsPlayer && dist2(this.x, this.y, w.player.x, w.player.y) < (this.r + w.player.hr) ** 2) {
      w.hurtPlayer(Math.round(this.dmg * 0.25), { indiscriminate: true });
    }
  }

  applyHit(e: Enemy, amount: number) {
    const w = this.w;
    const h = w.rollHit(amount, this.crit, e);
    const len = this.speed || 1;
    const info: HitInfo = {
      crit: h.crit,
      elements: this.elements,
      src: this,
      spellId: this.spellId,
      knock: this.dps ? undefined : { x: this.vx / len, y: this.vy / len, f: this.knock * w.stats.knockbackMult },
    };
    w.damageEnemy(e, h.dmg, info);
    const tr = this.item?.mods.traction;
    if (tr && h.crit) {
      // Strong Traction: yank other foes onto the target and hit them for the same damage
      const others = w.enemies.filter((o) => o !== e && !o.dead && !o.boss && dist2(o.x, o.y, e.x, e.y) < tr.radius ** 2);
      w.rng.shuffle(others);
      for (const o of others.slice(0, tr.count)) {
        o.x += (e.x - o.x) * 0.6;
        o.y += (e.y - o.y) * 0.6;
        w.damageEnemy(o, h.dmg, { crit: true, spellId: this.spellId });
      }
    }
    if (!this.dps && w.vis) w.vis.oneShot('effects/hit_spark', e.x, e.y);
    w.player.onHitEnemy(this.wandUid);
    this.onHit?.(this, e);
  }

  private hitPlayer() {
    const w = this.w;
    const pl = w.player;
    if (pl.dead) return;
    // player bullets that block enemy shots
    for (const p of w.projs) {
      if (p.faction !== 'player' || p.dead || (!p.blockHp && !p.eraser)) continue;
      if (dist2(this.x, this.y, p.x, p.y) < (this.r + p.r) ** 2) {
        if (p.blockHp) {
          p.blockHp -= this.dmg;
          if (p.blockHp <= 0) p.end();
        }
        if (p.eraser && p.data.reflectShots) {
          this.faction = 'player';
          this.setAngle(this.angle + Math.PI);
          this.dmg *= 2;
          return;
        }
        this.kill();
        return;
      }
    }
    for (const s of w.summons) {
      if (!s.blocksBullets || s.dead) continue;
      if (dist2(this.x, this.y, s.x, s.y) < (this.r + s.hr) ** 2) {
        s.hurt(this.dmg);
        this.kill();
        return;
      }
    }
    if (dist2(this.x, this.y, pl.x, pl.y - 4) < (this.r + pl.hr) ** 2) {
      w.hurtPlayer(this.dmg);
      this.kill();
    }
  }

  /** Remove without completion effects (absorbed / blocked). */
  kill() {
    if (this.dead) return;
    this.dead = true;
    this.w.vis?.oneShot('effects/impact_small', this.x, this.y, { scale: 0.6, tint: this.faction === 'enemy' ? 0xf03cb4 : undefined });
  }

  /** Completion: impact, then any completion payload (Duet/Fireworks/Fuse/Split). */
  end() {
    if (this.ended) return;
    this.ended = true;
    this.dead = true;
    this.onEnd?.(this);
    if (this.faction === 'player') this.w.onProjectileEnd?.(this);
    else this.w.vis?.oneShot('effects/impact_small', this.x, this.y, { scale: 0.6, tint: 0xf03cb4 });
  }
}
