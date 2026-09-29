import { Container, Sprite } from 'pixi.js';
import { angleTo, dist, dist2, M } from '../core/math';
import { Actor } from './entities';
import { enemyBullet } from './spells';
import type { BossScript } from './bosses';
import type { World } from './world';
import type { AnimSprite } from './visuals';

export type AiKind = 'chase' | 'keep' | 'charger' | 'hopper' | 'turret' | 'bouncer' | 'spawner' | 'phantom' | 'flyer' | 'thief' | 'dummy' | 'boss';

export type Pattern = 'aimed' | 'spread' | 'ring' | 'burst' | 'spiral' | 'lob';

export interface AttackDef {
  pattern: Pattern;
  count: number;
  spread: number;  // deg
  speed: number;   // m/s
  cd: number;      // s
  range: number;   // m
  kind: 'bullet' | 'diamond' | 'orb';
}

export interface EnemyDef {
  id: string;
  art: string;
  hp: number;
  speed: number;   // m/s
  contact: number;
  ai: AiKind;
  attack?: AttackDef;
  spawn?: string;  // spawner child id
  spawnMax?: number; // total children a spawner may hatch (default 3)
  r?: number;
  flying?: boolean;
  dummy?: boolean;
  /** Bullet damage (before chapter/difficulty scaling). */
  dmg?: number;
}

const A = (pattern: Pattern, count: number, spread: number, speed: number, cd: number, range = 7, kind: AttackDef['kind'] = 'bullet'): AttackDef => ({ pattern, count, spread, speed, cd, range, kind });

/** Roster per chapter. HP loosely follows the wiki monster table (wiki/data/monsters.json). */
export const ENEMIES: Record<string, EnemyDef> = {
  // Chapter 1 — forest
  spider: { id: 'spider', art: 'enemies/ch1/spider', hp: 50, speed: 3.2, contact: 8, ai: 'chase' },
  spider_red: { id: 'spider_red', art: 'enemies/ch1/spider_red', hp: 60, speed: 2.2, contact: 8, ai: 'keep', attack: A('aimed', 1, 0, 5, 2.2) },
  worm: { id: 'worm', art: 'enemies/ch1/worm', hp: 90, speed: 1.6, contact: 10, ai: 'charger' },
  eye_small: { id: 'eye_small', art: 'enemies/ch1/eye_small', hp: 60, speed: 2.5, contact: 8, ai: 'bouncer', attack: A('spread', 3, 30, 4.5, 2.6), flying: true },
  egg: { id: 'egg', art: 'enemies/ch1/egg', hp: 35, speed: 0, contact: 5, ai: 'spawner', spawn: 'spider', spawnMax: 3 },
  slime: { id: 'slime', art: 'enemies/ch1/slime', hp: 30, speed: 3, contact: 8, ai: 'hopper' },
  fly: { id: 'fly', art: 'enemies/ch1/fly', hp: 25, speed: 3.6, contact: 6, ai: 'flyer', flying: true },
  mushroom: { id: 'mushroom', art: 'enemies/ch1/mushroom', hp: 60, speed: 0, contact: 6, ai: 'turret', attack: A('ring', 6, 360, 3.5, 3) },
  // Chapter 2 — purgatory
  deceiver: { id: 'deceiver', art: 'enemies/ch2/deceiver', hp: 130, speed: 2.8, contact: 10, ai: 'phantom', attack: A('spread', 5, 50, 5, 2.4) },
  hatcher: { id: 'hatcher', art: 'enemies/ch2/hatcher', hp: 300, speed: 0.6, contact: 10, ai: 'spawner', spawn: 'fly', spawnMax: 6 },
  mind_mage: { id: 'mind_mage', art: 'enemies/ch2/mind_mage', hp: 200, speed: 2, contact: 8, ai: 'keep', attack: A('ring', 10, 360, 4, 3, 8, 'diamond') },
  cage: { id: 'cage', art: 'enemies/ch2/cage', hp: 450, speed: 0, contact: 12, ai: 'turret', attack: A('spiral', 12, 360, 3.5, 3.4, 9, 'orb') },
  phantom: { id: 'phantom', art: 'enemies/ch2/phantom', hp: 150, speed: 3, contact: 10, ai: 'phantom', attack: A('aimed', 3, 16, 6, 2) , flying: true },
  armor_spider: { id: 'armor_spider', art: 'enemies/ch2/armor_spider', hp: 300, speed: 4.2, contact: 0, ai: 'thief' },
  bat: { id: 'bat', art: 'enemies/ch2/bat', hp: 120, speed: 3.4, contact: 9, ai: 'flyer', attack: A('aimed', 1, 0, 5, 2.8), flying: true },
  // Chapter 3 — void
  void_imp: { id: 'void_imp', art: 'enemies/ch3/void_imp', hp: 320, speed: 2.4, contact: 12, ai: 'keep', attack: A('lob', 1, 0, 3, 2.6, 8, 'orb') },
  seeing_eye: { id: 'seeing_eye', art: 'enemies/ch3/seeing_eye', hp: 300, speed: 0, contact: 10, ai: 'turret', attack: A('burst', 6, 8, 7, 2.6, 10, 'diamond'), flying: true },
  absorber_flyer: { id: 'absorber_flyer', art: 'enemies/ch3/absorber_flyer', hp: 400, speed: 3.2, contact: 12, ai: 'flyer', flying: true },
  void_archer: { id: 'void_archer', art: 'enemies/ch3/void_archer', hp: 420, speed: 2.2, contact: 10, ai: 'keep', attack: A('spread', 3, 24, 7.5, 2.2, 10, 'diamond') },
  centipede: { id: 'centipede', art: 'enemies/ch3/centipede', hp: 500, speed: 3.8, contact: 14, ai: 'chase' },
  // Chapter 4 — abyss
  skeletal_warrior: { id: 'skeletal_warrior', art: 'enemies/ch4/skeletal_warrior', hp: 900, speed: 2.4, contact: 16, ai: 'charger' },
  abyss_tentacle: { id: 'abyss_tentacle', art: 'enemies/ch4/abyss_tentacle', hp: 700, speed: 0, contact: 14, ai: 'turret', attack: A('spiral', 16, 360, 4, 3, 10, 'bullet') },
  centaur_minion: { id: 'centaur_minion', art: 'enemies/ch4/centaur_minion', hp: 1200, speed: 3, contact: 16, ai: 'keep', attack: A('spread', 7, 70, 5.5, 2.6, 9, 'diamond') },
  leech: { id: 'leech', art: 'enemies/ch4/leech', hp: 500, speed: 3.4, contact: 12, ai: 'chase' },
  // Chapter 5 flavour (Author rooms)
  flesh_mass: { id: 'flesh_mass', art: 'enemies/ch5/flesh_mass', hp: 1500, speed: 1.5, contact: 16, ai: 'chase', attack: A('ring', 12, 360, 3.5, 3) },
  throne_knight: { id: 'throne_knight', art: 'enemies/ch5/throne_knight', hp: 2000, speed: 2.6, contact: 18, ai: 'charger' },
  // Training dummy
  dummy: { id: 'dummy', art: 'tiles/dummy', hp: 1e9, speed: 0, contact: 0, ai: 'dummy', dummy: true },
  // Relentless Snail curse
  snail: { id: 'snail', art: 'enemies/ch1/slime', hp: 1e9, speed: 0.6, contact: 10, ai: 'chase' },
};

export const CHAPTER_ROSTER: Record<number, string[]> = {
  1: ['spider', 'spider', 'spider_red', 'worm', 'eye_small', 'egg', 'slime', 'slime', 'fly', 'mushroom'],
  2: ['deceiver', 'hatcher', 'mind_mage', 'cage', 'phantom', 'bat', 'bat', 'spider_red', 'fly'],
  3: ['void_imp', 'seeing_eye', 'absorber_flyer', 'void_archer', 'centipede', 'centipede', 'bat'],
  4: ['skeletal_warrior', 'abyss_tentacle', 'centaur_minion', 'leech', 'leech', 'void_archer'],
};

export const ELITES: Record<number, string[]> = {
  1: ['spider', 'worm', 'mushroom'],
  2: ['mind_mage', 'cage', 'deceiver'],
  3: ['void_imp', 'void_archer', 'seeing_eye'],
  4: ['skeletal_warrior', 'centaur_minion'],
};

const DIFF_HP = [0.8, 1, 1.5, 2, 2.5, 3];
const DIFF_DMG = [0.7, 1, 1.2, 1.4, 1.6, 1.8];

type Phase = 'idle' | 'telegraph' | 'windup';

/** Hostile unit: AI movement + the mandatory attack sequence telegraph → windup → fire → impact. */
export class Enemy extends Actor {
  boss = false;
  elite = false;
  minion = false;
  passive = false;
  untargetable = false;
  invuln = 0;
  cd: number;
  t = 0;
  phase: Phase = 'idle';
  phaseT = 0;
  aimA = 0;
  dmgMult: number;
  speedMult = 1;
  script: BossScript | null = null;
  pending: (() => void) | null = null;
  private body: AnimSprite | null = null;
  private crown: Sprite | null = null;
  private hpBar: Container | null = null;
  private hpFill: Sprite | null = null;
  private dashT = 0;
  private dashA = 0;
  private hopT = 0;
  private spawned = 0;
  private wanderA = 0;
  scale = 1;
  telegraphSprite: string | null = null;
  /** Sprite group currently shown (bosses swap it between phases). */
  artBase: string;

  constructor(readonly w: World, readonly def: EnemyDef, x: number, y: number, opts: { elite?: boolean; minion?: boolean } = {}) {
    super();
    this.artBase = def.art;
    this.x = x;
    this.y = y;
    const chapter = Math.max(1, w.run.chapter);
    const diff = w.run.difficulty;
    this.elite = !!opts.elite;
    this.minion = !!opts.minion;
    this.scale = this.elite ? 1.35 : 1;
    this.maxHp = this.hp = Math.round(def.hp * (DIFF_HP[diff] ?? 1) * (this.elite ? 4 : 1) * (def.dummy ? 1 : 1));
    this.dmgMult = (DIFF_DMG[diff] ?? 1) * (1 + (chapter - 1) * 0.25);
    this.r = (def.r ?? 5) * this.scale;
    this.hr = 6 * this.scale;
    this.flying = !!def.flying;
    this.cd = w.rng.range(0.8, 2);
    this.wanderA = w.rng.range(0, Math.PI * 2);
    this.speedMult = w.stats.enemySpeedMult;
    this.passive = !!def.dummy || def.ai === 'thief';
    this.invuln = 0.4;
  }

  get dmg(): number {
    return Math.round((this.def.dmg ?? 8) * this.dmgMult);
  }

  // ---------------------------------------------------------------- view

  attachView() {
    const vis = this.w.vis;
    if (!vis) return;
    const art = vis.art;
    const base = art.hasAnim(this.def.art) ? this.def.art : 'enemies/ch1/spider';
    const eliteArt = this.def.art.replace('enemies/ch', 'enemies/elite_ch');
    this.body = vis.sprite(this.elite && art.hasAnim(eliteArt) ? eliteArt : base);
    this.body.scale.set(this.scale);
    this.shadow = vis.shadow(this.boss ? 3 : this.scale);
    const root = new Container();
    root.addChild(this.body);
    if (this.elite && !art.hasAnim(eliteArt) && art.has('ui/elite_crown.png')) {
      this.crown = new Sprite(art.tex('ui/elite_crown.png'));
      this.crown.anchor.set(0.5);
      this.crown.position.set(0, -10 * this.scale);
      root.addChild(this.crown);
    }
    if (!this.def.dummy && !this.boss) {
      this.hpBar = new Container();
      const bg = new Sprite(vis.white());
      bg.tint = 0x1b1b24;
      bg.width = 14;
      bg.height = 2;
      this.hpFill = new Sprite(vis.white());
      this.hpFill.tint = 0xf03cb4;
      this.hpFill.height = 2;
      this.hpBar.addChild(bg, this.hpFill);
      this.hpBar.position.set(-7, 10 * this.scale);
      root.addChild(this.hpBar);
    }
    this.view = this.body;
    vis.actors.addChild(root);
    this.root = root;
    root.position.set(this.x, this.y);
    vis.oneShot('effects/spawn', this.x, this.y, { layer: vis.shadows });
  }
  private root: Container | null = null;

  sync(dt: number) {
    if (!this.root || !this.body) return;
    const vis = this.w.vis!;
    const frozen = this.status.freezeT > 0;
    if (!frozen) this.body.step(dt);
    const hitPath = `${this.artBase}_hit.png`;
    if (this.flashT > 0 && vis.art.has(hitPath)) this.body.texture = vis.art.tex(hitPath);
    else if (this.telegraphSprite && this.phase !== 'idle' && vis.art.has(this.telegraphSprite)) this.body.texture = vis.art.tex(this.telegraphSprite);
    this.body.tint = frozen ? 0xa5f3fc : this.status.burnT > 0 ? 0xffb080 : this.status.poison.length ? 0xb6f7c1 : 0xffffff;
    this.body.scale.x = (this.faceLeft ? -1 : 1) * this.scale;
    const bob = this.flying ? Math.sin(this.t * 5) * 2 : 0;
    this.root.position.set(Math.round(this.x), Math.round(this.y - 4 * this.scale + bob));
    this.root.zIndex = this.y;
    if (this.phase === 'windup') this.body.scale.set((this.faceLeft ? -1 : 1) * this.scale * 1.15, this.scale * 1.15);
    this.shadow?.position.set(Math.round(this.x), Math.round(this.y + 4 * this.scale));
    if (this.hpBar && this.hpFill) {
      const show = this.w.stats.showHpBars > 0 || this.hp < this.maxHp;
      this.hpBar.visible = show;
      this.hpFill.width = Math.max(0, 14 * (this.hp / this.maxHp));
    }
  }

  /** Switch to another sprite group (boss phases). */
  swapArt(base: string) {
    this.artBase = base;
    this.telegraphSprite = `${base}_telegraph.png`;
    const vis = this.w.vis;
    if (vis && this.body) this.body.play(vis.art.anim(base), true);
  }

  destroyView() {
    this.root?.destroy({ children: true });
    this.shadow?.destroy();
    this.root = null;
    this.body = null;
    this.shadow = null;
  }

  onDeath() {
    this.script?.onDeath?.(this);
    if (this.def.id === 'armor_spider') {
      // "Vines": the coin-loving armor spider drops the Enchanting Coin spell (wiki).
      this.w.hooks.onDoor?.('drop:enchanting_coin');
      for (let i = 0; i < 20; i++) this.w.spawnPickup('coin', this.x, this.y);
    }
  }

  // ---------------------------------------------------------------- update

  update(dt: number) {
    const w = this.w;
    this.t += dt;
    this.flashT = Math.max(0, this.flashT - dt);
    this.invuln = Math.max(0, this.invuln - dt);
    if (this.status.freezeT > 0) return;
    const slow = this.status.slowT > 0 ? this.status.slowMult : 1;
    const sdt = dt * slow;
    // knockback decay
    if (this.vx || this.vy) {
      w.moveActor(this, this.vx * dt, this.vy * dt);
      this.vx *= Math.pow(0.001, dt);
      this.vy *= Math.pow(0.001, dt);
      if (Math.abs(this.vx) + Math.abs(this.vy) < 1) this.vx = this.vy = 0;
    }
    if (this.script) this.script.update(this, sdt);
    else this.think(sdt);
    this.tickAttack(sdt);
    // contact damage
    const pl = w.player;
    if (this.def.contact > 0 && !pl.dead && dist2(this.x, this.y, pl.x, pl.y) < (this.hr + pl.hr + 2) ** 2) {
      if (w.run.relics.length && w.run.relics.filter((r) => r.id.startsWith('prospectors_')).length >= 4 && !this.boss) {
        // Gold Rush series: units touching the player become a coin.
        w.spawnPickup('coin', this.x, this.y);
        this.hp = 0;
        w.killEnemy(this);
        return;
      }
      w.hurtPlayer(Math.round(this.def.contact * this.dmgMult));
    }
  }

  private moveToward(tx: number, ty: number, speedM: number, dt: number) {
    const a = angleTo(this.x, this.y, tx, ty);
    const sp = speedM * M * this.speedMult * dt;
    const hit = this.w.moveActor(this, Math.cos(a) * sp, Math.sin(a) * sp);
    this.faceLeft = Math.cos(a) < 0;
    return hit;
  }

  private think(dt: number) {
    const w = this.w;
    const pl = w.player;
    const d = dist(this.x, this.y, pl.x, pl.y);
    const def = this.def;
    const cloak = w.run.relics.find((r) => r.id === 'rogue_cloak');
    const hidden = pl.hidden || (!!cloak && w.time - pl.lastCastT > (cloak.lv >= 2 ? 3 : 5));
    const tx = hidden ? this.x + Math.cos(this.wanderA) * 20 : pl.x;
    const ty = hidden ? this.y + Math.sin(this.wanderA) * 20 : pl.y;
    if (this.phase !== 'idle') return;
    switch (def.ai) {
      case 'chase':
        this.moveToward(tx, ty, def.speed, dt);
        break;
      case 'keep': {
        const want = (def.attack?.range ?? 6) * M * 0.7;
        if (d > want + 10) this.moveToward(tx, ty, def.speed, dt);
        else if (d < want - 10) this.moveToward(this.x * 2 - pl.x, this.y * 2 - pl.y, def.speed, dt);
        else this.moveToward(this.x + Math.cos(this.t) * 20, this.y + Math.sin(this.t) * 20, def.speed * 0.5, dt);
        break;
      }
      case 'charger':
        if (this.dashT > 0) {
          this.dashT -= dt;
          const hit = this.w.moveActor(this, Math.cos(this.dashA) * 11 * M * dt, Math.sin(this.dashA) * 11 * M * dt);
          if (hit.hitX || hit.hitY) this.dashT = 0;
        } else {
          this.moveToward(tx, ty, def.speed, dt);
          this.cd -= dt;
          if (this.cd <= 0 && d < 7 * M && !hidden) {
            this.cd = 2.8;
            this.aimA = angleTo(this.x, this.y, pl.x, pl.y);
            this.beginAttack(() => {
              this.dashA = this.aimA;
              this.dashT = 0.45;
            }, 'line');
          }
        }
        break;
      case 'hopper':
        this.hopT -= dt;
        if (this.hopT <= 0) {
          this.hopT = 1.1;
          this.dashA = angleTo(this.x, this.y, tx, ty) + w.rng.range(-0.4, 0.4);
          this.dashT = 0.35;
        }
        if (this.dashT > 0) {
          this.dashT -= dt;
          w.moveActor(this, Math.cos(this.dashA) * def.speed * 2 * M * dt, Math.sin(this.dashA) * def.speed * 2 * M * dt);
        }
        break;
      case 'bouncer': {
        if (!this.vx && !this.vy) this.dashA = this.dashA || w.rng.range(0, Math.PI * 2);
        const hit = w.moveActor(this, Math.cos(this.dashA) * def.speed * M * dt, Math.sin(this.dashA) * def.speed * M * dt);
        if (hit.hitX) this.dashA = Math.PI - this.dashA;
        if (hit.hitY) this.dashA = -this.dashA;
        break;
      }
      case 'flyer':
        this.wanderA += w.rng.range(-4, 4) * dt;
        this.moveToward(tx + Math.cos(this.wanderA) * 30, ty + Math.sin(this.wanderA) * 30, def.speed, dt);
        break;
      case 'phantom':
        this.cd -= 0;
        if (Math.floor(this.t) % 4 === 3 && !this.dashT) {
          this.dashT = 1;
          const a = w.rng.range(0, Math.PI * 2);
          const nx = pl.x + Math.cos(a) * 4 * M;
          const ny = pl.y + Math.sin(a) * 4 * M;
          if (!w.blocked(nx, ny, this.r, this.flying)) {
            w.vis?.oneShot('effects/death_puff', this.x, this.y);
            this.x = nx;
            this.y = ny;
          }
        }
        if (Math.floor(this.t) % 4 !== 3) this.dashT = 0;
        this.moveToward(this.x - (pl.x - this.x), this.y - (pl.y - this.y), def.speed * 0.4, dt);
        break;
      case 'spawner':
        this.cd -= dt;
        if (this.cd <= 0 && w.enemies.length < 30 && this.spawned < (def.spawnMax ?? 3)) {
          this.cd = 4;
          this.spawned++;
          const child = ENEMIES[def.spawn ?? 'spider'];
          this.beginAttack(() => {
            const e = new Enemy(w, child, this.x + w.rng.range(-8, 8), this.y + 8, { minion: true });
            e.hp = e.maxHp = Math.round(e.maxHp * 0.6);
            w.addEnemy(e);
          }, 'circle');
        }
        break;
      case 'thief':
        // runs from the player, never attacks
        this.moveToward(this.x * 2 - pl.x + Math.cos(this.t) * 30, this.y * 2 - pl.y + Math.sin(this.t) * 30, def.speed, dt);
        break;
      case 'turret':
      case 'dummy':
      case 'boss':
        break;
    }
    if (def.attack && !hidden && def.ai !== 'charger' && def.ai !== 'spawner') {
      this.cd -= dt;
      if (this.cd <= 0 && d < def.attack.range * M) {
        this.cd = def.attack.cd * (this.elite ? 0.75 : 1) + w.rng.range(-0.2, 0.3);
        const at = def.attack;
        this.aimA = angleTo(this.x, this.y, pl.x, pl.y);
        const tx2 = pl.x;
        const ty2 = pl.y;
        this.beginAttack(() => this.fire(at, tx2, ty2), at.pattern === 'ring' || at.pattern === 'spiral' ? 'circle' : at.pattern === 'lob' ? 'target' : 'line', tx2, ty2);
      }
    }
  }

  /**
   * Mandatory readability sequence (manifest.attackTiming):
   * telegraph 0.3 s (red circle/line + boss *_telegraph sprite) → windup_flash 0.1 s → fire.
   */
  beginAttack(fire: () => void, shape: 'circle' | 'line' | 'target', tx = 0, ty = 0) {
    const w = this.w;
    const timing = w.art?.manifest.attackTiming ?? { telegraph: 0.3, windup: 0.1 };
    this.phase = 'telegraph';
    this.phaseT = timing.telegraph;
    this.pending = fire;
    const vis = w.vis;
    if (!vis) return;
    if (shape === 'circle') {
      vis.timed('effects/telegraph_circle.png', this.x, this.y, timing.telegraph, { scale: this.boss ? 2 : 1, layer: vis.shadows, fade: false });
    } else if (shape === 'line') {
      const len = 5 * M;
      vis.timed('effects/telegraph_line.png', this.x + Math.cos(this.aimA) * len * 0.5, this.y + Math.sin(this.aimA) * len * 0.5, timing.telegraph, {
        rot: this.aimA, layer: vis.shadows, fade: false, scale: len / 32,
      });
    } else {
      vis.timed('effects/telegraph_circle.png', tx, ty, timing.telegraph, { scale: 0.8, layer: vis.shadows, fade: false });
    }
    w.sfx('telegraph', 0.4);
  }

  private tickAttack(dt: number) {
    if (this.phase === 'idle') return;
    this.phaseT -= dt;
    if (this.phaseT > 0) return;
    const timing = this.w.art?.manifest.attackTiming ?? { telegraph: 0.3, windup: 0.1 };
    if (this.phase === 'telegraph') {
      this.phase = 'windup';
      this.phaseT = timing.windup;
      this.w.vis?.timed('effects/windup_flash.png', this.x, this.y - 4, timing.windup, { scale: this.boss ? 2.5 : 1.2 });
      return;
    }
    this.phase = 'idle';
    const f = this.pending;
    this.pending = null;
    if (!this.dead) f?.();
  }

  /** Emit a bullet pattern (magenta enemy shots). */
  fire(at: AttackDef, tx: number, ty: number) {
    const w = this.w;
    const dmg = this.dmg;
    const base = angleTo(this.x, this.y, tx, ty);
    const count = at.count + (this.elite ? 2 : 0);
    const sp = at.speed * (w.run.curses.includes('bloodthirsty_underlings') ? 1.1 : 1);
    switch (at.pattern) {
      case 'aimed':
      case 'spread':
        for (let i = 0; i < count; i++) {
          const a = base + (count > 1 ? (i / (count - 1) - 0.5) * at.spread * (Math.PI / 180) : 0);
          enemyBullet(w, this.x, this.y - 4, a, sp, dmg, at.kind);
        }
        break;
      case 'ring':
        for (let i = 0; i < count; i++) enemyBullet(w, this.x, this.y - 4, base + (i / count) * Math.PI * 2, sp, dmg, at.kind);
        break;
      case 'spiral':
        for (let i = 0; i < count; i++) {
          w.after(i * 0.06, () => {
            if (!this.dead) enemyBullet(w, this.x, this.y - 4, this.t * 2 + i * 0.5, sp, dmg, at.kind);
          });
        }
        break;
      case 'burst':
        for (let i = 0; i < count; i++) w.after(i * 0.08, () => {
          if (!this.dead) enemyBullet(w, this.x, this.y - 4, angleTo(this.x, this.y, w.player.x, w.player.y) + w.rng.range(-at.spread, at.spread) * (Math.PI / 180), sp, dmg, at.kind);
        });
        break;
      case 'lob': {
        const p = enemyBullet(w, this.x, this.y - 4, base, sp, dmg, at.kind);
        const d = dist(this.x, this.y, tx, ty);
        p.life = Math.max(0.3, d / (sp * M));
        p.onEnd = (pp) => {
          for (let i = 0; i < 6; i++) enemyBullet(w, pp.x, pp.y, (i / 6) * Math.PI * 2, 3, dmg, 'bullet');
        };
        break;
      }
    }
    w.sfx('enemyShoot', 0.5);
  }
}
