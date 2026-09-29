/**
 * Bosses: HP from the wiki boss table (wiki/data/bosses.json); patterns are our design.
 * Every attack uses the shared sequence telegraph (boss *_telegraph.png + red circle/line) → windup → fire.
 */
import { angleTo, dist, M } from '../core/math';
import { Enemy, ENEMIES, type EnemyDef } from './enemies';
import { enemyBullet } from './spells';
import type { World } from './world';

type Move = 'chase' | 'strafe' | 'still' | 'bounce' | 'charge' | 'teleport' | 'mirror';
type Attack =
  | { k: 'ring'; n: number; sp: number; kind?: Kind }
  | { k: 'spread'; n: number; deg: number; sp: number; kind?: Kind }
  | { k: 'spiral'; n: number; sp: number; arms: number; kind?: Kind }
  | { k: 'burst'; n: number; sp: number; kind?: Kind }
  | { k: 'charge'; times: number }
  | { k: 'summon'; id: string; n: number }
  | { k: 'rain'; n: number; r: number }
  | { k: 'homing'; n: number; sp: number }
  | { k: 'lines'; n: number; sp: number };
type Kind = 'bullet' | 'diamond' | 'orb';

export interface BossDef {
  id: string;
  chapter: number;
  hp: number;
  move: Move;
  speed: number;
  attacks: Attack[];
  /** Seconds between attacks at full HP (scales down to 60% below half HP). */
  gap: number;
  /** Later phases (HP fraction below which they start): new sprite group and attack list. */
  phases?: { below: number; art: string; attacks: Attack[]; gap?: number }[];
}

export const BOSSES: Record<string, BossDef> = {
  giant_spider: { id: 'giant_spider', chapter: 1, hp: 650, move: 'chase', speed: 1.4, gap: 1.6, attacks: [{ k: 'spread', n: 5, deg: 70, sp: 3.2 }, { k: 'summon', id: 'spider', n: 3 }, { k: 'ring', n: 12, sp: 3.5 }] },
  wandering_worm: { id: 'wandering_worm', chapter: 1, hp: 650, move: 'charge', speed: 1.6, gap: 1.5, attacks: [{ k: 'charge', times: 3 }, { k: 'ring', n: 10, sp: 4 }, { k: 'spread', n: 3, deg: 30, sp: 5 }] },
  deceiver: { id: 'deceiver', chapter: 1, hp: 650, move: 'mirror', speed: 2.4, gap: 1.4, attacks: [{ k: 'spread', n: 7, deg: 60, sp: 5 }, { k: 'burst', n: 6, sp: 6 }] },
  irate_eye: { id: 'irate_eye', chapter: 1, hp: 650, move: 'bounce', speed: 3, gap: 1.6, attacks: [{ k: 'homing', n: 1, sp: 3 }, { k: 'ring', n: 12, sp: 3.5 }] },
  chaotic_wreckage: { id: 'chaotic_wreckage', chapter: 1, hp: 1700, move: 'charge', speed: 1.2, gap: 1.6, attacks: [{ k: 'charge', times: 2 }, { k: 'ring', n: 16, sp: 3.5 }, { k: 'spread', n: 5, deg: 50, sp: 4.5, kind: 'orb' }] },
  spider_egg: { id: 'spider_egg', chapter: 1, hp: 1500, move: 'still', speed: 0, gap: 1.8, attacks: [{ k: 'rain', n: 4, r: 1.4 }, { k: 'summon', id: 'spider', n: 3 }, { k: 'ring', n: 14, sp: 3, kind: 'orb' }] },
  deceiver2: { id: 'deceiver2', chapter: 2, hp: 3000, move: 'mirror', speed: 2.8, gap: 1.2, attacks: [{ k: 'spread', n: 9, deg: 80, sp: 5.5 }, { k: 'burst', n: 10, sp: 7, kind: 'diamond' }, { k: 'ring', n: 18, sp: 4 }] },
  hatcher: { id: 'hatcher', chapter: 2, hp: 3300, move: 'strafe', speed: 1, gap: 1.6, attacks: [{ k: 'summon', id: 'fly', n: 5 }, { k: 'ring', n: 16, sp: 3.5, kind: 'orb' }, { k: 'spread', n: 7, deg: 90, sp: 4 }] },
  master_mind: { id: 'master_mind', chapter: 2, hp: 3200, move: 'teleport', speed: 1.5, gap: 1.3, attacks: [{ k: 'spiral', n: 36, sp: 3.5, arms: 3, kind: 'diamond' }, { k: 'burst', n: 8, sp: 6 }, { k: 'lines', n: 4, sp: 5 }] },
  cage: { id: 'cage', chapter: 2, hp: 6000, move: 'still', speed: 0, gap: 1.4, attacks: [{ k: 'spiral', n: 48, sp: 3, arms: 4, kind: 'orb' }, { k: 'ring', n: 20, sp: 4 }, { k: 'summon', id: 'phantom', n: 2 }] },
  void_imp: { id: 'void_imp', chapter: 3, hp: 17000, move: 'teleport', speed: 2, gap: 1.2, attacks: [{ k: 'rain', n: 6, r: 1.6 }, { k: 'ring', n: 20, sp: 4, kind: 'orb' }, { k: 'spread', n: 9, deg: 70, sp: 6, kind: 'diamond' }] },
  all_seeing_eye: { id: 'all_seeing_eye', chapter: 3, hp: 19000, move: 'still', speed: 0, gap: 1.2, attacks: [{ k: 'lines', n: 6, sp: 5 }, { k: 'spiral', n: 60, sp: 3.5, arms: 5, kind: 'diamond' }, { k: 'homing', n: 3, sp: 3 }] },
  indescribable: { id: 'indescribable', chapter: 3, hp: 40000, move: 'still', speed: 0, gap: 1.1, attacks: [{ k: 'summon', id: 'centipede', n: 2 }, { k: 'spiral', n: 60, sp: 3.5, arms: 6 }, { k: 'spread', n: 13, deg: 120, sp: 5, kind: 'orb' }, { k: 'rain', n: 8, r: 1.4 }] },
  skeletal_centaur: { id: 'skeletal_centaur', chapter: 4, hp: 150000, move: 'charge', speed: 2.4, gap: 1, attacks: [{ k: 'charge', times: 3 }, { k: 'spread', n: 11, deg: 100, sp: 6, kind: 'diamond' }, { k: 'ring', n: 24, sp: 4.5 }] },
  abyssal_lord: { id: 'abyssal_lord', chapter: 4, hp: 290000, move: 'strafe', speed: 1.2, gap: 1, attacks: [{ k: 'ring', n: 28, sp: 3.5, kind: 'orb' }, { k: 'spiral', n: 72, sp: 3.5, arms: 6 }, { k: 'rain', n: 10, r: 1.6 }, { k: 'summon', id: 'leech', n: 3 }] },
  // Chapter 5 finale (design: not on the wiki): three phases with the demon_lord_p1..p3 sprites
  demon_lord: {
    id: 'demon_lord', chapter: 5, hp: 600_000, move: 'strafe', speed: 2, gap: 1.0,
    attacks: [{ k: 'spiral', n: 60, sp: 3.5, arms: 4 }, { k: 'spread', n: 9, deg: 90, sp: 5.5, kind: 'diamond' }, { k: 'summon', id: 'throne_knight', n: 2 }],
    phases: [
      { below: 0.66, art: 'bosses/boss_demon_lord_p2', gap: 0.9, attacks: [{ k: 'ring', n: 32, sp: 4, kind: 'orb' }, { k: 'rain', n: 8, r: 1.6 }, { k: 'homing', n: 4, sp: 3.5 }, { k: 'burst', n: 14, sp: 7, kind: 'diamond' }] },
      { below: 0.33, art: 'bosses/boss_demon_lord_p3', gap: 0.75, attacks: [{ k: 'spiral', n: 96, sp: 4, arms: 8 }, { k: 'lines', n: 8, sp: 5.5 }, { k: 'ring', n: 40, sp: 5 }, { k: 'rain', n: 12, r: 1.6 }, { k: 'summon', id: 'flesh_mass', n: 2 }] },
    ],
  },
  author: { id: 'author', chapter: 5, hp: 1_000_000, move: 'strafe', speed: 2, gap: 0.8, attacks: [{ k: 'spiral', n: 90, sp: 4, arms: 8 }, { k: 'burst', n: 16, sp: 7, kind: 'diamond' }, { k: 'ring', n: 36, sp: 5 }, { k: 'homing', n: 5, sp: 3.5 }] },
};

export const CHAPTER_BOSSES: Record<number, string[]> = {
  1: ['giant_spider', 'wandering_worm', 'deceiver', 'irate_eye', 'chaotic_wreckage', 'spider_egg'],
  2: ['deceiver2', 'hatcher', 'master_mind', 'cage'],
  3: ['void_imp', 'all_seeing_eye', 'indescribable'],
  4: ['skeletal_centaur', 'abyssal_lord'],
};

export interface BossScript {
  update(e: Enemy, dt: number): void;
  onDeath?(e: Enemy): void;
}

export function spawnBoss(w: World, id: string, x: number, y: number, hpMult = 1): Enemy {
  const b = BOSSES[id];
  const art = id === 'demon_lord' ? 'bosses/boss_demon_lord_p1' : `bosses/boss_${id}`;
  const def: EnemyDef = { id: `boss_${id}`, art, hp: Math.round(b.hp * hpMult), speed: b.speed, contact: 14, ai: 'boss', r: 10, dmg: 9 + b.chapter * 2 };
  const e = new Enemy(w, def, x, y);
  e.boss = true;
  e.hr = 16;
  e.invuln = 1.2;
  e.telegraphSprite = `${art}_telegraph.png`;
  e.script = new Script(w, b);
  w.addEnemy(e);
  w.sfx('boss');
  w.vis?.shake(4, 0.5);
  return e;
}

class Script implements BossScript {
  private i = 0;
  private gapT = 1.2;
  private dashT = 0;
  private dashA = 0;
  private dashesLeft = 0;
  private moveA = 0;
  private tpT = 3;
  private phaseIdx = -1;

  constructor(private readonly w: World, private readonly b: BossDef) {}

  update(e: Enemy, dt: number) {
    const w = this.w;
    const pl = w.player;
    const rage = e.hp < e.maxHp * 0.5 ? 0.6 : 1;
    // phase changes (sprite swap, shockwave, breather)
    let idx = -1;
    this.b.phases?.forEach((p, k) => {
      if (e.hp < e.maxHp * p.below) idx = k;
    });
    if (idx !== this.phaseIdx) {
      this.phaseIdx = idx;
      if (idx >= 0) {
        e.swapArt(this.b.phases![idx].art);
        w.clearEnemyProjectiles();
        w.vis?.shake(5, 0.5);
        w.vis?.flash(0xffffff, 0.25);
        e.invuln = 1.2;
        this.gapT = 1.5;
        this.i = 0;
        w.sfx('boss');
      }
    }
    this.move(e, dt);
    if (e.phase !== 'idle' || this.dashT > 0) return;
    if (this.dashesLeft > 0) {
      this.dashesLeft--;
      this.telegraphCharge(e);
      return;
    }
    this.gapT -= dt;
    if (this.gapT > 0) return;
    const cur = this.phaseIdx >= 0 ? this.b.phases![this.phaseIdx] : null;
    const attacks = cur?.attacks ?? this.b.attacks;
    this.gapT = (cur?.gap ?? this.b.gap) * rage;
    const at = attacks[this.i++ % attacks.length];
    const tx = pl.x;
    const ty = pl.y;
    e.aimA = angleTo(e.x, e.y, tx, ty);
    if (at.k === 'charge') {
      this.dashesLeft = at.times - 1;
      this.telegraphCharge(e);
      return;
    }
    const shape = at.k === 'spread' || at.k === 'burst' || at.k === 'lines' || at.k === 'homing' ? 'line' : at.k === 'rain' ? 'target' : 'circle';
    if (at.k === 'rain') {
      // each impact point gets its own telegraph circle
      const pts: { x: number; y: number }[] = [];
      for (let k = 0; k < at.n; k++) {
        const a = w.rng.range(0, Math.PI * 2);
        const d = k === 0 ? 0 : w.rng.range(1, 4) * M;
        pts.push({ x: tx + Math.cos(a) * d, y: ty + Math.sin(a) * d });
      }
      for (const p of pts) w.vis?.timed('effects/telegraph_circle.png', p.x, p.y, 0.4, { scale: (at.r * M * 2) / 32, layer: w.vis.shadows, fade: false });
      e.beginAttack(() => {
        for (const p of pts) w.explode(p.x, p.y, at.r * M, e.dmg, 0, { faction: 'enemy', tint: 0xf03cb4 });
      }, 'target', tx, ty);
      return;
    }
    e.beginAttack(() => this.fire(e, at, tx, ty, rage), shape, tx, ty);
  }

  private telegraphCharge(e: Enemy) {
    const pl = this.w.player;
    e.aimA = angleTo(e.x, e.y, pl.x, pl.y);
    e.beginAttack(() => {
      this.dashA = e.aimA;
      this.dashT = 0.55;
    }, 'line');
  }

  private move(e: Enemy, dt: number) {
    const w = this.w;
    const pl = w.player;
    const sp = this.b.speed * M * e.speedMult;
    if (this.dashT > 0) {
      this.dashT -= dt;
      const hit = w.moveActor(e, Math.cos(this.dashA) * 12 * M * dt, Math.sin(this.dashA) * 12 * M * dt);
      if (hit.hitX || hit.hitY) {
        this.dashT = 0;
        w.vis?.shake(3, 0.15);
        for (let k = 0; k < 8; k++) enemyBullet(w, e.x, e.y, (k / 8) * Math.PI * 2, 3.5, e.dmg, 'bullet');
      }
      return;
    }
    if (e.phase !== 'idle') return;
    const c = w.room.center;
    switch (this.b.move) {
      case 'chase':
      case 'charge':
        if (dist(e.x, e.y, pl.x, pl.y) > 3 * M) this.step(e, pl.x, pl.y, sp, dt);
        break;
      case 'strafe':
        this.moveA += dt * 0.6;
        this.step(e, c.x + Math.cos(this.moveA) * 5 * M, c.y - 2 * M + Math.sin(this.moveA * 2) * 2 * M, sp, dt);
        break;
      case 'bounce': {
        if (!this.moveA) this.moveA = w.rng.range(0.3, 1.2);
        const hit = w.moveActor(e, Math.cos(this.moveA) * sp * dt, Math.sin(this.moveA) * sp * dt);
        if (hit.hitX) this.moveA = Math.PI - this.moveA;
        if (hit.hitY) this.moveA = -this.moveA;
        break;
      }
      case 'mirror':
        // mimics the player's movement mirrored through the room centre
        this.step(e, c.x * 2 - pl.x, c.y * 2 - pl.y - 2 * M, sp, dt);
        e.untargetable = false;
        if (e.hp < e.maxHp * 0.4 && e.view) e.view.alpha = 0.35 + 0.25 * Math.sin(e.t * 6);
        break;
      case 'teleport':
        this.tpT -= dt;
        if (this.tpT <= 0) {
          this.tpT = 3.5;
          const a = w.rng.range(0, Math.PI * 2);
          const nx = pl.x + Math.cos(a) * 5 * M;
          const ny = pl.y + Math.sin(a) * 5 * M;
          if (!w.blocked(nx, ny, e.r, true)) {
            w.vis?.oneShot('effects/death_puff', e.x, e.y, { scale: 2 });
            e.x = nx;
            e.y = ny;
            w.vis?.oneShot('effects/spawn', e.x, e.y, { scale: 2 });
          }
        }
        break;
      case 'still':
        break;
    }
  }

  private step(e: Enemy, tx: number, ty: number, sp: number, dt: number) {
    const d = dist(e.x, e.y, tx, ty);
    if (d < 2) return;
    const a = angleTo(e.x, e.y, tx, ty);
    this.w.moveActor(e, Math.cos(a) * Math.min(d, sp * dt), Math.sin(a) * Math.min(d, sp * dt));
    e.faceLeft = Math.cos(a) < 0;
  }

  private fire(e: Enemy, at: Attack, tx: number, ty: number, rage: number) {
    const w = this.w;
    const base = angleTo(e.x, e.y, tx, ty);
    const dmg = e.dmg;
    const extra = rage < 1 ? 1.25 : 1;
    switch (at.k) {
      case 'ring': {
        const n = Math.round(at.n * extra);
        const off = w.rng.range(0, 1);
        for (let i = 0; i < n; i++) enemyBullet(w, e.x, e.y, ((i + off) / n) * Math.PI * 2, at.sp, dmg, at.kind);
        break;
      }
      case 'spread':
        for (let i = 0; i < at.n; i++) enemyBullet(w, e.x, e.y, base + (i / Math.max(1, at.n - 1) - 0.5) * at.deg * (Math.PI / 180), at.sp, dmg, at.kind);
        break;
      case 'spiral': {
        const n = Math.round(at.n * extra);
        for (let i = 0; i < n; i++) {
          w.after((i / at.arms) * 0.05, () => {
            if (e.dead) return;
            const arm = i % at.arms;
            enemyBullet(w, e.x, e.y, (arm / at.arms) * Math.PI * 2 + i * 0.12, at.sp, dmg, at.kind);
          });
        }
        break;
      }
      case 'burst':
        for (let i = 0; i < at.n; i++)
          w.after(i * 0.07, () => {
            if (!e.dead) enemyBullet(w, e.x, e.y, angleTo(e.x, e.y, w.player.x, w.player.y) + w.rng.range(-0.15, 0.15), at.sp, dmg, at.kind);
          });
        break;
      case 'homing':
        for (let i = 0; i < at.n; i++) {
          const p = enemyBullet(w, e.x, e.y, base + (i - (at.n - 1) / 2) * 0.5, at.sp, dmg, 'orb', 6);
          p.onUpdate = (pp, dt) => {
            const want = angleTo(pp.x, pp.y, w.player.x, w.player.y);
            let d = want - pp.angle;
            while (d > Math.PI) d -= Math.PI * 2;
            while (d < -Math.PI) d += Math.PI * 2;
            pp.setAngle(pp.angle + Math.max(-1.6 * dt, Math.min(1.6 * dt, d)));
          };
        }
        break;
      case 'lines':
        for (let l = 0; l < at.n; l++) {
          const a = base + (l / at.n) * Math.PI * 2;
          for (let k = 0; k < 5; k++) w.after(k * 0.06, () => {
            if (!e.dead) enemyBullet(w, e.x, e.y, a, at.sp, dmg, 'diamond');
          });
        }
        break;
      case 'summon': {
        const def = ENEMIES[at.id];
        for (let i = 0; i < at.n && w.enemies.length < 30; i++) {
          const a = (i / at.n) * Math.PI * 2;
          const m = new Enemy(w, def, e.x + Math.cos(a) * 20, e.y + Math.sin(a) * 20, { minion: true });
          w.addEnemy(m);
        }
        break;
      }
      case 'charge':
      case 'rain':
        break;
    }
    w.sfx('enemyShoot');
  }
}
