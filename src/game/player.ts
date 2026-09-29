import { Container, Sprite } from 'pixi.js';
import { angleTo, DEG, dist, M } from '../core/math';
import type { Enemy } from './enemies';
import { Actor } from './entities';
import { castGroup, launchFlyingSword, type CastCtx } from './spells';
import { areaBoostCopies, deckOf, hasCastableFrom, planGroup, type CastGroup, type WandInst, type WandStats, wandStats } from './wand';
import type { World } from './world';
import { AnimSprite } from './visuals';
import { RELICS } from './relics';

export interface Intent {
  mx: number;
  my: number;
  aimX: number;
  aimY: number;
  fire: boolean;
  firePressed: boolean;
  fireReleased: boolean;
  skill: boolean;
}

interface Channel {
  wand: WandInst;
  group: CastGroup;
  t: number;
  max: number;
  mpPerSec: number;
  onStop: () => void;
  tick: (dt: number, angle: number) => void;
}

/** The player: movement, hazards, and the wand casting runtime. */
export class Player extends Actor {
  intent: Intent = { mx: 0, my: 0, aimX: 0, aimY: 0, fire: false, firePressed: false, fireReleased: false, skill: false };
  invuln = 0;
  /** Invulnerable while a spell/skill says so (Lightning Dash, sprint). */
  setInvuln = 0;
  aim = 0;
  casting = 0;
  walkT = 0;
  hurtT = 0;
  deathT = -1;
  timidT = 0;
  stiffT = 0;
  noHitT = 0;
  stillT = 0;
  skillCd = 0;
  sprintT = 0;
  castLock = 0;
  hidden = false;
  private spikeT = 0;
  private safeX = 0;
  private safeY = 0;
  private channel: Channel | null = null;
  private charge: { wand: WandInst; group: CastGroup; t: number } | null = null;
  private chargeQueue: { wand: WandInst; group: CastGroup }[] = [];
  private wandView: Sprite | null = null;
  private root: Container | null = null;
  private body: AnimSprite | null = null;
  /** Cached per-wand stats, rebuilt when wands/stats change. */
  private statCache = new Map<number, WandStats>();
  recoilX = 0;
  recoilY = 0;
  lastCastT = 0;

  constructor(private readonly w: World) {
    super();
    this.r = 4;
    this.hr = 3;
  }

  get hpMax(): number {
    return this.w.stats.maxHp;
  }

  statsOf(wand: WandInst): WandStats {
    let s = this.statCache.get(wand.uid);
    if (!s) {
      s = wandStats(this.w.content.wand[wand.defId], wand, this.w.content, this.w.stats.globals);
      this.statCache.set(wand.uid, s);
    }
    return s;
  }

  invalidateWands() {
    this.statCache.clear();
    for (const wand of this.w.run.wands) {
      const s = this.statsOf(wand);
      wand.mp = Math.min(wand.mp, s.maxMp);
      if (wand.ptr >= wand.slots.length) wand.ptr = 0;
    }
    this.updateWandView();
  }

  heal(n: number) {
    // Seed of Greed drains healing until it has soaked up 70 HP, then blooms into +50 max HP
    const run = this.w.run;
    if (run.relics.some((r) => r.id === 'seed_of_greed') && (run.spellKills.__seed ?? 0) < 70) {
      run.spellKills.__seed = (run.spellKills.__seed ?? 0) + n;
      this.w.vis?.number(this.x, this.y - 14, `seed ${Math.min(70, Math.round(run.spellKills.__seed))}/70`, 0x84cc16);
      if (run.spellKills.__seed >= 70) {
        run.maxHpBonus += 50;
        this.w.toast('The seed blooms: +50 max HP', 0x4ade80);
        this.w.hooks.onDoor?.('stats');
        this.hp += 50;
      }
      return;
    }
    const before = this.hp;
    this.hp = Math.min(this.w.stats.maxHp, this.hp + n);
    if (this.hp > before) {
      this.w.vis?.number(this.x, this.y - 14, `+${Math.round(this.hp - before)}`, 0x4ade80);
      this.w.vis?.timed('effects/heal_cross.png', this.x, this.y - 10, 0.5, { vy: -12 });
      this.w.sfx('heal');
    }
  }

  get activeWand(): WandInst | null {
    return this.w.run.wands[this.w.run.active] ?? null;
  }

  // ---------------------------------------------------------------- view

  attachView() {
    const vis = this.w.vis;
    if (!vis) return;
    this.root = new Container();
    this.shadow = vis.shadow(1);
    this.body = vis.sprite('player/player_idle');
    this.root.addChild(this.body);
    this.wandView = new Sprite();
    this.wandView.anchor.set(0.15, 0.85);
    this.root.addChild(this.wandView);
    vis.actors.addChild(this.root);
    this.updateWandView();
  }

  updateWandView() {
    const vis = this.w.vis;
    const wand = this.activeWand;
    if (!vis || !this.wandView) return;
    if (!wand) {
      this.wandView.visible = false;
      return;
    }
    const def = this.w.content.wand[wand.defId];
    const path = vis.art.has(def.sprite) ? def.sprite : 'projectiles/magic_bullet.png';
    this.wandView.texture = vis.art.tex(path);
    this.wandView.visible = true;
  }

  sync(dt: number) {
    if (!this.root || !this.body) return;
    const vis = this.w.vis!;
    const moving = Math.hypot(this.intent.mx, this.intent.my) > 0.1;
    let anim = 'player/player_idle';
    if (this.deathT >= 0) anim = 'player/player_death';
    else if (this.hurtT > 0 && vis.art.has('player/player_hurt.png')) anim = '';
    else if (this.casting > 0) anim = 'player/player_cast';
    else if (moving) anim = 'player/player_walk';
    if (anim) this.body.play(vis.art.anim(anim));
    else this.body.texture = vis.art.tex('player/player_hurt.png');
    this.body.step(dt);
    const faceLeft = Math.cos(this.aim) < 0;
    this.body.scale.x = faceLeft ? -this.w.stats.sizeMult : this.w.stats.sizeMult;
    this.body.scale.y = this.w.stats.sizeMult;
    this.root.position.set(Math.round(this.x), Math.round(this.y - 6));
    this.root.zIndex = this.y;
    const blink = (this.invuln > 0 && Math.floor(this.invuln * 20) % 2 === 0) || this.setInvuln > 0 && this.sprintT > 0;
    this.root.alpha = this.hidden ? 0.35 : blink ? 0.45 : 1;
    this.body.tint = this.flashT > 0 ? 0xff8080 : 0xffffff;
    if (this.wandView) {
      this.wandView.visible = this.deathT < 0 && !!this.activeWand && !this.w.run.finished;
      // Wand sprites are drawn diagonally (handle bottom-left → head top-right): rotate so the head points at the aim.
      this.wandView.rotation = this.aim + Math.PI / 4;
      this.wandView.position.set(Math.cos(this.aim) * 4, 2 + Math.sin(this.aim) * 3);
      this.wandView.zIndex = Math.sin(this.aim) < 0 ? -1 : 1;
    }
    if (this.shadow) this.shadow.position.set(Math.round(this.x), Math.round(this.y + 5));
  }

  /** Point at the tip of the held wand (world px), where spells spawn. */
  tip(): { x: number; y: number } {
    const robe = this.w.run.relics.find((r) => r.id === 'magicians_robe');
    if (robe) {
      // remote casting: spells leave from a point up to 5 m (+2 m per level above 1) towards the cursor
      const reach = (5 + 2 * (robe.lv - 1)) * M;
      const d = Math.min(reach, dist(this.x, this.y - 6, this.intent.aimX, this.intent.aimY));
      return { x: this.x + Math.cos(this.aim) * d, y: this.y - 6 + Math.sin(this.aim) * d };
    }
    return { x: this.x + Math.cos(this.aim) * 11, y: this.y - 6 + Math.sin(this.aim) * 9 };
  }

  die() {
    this.dead = true;
    this.deathT = 0;
    this.w.vis?.shake(4, 0.4);
  }

  // ---------------------------------------------------------------- update

  update(dt: number) {
    const w = this.w;
    const run = w.run;
    const st = w.stats;
    if (this.deathT >= 0) {
      this.deathT += dt;
      return;
    }
    this.invuln = Math.max(0, this.invuln - dt);
    this.setInvuln = Math.max(0, this.setInvuln - dt);
    this.flashT = Math.max(0, this.flashT - dt);
    this.hurtT = Math.max(0, this.hurtT - dt);
    this.casting = Math.max(0, this.casting - dt);
    this.timidT = Math.max(0, this.timidT - dt);
    this.stiffT = Math.max(0, this.stiffT - dt);
    this.skillCd = Math.max(0, this.skillCd - dt);
    this.noHitT += dt;
    this.flying = st.flight || this.sprintT > 0;
    this.aim = angleTo(this.x, this.y - 6, this.intent.aimX, this.intent.aimY);

    // movement
    let speed = st.speed * M;
    if (run.relics.some((r) => r.id === 'crimson_anklet')) speed *= this.noHitT > 8 ? 1.4 : 0.7;
    const wandDef = this.activeWand ? w.content.wand[this.activeWand.defId] : null;
    speed *= wandDef?.moveSpeedMult ?? 1;
    if (this.casting > 0 && !st.noCastSlow) speed *= 0.65;
    if (this.sprintT > 0) {
      this.sprintT -= dt;
      speed *= 3.2;
    }
    const mx = this.sprintT > 0 ? Math.cos(this.aim) : this.intent.mx;
    const my = this.sprintT > 0 ? Math.sin(this.aim) : this.intent.my;
    const moving = Math.hypot(mx, my) > 0.05;
    this.stillT = moving ? 0 : this.stillT + dt;
    this.recoilX *= Math.pow(0.001, dt);
    this.recoilY *= Math.pow(0.001, dt);
    const bx = this.x;
    const by = this.y;
    w.moveActor(this, (mx * speed + this.recoilX) * dt, (my * speed + this.recoilY) * dt);
    if (moving) this.walkT += dt;
    const walked = Math.hypot(this.x - bx, this.y - by) / M;
    if (walked > 0) this.onMoved(walked);

    // hazards
    this.spikeT -= dt;
    if (!this.flying && w.checkHazards(this) && this.spikeT <= 0 && !st.spikeImmune) {
      this.spikeT = 0.6;
      w.hurtPlayer(6, { trap: true });
    }
    if (!this.flying && w.isPit(this.x, this.y)) {
      this.x = this.safeX;
      this.y = this.safeY;
      w.hurtPlayer(8, { trap: true, ignoreInvuln: true });
    } else if (!w.isPit(this.x, this.y)) {
      this.safeX = this.x;
      this.safeY = this.y;
    }

    this.updateWands(dt);
    if (this.intent.skill) this.useSkill();
  }

  // ---------------------------------------------------------------- casting

  private updateWands(dt: number) {
    const w = this.w;
    const run = w.run;
    const st = w.stats;
    run.wands.forEach((wand, i) => {
      const s = this.statsOf(wand);
      const def = w.content.wand[wand.defId];
      let regen = s.regen * st.regenMult;
      if (def.heldRegen) regen *= i === run.active ? def.heldRegen[0] : def.heldRegen[1];
      if (run.temp.regenT > 0) regen *= 3;
      wand.mp = Math.min(s.maxMp, wand.mp + regen * dt);
      wand.wait -= dt;
      if (def.postSlot?.on === 'second') this.charge_(wand, def.postSlot.energy * dt);
      if (def.postSlot?.on === 'stillSecond' && this.stillT > 0) this.charge_(wand, def.postSlot.energy * dt);
      const spirit = s.spirit >= 0 || st.forceSpirit;
      if (spirit && (i !== run.active || st.forceSpirit)) this.spiritFire(wand, s);
    });
    const wand = this.activeWand;
    if (!wand) return;
    const s = this.statsOf(wand);
    const canCast = this.timidT <= 0 && this.stiffT <= 0 && this.castLock <= 0 && !run.finished && !(s.spirit >= 0 || st.forceSpirit);
    this.castLock = Math.max(0, this.castLock - dt);

    if (this.channel) {
      const c = this.channel;
      const cost = c.mpPerSec * dt;
      if (!this.intent.fire || c.t >= c.max || c.wand !== wand || c.wand.mp < cost) {
        c.onStop();
        this.channel = null;
        wand.wait = s.interval;
      } else {
        c.wand.mp -= cost;
        c.t += dt;
        this.casting = 0.2;
        c.tick(dt, this.aim);
      }
      return;
    }
    if (this.charge) {
      this.charge.t += dt;
      this.casting = 0.2;
      if (!this.intent.fire || this.charge.t > 5) {
        const c = this.charge;
        this.charge = null;
        this.fireGroup(c.wand, s, c.group, c.t);
      }
      return;
    }
    if (s.chargeMode && this.chargeQueue.length && (!this.intent.fire || this.chargeQueue.length >= s.chargeMode.max)) {
      const q = this.chargeQueue;
      this.chargeQueue = [];
      for (const it of q) this.fireGroup(it.wand, s, it.group, 0);
      return;
    }
    if (!canCast || !this.intent.fire || wand.wait > 0) return;
    const next = this.nextGroup(wand, s);
    if (!next) return;
    const { group, end } = next;
    if (wand.mp < group.mp) {
      if (group.mp > s.maxMp && wand.mp >= s.maxMp - 0.5) {
        // Unaffordable at full MP: cast what fits (never deadlock).
        while (group.items.length > 1 && group.mp > wand.mp) {
          const it = group.items.pop()!;
          group.mp -= it.mp * it.copies;
        }
      } else {
        return;
      }
    }
    wand.mp -= group.mp;
    this.advance(wand, s, group, end);
    const cont = group.items.find((i) => i.spell.castMode !== 'instant');
    if (cont?.spell.castMode === 'charged') {
      this.charge = { wand, group, t: 0 };
      return;
    }
    if (s.chargeMode) {
      this.chargeQueue.push({ wand, group });
      return;
    }
    this.fireGroup(wand, s, group, 0);
  }

  /** Plan the group at the wand pointer. */
  nextGroup(wand: WandInst, s: WandStats): { group: CastGroup; end: number } | null {
    const cards = deckOf(wand.slots, this.w.content, areaBoostCopies(this.w.run.wands, this.w.content));
    if (!hasCastableFrom(cards, 0)) return null;
    let ptr = wand.ptr;
    if (!hasCastableFrom(cards, ptr)) ptr = 0;
    const { group, next } = planGroup(cards, ptr, s.simul, { content: this.w.content, baseSimul: s.simul, mpMult: s.mpMult });
    return { group, end: next };
  }

  private advance(wand: WandInst, s: WandStats, group: CastGroup, end: number) {
    const cards = deckOf(wand.slots, this.w.content, areaBoostCopies(this.w.run.wands, this.w.content));
    const intervalMult = this.w.stats.intervalMult * (this.focusMult());
    if (!hasCastableFrom(cards, end)) {
      wand.ptr = 0;
      wand.wait = Math.max(0.05, (s.cd + group.cdAdd) * intervalMult) + Math.max(0, s.interval + group.intervalAdd) * 0;
    } else {
      wand.ptr = end;
      wand.wait = Math.max(0.03, (s.interval + group.intervalAdd) * intervalMult);
    }
  }

  private focusMult(): number {
    return this.stillT > 0.3 && this.w.run.relics.some((r) => r.id === 'talisman_of_focus') ? 0.4 : 1;
  }

  fireGroup(wand: WandInst, s: WandStats, group: CastGroup, chargeT: number, angleOverride?: number, origin?: { x: number; y: number }) {
    const w = this.w;
    const tip = origin ?? this.tip();
    const angle = angleOverride ?? this.aim;
    const def = w.content.wand[wand.defId];
    const ctx: CastCtx = {
      wand,
      wandStats: s,
      charge: chargeT,
      mirrored: 0,
      dmgScale: 1,
      refund: group.mp,
      depth: 0,
      scatter: s.scatter + group.scatter + w.stats.scatterAdd * (this.focusMult() < 1 ? 0.4 : 1),
      reverse: def.flags.includes('reverse') || this.w.run.curses.includes('rebellion'),
      channel: (c) => {
        this.channel = { wand, group, t: 0, max: c.max, mpPerSec: c.mpPerSec, onStop: c.onStop, tick: c.tick };
      },
    };
    const dirs = def.flags.includes('quad') ? [0, 90, 180, 270] : [0];
    for (const d of dirs) castGroup(w, group, tip.x, tip.y, angle + d * DEG, ctx);
    this.casting = 0.25;
    this.lastCastT = w.time;
    this.noHitT = this.noHitT;
    if (w.vis) w.vis.oneShot('effects/muzzle', tip.x, tip.y, { rot: angle });
    // recoil
    const recoil = 30 * w.stats.recoilMult * (def.flags.includes('reverseRecoil') ? -1 : 1) * (def.flags.includes('noRecoilStill') && this.stillT > 0 ? 0 : 1);
    this.recoilX -= Math.cos(angle) * recoil;
    this.recoilY -= Math.sin(angle) * recoil;
    if (s.flyingSwords > 0) launchFlyingSword(w, wand, s, angle);
    if (def.postSlot?.on === 'cast') this.charge_(wand, def.postSlot.energy);
    w.sfx(group.mp > 25 ? 'shootBig' : 'shoot', 0.6);
    for (const r of w.run.relics) RELICS[r.id]?.onCast?.(w, r.lv, wand, group, angle);
    // Resonance Rune: other wands may echo this cast.
    w.run.wands.forEach((other) => {
      if (other === wand) return;
      const os = this.statsOf(other);
      if (!os.resonance || !w.rng.chance(os.resonance.chance)) return;
      const next = this.nextGroup(other, os);
      if (!next) return;
      const free = w.rng.chance(os.resonance.free);
      if (!free && other.mp < next.group.mp) return;
      if (!free) other.mp -= next.group.mp;
      this.advance(other, os, next.group, next.end);
      this.fireGroup(other, os, next.group, 0, angle);
    });
  }

  /** Wand Spirit: auto-cast at the nearest enemy. */
  private spiritFire(wand: WandInst, s: WandStats) {
    if (wand.wait > 0) return;
    const w = this.w;
    const target = w.nearestEnemy(this.x, this.y, 9 * M);
    if (!target) return;
    const next = this.nextGroup(wand, s);
    if (!next || wand.mp < next.group.mp) return;
    wand.mp -= next.group.mp;
    this.advance(wand, s, next.group, next.end);
    const a = angleTo(this.x, this.y - 6, target.x, target.y);
    this.fireGroup(wand, s, next.group, 0, a, { x: this.x + Math.cos(a) * 8, y: this.y - 6 + Math.sin(a) * 8 });
  }

  /** Post (secondary) slot energy; at 100 the post segment casts for free. */
  charge_(wand: WandInst, amount: number) {
    const def = this.w.content.wand[wand.defId];
    if (!def.postSlot || !wand.post.some(Boolean)) return;
    wand.energy += amount * this.w.stats.postChargeMult;
    if (wand.energy < 100) return;
    wand.energy -= 100;
    const s = this.statsOf(wand);
    const cards = deckOf(wand.post, this.w.content);
    if (!hasCastableFrom(cards, 0)) return;
    const { group } = planGroup(cards, 0, 99, { content: this.w.content, baseSimul: s.simul, mpMult: 0 });
    const target = this.w.nearestEnemy(this.x, this.y, 10 * M);
    const a = target ? angleTo(this.x, this.y - 6, target.x, target.y) : this.aim;
    this.fireGroup(wand, s, group, 0, a);
  }

  onKill(e: Enemy) {
    for (const wand of this.w.run.wands) {
      const def = this.w.content.wand[wand.defId];
      if (def.postSlot?.on === 'kill') this.charge_(wand, def.postSlot.energy);
    }
    void e;
  }

  onHitEnemy(wandUid: number) {
    for (const wand of this.w.run.wands) {
      if (wand.uid !== wandUid) continue;
      const def = this.w.content.wand[wand.defId];
      if (def.postSlot?.on === 'hit') this.charge_(wand, def.postSlot.energy);
    }
  }

  /** Damage dealt (post slots that charge per 45 damage). */
  private dealt = 0;
  onDealt(n: number) {
    this.dealt += n;
    while (this.dealt >= 45) {
      this.dealt -= 45;
      for (const wand of this.w.run.wands) {
        const def = this.w.content.wand[wand.defId];
        if (def.postSlot?.on === 'dealt45') this.charge_(wand, def.postSlot.energy);
      }
    }
  }

  onDamaged() {
    this.hurtT = 0.25;
    this.noHitT = 0;
    for (const wand of this.w.run.wands) {
      const def = this.w.content.wand[wand.defId];
      if (def.postSlot?.on === 'damaged') this.charge_(wand, def.postSlot.energy);
    }
  }

  onMoved(meters: number) {
    for (const wand of this.w.run.wands) {
      const def = this.w.content.wand[wand.defId];
      if (def.postSlot?.on === 'meter') this.charge_(wand, def.postSlot.energy * meters);
    }
  }

  /** Arcane Barrier passive: damage is paid with wand MP (3% of max MP per point). */
  absorbWithBarrier(dmg: number): boolean {
    for (const wand of this.w.run.wands) {
      const s = this.statsOf(wand);
      if (!s.barrier || wand.mp < s.maxMp * 0.999 && wand.mp <= 0) continue;
      const cost = dmg * s.maxMp * 0.03;
      if (wand.mp >= cost) {
        wand.mp -= cost;
        this.w.explode(this.x, this.y, 4 * M, Math.round(cost * 4), 0, { fx: 'effects/arcane_ring' });
        this.invuln = 0.5;
        return true;
      }
    }
    return false;
  }

  swapWand(i: number) {
    const run = this.w.run;
    if (i < 0 || i >= run.wands.length || i === run.active) return;
    if (this.channel) {
      this.channel.onStop();
      this.channel = null;
    }
    this.charge = null;
    run.active = i;
    this.updateWandView();
    this.w.sfx('select');
  }

  private useSkill() {
    const w = this.w;
    if (this.skillCd > 0) return;
    const has = (id: string) => w.run.relics.find((r) => r.id === id);
    const coolant = has('coolant');
    const cdMult = coolant ? 1 - 0.25 * Math.min(coolant.lv, 3) / 3 : 1;
    if (has('swordsman_cloak')) {
      this.sprintT = 0.18;
      this.setInvuln = 0.25;
      this.skillCd = 2 * cdMult;
      const wand = this.activeWand;
      if (wand) {
        const s = this.statsOf(wand);
        const next = this.nextGroup(wand, s);
        if (next) w.after(0.18, () => this.fireGroup(wand, s, next.group, 0));
      }
      w.sfx('shootBig');
    } else if (has('bian')) {
      for (const p of w.projs) p.recall?.();
      this.skillCd = 5 * cdMult;
    } else if (has('original_shape')) {
      this.skillCd = 10 * cdMult;
      this.setInvuln = 0.5;
      const tx = this.intent.aimX;
      const ty = this.intent.aimY;
      w.after(0.35, () => {
        if (!w.blocked(tx, ty, this.r, false)) {
          this.x = tx;
          this.y = ty;
        }
        let killed = false;
        for (const e of w.enemies) {
          if (e.dead || (e.x - this.x) ** 2 + (e.y - this.y) ** 2 > (3 * M) ** 2) continue;
          w.damageEnemy(e, e.maxHp * (e.boss ? 0.1 : 0.5), { raw: true });
          if (e.dead) killed = true;
        }
        w.vis?.oneShot('effects/impact_large', this.x, this.y);
        w.vis?.shake(4, 0.2);
        if (killed) this.skillCd = 0;
      });
    }
  }
}
