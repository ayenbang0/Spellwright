/**
 * Visual cues for wand passives and held casts, attached to the player's sprite root (local origin = player centre).
 * Everything is pooled sprites plus one Graphics that is only redrawn while a charge or channel is active; the
 * simulation never reads any of it.
 */
import { Container, Graphics, Sprite } from 'pixi.js';
import { clamp } from '../core/math';
import type { Visuals } from './visuals';

export interface PassiveInfo {
  id: string;
  /** Equipped in the wand in hand (bright) or only carried (dim). */
  active: boolean;
  /** Magic Vine: stack count (its own slot plus the empty slots to its right). */
  stack: number;
}

export interface WandFxFrame {
  /** Wand tip relative to the player's sprite root. */
  tipX: number;
  tipY: number;
  /** Mean MP fill (0..1) of the carried wands. */
  mp: number;
  /** The wand in hand is recharging between casts. */
  recharging: boolean;
  /** Charge Mode: queued casts / cap. */
  pips: number;
  pipsMax: number;
  /** Bi'an swords still on the wand. */
  swords: number;
  /** Spell id being channelled (continuous spells) and for how long. */
  channel: string | null;
  channelT: number;
  /** Seconds a charged cast has been held (0 = none). */
  charge: number;
}

interface Group {
  info: PassiveInfo;
  sprites: Sprite[];
}

const TEX: Record<string, string> = {
  magic_reservoir: 'effects/px_mote.png',
  tranquil_bloom: 'effects/px_petal.png',
  magic_vine: 'effects/px_vine.png',
  forced_cooldown: 'effects/px_tick.png',
  capacity_expansion_stone: 'effects/px_facet.png',
  spell_prototype: 'effects/px_wild.png',
  arcane_barrier: 'effects/shield_hex.png',
  wand_spirit: 'effects/px_spirit.png',
  resonance_rune: 'effects/px_rune.png',
  area_boost: 'effects/px_glint.png',
  bian_flying_sword: 'effects/px_blade.png',
  charge_mode: 'effects/px_pip.png',
};

const COUNT: Record<string, (i: PassiveInfo) => number> = {
  magic_reservoir: () => 3,
  tranquil_bloom: () => 3,
  magic_vine: (i) => Math.min(8, Math.max(1, i.stack)),
  forced_cooldown: () => 3,
  capacity_expansion_stone: () => 3,
  spell_prototype: () => 2,
  arcane_barrier: () => 1,
  wand_spirit: () => 1,
  resonance_rune: () => 1,
  area_boost: () => 1,
  bian_flying_sword: () => 8,
  charge_mode: () => 24,
};

export type WandPulse = 'barrier' | 'spirit' | 'rune' | 'area';

const TAU = Math.PI * 2;

/** Pastel colour cycling through the hue wheel (Spell Prototype's wildcard shimmer). */
function shimmer(h: number): number {
  const c = (o: number) => Math.round(255 * (0.6 + 0.4 * Math.sin(h * TAU + o)));
  return (c(0) << 16) | (c(2.09) << 8) | c(4.19);
}

export class WandFx {
  private readonly root = new Container();
  private readonly glow = new Graphics();
  private groups: Group[] = [];
  private t = 0;
  private tickAng = 0;
  private glowOn = false;
  private spiritAim = 0;
  private spiritIdle = 0;
  private pulses: Record<WandPulse, number> = { barrier: 0, spirit: 0, rune: 0, area: 0 };

  constructor(private readonly vis: Visuals, parent: Container) {
    parent.addChild(this.root);
    this.root.addChild(this.glow);
  }

  /** Rebuild the pooled sprites for the passives now carried (called when wands/slots change). */
  set(list: PassiveInfo[]) {
    const keep: Group[] = [];
    for (const info of list) {
      const want = COUNT[info.id]?.(info) ?? 0;
      const g = this.groups.find((x) => x.info.id === info.id) ?? { info, sprites: [] };
      g.info = info;
      while (g.sprites.length < want) {
        const s = this.vis.staticSprite(TEX[info.id]);
        if (info.id === 'magic_vine') s.anchor.set(0.5, 1);
        s.visible = info.id !== 'charge_mode' && info.id !== 'bian_flying_sword';
        this.root.addChild(s);
        g.sprites.push(s);
      }
      while (g.sprites.length > want) g.sprites.pop()!.destroy();
      keep.push(g);
    }
    for (const g of this.groups) if (!keep.includes(g)) for (const s of g.sprites) s.destroy();
    this.groups = keep;
  }

  pulse(kind: WandPulse) {
    this.pulses[kind] = 1;
  }

  /** Wand Spirit hovers on the side it last fired towards. */
  aimSpirit(angle: number) {
    this.spiritAim = angle;
    this.spiritIdle = 2;
  }

  update(dt: number, f: WandFxFrame) {
    const t = (this.t += dt);
    const p = this.pulses;
    p.barrier = Math.max(0, p.barrier - dt * 2.5);
    p.spirit = Math.max(0, p.spirit - dt * 3);
    p.rune = Math.max(0, p.rune - dt * 2);
    p.area = Math.max(0, p.area - dt * 2);
    this.tickAng += dt * (f.recharging ? 5 : 1.2);
    this.spiritIdle = Math.max(0, this.spiritIdle - dt);
    if (this.spiritIdle <= 0) this.spiritAim += dt * 0.6;

    for (let gi = 0; gi < this.groups.length; gi++) {
      const { info, sprites } = this.groups[gi];
      const a = info.active ? 1 : 0.5;
      const n = sprites.length;
      for (let k = 0; k < n; k++) {
        const s = sprites[k];
        switch (info.id) {
          case 'magic_reservoir': {
            const ang = t * 0.9 + (k * TAU) / n;
            s.position.set(Math.cos(ang) * 12, Math.sin(ang) * 6 - 2);
            s.alpha = a * (0.35 + 0.6 * f.mp);
            s.scale.set(0.8 + 0.4 * Math.sin(t * 4 + k));
            break;
          }
          case 'tranquil_bloom': {
            const ph = (t * 0.35 + k / n) % 1;
            s.position.set((k - 1) * 7 + Math.sin(ph * 6 + k) * 3, -16 + ph * 26);
            s.rotation = ph * 8;
            s.alpha = a * Math.sin(ph * Math.PI);
            break;
          }
          case 'magic_vine':
            s.position.set((k - (n - 1) / 2) * 5, 11);
            s.rotation = Math.sin(t * 2 + k * 0.9) * 0.3;
            s.alpha = a * 0.9;
            break;
          case 'forced_cooldown': {
            const ang = this.tickAng + (k * TAU) / n;
            s.position.set(Math.cos(ang) * 13, Math.sin(ang) * 8);
            s.rotation = ang + Math.PI / 2;
            s.alpha = a * (f.recharging ? 1 : 0.55);
            break;
          }
          case 'capacity_expansion_stone': {
            const ang = -t * 0.6 + (k * TAU) / n;
            s.position.set(Math.cos(ang) * 15, Math.sin(ang) * 7 - 3 + Math.sin(t * 2 + k) * 1.2);
            s.rotation = t * 0.5 + k;
            s.alpha = a * 0.9;
            break;
          }
          case 'spell_prototype': {
            const ang = t * 1.3 + k * Math.PI;
            s.position.set(Math.cos(ang) * 8, -13 + Math.sin(ang) * 3);
            s.tint = shimmer(t * 0.5 + k * 0.5);
            s.rotation = t * 2;
            s.alpha = a;
            s.scale.set(0.9 + 0.2 * Math.sin(t * 5 + k));
            break;
          }
          case 'arcane_barrier':
            s.rotation = t * 0.3;
            s.scale.set(1.7 + p.barrier * 0.4);
            s.tint = 0x7ee8ff;
            s.alpha = clamp(a * (0.15 + 0.3 * f.mp) + p.barrier * 0.6, 0, 1);
            break;
          case 'wand_spirit':
            s.position.set(Math.cos(this.spiritAim) * 8, Math.sin(this.spiritAim) * 8 + Math.sin(t * 3) * 1.5);
            s.rotation = this.spiritAim + Math.PI / 4;
            s.alpha = a * (0.55 + 0.3 * p.spirit);
            s.scale.set(1 + p.spirit * 0.25);
            break;
          case 'resonance_rune':
            s.position.set(-11, -9 + Math.sin(t * 2.2) * 1.5);
            s.alpha = clamp(a * (0.5 + 0.35 * Math.sin(t * 2)) + p.rune, 0, 1);
            s.scale.set(1 + p.rune * 0.6);
            break;
          case 'area_boost':
            s.position.set(0, -17 + Math.sin(t * 2) * 1.5);
            s.alpha = clamp(a * (0.5 + 0.4 * Math.sin(t * 3)) + p.area, 0, 1);
            s.scale.set(0.8 + 0.3 * Math.sin(t * 3) + p.area * 0.8);
            break;
          case 'bian_flying_sword': {
            s.visible = k < f.swords;
            if (!s.visible) break;
            const ang = t * 2.2 + (k * TAU) / Math.max(1, f.swords);
            s.position.set(Math.cos(ang) * 14, Math.sin(ang) * 8);
            s.rotation = ang + Math.PI * 0.75;
            s.alpha = a;
            break;
          }
          case 'charge_mode': {
            s.visible = k < f.pips;
            if (!s.visible) break;
            const ang = t * 2 + (k * TAU) / Math.max(6, f.pips);
            const r = 4 + Math.min(f.pips, 24) * 0.25;
            s.position.set(f.tipX + Math.cos(ang) * r, f.tipY + Math.sin(ang) * r);
            s.tint = f.pips >= f.pipsMax ? 0xffffff : 0xfacc15;
            break;
          }
        }
      }
    }
    this.drawGlow(t, f);
  }

  private drawGlow(t: number, f: WandFxFrame) {
    const g = this.glow;
    if (f.charge <= 0 && !f.channel) {
      if (this.glowOn) {
        g.clear();
        this.glowOn = false;
      }
      return;
    }
    this.glowOn = true;
    g.clear();
    const x = f.tipX;
    const y = f.tipY;
    if (f.charge > 0) {
      const k = clamp(f.charge / 1.2, 0, 1);
      const r = 2 + 6 * k;
      g.circle(x, y, r).fill({ color: k >= 1 ? 0xffffff : 0xfbbf24, alpha: 0.35 + 0.4 * k });
      g.circle(x, y, r + 2 + Math.sin(t * 20)).stroke({ width: 1, color: 0xfbbf24 });
      const rays = 4 + Math.min(8, Math.floor(f.charge * 4));
      for (let i = 0; i < rays; i++) {
        const a = t * 3 + (i * TAU) / rays;
        g.moveTo(x + Math.cos(a) * (r + 3), y + Math.sin(a) * (r + 3)).lineTo(x + Math.cos(a) * (r + 6), y + Math.sin(a) * (r + 6));
      }
      g.stroke({ width: 1, color: 0xfef3c7 });
      return;
    }
    switch (f.channel) {
      case 'ray_of_disintegration':
        g.circle(x, y, 2.5 + 0.6 * Math.sin(t * 30)).fill({ color: 0xffffff });
        g.circle(x, y, 4.5 + Math.sin(t * 14)).stroke({ width: 1, color: 0x22d3ee });
        break;
      case 'high_pressure_stream':
        g.circle(x, y, 3).fill({ color: 0x3b82f6, alpha: 0.8 });
        g.circle(x, y, 4.5 + Math.sin(t * 16)).stroke({ width: 1, color: 0xa5f3fc });
        break;
      case 'fierce_dragon_breath': {
        const r = 2 + Math.min(f.channelT, 3) * 1.6;
        g.circle(x, y, r + Math.sin(t * 25)).fill({ color: 0xf97316, alpha: 0.85 });
        g.circle(x, y, r * 0.55).fill({ color: 0xfde047 });
        break;
      }
      default:
        break;
    }
  }
}
