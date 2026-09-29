/**
 * Spell behaviours: turns planned cast groups (wand.ts) into projectiles, zones, channels and summons.
 * Numbers come from public/data/spells.json; behaviour identity lives here, keyed by spell id.
 */
import { Container, Sprite } from 'pixi.js';
import { angleTo, clamp, DEG, dist, dist2, M } from '../core/math';
import { duetMirror, spellDamage, type DamageParts } from './damage';
import type { Enemy } from './enemies';
import { Proj } from './projectiles';
import { Summon } from './summons';
import type { CastGroup, CastItem, ElementMod, WandInst, WandStats } from './wand';
import type { World } from './world';

export interface CastCtx {
  wand: WandInst | null;
  wandStats: WandStats | null;
  /** Seconds the cast was charged (Shining Star Arrow). */
  charge: number;
  /** Duet mirrored damage handed to this group. */
  mirrored: number;
  /** Damage scale from triggers (Fireworks 35%, Nova 50%, Split…). */
  dmgScale: number;
  /** MP a Mana Absorption returns for this release. */
  refund: number;
  depth: number;
  scatter: number;
  reverse: boolean;
  /** Start a continuous-cast channel on the caster (player only). */
  channel: ((c: { max: number; mpPerSec: number; onStop: () => void; tick: (dt: number, angle: number) => void }) => void) | null;
  /** Summon owner position provider (grimoire casting). */
  origin?: () => { x: number; y: number };
  /** Where Mana Absorption refunds go when the caster is not a wand (a Grimoire's own MP pool). */
  refundSink?: (n: number) => void;
}

/** Projectile art per spell id (anim base under assets/). */
const ART: Record<string, string> = {
  magic_bullet: 'projectiles/magic_bullet', rock_n_ball: 'projectiles/rock_ball', butterfly: 'projectiles/butterfly',
  laser: 'projectiles/laser', fuse: 'projectiles/fuse_spark', floating_wisp: 'projectiles/wisp', black_hole: 'projectiles/black_hole',
  mana_absorption: 'projectiles/mana_absorb', shadow_serpent: 'projectiles/serpent_head', deceptive_mine: 'projectiles/mine',
  meteor: 'projectiles/meteor', rainbow: 'projectiles/rainbow_shot', arcane_nova: 'projectiles/arcane_nova',
  adava_keravda: 'projectiles/adava_bolt', thunderstorm: 'projectiles/thunder_bolt', high_pressure_stream: 'projectiles/water_stream',
  enchanting_coin: 'projectiles/enchant_coin', evil_slayer_sword: 'projectiles/evil_sword', boomerang_blade: 'projectiles/boomerang',
  sword_of_judgement: 'projectiles/judgement_sword', condensed_water_bubble: 'projectiles/water_bubble',
  shining_star_arrow: 'projectiles/shining_arrow', bings_arrow: 'projectiles/bing_arrow', fierce_dragon_breath: 'projectiles/flame',
  lightning_dash: 'projectiles/lightning_ball', ray_of_disintegration: 'projectiles/ray', bian_flying_sword: 'projectiles/judgement_sword',
};

const TRAIL_BY_ELEMENT: Record<string, string> = { fire: 'effects/trail_fire', venom: 'effects/trail_venom' };

const CLOAK_ELEMENTS: ElementMod[] = [
  { element: 'fire', power: 10, duration: 2, chance: 1, extra: 0 },
  { element: 'frost', power: 1.5, duration: 1.5, chance: 1, extra: 0 },
  { element: 'venom', power: 1, duration: 3, chance: 1, extra: 0 },
  { element: 'thunder', power: 1, duration: 0, chance: 0.15, extra: 1 },
];

// ------------------------------------------------------------------ numbers

function parts(w: World, it: CastItem, ctx: CastCtx, baseInc = 0): DamageParts {
  const s = it.spell;
  return {
    base: s.damage[it.lv] ?? 0,
    baseInc,
    dmgAdd: it.mods.dmgAdd + w.stats.dmgAdd,
    dmgMult: it.mods.dmgMult * ctx.dmgScale,
    mirrored: ctx.mirrored,
    finalMult: (ctx.wandStats?.finalMult ?? 1) * it.mods.finalMult,
    condFinal: 1,
    bubble: 0,
  };
}

function critOf(w: World, it: CastItem, ctx: CastCtx): number {
  return (it.spell.crit[it.lv] ?? 0) + it.mods.crit + w.stats.critAdd + (ctx.wandStats?.crit ?? 0);
}

function speedOf(w: World, it: CastItem): number {
  return Math.max(0, it.spell.speed + it.mods.speedAdd) * M * w.stats.projSpeedMult;
}

function lifeOf(it: CastItem): number {
  return Math.max(0.05, (it.spell.lifetime + it.mods.durationAdd) * it.mods.durationMult);
}

function radiusOf(w: World, it: CastItem): number {
  return (it.spell.radius[it.lv] || 1) * it.mods.radiusMult * w.stats.globals.radiusMult * M;
}

function trailOf(it: CastItem): string {
  for (const e of it.mods.elements) if (TRAIL_BY_ELEMENT[e.element]) return TRAIL_BY_ELEMENT[e.element];
  return 'effects/trail_cyan';
}

/** Standard projectile from a cast item. */
function bullet(w: World, it: CastItem, ctx: CastCtx, x: number, y: number, a: number, over: Partial<ConstructorParameters<typeof Proj>[1]> = {}): Proj {
  const s = it.spell;
  const p = new Proj(w, {
    faction: 'player',
    x,
    y,
    angle: a,
    speed: speedOf(w, it),
    life: lifeOf(it),
    r: 3 * it.mods.sizeMult * (w.stats.sizeMult > 1 ? 1.2 : 1),
    dmg: spellDamage(parts(w, it, ctx)),
    crit: critOf(w, it, ctx),
    dps: s.dps,
    tickRate: s.tickRate || 4,
    pierce: (s.pierce[it.lv] ?? 0) + it.mods.pierce,
    rebound: it.mods.rebound,
    reflect: it.mods.reflect,
    elements: it.mods.elements,
    art: ART[s.id] ?? 'projectiles/magic_bullet',
    tags: it.mods.tags,
    trail: trailOf(it),
    item: it,
    wandUid: ctx.wand?.uid ?? 0,
    indiscriminate: s.indiscriminate,
    wallPierce: w.stats.wallPierce,
    scale: it.mods.sizeMult,
    ...over,
  });
  p.ctx = ctx;
  p.trajectory = it.mods.trajectory;
  p.homingDeg = it.mods.trajectory === 'homing' ? it.mods.homingDeg : 0;
  if (it.mods.trajectory === 'orbit') {
    const r = (it.mods.orbitRadius || 3) * M;
    p.orbit = { r, a: angleTo(w.player.x, w.player.y, x, y), w: Math.max(2, p.speed / r) };
  }
  if (it.mods.hover) p.data.hover = it.mods.hover;
  if (it.after?.kind === 'echo' || it.after?.kind === 'serial') wireEchoSerial(w, p, it, ctx);
  return p;
}

// ------------------------------------------------------------------ cast groups

/** Cast every item of a planned group from (x, y) towards `angle`. */
export function castGroup(w: World, group: CastGroup, x: number, y: number, angle: number, ctx: CastCtx) {
  if (ctx.depth > 8) return;
  const absorbCount = group.items.reduce((n, it) => n + (it.spell.id === 'mana_absorption' ? it.copies * Math.max(1, it.mods.split || 1) : 0), 0);
  for (const it of group.items) {
    for (let c = 0; c < it.copies; c++) {
      const spread = (ctx.scatter + (it.spell.scatter[it.lv] ?? 0) * 0 + it.mods.scatter) * DEG;
      const a = angle + (ctx.reverse ? Math.PI : 0) + (w.rng.next() - 0.5) * Math.max(0, spread);
      const refund = absorbCount ? ctx.refund / absorbCount : 0;
      spawnSpell(w, it, x, y, a, { ...ctx, refund });
    }
    // Chain of Lightning links spells cast together.
    if (it.mods.chainDmg > 0 && group.items.length + it.copies > 2) chainLightning(w, x, y, angle, it.mods.chainDmg);
  }
}

function chainLightning(w: World, x: number, y: number, angle: number, dmg: number) {
  const len = 6 * M;
  for (const e of w.enemies) {
    if (e.dead) continue;
    const t = clamp(((e.x - x) * Math.cos(angle) + (e.y - y) * Math.sin(angle)) / len, 0, 1);
    const px = x + Math.cos(angle) * len * t;
    const py = y + Math.sin(angle) * len * t;
    if (dist2(px, py, e.x, e.y) < (e.hr + 6) ** 2) w.damageEnemy(e, dmg, { raw: true });
  }
}

/** Spawn one copy of a cast item. */
export function spawnSpell(w: World, it: CastItem, x: number, y: number, a: number, ctx: CastCtx) {
  const s = it.spell;
  if (w.run.relics.some((r) => r.id === 'colorful_cloak') && s.type !== 'Summon') {
    // Colorful Cloak: every cast picks up a random elemental effect
    const pick = w.rng.pick(CLOAK_ELEMENTS);
    it = { ...it, mods: { ...it.mods, elements: [...it.mods.elements, pick], tags: [...it.mods.tags, pick.element] } };
  }
  const handler = SPELLS[s.id];
  if (it.mods.fall && s.type === 'Projectile' && !s.trigger) {
    fall(w, it, ctx, a);
    return;
  }
  if (handler) handler(w, it, ctx, x, y, a);
  else if (s.type === 'Summon') summon(w, it, ctx, x, y, a, 'pop');
  else w.addProj(bullet(w, it, ctx, x, y, a));
}

/** Release a payload group at a point (completion triggers, Fuse, Nova, Echo…). */
function release(w: World, group: CastGroup, x: number, y: number, a: number, ctx: CastCtx, over: Partial<CastCtx> = {}) {
  castGroup(w, group, x, y, a, { ...ctx, depth: ctx.depth + 1, mirrored: 0, dmgScale: 1, refund: group.mp, channel: null, ...over });
}

/** Completion of a player projectile: split copies, Duet / Fireworks / Twine payloads. */
export function completeProj(w: World, p: Proj) {
  const it = p.item;
  const ctx = p.ctx;
  if (!it || !ctx) return;
  if (!p.data.noImpact) w.vis?.oneShot('effects/impact_small', p.x, p.y, { scale: 0.75 });
  if (it.mods.split > 0 && !p.data.isSplit && ctx.depth < 6) {
    const n = it.mods.split;
    for (let i = 0; i < n; i++) {
      const a = p.angle + ((i - (n - 1) / 2) / Math.max(1, n - 1)) * 120 * DEG;
      const child = bullet(w, it, { ...ctx, dmgScale: ctx.dmgScale * it.mods.splitDmg, depth: ctx.depth + 1 }, p.x, p.y, a);
      child.data.isSplit = 1;
      child.life = Math.max(0.3, child.life * 0.6);
      w.addProj(child);
    }
  }
  const after = it.after;
  if (!after) return;
  const m = after.spell.mods?.[after.lv];
  if (after.kind === 'duet' || after.kind === 'twine') {
    const inherit = after.kind === 'duet' ? m?.dmgMult ?? [0.3, 0.6, 1.2][after.lv] : 0;
    const mirrored = inherit ? duetMirror(parts(w, it, ctx), inherit, 1) : 0;
    release(w, after.payload, p.x, p.y, p.angle, ctx, { mirrored });
  } else if (after.kind === 'fireworks') {
    const scale = m?.dmgMult ?? [0.35, 0.45, 0.6][after.lv];
    for (let i = 0; i < 4; i++) release(w, after.payload, p.x, p.y, p.angle + (i * Math.PI) / 2 + Math.PI / 4, ctx, { dmgScale: scale });
  }
}

function wireEchoSerial(w: World, p: Proj, it: CastItem, ctx: CastCtx) {
  const after = it.after!;
  const m = after.spell.mods?.[after.lv];
  const mpMult = m?.mpMult ?? 0.8;
  const pay = (): boolean => {
    const wand = ctx.wand;
    const cost = after.payload.mp * mpMult;
    if (!wand) return true;
    if (wand.mp < cost) return false;
    wand.mp -= cost;
    return true;
  };
  if (after.kind === 'echo') {
    const minGap = m?.intervalAdd ?? [0.3, 0.2, 0.1][after.lv];
    const prevHit = p.onHit;
    p.onHit = (pp, e) => {
      prevHit?.(pp, e);
      if (w.time - (pp.data.lastEcho ?? -9) < minGap || !pay()) return;
      pp.data.lastEcho = w.time;
      // aim at the closest foe to the hit (which may be the one just hit: the payload then lands on it immediately)
      const next = w.nearestEnemy(e.x, e.y, 8 * M);
      const a = next && next !== e ? angleTo(e.x, e.y, next.x, next.y) : w.rng.range(0, Math.PI * 2);
      release(w, after.payload, e.x, e.y, a, ctx);
    };
  } else {
    const delay = [0.2, 0.12, 0.06][after.lv];
    const prevUpdate = p.onUpdate;
    p.onUpdate = (pp, dt) => {
      prevUpdate?.(pp, dt);
      if (pp.data.serialDone || pp.age < delay) return;
      pp.data.serialDone = 1;
      if (pay()) release(w, after.payload, pp.x, pp.y, pp.angle, ctx);
    };
  }
}

// ------------------------------------------------------------------ helpers

function telegraph(w: World, x: number, y: number, r: number, t: number, color = 0x22d3ee) {
  const vis = w.vis;
  if (!vis) return;
  const s = vis.timed('effects/telegraph_circle.png', x, y, t, { scale: (r * 2) / 32, tint: color, fade: false, layer: vis.shadows });
  s.alpha = 0.8;
}

function aimPoint(w: World, x: number, y: number, a: number, maxRange: number): { x: number; y: number } {
  const i = w.player.intent;
  const d = Math.min(maxRange, dist(x, y, i.aimX, i.aimY));
  return { x: x + Math.cos(a) * d, y: y + Math.sin(a) * d };
}

function summonLimit(w: World, it: CastItem): number {
  const base = it.spell.summonLimit[it.lv] || 3;
  return Math.max(1, Math.round(base * w.stats.summonLimitMult));
}

function summon(w: World, it: CastItem, ctx: CastCtx, x: number, y: number, a: number, kind: Summon['kind']) {
  const same = w.summons.filter((s) => s.spellId === it.spell.id && !s.dead);
  const limit = summonLimit(w, it);
  if (same.length >= limit) {
    if (w.meta.summonLimitStop) return;
    same[0].kill();
  }
  if (it.mods.fusion) {
    // Fusion Summon: merge into an identical summon that has not merged yet
    const partner = same.find((x) => !x.merged && !x.dead);
    if (partner) {
      partner.merge();
      w.vis?.oneShot('effects/level_up', partner.x, partner.y);
      return;
    }
  }
  const hp = (it.spell.hp[it.lv] || 20) * it.mods.summonHpMult;
  const s = new Summon(w, kind, it, ctx, x + Math.cos(a) * 10, y + Math.sin(a) * 10, hp);
  s.dmg = spellDamage(parts(w, it, ctx));
  s.crit = critOf(w, it, ctx);
  w.addSummon(s);
  w.vis?.oneShot('effects/level_up', s.x, s.y);
}

/** Fall boost: the spell arrives from above at the cursor (telegraph circle, then a blast). */
function fall(w: World, it: CastItem, ctx: CastCtx, angle: number) {
  const from = w.player.tip();
  const t = aimPoint(w, from.x, from.y, angle, 9 * M);
  const r = Math.max(1.5 * M, radiusOf(w, it) * 0.6);
  const dmg = spellDamage(parts(w, it, ctx));
  const crit = critOf(w, it, ctx);
  telegraph(w, t.x, t.y, r, 0.3);
  w.after(0.35, () => {
    w.explode(t.x, t.y, r, dmg, crit, { elements: it.mods.elements, spellId: it.spell.id, indiscriminate: it.spell.indiscriminate });
    w.vis?.shake(1.5, 0.1);
  });
}

// ------------------------------------------------------------------ spell table

type Handler = (w: World, it: CastItem, ctx: CastCtx, x: number, y: number, a: number) => void;

const SPELLS: Record<string, Handler> = {
  magic_bullet(w, it, ctx, x, y, a) {
    const p = bullet(w, it, ctx, x, y, a);
    if (it.lv > 0) {
      const mult = it.lv === 1 ? 1.5 : 2;
      const dur = it.lv === 1 ? 4 : 8;
      p.onHit = (_, e) => {
        e.status.vulnMult = Math.max(e.status.vulnMult, mult);
        e.status.vulnT = Math.max(e.status.vulnT, dur);
      };
    }
    w.addProj(p);
  },

  rock_n_ball(w, it, ctx, x, y, a) {
    const p = bullet(w, it, ctx, x, y, a, { r: 6, rotate: false, pierce: -1 });
    p.rebound += 3;
    p.blockHp = [40, 80, 120][it.lv];
    p.knock = 90;
    p.onUpdate = (pp, dt) => {
      if (pp.view) pp.view.rotation += dt * 8 * Math.sign(pp.vx || 1);
    };
    w.addProj(p);
  },

  butterfly(w, it, ctx, x, y, a) {
    const n = it.spell.shots[it.lv] || 3;
    for (let i = 0; i < n; i++) {
      const aa = a + ((i - (n - 1) / 2) / Math.max(1, n - 1)) * (it.spell.scatter[it.lv] || 90) * DEG;
      const p = bullet(w, it, ctx, x, y, aa, { rotate: false });
      p.homingDeg = p.homingDeg || 40;
      p.data.phase = w.rng.range(0, 6);
      p.onUpdate = (pp) => {
        const wob = Math.sin(pp.age * 12 + pp.data.phase) * 0.9;
        pp.setAngle(pp.angle + wob * 0.05);
      };
      w.addProj(p);
    }
  },

  laser(w, it, ctx, x, y, a) {
    const p = bullet(w, it, ctx, x, y, a, { r: 3 });
    // Upgraded Laser: penetration turns into reflection.
    if (it.lv > 0) {
      p.reflect += it.lv;
      p.pierce = 0;
    }
    w.addProj(p);
  },

  rainbow(w, it, ctx, x, y, a) {
    const n = it.spell.shots[it.lv] || 7;
    const spread = (it.spell.scatter[it.lv] || 45) * DEG;
    const tints = [0xff6b6b, 0xffa94d, 0xffe066, 0x69db7c, 0x4dabf7, 0x748ffc, 0xda77f2];
    for (let i = 0; i < n; i++) {
      const aa = a - spread / 2 + (spread * i) / Math.max(1, n - 1);
      w.addProj(bullet(w, it, ctx, x, y, aa, { pierce: 1 + it.mods.pierce, tint: tints[i % tints.length] }));
    }
  },

  fuse(w, it, ctx, x, y, a) {
    const p = bullet(w, it, ctx, x, y, a, { r: 2 });
    p.onEnd = (pp) => {
      if (it.payload) release(w, it.payload, pp.x, pp.y, pp.angle, ctx);
    };
    p.onHit = (pp) => pp.end();
    w.addProj(p);
  },

  arcane_nova(w, it, ctx, x, y, a) {
    const p = bullet(w, it, ctx, x, y, a, { rotate: false, pierce: -1 });
    const releases = 20;
    p.onUpdate = (pp, dt) => {
      if (pp.view) pp.view.rotation += dt * 10;
      const due = Math.floor((pp.age / pp.life) * releases);
      while ((pp.data.released ?? 0) < due && it.payload) {
        pp.data.released = (pp.data.released ?? 0) + 1;
        const foe = w.nearestEnemy(pp.x, pp.y, 10 * M);
        const ra = foe ? angleTo(pp.x, pp.y, foe.x, foe.y) + w.rng.range(-0.25, 0.25) : pp.angle + w.rng.range(-0.6, 0.6);
        release(w, it.payload, pp.x, pp.y, ra, ctx, { dmgScale: 0.5, refund: it.payload.mp });
      }
    };
    w.addProj(p);
  },

  mana_absorption(w, it, ctx, x, y, a) {
    const p = bullet(w, it, ctx, x, y, a);
    const refund = ctx.refund;
    p.onHit = (pp) => {
      if (pp.data.refunded || (!ctx.wand && !ctx.refundSink)) return;
      pp.data.refunded = 1;
      if (ctx.refundSink) ctx.refundSink(refund);
      else if (ctx.wand) ctx.wand.mp = Math.min(ctx.wandStats?.maxMp ?? 9999, ctx.wand.mp + refund);
      w.vis?.number(pp.x, pp.y - 8, `+${Math.round(refund)}mp`, 0x22d3ee);
    };
    w.addProj(p);
  },

  floating_wisp(w, it, ctx, x, y, a) {
    const p = bullet(w, it, ctx, x, y, a, { rotate: false, pierce: -1 });
    p.homingDeg = 30;
    p.trajectory = p.trajectory ?? 'homing';
    p.data.rep = 0;
    const repEvery = it.lv === 0 ? 0 : it.lv === 1 ? 4 : 3;
    p.onHit = (pp) => {
      // hitting calls nearby wisps
      for (const o of w.projs) if (o !== pp && o.spellId === 'floating_wisp' && dist2(o.x, o.y, pp.x, pp.y) < (5 * M) ** 2) o.target = pp.target;
      pp.hits.clear();
    };
    p.onUpdate = (pp) => {
      if (!repEvery) return;
      if (pp.age - pp.data.rep >= repEvery && w.projs.filter((o) => o.spellId === 'floating_wisp').length < 16) {
        pp.data.rep = pp.age;
        const c = bullet(w, it, ctx, pp.x, pp.y, pp.angle + Math.PI / 2, { rotate: false, pierce: -1 });
        c.homingDeg = 30;
        c.life = pp.life - pp.age;
        w.addProj(c);
      }
    };
    w.addProj(p);
  },

  black_hole(w, it, ctx, x, y, a) {
    const p = bullet(w, it, ctx, x, y, a, { r: radiusOf(w, it) * 0.5, rotate: false, pierce: -1, dps: true, tickRate: 4, trail: null });
    const pull = radiusOf(w, it) * 1.6;
    p.onUpdate = (pp, dt) => {
      pp.vx *= 0.992;
      pp.vy *= 0.992;
      if (it.lv > 0) pp.r += dt * (it.lv === 1 ? 2 : 4);
      if (pp.view) pp.view.scale.set(Math.max(1, (pp.r * 2) / 16));
      for (const e of w.enemies) {
        if (e.dead || e.boss) continue;
        const d = dist(pp.x, pp.y, e.x, e.y);
        if (d < pull && d > 2) {
          e.x += ((pp.x - e.x) / d) * 40 * dt;
          e.y += ((pp.y - e.y) / d) * 40 * dt;
        }
      }
    };
    w.addProj(p);
  },

  arcane_explosion(w, it, ctx, x, y) {
    const r = radiusOf(w, it);
    const dmg = spellDamage(parts(w, it, ctx));
    const crit = critOf(w, it, ctx);
    const blast = (bx: number, by: number, radius: number, depth: number) => {
      const before = new Set(w.enemies.filter((e) => !e.dead));
      w.explode(bx, by, radius, dmg, crit, { elements: it.mods.elements, spellId: it.spell.id, fx: 'effects/arcane_ring' });
      if (it.lv === 0 || depth > 3) return;
      for (const e of before) if (e.dead) w.after(0.05, () => blast(e.x, e.y, radius * (it.lv === 1 ? 0.7 : 1), depth + 1));
    };
    blast(x, y, r, 0);
    const p = new Proj(w, { faction: 'player', x, y, angle: 0, speed: 0, life: 0.01, r: 1, dmg: 0, item: it });
    p.ctx = ctx;
    p.data.noImpact = 1;
    w.addProj(p);
  },

  shadow_serpent(w, it, ctx, x, y, a) {
    // A winding head; every body segment ticks damage (4 hits/s per enemy) while overlapping.
    const p = bullet(w, it, ctx, x, y, a, { dps: false, pierce: -1, trail: null });
    p.dmg = 0;
    const segs = Math.min(40, Math.round([6, 12, 24][it.lv] * 1.4));
    const perTick = spellDamage(parts(w, it, ctx)) / (it.spell.tickRate || 4);
    const crit = critOf(w, it, ctx);
    const hist: { x: number; y: number }[] = [];
    const body: Sprite[] = [];
    const last = new Map<Enemy, number>();
    if (w.vis) {
      for (let i = 0; i < segs; i++) {
        const b = new Sprite(w.vis.art.tex(w.vis.art.pick('projectiles/serpent_body_f0.png', 'projectiles/serpent_body.png')));
        b.anchor.set(0.5);
        b.position.set(x, y);
        w.vis.projectiles.addChild(b);
        body.push(b);
      }
    }
    p.data.base = a;
    p.onUpdate = (pp) => {
      if (!pp.trajectory) pp.setAngle(pp.data.base + Math.cos(pp.age * 3.5) * 0.25);
      else pp.data.base = pp.angle;
      hist.unshift({ x: pp.x, y: pp.y });
      if (hist.length > segs * 3 + 3) hist.pop();
      for (let i = 0; i < body.length; i++) {
        const h = hist[Math.min(hist.length - 1, (i + 1) * 3)];
        body[i].position.set(Math.round(h.x), Math.round(h.y));
      }
      for (const e of w.enemies) {
        if (e.dead || e.untargetable || w.time - (last.get(e) ?? -9) < 0.25) continue;
        let touching = false;
        for (let i = 0; i < hist.length && !touching; i += 3) touching = dist2(hist[i].x, hist[i].y, e.x, e.y) < (e.hr + 6) ** 2;
        if (!touching) continue;
        // one tick per enemy per 0.25 s however many segments overlap: the tooltip DPS is per serpent
        last.set(e, w.time);
        const hit = w.rollHit(perTick, crit, e);
        w.damageEnemy(e, hit.dmg, { crit: hit.crit, elements: it.mods.elements, spellId: it.spell.id });
        w.player.onHitEnemy(pp.wandUid);
        pp.onHit?.(pp, e);
      }
    };
    p.onEnd = () => body.forEach((b) => b.destroy());
    w.addProj(p);
  },

  deceptive_mine(w, it, ctx, x, y, a) {
    const p = bullet(w, it, ctx, x, y, a, { rotate: false, pierce: 0, trail: null });
    const r = radiusOf(w, it);
    p.onUpdate = (pp, dt) => {
      pp.vx *= Math.pow(0.05, dt);
      pp.vy *= Math.pow(0.05, dt);
      pp.speed = Math.hypot(pp.vx, pp.vy);
      if (pp.view && pp.speed < 10) pp.view.alpha = Math.floor(pp.age * 8) % 2 ? 0.5 : 1;
    };
    p.onEnd = (pp) => {
      if (w.isPit(pp.x, pp.y)) return;
      w.explode(pp.x, pp.y, r, pp.dmg, pp.crit, { elements: it.mods.elements, indiscriminate: true, spellId: it.spell.id });
    };
    w.addProj(p);
  },

  meteor(w, it, ctx, x, y, a) {
    const t = aimPoint(w, x, y, a, 9 * M);
    const r = radiusOf(w, it);
    const dmg = spellDamage(parts(w, it, ctx));
    const crit = critOf(w, it, ctx);
    const drop = (tx: number, ty: number, rr: number, d: number, small: boolean) => {
      telegraph(w, tx, ty, rr, 0.3);
      if (w.vis) {
        const m = w.vis.sprite(small ? 'projectiles/meteor' : 'projectiles/meteor');
        m.position.set(tx - 30, ty - 90);
        m.scale.set(small ? 0.7 : 1.3);
        w.vis.overhead.addChild(m);
        const start = w.time;
        const fall = () => {
          const k = Math.min(1, (w.time - start) / 0.35);
          m.position.set(tx - 30 * (1 - k), ty - 90 * (1 - k));
          m.step(1 / 60);
          if (k < 1 && !m.destroyed) w.after(1 / 60, fall);
          else m.destroy();
        };
        fall();
      }
      w.after(0.35, () => {
        w.explode(tx, ty, rr, d, crit, { elements: it.mods.elements, indiscriminate: true, spellId: it.spell.id });
        w.vis?.shake(small ? 1 : 3, 0.15);
      });
    };
    drop(t.x, t.y, r, dmg, false);
    const extra = it.lv === 0 ? 0 : it.lv === 1 ? 2 : 4;
    for (let i = 0; i < extra; i++) {
      const ang = w.rng.range(0, Math.PI * 2);
      const d = w.rng.range(1.5, 3) * M;
      w.after(0.12 * (i + 1), () => drop(t.x + Math.cos(ang) * d, t.y + Math.sin(ang) * d, r * 0.6, 28, true));
    }
    const p = new Proj(w, { faction: 'player', x: t.x, y: t.y, angle: a, speed: 0, life: 0.36, r: 1, dmg: 0, item: it, trail: null });
    p.ctx = ctx;
    p.data.noImpact = 1;
    p.stopOnWall = false;
    w.addProj(p);
  },

  adava_keravda(w, it, ctx, x, y, a) {
    const t = aimPoint(w, x, y, a, 10 * M);
    const r = radiusOf(w, it);
    // level from kills (120 → +, 240 → ++), not crafting
    const kills = w.run.spellKills.adava_keravda ?? 0;
    const lv = kills >= 240 ? 2 : kills >= 120 ? 1 : 0;
    const item = lv !== it.lv ? { ...it, lv } : it;
    const dmg = spellDamage(parts(w, item, ctx));
    w.vis?.oneShot('projectiles/adava_bolt', t.x, t.y - 16);
    w.explode(t.x, t.y, (it.spell.radius[lv] || 1) * M * it.mods.radiusMult, dmg, critOf(w, item, ctx), { elements: it.mods.elements, indiscriminate: true, spellId: 'adava_keravda' });
    void r;
    const p = new Proj(w, { faction: 'player', x: t.x, y: t.y, angle: a, speed: 0, life: 0.01, r: 1, dmg: 0, item: it, trail: null });
    p.ctx = ctx;
    p.data.noImpact = 1;
    w.addProj(p);
  },

  thunderstorm(w, it, ctx, x, y, a) {
    const t = aimPoint(w, x, y, a, 8 * M);
    const r = radiusOf(w, it);
    const conduct = [3, 5, 8][it.lv];
    const single = [0, 1.3, 1.6][it.lv];
    const p = new Proj(w, { faction: 'player', x: t.x, y: t.y, angle: a, speed: 0, life: lifeOf(it), r: 1, dmg: spellDamage(parts(w, it, ctx)), crit: critOf(w, it, ctx), item: it, trail: null, art: 'effects/telegraph_circle', rotate: false });
    p.ctx = ctx;
    p.stopOnWall = false;
    p.onUpdate = (pp, dt) => {
      if (pp.view) {
        pp.view.scale.set((r * 2) / 32);
        pp.view.alpha = 0.5;
        pp.view.tint = 0xfacc15;
      }
      pp.data.t = (pp.data.t ?? 0) + dt;
      if (pp.data.t < 0.25) return;
      pp.data.t = 0;
      const inside = w.enemies.filter((e) => !e.dead && dist2(e.x, e.y, pp.x, pp.y) < (r + e.hr) ** 2);
      if (!inside.length) return;
      let target = w.rng.pick(inside);
      const mult = inside.length === 1 && single ? 1 + single : 1;
      const hit = new Set<Enemy>();
      for (let i = 0; i < conduct && target; i++) {
        hit.add(target);
        pp.applyHit(target, (pp.dmg / 4) * mult * (i === 0 ? 1 : 0.6));
        w.vis?.oneShot('projectiles/thunder_bolt', target.x, target.y - 10);
        target = w.nearestEnemy(target.x, target.y, 3 * M, hit) as Enemy;
      }
    };
    w.addProj(p);
  },

  high_pressure_stream(w, it, ctx) {
    channel(w, it, ctx, (dt, ang, st) => {
      st.acc += dt;
      while (st.acc >= 0.05) {
        st.acc -= 0.05;
        const tip = w.player.tip();
        const p = bullet(w, it, ctx, tip.x, tip.y, ang + w.rng.range(-0.06, 0.06), { dps: false, pierce: 0, trail: null });
        p.dmg = spellDamage(parts(w, it, ctx)) * 0.05;
        p.life = 0.45;
        w.addProj(p);
      }
    });
  },

  fierce_dragon_breath(w, it, ctx) {
    const ramp = [0.3, 0.4, 0.5][it.lv];
    channel(w, it, ctx, (dt, ang, st) => {
      st.acc += dt;
      st.t += dt;
      while (st.acc >= 0.045) {
        st.acc -= 0.045;
        const tip = w.player.tip();
        const aa = ang + w.rng.range(-30, 30) * DEG;
        const base = it.spell.damage[it.lv];
        const p = bullet(w, it, ctx, tip.x, tip.y, aa, { dps: false, pierce: -1, trail: null, rotate: false });
        p.dmg = spellDamage(parts(w, it, ctx, base * ramp * st.t)) / 22;
        p.life = 0.4;
        p.onUpdate = (pp) => {
          if (pp.view) pp.view.scale.set(0.7 + pp.age * 2);
        };
        w.addProj(p);
      }
    });
  },

  ray_of_disintegration(w, it, ctx) {
    const segs: Sprite[] = [];
    channel(
      w,
      it,
      ctx,
      (dt, ang, st) => {
        const tip = w.player.tip();
        let len = 0;
        const step = 4;
        while (len < 14 * M && !w.inWall(tip.x + Math.cos(ang) * len, tip.y + Math.sin(ang) * len)) len += step;
        st.acc += dt;
        const tickEvery = 1 / (it.spell.tickRate || 20);
        const dmg = spellDamage(parts(w, it, ctx));
        while (st.acc >= tickEvery) {
          st.acc -= tickEvery;
          for (const e of w.enemies) {
            if (e.dead) continue;
            const tt = clamp((e.x - tip.x) * Math.cos(ang) + (e.y - tip.y) * Math.sin(ang), 0, len);
            if (dist2(tip.x + Math.cos(ang) * tt, tip.y + Math.sin(ang) * tt, e.x, e.y) < (e.hr + 3) ** 2) {
              const h = w.rollHit(dmg * tickEvery, critOf(w, it, ctx), e);
              w.damageEnemy(e, h.dmg, { crit: h.crit, elements: it.mods.elements, spellId: it.spell.id, noNumber: w.rng.chance(0.8) });
            }
          }
        }
        if (w.vis) {
          const need = Math.ceil(len / 32);
          while (segs.length < need) {
            const s = new Sprite(w.vis.art.tex(w.vis.art.pick('projectiles/ray_f0.png', 'projectiles/laser_f0.png')));
            s.anchor.set(0, 0.5);
            w.vis.projectiles.addChild(s);
            segs.push(s);
          }
          const frame = Math.floor(w.time * 12) % 2;
          segs.forEach((s, i) => {
            s.visible = i < need;
            s.texture = w.vis!.art.tex(w.vis!.art.pick(`projectiles/ray_f${frame}.png`, 'projectiles/laser_f0.png'));
            s.position.set(tip.x + Math.cos(ang) * i * 32, tip.y + Math.sin(ang) * i * 32);
            s.rotation = ang;
          });
        }
      },
      () => segs.forEach((s) => s.destroy()),
    );
  },

  lightning_dash(w, it, ctx, x, y, a) {
    if (!ctx.channel) {
      // cast from a payload (Fuse, Echo, a Grimoire…): an independent lightning ball that chases the cursor
      const ball = bullet(w, it, ctx, x, y, a, { dps: false, pierce: -1, rotate: false, life: Math.max(1, lifeOf(it) + 1) });
      ball.eraser = true;
      ball.trajectory = ball.trajectory ?? 'track';
      ball.stopOnWall = false;
      ball.onUpdate = (pp) => {
        for (const [e, t] of pp.hits) if (w.time - t > 1 / 3) pp.inside.delete(e);
      };
      w.addProj(ball);
      return;
    }
    const pl = w.player;
    const p = bullet(w, it, ctx, pl.x, pl.y, pl.aim, { dps: false, pierce: -1, rotate: false, life: 99 });
    p.eraser = true;
    p.stopOnWall = false;
    // tick rate 3/s (wiki): an enemy may be hit again while still inside after 1/3 s
    p.onUpdate = (pp) => {
      for (const [e, t] of pp.hits) if (w.time - t > 1 / 3) pp.inside.delete(e);
    };
    w.addProj(p);
    channel(
      w,
      it,
      ctx,
      (dt) => {
        pl.setInvuln = 0.1;
        const ang = angleTo(pl.x, pl.y, pl.intent.aimX, pl.intent.aimY);
        const sp = 11 * M;
        if (dist(pl.x, pl.y, pl.intent.aimX, pl.intent.aimY) > 6) w.moveActor(pl, Math.cos(ang) * sp * dt, Math.sin(ang) * sp * dt);
        p.x = pl.x;
        p.y = pl.y - 4;
        p.age = 0;
        pl.hidden = true;
      },
      () => {
        pl.hidden = false;
        p.dead = true;
        if (it.lv > 0) {
          const r = M * (it.lv === 1 ? 2.5 : 3.5);
          for (const b of w.projs) if (b.faction === 'enemy' && dist2(b.x, b.y, pl.x, pl.y) < r * r) b.kill();
          w.explode(pl.x, pl.y, r, spellDamage(parts(w, it, ctx)) * 2, critOf(w, it, ctx), { fx: 'effects/arcane_ring' });
        }
      },
    );
  },

  enchanting_coin(w, it, ctx, x, y, a) {
    const spent = Math.floor(w.run.coins * 0.2);
    w.run.coins -= spent;
    const base = it.spell.damage[it.lv];
    const p = bullet(w, it, ctx, x, y, a, { rotate: false });
    p.dmg = spellDamage(parts(w, it, ctx, base * 0.1 * spent));
    p.onEnd = (pp) => {
      // coins come back where the spell completes (pick them up!)
      for (let i = 0; i < spent; i++) w.spawnPickup('coin', pp.x, pp.y, 1);
    };
    w.addProj(p);
  },

  evil_slayer_sword(w, it, ctx, x, y, a) {
    const r = radiusOf(w, it);
    const p = bullet(w, it, ctx, x, y, a, { speed: 0, life: 0.22, r, pierce: -1, rotate: true, trail: null, scale: r / 12 });
    p.eraser = true;
    if (it.lv > 0) p.data.reflectShots = 1;
    p.setAngle(a, 0.001);
    const arc = ((it.spell.scatter[it.lv] || 150) * DEG) / 2;
    const hitOk = (e: { x: number; y: number }) => Math.abs(((angleTo(w.player.x, w.player.y, e.x, e.y) - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI) < arc;
    p.onUpdate = (pp) => {
      pp.x = w.player.x + Math.cos(a) * r * 0.5;
      pp.y = w.player.y - 4 + Math.sin(a) * r * 0.5;
      for (const e of w.enemies) if (!e.dead && !pp.hits.has(e) && !hitOk(e)) pp.hits.set(e, w.time);
    };
    w.vis?.oneShot('effects/slash', x, y, { rot: a, scale: r / 16 });
    w.addProj(p);
  },

  boomerang_blade(w, it, ctx, x, y, a) {
    const p = bullet(w, it, ctx, x, y, a, { pierce: -1, rotate: false, dps: false });
    const outT = Math.max(0.35, lifeOf(it) * 0.45);
    p.life = 99;
    p.stopOnWall = false;
    p.onUpdate = (pp, dt) => {
      if (pp.view) pp.view.rotation += dt * 18;
      // re-hit while inside at 3 hits/s (wiki tick rate)
      for (const [e, t] of pp.hits) if (w.time - t > 1 / 3) pp.inside.delete(e);
      if (pp.age > outT) {
        const d = dist(pp.x, pp.y, w.player.x, w.player.y);
        pp.setAngle(angleTo(pp.x, pp.y, w.player.x, w.player.y), Math.max(pp.speed, speedOf(w, it)));
        if (d < 8 || pp.age > outT * 3) pp.end();
      } else pp.setAngle(pp.angle, pp.speed * (1 - dt * 1.5));
    };
    w.addProj(p);
  },

  sword_of_judgement(w, it, ctx, x, y) {
    const p = bullet(w, it, ctx, x, y, 0, { pierce: 0, trail: 'effects/trail_cyan' });
    const orbitA = w.rng.range(0, Math.PI * 2);
    p.orbit = { r: 14, a: orbitA, w: 3 };
    p.life = Math.max(4, lifeOf(it));
    p.speed = 1;
    p.onUpdate = (pp) => {
      if (!pp.orbit) return;
      const e = w.nearestEnemy(pp.x, pp.y, 5 * M);
      if (e && pp.age > 0.25) {
        pp.orbit = null;
        pp.target = e;
        pp.homingDeg = 200;
        pp.setAngle(angleTo(pp.x, pp.y, e.x, e.y), 16 * M);
        pp.life = pp.age + 1.2;
      }
    };
    w.addProj(p);
  },

  condensed_water_bubble(w, it, ctx, x, y, a) {
    const r0 = radiusOf(w, it) * 0.35;
    const p = bullet(w, it, ctx, x + Math.cos(a) * 12, y + Math.sin(a) * 12, a, { speed: M * 0.6, pierce: -1, rotate: false, r: r0, dps: false, trail: null });
    p.life = lifeOf(it);
    p.onHit = () => undefined;
    p.hits = new Map();
    p.onUpdate = (pp) => {
      const k = 1 + 0.1 * (it.lv + 1) * pp.age;
      pp.r = r0 * k;
      if (pp.view) pp.view.scale.set((pp.r * 2) / 16);
      pp.hits.clear();
      pp.inside.clear();
    };
    p.dmg = 0;
    p.onEnd = (pp) => {
      const growth = [0.2, 0.25, 0.35][it.lv];
      const base = it.spell.damage[it.lv];
      const pr = parts(w, it, ctx);
      pr.bubble = Math.round(pp.age * growth * base * (it.mods.dmgMult / (it.mods.dmgMult || 1)) * (1 + pr.dmgAdd));
      const dmg = spellDamage(pr);
      w.explode(pp.x, pp.y, pp.r * 2.2, dmg, critOf(w, it, ctx), { elements: it.mods.elements, spellId: it.spell.id });
      const pl = w.player;
      const d = dist(pp.x, pp.y, pl.x, pl.y);
      if (d < pp.r * 2.5) {
        pl.recoilX += ((pl.x - pp.x) / (d || 1)) * 220;
        pl.recoilY += ((pl.y - pp.y) / (d || 1)) * 220;
      }
    };
    w.addProj(p);
  },

  shining_star_arrow(w, it, ctx, x, y, a) {
    const critBonus = 0.25 * ctx.charge;
    const threshold = [0.33, 0.66, 1][it.lv];
    const finalBonus = [1.5, 1.7, 2][it.lv];
    const crit = critOf(w, it, ctx) + critBonus;
    const pr = parts(w, it, ctx);
    if (crit > threshold) pr.condFinal = finalBonus;
    const p = bullet(w, it, ctx, x, y, a, { crit, pierce: 1 + it.mods.pierce, dmg: spellDamage(pr) });
    w.player.recoilX -= Math.cos(a) * 80;
    w.player.recoilY -= Math.sin(a) * 80;
    w.addProj(p);
  },

  bings_arrow(w, it, ctx, x, y, a) {
    w.addProj(bullet(w, it, ctx, x, y, a));
    w.run.spellKills.__bing = (w.run.spellKills.__bing ?? 0) + 1;
    if (w.run.spellKills.__bing % 50 === 0) {
      const n = [4, 6, 10][it.lv];
      for (let i = 0; i < n; i++) {
        const big = bullet(w, it, { ...ctx, dmgScale: ctx.dmgScale * 3 }, x, y, a + (i - (n - 1) / 2) * 6 * DEG, { scale: 1.6, r: 5, pierce: 3 });
        w.addProj(big);
      }
    }
  },

  // ---------------------------------------------------------------- summons

  pop(w, it, ctx, x, y, a) {
    summon(w, it, ctx, x, y, a, 'pop');
  },
  pillar_of_light(w, it, ctx, x, y, a) {
    const n = it.spell.shots[it.lv] || 3;
    for (let i = 0; i < n; i++) {
      const off = (i - (n - 1) / 2) * 14;
      const px = x + Math.cos(a) * 20 - Math.sin(a) * off;
      const py = y + Math.sin(a) * 20 + Math.cos(a) * off;
      summon(w, it, ctx, px - Math.cos(a) * 10, py - Math.sin(a) * 10, a, 'pillar');
    }
  },
  autonomous_grimoire(w, it, ctx, x, y, a) {
    summon(w, it, ctx, x, y, a, 'grimoire');
  },
  hand_of_the_cthulhu(w, it, ctx, x, y, a) {
    summon(w, it, ctx, x, y, a, 'hand');
  },
  skull_of_the_cthulhu(w, it, ctx, x, y, a) {
    summon(w, it, ctx, x, y, a, 'skull');
  },
};

// ------------------------------------------------------------------ channels

interface ChannelState {
  acc: number;
  t: number;
}

/** Continuous casting: runs while the cast button is held and the wand has MP (spell MP is per second). */
function channel(w: World, it: CastItem, ctx: CastCtx, tick: (dt: number, angle: number, st: ChannelState) => void, stop?: () => void) {
  const st: ChannelState = { acc: 0, t: 0 };
  const max = Math.max(1, it.spell.lifetime + it.mods.durationAdd) * it.mods.durationMult;
  const mpPerSec = it.spell.mana[it.lv] * it.mods.mpMult * (ctx.wandStats?.mpMult ?? 1);
  if (!ctx.channel) {
    // Cast from a payload/summon: run for a short burst instead.
    const end = w.time + 0.6;
    const step = () => {
      tick(1 / 30, w.player.aim, st);
      if (w.time < end) w.after(1 / 30, step);
      else stop?.();
    };
    step();
    return;
  }
  ctx.channel({ max, mpPerSec, onStop: () => stop?.(), tick: (dt, angle) => tick(dt, angle, st) });
}

/** Bi'an Flying Sword passive: swords launch with each cast and return on recall (Space). */
export function launchFlyingSword(w: World, wand: WandInst, stats: WandStats, angle: number) {
  const live = w.projs.filter((p) => p.spellId === 'bian_flying_sword' && !p.dead);
  if (live.length >= stats.flyingSwords) return;
  const def = w.content.spell.bian_flying_sword;
  if (!def) return;
  const pl = w.player;
  const p = new Proj(w, {
    faction: 'player', x: pl.x, y: pl.y - 6, angle, speed: 12 * M, life: 30, r: 4, dmg: def.damage[0] * (1 + w.stats.dmgAdd),
    crit: def.crit[0] + w.stats.critAdd, pierce: -1, art: ART.bian_flying_sword, spellId: 'bian_flying_sword', wandUid: wand.uid,
  });
  p.stopOnWall = false;
  p.onUpdate = (pp, dt) => {
    if (pp.data.returning) {
      pp.setAngle(angleTo(pp.x, pp.y, pl.x, pl.y), 16 * M);
      for (const [e, t] of pp.hits) if (w.time - t > 0.3) pp.inside.delete(e);
      if (dist2(pp.x, pp.y, pl.x, pl.y) < 100) pp.dead = true;
      return;
    }
    pp.setAngle(pp.angle, Math.max(0, pp.speed - dt * 30 * M));
    if (pp.speed <= 0) {
      pp.data.parked = 1;
      if (pp.view) pp.view.rotation = -Math.PI / 2;
    }
  };
  p.recall = () => {
    p.data.returning = 1;
    p.hits.clear();
    p.inside.clear();
  };
  w.addProj(p);
}

/** Enemy-side helper so all magenta bullets look/behave the same. */
export function enemyBullet(w: World, x: number, y: number, a: number, speedM: number, dmg: number, kind: 'bullet' | 'diamond' | 'orb' = 'bullet', life = 5): Proj {
  const art = kind === 'orb' ? 'projectiles/enemy_orb' : kind === 'diamond' ? 'projectiles/enemy_diamond' : 'projectiles/enemy_bullet';
  const slow = w.run.curses.includes('heartburn') ? 1 : 1;
  const p = new Proj(w, { faction: 'enemy', x, y, angle: a, speed: speedM * M * slow, life, r: kind === 'orb' ? 5 : 3, dmg, art, rotate: kind === 'diamond', trail: null });
  const drop = w.run.relics.find((r) => r.id === 'stagnant_droplet');
  if (drop) {
    p.onUpdate = (pp) => {
      if (dist2(pp.x, pp.y, w.player.x, w.player.y) < (3 * M) ** 2 && !pp.data.slowed) {
        pp.data.slowed = 1;
        pp.setAngle(pp.angle, pp.speed * 0.5);
      }
    };
  }
  w.addProj(p);
  return p;
}

export { Container };
