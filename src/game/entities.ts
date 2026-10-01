import type { Container } from 'pixi.js';
import type { AnimSprite } from './visuals';

export type Faction = 'player' | 'enemy';

export interface PoisonStack {
  stacks: number;
  t: number;
}

/** Status effects on any actor. */
export interface Status {
  poison: PoisonStack[];
  burnDps: number;
  burnT: number;
  freezeT: number;
  slowMult: number;
  slowT: number;
  vulnMult: number;
  vulnT: number;
  tick: number;
}

export function newStatus(): Status {
  return { poison: [], burnDps: 0, burnT: 0, freezeT: 0, slowMult: 1, slowT: 0, vulnMult: 1, vulnT: 0, tick: 0 };
}

export class Actor {
  x = 0;
  y = 0;
  vx = 0;
  vy = 0;
  /** Collision radius vs walls (px). */
  r = 5;
  /** Hurtbox radius vs projectiles (px). */
  hr = 6;
  hp = 1;
  maxHp = 1;
  dead = false;
  flying = false;
  status = newStatus();
  flashT = 0;
  /** Sub-1 remainder of damage-over-time hits. */
  dotAcc = 0;
  view: AnimSprite | null = null;
  shadow: Container | null = null;
  faceLeft = false;
  /** Position at the start of the latest simulation step: views are drawn between this and (x, y) (`World.renderFrame`). */
  prevX = 0;
  prevY = 0;

  poisonTotal(): number {
    let n = 0;
    for (const p of this.status.poison) n += p.stacks;
    return n;
  }
}
