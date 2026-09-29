/**
 * Visual-only decoration for boosted projectiles: family colours, overlay layout and the per-projectile
 * Graphics that show hover countdowns, orbit radii, steering, lock-on and chain links.
 * Nothing here touches simulation state or `World.rng`.
 */
import { Container, Graphics } from 'pixi.js';
import { angleTo } from '../core/math';
import type { Proj } from './projectiles';
import type { Visuals } from './visuals';
import type { World } from './world';

/** Family colour per behaviour tag: damage red/orange, speed white, time violet, area teal, control blue, economy green. */
export const TAG_COLOR: Record<string, number> = {
  fire: 0xf97316, frost: 0xa5f3fc, venom: 0x4ade80, slime: 0xa3e635, thunder: 0xfacc15,
  dmg: 0xef4444, saving: 0x22c55e, accel: 0xe0f2fe, duration: 0x8b5cf6, range: 0x14b8a6, precise: 0xffffff,
  traction: 0xcbd5e1, track: 0x3b82f6, homing: 0x60a5fa, hover: 0x3b82f6, orbit: 0x3b82f6, split: 0x3b82f6,
  reflect: 0x93c5fd, rebound: 0x4ade80, pierce: 0xffffff, multishot: 0x67e8f9, volley: 0x67e8f9, scatter: 0xfacc15,
  chain: 0xfde047, duet: 0xcbd5e1, echo: 0x22d3ee, serial: 0x22d3ee, fireworks: 0xfbbf24, upgrade: 0xfbbf24,
  mimic: 0xc084fc, enlarge: 0xffffff, fall: 0x94a3b8,
};

/** Compact icon overlays; each takes the next free slot around the base sprite instead of the sprite centre. */
export const GLYPH_TAGS: Record<string, true> = {
  dmg: true, saving: true, accel: true, duration: true, range: true, precise: true, traction: true, track: true,
  reflect: true, hover: true, split: true, scatter: true, chain: true, upgrade: true, mimic: true, serial: true,
  fireworks: true, slime: true,
};

/** Offsets (source px) for the nth glyph overlay; glyphs beyond the last slot are dropped. */
export const GLYPH_SLOTS: [number, number][] = [[7, -7], [-7, 7], [-7, -7], [7, 7], [0, -10], [0, 10], [10, 0], [-10, 0]];

const lerp255 = (comp: number, k: number) => Math.round(255 + (comp - 255) * k);

/** Base-sprite look for a boosted shot: aura colour (first tag), a light tint blend, and a size bump. */
export function boostLook(tags: string[]): { aura: number; tint: number; scale: number } | null {
  let n = 0;
  let r = 0;
  let g = 0;
  let b = 0;
  let aura = 0;
  for (const tag of tags) {
    const c = TAG_COLOR[tag];
    if (c === undefined) continue;
    if (!n) aura = c;
    n++;
    r += lerp255((c >> 16) & 255, 0.45);
    g += lerp255((c >> 8) & 255, 0.45);
    b += lerp255(c & 255, 0.45);
  }
  if (!n) return null;
  return { aura, tint: (Math.round(r / n) << 16) | (Math.round(g / n) << 8) | Math.round(b / n), scale: 1 + 0.12 * Math.min(n, 3) };
}

const FX_TAGS: Record<string, true> = { hover: true, duration: true, orbit: true, track: true, homing: true, accel: true, chain: true };

function dashArc(g: Graphics, r: number, a0: number, a1: number, dash: number, gap: number) {
  for (let a = a0; a < a1; a += dash + gap) {
    g.moveTo(Math.cos(a) * r, Math.sin(a) * r).arc(0, 0, r, a, Math.min(a + dash, a1));
  }
}

const LINK_LIFE = 0.35;

/** Per-projectile dynamic decoration; only created for projectiles that carry one of FX_TAGS. */
export class ProjFx {
  /** Seconds between trail puffs (Accelerator leaves a denser trail). */
  trailGap = 0.035;
  private layer = new Container();
  private hoverG: Graphics | null = null;
  private hoverStep = -1;
  private lifeG: Graphics | null = null;
  private lifeStep = -1;
  private orbitG: Graphics | null = null;
  private trackG: Graphics | null = null;
  private lockG: Graphics | null = null;
  private lockFor: unknown = null;
  private streakG: Graphics | null = null;
  private linkG: Graphics | null = null;

  static wants(tags: string[]): boolean {
    return tags.some((t) => t in FX_TAGS);
  }

  constructor(private readonly p: Proj, private readonly root: Container, tags: string[], private readonly w: World) {
    const add = () => {
      const g = new Graphics();
      this.layer.addChild(g);
      return g;
    };
    if (tags.includes('hover')) this.hoverG = add();
    if (tags.includes('duration')) this.lifeG = add();
    if (tags.includes('orbit') && p.orbit) {
      this.orbitG = add();
      dashArc(this.orbitG, p.orbit.r, 0, Math.PI * 2, 0.16, 0.14);
      this.orbitG.stroke({ width: 1, color: 0x60a5fa, alpha: 0.45 });
    }
    if (tags.includes('track')) this.trackG = add();
    if (tags.includes('homing')) this.lockG = add();
    if (tags.includes('accel')) {
      this.trailGap = 0.018;
      this.streakG = add();
      for (const [dy, len, alpha] of [[-2.5, 9, 0.6], [0, 14, 0.9], [2.5, 9, 0.6]]) {
        this.streakG.moveTo(-4, dy).lineTo(-4 - len, dy).stroke({ width: 1, color: 0xffffff, alpha });
      }
    }
    if (tags.includes('chain')) this.linkG = add();
    root.addChild(this.layer);
  }

  /** Called after the projectile view has been positioned for this frame. */
  sync() {
    const p = this.p;
    const root = this.root;
    this.layer.rotation = -root.rotation;
    if (this.hoverG && p.hovered) this.drawHover(this.hoverG);
    if (this.lifeG) this.drawLife(this.lifeG);
    if (this.orbitG) {
      const pl = this.w.player;
      this.orbitG.position.set(pl.x - root.x, pl.y - 4 - root.y);
      this.orbitG.rotation = p.age * 0.5;
    }
    if (this.trackG) this.drawTrack(this.trackG);
    if (this.lockG) this.drawLock(this.lockG);
    if (this.streakG) {
      this.streakG.visible = p.speed > 1;
      this.streakG.rotation = p.angle + root.rotation;
    }
    if (this.linkG) this.drawLink(this.linkG);
  }

  private drawHover(g: Graphics) {
    const total = Math.max(0.1, this.p.data.hover ?? 1);
    const remain = Math.max(0, Math.min(1, (this.p.life - this.p.age) / total));
    const step = Math.ceil(remain * 24);
    if (step === this.hoverStep) return;
    this.hoverStep = step;
    g.clear();
    g.circle(0, 0, 8).stroke({ width: 1, color: 0x3b82f6, alpha: 0.4 });
    if (remain > 0) g.moveTo(0, -8).arc(0, 0, 8, -Math.PI / 2, -Math.PI / 2 + remain * Math.PI * 2).stroke({ width: 1.5, color: 0xffffff });
  }

  private drawLife(g: Graphics) {
    const p = this.p;
    const remain = Math.max(0, Math.min(1, 1 - p.age / p.life));
    const step = Math.ceil(remain * 16);
    if (step === this.lifeStep) return;
    this.lifeStep = step;
    g.clear();
    if (remain <= 0) return;
    dashArc(g, 6.5, -Math.PI / 2, -Math.PI / 2 + remain * Math.PI * 2, 0.32, 0.22);
    g.stroke({ width: 1, color: 0xa78bfa });
  }

  private drawTrack(g: Graphics) {
    const p = this.p;
    g.clear();
    if (p.speed <= 0) return;
    const it = this.w.player.intent;
    const dx = it.aimX - this.root.x;
    const dy = it.aimY - this.root.y;
    const a = angleTo(this.root.x, this.root.y, it.aimX, it.aimY);
    const d = Math.hypot(dx, dy);
    const alpha = 0.4 + 0.3 * Math.sin(p.age * 12);
    const len = Math.min(d, 22);
    if (len > 8) {
      g.moveTo(Math.cos(a) * 7, Math.sin(a) * 7).lineTo(Math.cos(a) * 11, Math.sin(a) * 11);
      g.moveTo(Math.cos(a) * 15, Math.sin(a) * 15).lineTo(Math.cos(a) * len, Math.sin(a) * len);
    }
    g.moveTo(dx - 3, dy).lineTo(dx + 3, dy).moveTo(dx, dy - 3).lineTo(dx, dy + 3);
    g.stroke({ width: 1, color: 0x93c5fd, alpha });
  }

  private drawLock(g: Graphics) {
    const t = this.p.target;
    if (!t || t.dead) {
      g.visible = false;
      this.lockFor = null;
      return;
    }
    if (this.lockFor !== t) {
      this.lockFor = t;
      g.clear();
      const s = t.hr + 3;
      const c = 3;
      for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        g.moveTo(sx * s, sy * (s - c)).lineTo(sx * s, sy * s).lineTo(sx * (s - c), sy * s);
      }
      g.stroke({ width: 1, color: 0xffffff });
    }
    g.visible = true;
    g.position.set(t.x - this.root.x, t.y - this.root.y);
    g.scale.set(1 + 0.12 * Math.sin(this.p.age * 14));
  }

  /** Jagged tether from the muzzle to the projectile for the first moments of its flight (Chain of Lightning). */
  private drawLink(g: Graphics) {
    const p = this.p;
    g.clear();
    if (p.age > LINK_LIFE) {
      g.visible = false;
      return;
    }
    const x1 = p.ox - this.root.x;
    const y1 = p.oy - this.root.y;
    const len = Math.hypot(x1, y1);
    if (len < 2) return;
    const nx = -y1 / len;
    const ny = x1 / len;
    const segs = Math.max(2, Math.round(len / 6));
    const pts: number[] = [0, 0];
    for (let i = 1; i < segs; i++) {
      const t = i / segs;
      const o = (Math.random() * 2 - 1) * 2.5;
      pts.push(x1 * t + nx * o, y1 * t + ny * o);
    }
    pts.push(x1, y1);
    for (const [width, color] of [[2, 0xfacc15], [1, 0xffffff]] as const) {
      g.moveTo(pts[0], pts[1]);
      for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
      g.stroke({ width, color, alpha: 1 - p.age / LINK_LIFE });
    }
  }
}

/** Pop for the end of a hover: ring + spark burst. */
export function hoverPop(vis: Visuals, x: number, y: number) {
  vis.ring(x, y, 5, { color: 0x3b82f6, width: 1, life: 0.25, scaleTo: 2.4 });
  vis.burst(x, y, { color: 0xffffff, rays: 6, r0: 3, r1: 8, life: 0.2 });
}
