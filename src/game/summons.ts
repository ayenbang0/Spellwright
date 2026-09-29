import { angleTo, dist, dist2, M } from '../core/math';
import { Actor } from './entities';
import type { Enemy } from './enemies';
import { Proj } from './projectiles';
import { castGroup, type CastCtx } from './spells';
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
  }

  attachView() {
    const vis = this.w.vis;
    if (!vis) return;
    this.view = vis.sprite(vis.art.hasAnim(ART[this.kind]) ? ART[this.kind] : 'projectiles/pop_minion');
    this.shadow = vis.shadow(this.kind === 'skull' ? 1.2 : 0.8);
    vis.actors.addChild(this.view);
  }

  sync(dt: number) {
    if (!this.view) return;
    this.view.step(dt);
    const bob = this.flying ? Math.sin(this.age * 4) * 2 : 0;
    this.view.position.set(Math.round(this.x), Math.round(this.y - 6 + bob));
    this.view.zIndex = this.y;
    this.view.scale.x = this.faceLeft ? -1 : 1;
    this.view.tint = this.flashT > 0 ? 0xff8080 : 0xffffff;
    this.view.alpha = this.hp <= 0 ? 0.5 : 1;
    this.shadow?.position.set(Math.round(this.x), Math.round(this.y + 3));
  }

  destroyView() {
    this.view?.destroy();
    this.shadow?.destroy();
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
    w.vis?.oneShot('effects/death_puff', this.x, this.y);
    const m = this.item?.mods;
    if (!m) return;
    if (m.summonDrain > 0 && this.kind !== 'parasite') {
      const n = m.summonDrain >= 8 ? 5 : m.summonDrain >= 4 ? 3 : 2;
      for (let i = 0; i < n; i++) {
        const p = new Summon(w, 'parasite', null, null, this.x, this.y, 5);
        p.dmg = 15;
        p.crit = this.crit;
        w.addSummon(p);
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
        w.explode(this.x, this.y, 2.5 * M, Math.round(this.hp), this.crit, { elements: m.elements, spellId: 'cadaver_explosion' });
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
            dmg: this.dmg * (bomb ? 3 : 1), crit: this.crit, art: 'projectiles/pop_shot', elements: this.item?.mods.elements, trail: null,
          });
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
          w.vis?.timed('effects/telegraph_circle.png', tx, ty, 0.3, { scale: 0.5, tint: 0x22d3ee, fade: false, layer: w.vis.shadows });
          w.after(0.3, () => {
            w.vis?.oneShot('projectiles/cthulhu_hand', tx, ty - 6);
            w.explode(tx, ty, 10, this.dmg, this.crit, { elements: this.item?.mods.elements, spellId: 'hand_of_the_cthulhu', fx: 'effects/hit_spark' });
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
          for (const e of w.enemies) {
            if (e.dead || dist2(e.x, e.y, this.x, this.y) > radius * radius) continue;
            const h = w.rollHit((this.dmg * tick) * bonus, this.crit, e);
            w.damageEnemy(e, h.dmg, { crit: h.crit, elements: this.item?.mods.elements, spellId: 'skull_of_the_cthulhu', noNumber: true });
            healed += 1;
          }
          this.hp = Math.min(this.maxHp, this.hp + healed);
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
    if (len < 4) return;
    const ax = (this.x - from.x) / len;
    const ay = (this.y - from.y) / len;
    for (const e of w.enemies) {
      if (e.dead) continue;
      const t = Math.max(0, Math.min(len, (e.x - from.x) * ax + (e.y - from.y) * ay));
      if (dist2(from.x + ax * t, from.y + ay * t, e.x, e.y) < (e.hr + 3) ** 2) w.damageEnemy(e, dps * dt, { raw: true, noNumber: true, dot: true });
    }
    if (w.vis && Math.floor(this.age * 20) % 3 === 0) {
      const k = w.rng.next();
      w.vis.timed('effects/trail_cyan.png', from.x + ax * len * k, from.y + ay * len * k, 0.15, { scale: 0.6 });
    }
  }
}
