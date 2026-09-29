import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import type { Anim, Art } from '../core/art';
import { PixelText } from '../core/text';

/** Sprite driven by an `Art` animation, advanced by the fixed-step clock (not Pixi's ticker). */
export class AnimSprite extends Sprite {
  private anim: Anim;
  private t = 0;
  done = false;
  speed = 1;

  constructor(anim: Anim) {
    super(anim.frames[0]);
    this.anim = anim;
    this.anchor.set(0.5);
  }

  play(anim: Anim, restart = false) {
    if (anim === this.anim && !restart) return;
    this.anim = anim;
    this.t = 0;
    this.done = false;
    this.texture = anim.frames[0];
  }

  step(dt: number) {
    if (this.done) return;
    this.t += dt * this.speed;
    const n = this.anim.frames.length;
    let f = Math.floor(this.t * this.anim.fps);
    if (f >= n) {
      if (this.anim.loop) f %= n;
      else {
        f = n - 1;
        this.done = true;
      }
    }
    this.texture = this.anim.frames[f];
  }
}

interface Fx {
  view: Container;
  life: number;
  age: number;
  vx: number;
  vy: number;
  fade: boolean;
  anim?: AnimSprite;
  rise?: number;
}

/**
 * All rendering for a World. World coordinates are source pixels; `root` is scaled x4 (manifest.scaleDisplay).
 * Layers: floor → decor → shadows → actors (y-sorted) → projectiles → fx → overhead.
 */
export class Visuals {
  readonly root = new Container();
  readonly floor = new Container();
  readonly decor = new Container();
  readonly shadows = new Container();
  readonly actors = new Container();
  readonly projectiles = new Container();
  readonly fx = new Container();
  readonly overhead = new Container();
  private fxList: Fx[] = [];
  /** Pooled trail puffs (bullet storms spawn tens of thousands per second, so no per-puff allocation). */
  private trailPool: { s: Sprite; age: number; life: number }[] = [];
  private trailNext = 0;
  private trailBudget = 0;
  private static readonly TRAILS = 420;
  private shakeT = 0;
  private shakeMag = 0;
  camX = 0;
  camY = 0;
  flashG = new Graphics();
  private flashT = 0;
  private flashColor = 0xffffff;

  /** View size in world px and screen size in CSS px; updated by `resize`. */
  viewW = 320;
  viewH = 180;
  screenW = 1280;
  screenH = 720;

  constructor(readonly art: Art) {
    this.actors.sortableChildren = true;
    this.root.addChild(this.floor, this.decor, this.shadows, this.actors, this.projectiles, this.fx, this.overhead);
    this.root.scale.set(art.manifest.scaleDisplay);
  }

  /** Fit the view to the window: integer scale, capped at manifest.scaleDisplay, at least 2. */
  resize(screenW: number, screenH: number) {
    this.screenW = screenW;
    this.screenH = screenH;
    const max = this.art.manifest.scaleDisplay;
    const s = Math.max(2, Math.min(max, Math.floor(Math.min(screenW / 320, screenH / 180))));
    this.root.scale.set(s);
    this.viewW = Math.ceil(screenW / s);
    this.viewH = Math.ceil(screenH / s);
  }

  sprite(base: string): AnimSprite {
    return new AnimSprite(this.art.anim(base));
  }

  staticSprite(path: string): Sprite {
    const s = new Sprite(this.art.tex(path));
    s.anchor.set(0.5);
    return s;
  }

  shadow(w = 1): Sprite {
    const s = this.staticSprite('effects/shadow.png');
    s.scale.set(w, 1);
    this.shadows.addChild(s);
    return s;
  }

  /** One-shot animation (impacts, puffs); removed when finished. */
  oneShot(base: string, x: number, y: number, opts: { scale?: number; tint?: number; rot?: number; layer?: Container } = {}) {
    const a = this.sprite(base);
    a.position.set(x, y);
    if (opts.scale) a.scale.set(opts.scale);
    if (opts.tint !== undefined) a.tint = opts.tint;
    if (opts.rot) a.rotation = opts.rot;
    (opts.layer ?? this.fx).addChild(a);
    const meta = this.art.anim(base);
    this.fxList.push({ view: a, life: meta.loop ? 0.5 : meta.frames.length / meta.fps + 0.02, age: 0, vx: 0, vy: 0, fade: false, anim: a });
  }

  /** Static sprite that lives for `life` seconds (telegraphs, flashes, particles). */
  timed(path: string, x: number, y: number, life: number, opts: { scale?: number; tint?: number; rot?: number; vx?: number; vy?: number; fade?: boolean; alpha?: number; layer?: Container } = {}) {
    const s = this.staticSprite(path);
    s.position.set(x, y);
    if (opts.scale) s.scale.set(opts.scale);
    if (opts.tint !== undefined) s.tint = opts.tint;
    if (opts.rot) s.rotation = opts.rot;
    if (opts.alpha !== undefined) s.alpha = opts.alpha;
    (opts.layer ?? this.fx).addChild(s);
    this.fxList.push({ view: s, life, age: 0, vx: opts.vx ?? 0, vy: opts.vy ?? 0, fade: opts.fade ?? true });
    return s;
  }

  /** A short fading puff behind a projectile. Skipped once this frame's budget is spent. */
  trail(path: string, x: number, y: number, scale = 1) {
    if (this.trailBudget <= 0) return;
    this.trailBudget--;
    let e = this.trailPool[this.trailNext];
    if (!e) {
      const s = new Sprite();
      s.anchor.set(0.5);
      this.shadows.addChild(s);
      e = { s, age: 0, life: 0 };
      this.trailPool[this.trailNext] = e;
    }
    this.trailNext = (this.trailNext + 1) % Visuals.TRAILS;
    e.s.texture = this.art.tex(path);
    e.s.position.set(x, y);
    e.s.scale.set(scale);
    e.s.alpha = 1;
    e.s.visible = true;
    e.age = 0;
    e.life = 0.22;
  }

  number(x: number, y: number, text: string, tint: number) {
    const t = new PixelText(this.art, text, { tint, shadow: true, align: 'center' });
    t.position.set(Math.round(x), Math.round(y));
    t.scale.set(0.5);
    this.overhead.addChild(t);
    this.fxList.push({ view: t, life: 0.7, age: 0, vx: 0, vy: -18, fade: true, rise: 1 });
  }

  shake(mag: number, t = 0.15) {
    if (mag >= this.shakeMag || this.shakeT <= 0) {
      this.shakeMag = mag;
      this.shakeT = t;
    }
  }

  flash(color: number, t = 0.12) {
    this.flashColor = color;
    this.flashT = t;
  }

  step(dt: number) {
    this.trailBudget = 40;
    for (const e of this.trailPool) {
      if (!e.s.visible) continue;
      e.age += dt;
      if (e.age >= e.life) e.s.visible = false;
      else e.s.alpha = 1 - e.age / e.life;
    }
    for (const f of this.fxList) {
      f.age += dt;
      f.view.x += f.vx * dt;
      f.view.y += f.vy * dt;
      if (f.anim) f.anim.step(dt);
      if (f.fade) f.view.alpha = Math.max(0, 1 - f.age / f.life);
    }
    this.fxList = this.fxList.filter((f) => {
      const over = f.anim ? f.anim.done || f.age >= f.life : f.age >= f.life;
      if (over) f.view.destroy({ children: true });
      return !over;
    });
    this.shakeT -= dt;
    this.flashT -= dt;
    this.flashG.clear();
    if (this.flashT > 0) this.flashG.rect(0, 0, this.screenW, this.screenH).fill({ color: this.flashColor, alpha: Math.min(0.22, this.flashT * 2) });
  }

  /** Position the camera (world px) with shake; snaps to whole source pixels. */
  camera(x: number, y: number) {
    let sx = 0;
    let sy = 0;
    if (this.shakeT > 0) {
      sx = (Math.random() * 2 - 1) * this.shakeMag;
      sy = (Math.random() * 2 - 1) * this.shakeMag;
    }
    this.camX = x;
    this.camY = y;
    const s = this.root.scale.x;
    this.root.position.set(Math.round(-x + this.viewW / 2 + sx) * s, Math.round(-y + this.viewH / 2 + sy) * s);
  }

  clearAll() {
    for (const l of [this.floor, this.decor, this.shadows, this.actors, this.projectiles, this.fx, this.overhead]) {
      for (const c of l.removeChildren()) c.destroy({ children: true });
    }
    this.fxList = [];
    this.trailPool = [];
    this.trailNext = 0;
  }

  white(): Texture {
    return Texture.WHITE;
  }
}
