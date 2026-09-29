/** Potion effects (wiki potion list, 31). Durations/seconds come from public/data/potions.json. */
import { RELICS } from './relics';
import type { World } from './world';

type PotionFn = (w: World, seconds: number) => void;

export const POTIONS: Record<string, PotionFn> = {
  serpents_blood: (w) => w.player.heal(w.rng.int(1, 25)),
  shield_potion: (w) => void (w.run.shield += Math.min(50, Math.max(0, w.stats.maxHp - w.player.hp))),
  holy_water: (w) => removeCurses(w, 1),
  reforge_potion: (w) => w.hooks.onDoor?.('reforge:99'),
  illusion_potion: (w, s) => {
    w.slowmo = 0.5;
    w.after(s * 0.5, () => (w.slowmo = 1));
  },
  awakening_potion: (w, s) => void (w.run.temp.regenT = s),
  refresh_potion: (w) => w.hooks.onDoor?.('refresh'),
  lockpick_potion: (w) => w.hooks.onDoor?.('unlockAll'),
  midas_potion: (w) => {
    for (const e of w.enemies) {
      if (e.dead || e.boss || e.def.dummy) continue;
      w.spawnPickup('coin', e.x, e.y);
      e.hp = 0;
      w.killEnemy(e);
    }
  },
  discount_potion: (w) => w.hooks.onDoor?.('discount'),
  levitation_potion: (w) => void (w.run.temp.flight = true),
  invisibility_potion: (w, s) => {
    w.player.hidden = true;
    w.after(s, () => (w.player.hidden = false));
  },
  invincibility_potion: (w, s) => void (w.player.setInvuln = s),
  petrification_potion: (w, s) => {
    w.player.setInvuln = s;
    w.player.castLock = s;
  },
  agility_potion: (w) => void (w.run.perm.speed += 0.6),
  scale_potion: (w) => void (w.run.perm.scale = w.rng.chance(0.5) ? 0.8 : 1.25),
  crystal_potion: (w) => void (w.run.perm.regen += 1),
  unstable_red_potion: (w) => void (w.run.perm.maxHp += w.rng.chance(0.5) ? -5 : 15),
  unstable_blue_potion: (w) => void (w.run.perm.maxMp += w.rng.chance(0.5) ? -5 : 15),
  purification_potion: (w) => {
    removeCurses(w, 99);
    w.run.coins = 0;
    w.run.keys = 0;
    w.run.shield = 0;
    w.run.tempShield = 0;
  },
  wealth_potion: (w) => void (w.run.coins += Math.floor(w.run.coins * 0.25)),
  tears_of_the_goddess: (w) => {
    if (new Set(w.run.curses).size >= 5) removeCurses(w, 99);
    else w.toast('The tears need five distinct curses…', 0xa78bfa);
  },
  relic_potion: (w) => w.hooks.onDoor?.('relic:upgrade'),
  reset_potion: (w) => w.hooks.onDoor?.('relic:reset'),
  sacrificial_potion: (w) => {
    const hp = Math.floor(w.player.hp * 0.2);
    w.player.hp -= hp;
    w.run.coins += hp;
  },
  locksmith_potion: (w) => void (w.run.keys = w.run.keys > 0 ? w.run.keys * 2 : 1),
  pure_castor_oil: (w, s) => {
    for (const e of w.enemies) {
      e.status.poison.push({ stacks: 5, t: s || 10 });
      e.status.slowMult = 0.5;
      e.status.slowT = s || 10;
    }
  },
  duplication_potion: (w) => {
    for (const p of [...w.pickups]) if (p.kind !== 'potion') w.spawnPickup(p.kind, p.x, p.y, p.amount);
  },
  treasure_potion: (w) => w.hooks.onDoor?.('chest'),
  emergency_potion: (w) => void (w.run.tempShield += Math.max(0, w.stats.maxHp - w.player.hp)),
  conversion_potion: (w) => {
    const hp = Math.floor(w.player.hp * 0.4);
    w.player.hp -= hp;
    w.run.shield += hp;
  },
};

function removeCurses(w: World, n: number) {
  for (let i = 0; i < n && w.run.curses.length; i++) {
    const c = w.run.curses.splice(w.rng.int(0, w.run.curses.length - 1), 1)[0];
    w.toast(`Curse lifted: ${w.content.curse[c]?.name ?? c}`, 0xa78bfa);
  }
}

/** Drink the potion in slot `i`. */
export function drinkPotion(w: World, i: number) {
  const run = w.run;
  const id = run.potions[i];
  if (!id) return;
  const def = w.content.potion[id];
  run.potions.splice(i, 1);
  POTIONS[id]?.(w, def?.seconds ?? 0);
  w.sfx('heal');
  w.vis?.oneShot('effects/level_up', w.player.x, w.player.y - 8);
  w.toast(def?.name ?? id, 0x4ade80);
  if (run.curses.includes('potion_allergy')) w.hurtPlayer(w.content.curse.potion_allergy?.params[0] ?? 5, { trap: true, ignoreInvuln: true });
  if (run.relics.some((r) => r.id === 'endless_elixir') && w.rng.chance(0.3)) {
    run.potions.push(w.rng.pick(w.content.data.potions).id);
    w.toast('The elixir refills!', 0x4ade80);
  }
  for (const r of run.relics) RELICS[r.id]?.onPotion?.(w, r.lv);
  w.hooks.onDoor?.('stats');
}
