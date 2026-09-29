// Browser-injected playtest bot (development aid, not shipped). Evaluate this file in the game page, then call
//   window.__bot.start({ god: true })   // god = huge HP so a whole run can be walked through
// It fights (aims at the nearest foe, kites), collects pickups, uses room props with E and walks through doors.
(() => {
  if (window.__botTimer) clearInterval(window.__botTimer);
  const keys = new Set();
  const setKey = (code, on) => {
    if (on && !keys.has(code)) {
      keys.add(code);
      window.dispatchEvent(new KeyboardEvent('keydown', { code }));
    } else if (!on && keys.has(code)) {
      keys.delete(code);
      window.dispatchEvent(new KeyboardEvent('keyup', { code }));
    }
  };
  const tap = (code) => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code }));
    window.dispatchEvent(new KeyboardEvent('keyup', { code }));
  };
  let firing = false;
  const canvas = document.getElementById('game');
  const fire = (on) => {
    if (on && !firing) {
      canvas.dispatchEvent(new PointerEvent('pointerdown', { button: 0, clientX: 0, clientY: 0, bubbles: true }));
      firing = true;
    } else if (!on && firing) {
      window.dispatchEvent(new PointerEvent('pointerup', { button: 0 }));
      firing = false;
    }
  };
  const bot = { modalTicks: 0, tick: 0, used: new Set(), room: '', stats: { rooms: 0 }, god: false, skipProps: [] };
  window.__bot = bot;
  bot.start = (opts = {}) => {
    bot.god = !!opts.god;
    bot.skipProps = opts.skipProps ?? [];
    window.__botTimer = setInterval(step, 50);
  };
  bot.stop = () => {
    clearInterval(window.__botTimer);
    fire(false);
    ['KeyW', 'KeyA', 'KeyS', 'KeyD'].forEach((k) => setKey(k, false));
  };
  function step() {
    const g = window.game;
    const w = g.world;
    const p = w.player;
    const r = g.vis.root;
    const s = r.scale.x;
    if (g.ui.modalOpen && g.mode === 'run' && !p.dead) {
      // dismiss forge / shop style panels the bot opened by walking onto them
      if (++bot.modalTicks > 8) {
        bot.modalTicks = 0;
        tap('Escape');
      }
    }
    if (g.ui.modalOpen || g.ui.onTitle || p.dead || g.mode !== 'run') {
      fire(false);
      ['KeyW', 'KeyA', 'KeyS', 'KeyD'].forEach((k) => setKey(k, false));
      return;
    }
    if (bot.god) p.hp = w.stats.maxHp;
    const sig = `${g.run.chapter}:${g.run.room}:${w.room.kind}`;
    if (sig !== bot.room) {
      bot.room = sig;
      bot.used = new Set();
      bot.stats.rooms++;
    }
    bot.tick++;
    if (bot.sideTicks > 0) bot.sideTicks--;
    const moved = Math.hypot(p.x - (bot.lx ?? 0), p.y - (bot.ly ?? 0)) > 0.3;
    bot.lx = p.x;
    bot.ly = p.y;
    bot.stuck = moved ? 0 : (bot.stuck ?? 0) + 1;
    const foes = w.enemies.filter((e) => !e.dead && !e.passive);
    let dx = 0;
    let dy = 0;
    if (foes.length) {
      let e = foes[0];
      let bd = 1e9;
      for (const f of foes) {
        const d = (f.x - p.x) ** 2 + (f.y - p.y) ** 2;
        if (d < bd) {
          bd = d;
          e = f;
        }
      }
      window.dispatchEvent(new PointerEvent('pointermove', { clientX: e.x * s + r.x, clientY: (e.y - 4) * s + r.y }));
      fire(true);
      const d = Math.sqrt(bd) || 1;
      const ux = (e.x - p.x) / d;
      const uy = (e.y - p.y) / d;
      const t = Math.floor(bot.tick / 30) % 2 ? 1 : -1;
      dx = -uy * t + (d < 70 ? -ux : d > 130 ? ux : 0);
      dy = ux * t + (d < 70 ? -uy : d > 130 ? uy : 0);
    } else if (bot.stuck > 20 || bot.sideTicks > 0) {
      // wedged against a pot or wall: shoot the nearest breakable prop and sidestep
      const pot = w.props.filter((q) => !q.dead && q.hp !== undefined).sort((a, b) => (a.x - p.x) ** 2 + (a.y - p.y) ** 2 - ((b.x - p.x) ** 2 + (b.y - p.y) ** 2))[0];
      if (pot) window.dispatchEvent(new PointerEvent('pointermove', { clientX: pot.x * s + r.x, clientY: pot.y * s + r.y }));
      fire(!!pot);
      if (!bot.sideTicks) {
        bot.side = Math.random() < 0.5 ? 1 : -1;
        bot.sideTicks = 50;
        bot.vert = Math.random() < 0.5 ? 1 : -1;
      }
      dx = bot.side;
      dy = bot.vert * 0.5;
      bot.stuck = 0;
    } else {
      fire(false);
      const pk = w.pickups.find((q) => !q.dead && q.kind !== 'potion');
      const prop = w.props.find((q) => !q.dead && q.info && q.use && !bot.used.has(q) && !bot.skipProps.includes(q.label));
      let tx;
      let ty;
      if (pk) {
        tx = pk.x;
        ty = pk.y;
      } else if (prop) {
        tx = prop.x;
        ty = prop.y + 4;
        if ((prop.x - p.x) ** 2 + (prop.y - p.y) ** 2 < 22 * 22) {
          tap('KeyE');
          bot.used.add(prop);
        }
      } else {
        const d = w.room.doors.find((q) => q.open);
        if (d) {
          tx = d.tx * 16 + 8;
          ty = 24;
        }
      }
      if (tx !== undefined) {
        dx = tx - p.x;
        dy = ty - p.y;
        const l = Math.hypot(dx, dy) || 1;
        dx /= l;
        dy /= l;
        if (l < 4) dx = dy = 0;
      }
    }
    setKey('KeyD', dx > 0.3);
    setKey('KeyA', dx < -0.3);
    setKey('KeyS', dy > 0.3);
    setKey('KeyW', dy < -0.3);
  }
})();
