/**
 * Purely visual per-spell identity: cast flash, impact, channel emitters, area rings and summon spawn effects.
 * Nothing here touches simulation state or `w.rng`; every entry point is a no-op when `w.vis` is null (headless sims).
 */
import { Graphics } from 'pixi.js';
import type { Proj } from './projectiles';
import type { Summon } from './summons';
import type { CastGroup } from './wand';
import type { World } from './world';

// ------------------------------------------------------------------ cast flashes

type Shape = 'burst' | 'ring' | 'in' | 'cone' | 'flare' | 'plus' | 'bolt';

interface Look {
  c: number;
  shape: Shape;
  /** Reach in world px. */
  size: number;
  /** Ray / beam count where the shape uses it. */
  n?: number;
  core?: number;
}

export const CYAN = 0x22d3ee;
export const GOLD = 0xfbbf24;
export const FIRE = 0xf97316;
export const VOID = 0xa855f7;
export const PINK = 0xf9a8d4;
export const BLUE = 0x3b82f6;
export const ICE = 0xa5f3fc;
export const YELLOW = 0xfacc15;
export const GREEN = 0x4ade80;
export const STONE = 0xa1a1aa;
export const TEAL = 0x14b8a6;
export const BONE = 0xe7e5e4;
const RAINBOW = [0xff6b6b, 0xffe066, 0x69db7c, 0x4dabf7, 0xda77f2];

const CAST: Record<string, Look[]> = {
  rock_n_ball: [{ c: STONE, shape: 'burst', size: 7, n: 5 }],
  rainbow: RAINBOW.map((c, i): Look => ({ c, shape: 'burst', size: 5 + i * 1.6, n: 5 })),
  butterfly: [{ c: PINK, shape: 'burst', size: 8, n: 8 }, { c: PINK, shape: 'ring', size: 8 }],
  laser: [{ c: CYAN, shape: 'flare', size: 14 }],
  fuse: [{ c: FIRE, shape: 'burst', size: 6, n: 4 }, { c: YELLOW, shape: 'ring', size: 5 }],
  floating_wisp: [{ c: TEAL, shape: 'ring', size: 9 }],
  black_hole: [{ c: VOID, shape: 'in', size: 12 }],
  arcane_explosion: [{ c: CYAN, shape: 'ring', size: 12 }],
  shadow_serpent: [{ c: VOID, shape: 'burst', size: 8, n: 6 }],
  ray_of_disintegration: [{ c: CYAN, shape: 'flare', size: 12 }, { c: CYAN, shape: 'in', size: 9 }],
  deceptive_mine: [{ c: YELLOW, shape: 'ring', size: 7 }],
  meteor: [{ c: FIRE, shape: 'burst', size: 9, n: 6 }],
  arcane_nova: [{ c: CYAN, shape: 'ring', size: 14 }, { c: CYAN, shape: 'burst', size: 10, n: 4 }],
  lightning_dash: [{ c: YELLOW, shape: 'bolt', size: 12, n: 3 }],
  adava_keravda: [{ c: GREEN, shape: 'bolt', size: 14, n: 2 }, { c: GREEN, shape: 'ring', size: 8 }],
  thunderstorm: [{ c: YELLOW, shape: 'bolt', size: 10, n: 2 }],
  high_pressure_stream: [{ c: BLUE, shape: 'cone', size: 11, n: 3 }],
  enchanting_coin: [{ c: GOLD, shape: 'burst', size: 7, n: 6 }, { c: GOLD, shape: 'ring', size: 6 }],
  evil_slayer_sword: [{ c: 0xffffff, shape: 'burst', size: 9, n: 3 }],
  boomerang_blade: [{ c: CYAN, shape: 'ring', size: 9 }],
  sword_of_judgement: [{ c: GOLD, shape: 'burst', size: 10, n: 8 }],
  condensed_water_bubble: [{ c: ICE, shape: 'ring', size: 8 }],
  fierce_dragon_breath: [{ c: FIRE, shape: 'cone', size: 12, n: 3 }],
  shining_star_arrow: [{ c: GOLD, shape: 'burst', size: 11, n: 4 }, { c: GOLD, shape: 'ring', size: 10 }],
  bings_arrow: [{ c: ICE, shape: 'burst', size: 8, n: 6 }],
  mana_absorption: [{ c: CYAN, shape: 'plus', size: 9 }],
  pop: [{ c: PINK, shape: 'ring', size: 8 }],
  skull_of_the_cthulhu: [{ c: BONE, shape: 'in', size: 9 }, { c: VOID, shape: 'ring', size: 7 }],
  hand_of_the_cthulhu: [{ c: VOID, shape: 'in', size: 10 }],
  pillar_of_light: [{ c: GOLD, shape: 'plus', size: 8 }],
  autonomous_grimoire: [{ c: YELLOW, shape: 'burst', size: 7, n: 6 }],
};

function drawLook(w: World, l: Look, x: number, y: number, a: number, k: number) {
  const vis = w.vis!;
  const size = l.size * k;
  switch (l.shape) {
    case 'burst':
      vis.burst(x, y, { color: l.c, rays: l.n ?? 6, r0: 2, r1: size, life: 0.2 });
      break;
    case 'ring':
      vis.ring(x, y, size * 0.4, { color: l.c, life: 0.24, scaleTo: 2.4 });
      break;
    case 'in':
      vis.ring(x, y, size, { color: l.c, life: 0.24, scaleTo: 0.2 });
      break;
    case 'flare':
      vis.beam(x, y, x + Math.cos(a) * size, y + Math.sin(a) * size, { color: l.c, jitter: 0, width: 2, life: 0.1 });
      break;
    case 'cone': {
      const n = l.n ?? 3;
      for (let i = 0; i < n; i++) {
        const aa = a + (i - (n - 1) / 2) * 0.4;
        vis.beam(x, y, x + Math.cos(aa) * size, y + Math.sin(aa) * size, { color: l.c, jitter: 0, life: 0.12 });
      }
      break;
    }
    case 'plus':
      for (let q = 0; q < 2; q++) {
        const aa = a + q * (Math.PI / 2);
        vis.beam(x - Math.cos(aa) * size * 0.5, y - Math.sin(aa) * size * 0.5, x + Math.cos(aa) * size * 0.5, y + Math.sin(aa) * size * 0.5, { color: l.c, jitter: 0, width: 1, life: 0.16 });
      }
      break;
    case 'bolt': {
      const n = l.n ?? 2;
      for (let i = 0; i < n; i++) {
        const aa = a + (Math.random() - 0.5) * 1.8;
        vis.beam(x, y, x + Math.cos(aa) * size, y + Math.sin(aa) * size, { color: l.c, jitter: 2, life: 0.12 });
      }
      break;
    }
  }
}

/** Per-spell muzzle: every distinct castable in the group gets its own colour/shape; unknown ids keep the cyan muzzle. */
export function castFlash(w: World, group: CastGroup, x: number, y: number, angle: number, charge = 0) {
  const vis = w.vis;
  if (!vis) return;
  const k = 1 + Math.min(charge, 1.5) * 0.6;
  let plain = false;
  let seen = 0;
  const ids: string[] = [];
  for (const it of group.items) {
    const id = it.spell.id;
    if (ids.includes(id)) continue;
    ids.push(id);
    const looks = CAST[id];
    if (!looks) {
      plain = true;
      continue;
    }
    if (seen++ >= 3) continue;
    for (const l of looks) drawLook(w, l, x, y, angle, k);
  }
  if (plain || !ids.length) vis.oneShot('effects/muzzle', x, y, { rot: angle });
}

// ------------------------------------------------------------------ impacts

interface Impact {
  anim: string;
  scale: number;
  tint?: number;
}

const IMPACT: Record<string, Impact> = {
  rock_n_ball: { anim: 'effects/sx_debris', scale: 0.9 },
  butterfly: { anim: 'effects/sx_dust', scale: 0.8 },
  laser: { anim: 'effects/sx_rays_thin', scale: 0.55 },
  fuse: { anim: 'effects/sx_spark', scale: 0.65, tint: 0xfb923c },
  floating_wisp: { anim: 'effects/sx_wisp', scale: 0.6 },
  black_hole: { anim: 'effects/sx_implode', scale: 1.5 },
  shadow_serpent: { anim: 'effects/sx_smoke', scale: 0.9 },
  rainbow: { anim: 'effects/sx_spark', scale: 0.7 },
  arcane_nova: { anim: 'effects/sx_nova', scale: 1.1 },
  lightning_dash: { anim: 'effects/sx_bolt', scale: 0.9 },
  enchanting_coin: { anim: 'effects/sx_coin', scale: 0.8 },
  boomerang_blade: { anim: 'effects/sx_cross', scale: 0.6 },
  sword_of_judgement: { anim: 'effects/sx_rays', scale: 0.85 },
  shining_star_arrow: { anim: 'effects/sx_star', scale: 1.0 },
  bings_arrow: { anim: 'effects/sx_shard', scale: 0.8 },
  mana_absorption: { anim: 'effects/sx_plus', scale: 0.7 },
  high_pressure_stream: { anim: 'effects/sx_splash', scale: 0.5 },
  fierce_dragon_breath: { anim: 'effects/sx_flame', scale: 0.55 },
  bian_flying_sword: { anim: 'effects/sx_cross', scale: 0.5 },
};

/** Completion effect of a player projectile: each spell ends in its own shape/colour instead of the shared impact. */
export function spellImpact(w: World, p: Proj) {
  const vis = w.vis;
  if (!vis) return;
  const fx = IMPACT[p.spellId];
  if (!fx) {
    vis.oneShot('effects/impact_small', p.x, p.y, { scale: 0.75 });
    return;
  }
  vis.oneShot(fx.anim, p.x, p.y, { scale: fx.scale, tint: p.data.tint ?? fx.tint });
}

/** Static radius marker for an area that has just been (or is being) damaged: drawn at the true radius. */
export function areaRing(w: World, x: number, y: number, r: number, color: number, life = 0.35) {
  w.vis?.ring(x, y, r, { color, life, width: 1, fill: 0.12 });
}

// ------------------------------------------------------------------ channel emitters

/** Wand-tip particles while a continuous spell is held (called from the channel tick). */
export function channelSpray(w: World, id: string, x: number, y: number, angle: number, t: number) {
  const vis = w.vis;
  if (!vis) return;
  const r = Math.random();
  if (id === 'high_pressure_stream') {
    if (r > 0.6) return;
    const s = 60 + Math.random() * 30;
    const a = angle + (Math.random() - 0.5) * 0.5;
    vis.timed('effects/sx_trail_blue.png', x, y, 0.22, { scale: 0.7, vx: Math.cos(a) * s, vy: Math.sin(a) * s });
  } else if (id === 'fierce_dragon_breath') {
    if (r > 0.7) return;
    const s = 45 + Math.random() * 40;
    const a = angle + (Math.random() - 0.5) * 1.0;
    vis.timed('effects/trail_fire.png', x, y, 0.3, { scale: 0.7 + Math.min(t, 3) * 0.3, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 6 });
  } else if (id === 'ray_of_disintegration') {
    if (r > 0.2) return;
    vis.oneShot('effects/sx_spark', x, y, { scale: 0.4 });
  } else if (id === 'lightning_dash') {
    if (r > 0.4) return;
    const a = Math.random() * Math.PI * 2;
    vis.beam(x, y, x + Math.cos(a) * 9, y + Math.sin(a) * 9, { color: YELLOW, jitter: 2, life: 0.1 });
  }
}

/** Sparks where the disintegration ray meets a wall. */
export function rayEndSpark(w: World, x: number, y: number) {
  if (Math.random() < 0.25) w.vis?.oneShot('effects/sx_spark', x, y, { scale: 0.45 });
}

// ------------------------------------------------------------------ summons

type SummonKind = Summon['kind'];

const SPAWN: Record<SummonKind, string> = {
  pop: 'effects/sx_spawn_pop',
  pillar: 'effects/sx_spawn_pillar',
  grimoire: 'effects/sx_spawn_grimoire',
  hand: 'effects/sx_spawn_hand',
  skull: 'effects/sx_spawn_skull',
  parasite: 'effects/sx_spawn_pop',
};

/** Each summon kind appears with its own effect. */
export function summonSpawn(w: World, kind: SummonKind, x: number, y: number) {
  const vis = w.vis;
  if (!vis) return;
  if (kind === 'pillar') vis.oneShot(SPAWN.pillar, x, y - 4);
  else vis.oneShot(SPAWN[kind], x, y, { scale: kind === 'parasite' ? 0.5 : 1 });
  if (kind === 'parasite') return;
  const c = { pop: PINK, skull: BONE, hand: VOID, pillar: GOLD, grimoire: YELLOW }[kind];
  vis.ring(x, y, 4, { color: c, life: 0.3, scaleTo: 3 });
}

/** Fusion Summon: two summons merge into one crowned unit. */
export function fusionFlash(w: World, from: { x: number; y: number }, to: { x: number; y: number }) {
  const vis = w.vis;
  if (!vis) return;
  vis.beam(from.x, from.y - 6, to.x, to.y - 6, { color: GOLD, jitter: 2, width: 1, life: 0.25 });
  vis.oneShot('effects/level_up', to.x, to.y);
  vis.ring(to.x, to.y - 4, 5, { color: GOLD, width: 2, life: 0.4, scaleTo: 3.5 });
  vis.burst(to.x, to.y - 4, { color: 0xffffff, rays: 10, r0: 4, r1: 12, life: 0.3 });
}

/** Cadaver Explosion: red burst at the real blast radius. */
export function cadaverBlast(w: World, x: number, y: number, r: number) {
  const vis = w.vis;
  if (!vis) return;
  vis.ring(x, y, r, { color: 0xdc2626, width: 1, life: 0.4, fill: 0.16 });
  vis.burst(x, y, { color: 0xfb7185, rays: 12, r0: r * 0.3, r1: r * 0.9, life: 0.3 });
}

/**
 * Slowly turning dashed ring at a true radius (black-hole pull, thunderstorm zone, armed mine, skull drain range).
 * Redrawn only when the radius changes by a pixel; lives under the actors until destroyed.
 */
export class RingAura {
  private readonly g: Graphics | null;
  private r = -1;

  constructor(w: World, private readonly color: number, private readonly dashes = 14) {
    this.g = w.vis ? new Graphics() : null;
    if (this.g) w.vis!.shadows.addChild(this.g);
  }

  update(x: number, y: number, r: number, dt: number, alpha = 0.75) {
    const g = this.g;
    if (!g || g.destroyed) return;
    if (Math.abs(r - this.r) >= 1) {
      this.r = r;
      g.clear();
      const step = (Math.PI * 2) / this.dashes;
      for (let i = 0; i < this.dashes; i++) g.moveTo(Math.cos(i * step) * r, Math.sin(i * step) * r).arc(0, 0, r, i * step, i * step + step * 0.55);
      g.stroke({ width: 1, color: this.color });
    }
    g.position.set(x, y);
    g.rotation += dt * 0.6;
    g.alpha = alpha;
  }

  destroy() {
    if (this.g && !this.g.destroyed) this.g.destroy();
  }
}
