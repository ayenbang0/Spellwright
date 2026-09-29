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
  /** Final scale multiplier reached at end of life (linear from 1); undefined = no scaling. */
  scaleTo?: number;
  /** Child scaled from 0 to 1 over the life (growing fill of a warning zone). */
  grow?: Container;
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

  /**
   * Jagged energy bolt between two world points (lightning, chain arcs, tethers). Straight when `jitter` is 0.
   * Drawn as a coloured outline stroke under a bright core stroke; fades over `life`.
   */
  beam(x1: number, y1: number, x2: number, y2: number, opts: { color?: number; core?: number; width?: number; life?: number; jitter?: number; layer?: Container } = {}) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const jitter = opts.jitter ?? 3;
    const segs = jitter > 0 ? Math.max(2, Math.round(len / 8)) : 1;
    const pts: number[] = [x1, y1];
    for (let i = 1; i < segs; i++) {
      const t = i / segs;
      const o = (Math.random() * 2 - 1) * jitter;
      pts.push(x1 + dx * t + nx * o, y1 + dy * t + ny * o);
    }
    pts.push(x2, y2);
    const g = new Graphics();
    const stroke = (width: number, color: number) => {
      g.moveTo(pts[0], pts[1]);
      for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
      g.stroke({ width, color, cap: 'butt', join: 'miter' });
    };
    const width = opts.width ?? 1;
    stroke(width + 1, opts.color ?? 0x22d3ee);
    stroke(width, opts.core ?? 0xffffff);
    (opts.layer ?? this.fx).addChild(g);
    this.fxList.push({ view: g, life: opts.life ?? 0.12, age: 0, vx: 0, vy: 0, fade: true });
    return g;
  }

  /** Circle outline (optionally filled) centred on a world point; grows to `scaleTo`x its radius while fading. */
  ring(x: number, y: number, r: number, opts: { color?: number; width?: number; life?: number; scaleTo?: number; fill?: number; layer?: Container } = {}) {
    const color = opts.color ?? 0x22d3ee;
    const g = new Graphics();
    if (opts.fill) g.circle(0, 0, r).fill({ color, alpha: opts.fill });
    g.circle(0, 0, r).stroke({ width: opts.width ?? 1, color });
    g.position.set(x, y);
    (opts.layer ?? this.fx).addChild(g);
    this.fxList.push({ view: g, life: opts.life ?? 0.3, age: 0, vx: 0, vy: 0, fade: true, scaleTo: opts.scaleTo });
    return g;
  }

  /**
   * Warning zone at a true damage radius: a steady outline whose fill grows from the centre over `life`
   * (telegraphs for delayed area spells).
   */
  zone(x: number, y: number, r: number, opts: { color?: number; life?: number; layer?: Container } = {}) {
    const color = opts.color ?? 0x22d3ee;
    const root = new Container();
    root.position.set(x, y);
    const edge = new Graphics();
    edge.circle(0, 0, r).stroke({ width: 1, color });
    const fill = new Graphics();
    fill.circle(0, 0, r).fill({ color, alpha: 0.28 });
    fill.scale.set(0.05);
    root.addChild(edge, fill);
    (opts.layer ?? this.shadows).addChild(root);
    this.fxList.push({ view: root, life: opts.life ?? 0.3, age: 0, vx: 0, vy: 0, fade: false, grow: fill });
    return root;
  }

  /** Radial spark lines around a world point, flying outward (`r0` → `r1`, then scaled up) while fading. */
  burst(x: number, y: number, opts: { color?: number; rays?: number; r0?: number; r1?: number; width?: number; life?: number; scaleTo?: number; layer?: Container } = {}) {
    const rays = opts.rays ?? 8;
    const r0 = opts.r0 ?? 2;
    const r1 = opts.r1 ?? 6;
    const phase = Math.random() * Math.PI * 2;
    const g = new Graphics();
    for (let i = 0; i < rays; i++) {
      const a = phase + (i / rays) * Math.PI * 2;
      g.moveTo(Math.cos(a) * r0, Math.sin(a) * r0).lineTo(Math.cos(a) * r1, Math.sin(a) * r1);
    }
    g.stroke({ width: opts.width ?? 1, color: opts.color ?? 0xffffff });
    g.position.set(x, y);
    (opts.layer ?? this.fx).addChild(g);
    this.fxList.push({ view: g, life: opts.life ?? 0.25, age: 0, vx: 0, vy: 0, fade: true, scaleTo: opts.scaleTo ?? 1.8 });
    return g;
  }

  /** Spark lines from a world point along explicit angles (fans, cones), `r0` → `r1`, fading. */
  rays(x: number, y: number, angles: number[], opts: { color?: number; r0?: number; r1?: number; width?: number; life?: number; scaleTo?: number; layer?: Container } = {}) {
    const r0 = opts.r0 ?? 3;
    const r1 = opts.r1 ?? 14;
    const g = new Graphics();
    for (const a of angles) g.moveTo(Math.cos(a) * r0, Math.sin(a) * r0).lineTo(Math.cos(a) * r1, Math.sin(a) * r1);
    g.stroke({ width: opts.width ?? 1, color: opts.color ?? 0xffffff });
    g.position.set(x, y);
    (opts.layer ?? this.fx).addChild(g);
    this.fxList.push({ view: g, life: opts.life ?? 0.2, age: 0, vx: 0, vy: 0, fade: true, scaleTo: opts.scaleTo ?? 1.3 });
    return g;
  }

  /** A row of `n` small dots centred on a world point that drifts upward while fading (counts / copies). */
  pips(x: number, y: number, n: number, opts: { color?: number; gap?: number; life?: number; vy?: number; layer?: Container } = {}) {
    const gap = opts.gap ?? 3;
    const color = opts.color ?? 0xffffff;
    const g = new Graphics();
    for (let i = 0; i < n; i++) g.rect(Math.round((i - (n - 1) / 2) * gap) - 1, -1, 2, 2).fill({ color });
    g.position.set(x, y);
    (opts.layer ?? this.fx).addChild(g);
    this.fxList.push({ view: g, life: opts.life ?? 0.35, age: 0, vx: 0, vy: opts.vy ?? -14, fade: true });
    return g;
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
      if (f.scaleTo !== undefined) f.view.scale.set(1 + (f.scaleTo - 1) * Math.min(1, f.age / f.life));
      if (f.grow) f.grow.scale.set(Math.min(1, f.age / f.life));
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

  /** Position the camera (world px) with shake; snaps to whole screen pixels (sub-pixel scrolling stays smooth). */
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
    this.root.position.set(Math.round((-x + this.viewW / 2 + sx) * s), Math.round((-y + this.viewH / 2 + sy) * s));
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
