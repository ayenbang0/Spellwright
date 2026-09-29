import { RARITY_COLOR, type EndSummary, type Game } from '../game/game';
import { applyMerge, mergeCandidates, rerollCost, spellPool } from '../game/loot';
import { SETS } from '../game/sets';
import { canPlace, coveringSlot, type SpellInst, type WandInst } from '../game/wand';
import {
  ACHIEVEMENTS, DIFFICULTY_NAMES, GINA_FREE, GINA_MAX, ginaCost, level, LILIAN, LYON, VIVIAN, VIVIAN_TIERS, valueAt, type Tiered,
} from '../meta/meta';
import { resetSave, writeSave } from '../meta/save';
import { fmtNum, h, icon, type Child } from './dom';
import type { Ui } from './ui';

// ------------------------------------------------------------------ shared builders

const lvMark = (lv: number) => ['', '+', '++'][lv] ?? '';

/** Spell card (icon, name, level badge), coloured by spell type and bordered by rarity. */
export function spellCard(ui: Ui, game: Game, s: SpellInst, opts: { onClick?: () => void; sel?: boolean; count?: number } = {}): HTMLElement {
  const def = game.content.spell[s.id];
  const el = h(
    'div',
    { class: `card t-${def.type} r-${def.rarity}${opts.sel ? ' sel' : ''}`, on: { click: () => opts.onClick?.() } },
    icon(def.icon, 32),
    h('div', { class: 'nm' }, def.name),
    s.lv > 0 ? h('div', { class: 'lv' }, lvMark(s.lv)) : null,
    opts.count && opts.count > 1 ? h('div', { class: 'cnt' }, `x${opts.count}`) : null,
  );
  ui.tip(el, () => ui.spellTip(s));
  return el;
}

function emptyCard(label = '+', onClick?: () => void): HTMLElement {
  return h('div', { class: 'card slot-empty', on: { click: () => onClick?.() } }, h('div', { class: 'nm' }, label));
}

function costText(n: number, have: number, unit = ''): HTMLElement {
  return h('span', { class: `cost${have < n ? ' poor' : ''}` }, `${fmtNum(n)}${unit}`);
}

function header(title: string, sub?: string): Child[] {
  return [h('h1', null, title), sub ? h('div', { class: 'subtitle' }, sub) : null];
}

// ------------------------------------------------------------------ title

export function openTitle(ui: Ui, game: Game, onDone: () => void) {
  document.body.classList.add('menu-open');
  const save = game.save;
  const screen = h('div', { class: 'screen' });
  const show = () => {
    screen.replaceChildren(
      h('div', { class: 'logo' }, 'SPELLWRIGHT'),
      h('div', { class: 'tagline o' }, 'Program your wand. Order is everything: boosts shape the spells to their right. Break the mana economy, clear the rooms, beat the bosses.'),
      h(
        'div',
        { class: 'menu' },
        h('button', { class: 'btn blue', on: { click: () => (screen.remove(), document.body.classList.remove('menu-open'), onDone()) } }, 'Play'),
        h('button', { class: 'btn green', on: { click: () => achievements() } }, 'Achievements'),
        h('button', { class: 'btn grey', on: { click: () => settings() } }, 'Settings'),
        h('button', { class: 'btn red', on: { click: () => reset() } }, 'Reset progress'),
      ),
      h('div', { class: 'stat-line' }, `${save.achievements.length}/${ACHIEVEMENTS.length} achievements · ${save.sets.length}/${SETS.length} sets · ${save.stats.runs} runs · best chapter ${save.stats.bestChapter}`),
      h('div', { class: 'stat-line muted' }, 'WASD move · mouse aim & fire · Q / wheel swap wand · E interact · Space skill · 1-4 potions · Tab bag'),
    );
  };
  const settings = () => openSettings(ui, game);
  const achievements = () =>
    ui.open('ach', ({ close }) =>
      h(
        'div',
        { class: 'narrow' },
        ...header('Achievements'),
        h('div', { class: 'rows' }, ...ACHIEVEMENTS.map((a) => h('div', { class: 'line' }, h('span', { class: 'n' }, a.name), h('span', { class: 'd' }, a.desc), save.achievements.includes(a.id) ? h('span', { class: 'badge gold' }, 'Done') : h('span', { class: 'badge grey' }, '—')))),
        h('div', { class: 'foot' }, h('button', { class: 'btn grey', on: { click: close } }, 'Close')),
      ),
    );
  const reset = () => {
    if (!confirm('Erase all progress?')) return;
    resetSave();
    location.reload();
  };
  show();
  ui.root.append(screen);
}

// ------------------------------------------------------------------ settings / pause

function openSettings(ui: Ui, game: Game) {
  ui.open(
    'settings',
    ({ close, refresh }) => {
      const s = game.save.settings;
      const toggle = (label: string, get: () => boolean, set: (v: boolean) => void) =>
        h('div', { class: 'setting' }, h('span', null, label), h('button', { class: `btn ${get() ? 'green' : 'grey'}`, on: { click: () => (set(!get()), writeSave(game.save), refresh()) } }, get() ? 'On' : 'Off'));
      return h(
        'div',
        null,
        ...header('Settings'),
        toggle('Sound', () => !s.muted, (v) => ((s.muted = !v), (game.audio.muted = !v))),
        toggle('Summon limit: stop when full (otherwise replace oldest)', () => s.summonLimitStop, (v) => ((s.summonLimitStop = v), (game.world.meta.summonLimitStop = v))),
        h('div', { class: 'foot' }, h('button', { class: 'btn blue', on: { click: close } }, 'Back')),
      );
    },
    { narrow: true },
  );
}

export function openPause(ui: Ui, game: Game) {
  ui.open(
    'pause',
    ({ close }) =>
      h(
        'div',
        null,
        ...header('Paused', game.mode === 'camp' ? 'Camp' : `${game.chapterName(game.run.chapter)} · room ${game.run.room + 1}`),
        h(
          'div',
          { class: 'menu', style: { margin: '0 auto' } },
          h('button', { class: 'btn blue', on: { click: close } }, 'Resume'),
          h('button', { class: 'btn purple', on: { click: () => (close(), ui.openInventory()) } }, 'Bag'),
          h('button', { class: 'btn grey', on: { click: () => openSettings(ui, game) } }, 'Settings'),
          game.mode === 'run' ? h('button', { class: 'btn red', on: { click: () => (close(), game.finishRun(false)) } }, 'Abandon run') : null,
        ),
        h('div', { class: 'stat-line', style: { textAlign: 'center', marginTop: '10px' } }, 'WASD move · mouse aim & fire · Q / wheel swap wand · E interact · Space skill · 1-4 potions · Tab bag'),
      ),
    { narrow: true },
  );
}

// ------------------------------------------------------------------ end of run

export function openEnd(ui: Ui, game: Game, s: EndSummary) {
  ui.open(
    'end',
    () =>
      h(
        'div',
        null,
        ...header(s.won ? 'Victory!' : 'Defeated', s.won ? 'The spire falls silent.' : 'Your spells scatter into the dark.'),
        h(
          'div',
          { class: 'endstats' },
          h('span', null, 'Reached'), h('span', null, `${game.chapterName(s.chapter)} · room ${s.room}`),
          h('span', null, 'Foes felled'), h('span', null, String(s.kills)),
          h('span', null, 'Time'), h('span', null, `${Math.floor(s.time / 60)}m ${Math.floor(s.time % 60)}s`),
          h('span', null, 'Crystals banked'), h('span', { class: 'cost' }, `+${s.crystals}`),
          h('span', null, 'Old Blood'), h('span', { class: 'cost' }, `+${s.blood}`),
          h('span', null, 'Chaotic Cores'), h('span', { class: 'cost' }, `+${s.cores}`),
        ),
        s.newSets.length ? h('div', { class: 'row', style: { justifyContent: 'center', flexWrap: 'wrap' } }, ...s.newSets.map((id) => h('span', { class: 'badge gold' }, `Set: ${game.content.names.sets[id] ?? id}`))) : null,
        s.newAchievements.length ? h('div', { class: 'row', style: { justifyContent: 'center', flexWrap: 'wrap', marginTop: '6px' } }, ...s.newAchievements.map((id) => h('span', { class: 'badge purple' }, ACHIEVEMENTS.find((a) => a.id === id)?.name ?? id))) : null,
        h('div', { class: 'foot' }, h('button', { class: 'btn big blue', on: { click: () => (ui.closeAll(), game.enterCamp()) } }, 'Back to camp')),
      ),
    { closable: false, narrow: true },
  );
}

// ------------------------------------------------------------------ inventory

interface Held {
  spell: SpellInst;
  from: { kind: 'pack'; i: number } | { kind: 'wand'; wi: number; i: number; post: boolean };
}

export function openInventory(ui: Ui, game: Game) {
  const run = game.run;
  const content = game.content;
  let held: Held | null = null;
  const heldEl = h('div', { class: 'held' });
  ui.root.append(heldEl);
  const move = (e: PointerEvent) => {
    heldEl.style.left = `${e.clientX}px`;
    heldEl.style.top = `${e.clientY}px`;
  };
  window.addEventListener('pointermove', move);

  const returnHeld = () => {
    if (!held) return;
    const f = held.from;
    let placed = false;
    if (f.kind === 'wand') {
      const wand = run.wands[f.wi];
      const arr = wand ? (f.post ? wand.post : wand.slots) : null;
      if (arr && canPlace(arr, f.i, held.spell.id, content)) {
        arr[f.i] = held.spell;
        placed = true;
      }
    } else if (!run.backpack[f.i]) {
      run.backpack[f.i] = held.spell;
      placed = true;
    }
    if (!placed) {
      const free = run.backpack.findIndex((x) => !x);
      if (free >= 0) run.backpack[free] = held.spell;
      else ui.toast('The spell crumbles: no room to keep it', 'bad');
    }
    held = null;
  };

  ui.open(
    'inventory',
    ({ close, refresh }) => {
      const changed = () => {
        game.refreshStats();
        refresh();
      };
      const syncHeld = () => {
        heldEl.replaceChildren();
        if (held) heldEl.append(spellCard(ui, game, held.spell));
      };
      const clickPack = (i: number) => {
        const cur = run.backpack[i];
        if (!held) {
          if (!cur) return;
          held = { spell: cur, from: { kind: 'pack', i } };
          run.backpack[i] = null;
        } else {
          run.backpack[i] = held.spell;
          held = cur ? { spell: cur, from: held.from } : null;
        }
        syncHeld();
        changed();
      };
      const clickSlot = (wi: number, i: number, post: boolean) => {
        const wand = run.wands[wi];
        const arr = post ? wand.post : wand.slots;
        const c = coveringSlot(arr, i, content);
        if (!held) {
          if (c < 0) return;
          held = { spell: arr[c]!, from: { kind: 'wand', wi, i: c, post } };
          arr[c] = null;
        } else if (c < 0) {
          if (!canPlace(arr, i, held.spell.id, content)) {
            ui.toast('It does not fit there', 'bad');
            return;
          }
          arr[i] = held.spell;
          held = null;
        } else {
          const old = arr[c]!;
          arr[c] = null;
          if (!canPlace(arr, i, held.spell.id, content)) {
            arr[c] = old;
            ui.toast('It does not fit there', 'bad');
            return;
          }
          arr[i] = held.spell;
          held = { spell: old, from: held.from };
        }
        syncHeld();
        changed();
      };

      const slotRow = (wi: number, arr: (SpellInst | null)[], post: boolean) => {
        const row = h('div', { class: 'grid' });
        arr.forEach((s, i) => {
          const c = coveringSlot(arr, i, content);
          if (c >= 0 && c !== i) row.append(h('div', { class: 'card cover', on: { click: () => clickSlot(wi, i, post) } }));
          else if (s) row.append(spellCard(ui, game, s, { onClick: () => clickSlot(wi, i, post) }));
          else row.append(emptyCard(post ? '⚡' : '+', () => clickSlot(wi, i, post)));
        });
        return row;
      };

      const wandBlock = (wand: WandInst, wi: number) => {
        const def = content.wand[wand.defId];
        const st = game.world.player.statsOf(wand);
        return h(
          'div',
          { class: 'section' },
          h(
            'div',
            { class: 'row' },
            h('h2', { class: 'grow' }, `${wi + 1}. ${def.name}`),
            wi === run.active ? h('span', { class: 'badge blue' }, 'In hand') : h('button', { class: 'btn tiny blue', on: { click: () => (game.world.player.swapWand(wi), refresh()) } }, 'Hold'),
            run.wands.length > 1
              ? h('button', { class: 'btn tiny red', on: { click: () => discardWand(wi) } }, 'Discard')
              : null,
          ),
          h('div', { class: 'line d' }, def.desc),
          h(
            'div',
            { class: 'stats' },
            h('span', null, 'Max MP'), h('span', null, String(st.maxMp)),
            h('span', null, 'MP regen'), h('span', null, `${st.regen.toFixed(1)}/s`),
            h('span', null, 'Cast interval'), h('span', null, `${st.interval}s`),
            h('span', null, 'Recharge'), h('span', null, `${st.cd.toFixed(2)}s`),
            h('span', null, 'Simultaneous'), h('span', null, String(st.simul)),
            h('span', null, 'Scatter'), h('span', null, `${st.scatter}°`),
          ),
          slotRow(wi, wand.slots, false),
          wand.post.length ? h('div', { class: 'small o' }, `Charge slots · energy ${Math.floor(wand.energy)}/100`) : null,
          wand.post.length ? slotRow(wi, wand.post, true) : null,
        );
      };

      const discardWand = (wi: number) => {
        const wand = run.wands[wi];
        for (const s of [...wand.slots, ...wand.post]) {
          if (!s) continue;
          const free = run.backpack.findIndex((x) => !x);
          if (free >= 0) run.backpack[free] = s;
        }
        run.wands.splice(wi, 1);
        run.active = Math.min(run.active, run.wands.length - 1);
        game.world.player.updateWandView();
        changed();
      };

      const packGrid = h('div', { class: 'grid' });
      run.backpack.forEach((s, i) => packGrid.append(s ? spellCard(ui, game, s, { onClick: () => clickPack(i) }) : emptyCard('', () => clickPack(i))));

      const relics = h('div', { class: 'grid' });
      for (const r of run.relics) {
        const def = content.relic[r.id];
        const el = h('div', { class: `card t-Relic r-${def.rarity}` }, icon(def.icon, 32), h('div', { class: 'nm' }, def.name), r.lv > 1 ? h('div', { class: 'lv' }, `${r.lv}`) : null);
        ui.tip(el, () => ({ title: `${def.name} · Lv ${r.lv}/${def.maxLevel}`, lines: [def.desc[r.lv - 1] ?? def.desc[0], def.series ? `Set: ${def.series}` : ''], rarity: def.rarity }));
        relics.append(el);
      }
      const curses = h('div', { class: 'grid' });
      for (const id of run.curses) {
        const def = content.curse[id];
        const el = h('div', { class: `card t-Curse` }, icon(def.icon, 32), h('div', { class: 'nm' }, def.name));
        ui.tip(el, () => ({ title: def.name, lines: [def.desc] }));
        curses.append(el);
      }
      const st = game.world.stats;
      const pl = game.world.player;
      const stats = h(
        'div',
        { class: 'stats' },
        h('span', null, 'Health'), h('span', null, `${Math.ceil(pl.hp)} / ${st.maxHp}`),
        h('span', null, 'Move speed'), h('span', null, st.speed.toFixed(1)),
        h('span', null, 'Spell damage'), h('span', null, `${st.dmgAdd >= 0 ? '+' : ''}${Math.round(st.dmgAdd * 100)}%`),
        h('span', null, 'Crit chance'), h('span', null, `${Math.round(st.critAdd * 100)}% (x${st.critMult})`),
        h('span', null, 'Damage taken'), h('span', null, `x${st.dmgTakenMult.toFixed(2)}`),
        h('span', null, 'Effect radius'), h('span', null, `x${st.globals.radiusMult.toFixed(2)}`),
        h('span', null, 'Wands'), h('span', null, `${run.wands.length} / ${run.wandLimit + st.wandLimitAdd}`),
        h('span', null, 'Backpack'), h('span', null, `${run.backpack.filter(Boolean).length} / ${run.backpack.length}`),
      );

      return h(
        'div',
        null,
        h('h1', null, 'Bag'),
        h('div', { class: 'subtitle' }, held ? 'Click a slot to place the spell. Boosts affect the spells to their right.' : 'Click a spell to pick it up, then click a slot. Order matters: boosts affect the spells to their right.'),
        h(
          'div',
          { class: 'cols' },
          h('div', { class: 'col' }, ...run.wands.map(wandBlock)),
          h(
            'div',
            { class: 'col' },
            h('div', { class: 'section' }, h('h2', null, 'Backpack'), packGrid, held ? h('button', { class: 'btn tiny red', on: { click: () => ((held = null), syncHeld(), changed()) } }, 'Destroy held spell') : null),
            h('div', { class: 'section' }, h('h2', null, `Relics (${run.relics.length})`), run.relics.length ? relics : h('div', { class: 'small muted' }, 'None yet.')),
            run.curses.length ? h('div', { class: 'section' }, h('h2', null, `Curses (${run.curses.length})`), curses) : null,
            h('div', { class: 'section' }, h('h2', null, 'Stats'), stats),
          ),
        ),
        h('div', { class: 'foot' }, h('button', { class: 'btn blue', on: { click: close } }, 'Close [Tab]')),
      );
    },
    {
      onClose: () => {
        window.removeEventListener('pointermove', move);
        returnHeld();
        heldEl.remove();
        game.refreshStats();
      },
    },
  );
}

// ------------------------------------------------------------------ forge

export function openForge(ui: Ui, game: Game) {
  ui.open('forge', ({ close, refresh }) => {
    const run = game.run;
    const merges = mergeCandidates(run.backpack, game.content);
    const rerolls = run.backpack.map((s, i) => ({ s, i })).filter((x): x is { s: SpellInst; i: number } => !!x.s && game.content.spell[x.s.id].upgrade !== 'none');
    const fuseRows = merges.map((m) => {
      const def = game.content.spell[m.id];
      return h(
        'div',
        { class: 'line' },
        icon(def.icon, 24),
        h('span', { class: 'n' }, `${def.name} ${lvMark(m.lv)}`.trim()),
        h('span', { class: 'd' }, `3 copies → ${lvMark(m.lv + 1)}`),
        h('button', {
          class: 'btn green tiny',
          on: {
            click: () => {
              applyMerge(run.backpack, m);
              if (m.lv + 1 >= 2) game.unlock('twostar');
              game.world.sfx('levelUp');
              game.ui.toast(`${def.name} ${lvMark(m.lv + 1)}`, 'gold');
              refresh();
            },
          },
        }, 'Fuse'),
      );
    });
    const rerollRows = rerolls.map(({ s, i }) => {
      const def = game.content.spell[s.id];
      const cost = rerollCost(def, game.meta);
      return h(
        'div',
        { class: 'line' },
        icon(def.icon, 24),
        h('span', { class: 'n' }, `${def.name} ${lvMark(s.lv)}`.trim()),
        h('span', { class: 'd' }, def.rarity),
        costText(cost, run.coins, ' coins'),
        h('button', {
          class: 'btn purple tiny',
          on: {
            click: () => {
              if (run.coins < cost) return game.ui.toast('Not enough coins', 'bad');
              const pool = spellPool({ content: game.content, save: game.save, meta: game.meta, run, stats: game.world.stats, rng: game.world.rng }, def.rarity, def.shop).filter((x) => x.id !== s.id && x.upgrade === 'craft');
              if (!pool.length) return game.ui.toast('Nothing to reroll into', 'info');
              run.coins -= cost;
              run.backpack[i] = { id: game.world.rng.pick(pool).id, lv: s.lv };
              game.world.sfx('pickup');
              refresh();
            },
          },
        }, 'Reroll'),
      );
    });
    return h(
      'div',
      null,
      ...header('The Forge', 'Only backpack spells can be forged. A Spell Prototype fills in for a missing copy of a Normal or Rare spell of the same level.'),
      h('div', { class: 'cols' },
        h('div', { class: 'section' }, h('h2', null, 'Fuse'), merges.length ? h('div', { class: 'rows' }, ...fuseRows) : h('div', { class: 'small muted' }, 'You need three identical spells of the same level.')),
        h('div', { class: 'section' }, h('h2', null, `Reroll (you have ${run.coins} coins)`), rerolls.length ? h('div', { class: 'rows' }, ...rerollRows) : h('div', { class: 'small muted' }, 'The backpack is empty.')),
      ),
      h('div', { class: 'foot' }, h('button', { class: 'btn blue', on: { click: close } }, 'Done')),
    );
  });
}

// ------------------------------------------------------------------ relic reset (potion)

export function openRelicReset(ui: Ui, game: Game) {
  ui.open('reset', ({ close }) =>
    h(
      'div',
      null,
      ...header('Reset a relic', 'Pick one: it is swapped for another relic of the same rarity.'),
      h('div', { class: 'grid', style: { justifyContent: 'center' } }, ...game.run.relics.map((r) => {
        const def = game.content.relic[r.id];
        const el = h('div', { class: `card t-Relic r-${def.rarity}`, on: { click: () => (game.resetRelic(r.id), close()) } }, icon(def.icon, 32), h('div', { class: 'nm' }, def.name));
        ui.tip(el, () => ({ title: def.name, lines: [def.desc[0]], rarity: def.rarity }));
        return el;
      })),
      h('div', { class: 'foot' }, h('button', { class: 'btn grey', on: { click: close } }, 'Cancel')),
    ),
  );
}

// ------------------------------------------------------------------ depart (start a run)

export function openDepart(ui: Ui, game: Game) {
  let setId = game.save.sets.includes(game.save.set) ? game.save.set : 'original';
  let diff = Math.min(game.save.difficulty, game.save.maxDifficulty);
  ui.open('depart', ({ close, refresh }) => {
    const save = game.save;
    const setCards = SETS.map((s) => {
      const owned = save.sets.includes(s.id);
      const name = game.content.names.sets[s.id] ?? s.id;
      const el = h(
        'button',
        { class: `btn ${owned ? (setId === s.id ? 'gold active' : 'blue') : 'grey'}`, disabled: !owned, on: { click: () => ((setId = s.id), refresh()) } },
        owned ? name : `??? ${name}`,
      );
      ui.tip(el, () => ({ title: name, lines: [owned ? s.desc : `Locked: ${s.unlock}`] }));
      return el;
    });
    const diffs = DIFFICULTY_NAMES.map((n, i) =>
      h('button', { class: `btn ${i <= save.maxDifficulty ? (diff === i ? 'gold active' : 'green') : 'grey'}`, disabled: i > save.maxDifficulty, on: { click: () => ((diff = i), refresh()) } }, n),
    );
    const chosen = SETS.find((s) => s.id === setId)!;
    return h(
      'div',
      null,
      ...header('Depart', 'Choose a starting set and a difficulty.'),
      h('div', { class: 'section' }, h('h2', null, 'Starting set'), h('div', { class: 'grid' }, ...setCards), h('div', { class: 'small o' }, chosen.desc)),
      h('div', { class: 'section', style: { marginTop: '10px' } }, h('h2', null, 'Difficulty'), h('div', { class: 'grid' }, ...diffs), h('div', { class: 'small muted' }, 'Chapter 4 opens on Hard and above. Higher difficulties make foes tougher and epic loot likelier.')),
      h('div', { class: 'foot' }, h('button', { class: 'btn grey', on: { click: close } }, 'Not yet'), h('button', { class: 'btn big blue', on: { click: () => (ui.closeAll(), game.startRun(setId, diff)) } }, 'Enter the portal')),
    );
  });
}

// ------------------------------------------------------------------ camp NPCs

export function openNpc(ui: Ui, game: Game, id: string) {
  const name = game.content.npcName(id);
  switch (id) {
    case 'vivian': return openVivian(ui, game, name);
    case 'lyon': return openLyon(ui, game, name);
    case 'lilian': return openLilian(ui, game, name);
    case 'gina': return openGina(ui, game, name);
    case 'leah': return openLeah(ui, game, name);
    case 'trainer': return openTrainer(ui, game, name);
    default:
      ui.open('npc', ({ close }) => h('div', null, ...header(name, 'A happy little creature blinks at you. It seems to approve of your wand.'), h('div', { class: 'foot' }, h('button', { class: 'btn blue', on: { click: close } }, 'Pet'))), { narrow: true });
  }
}

function tieredRow(t: Tiered, lv: number, have: number, unit: string, buy: () => void): HTMLElement {
  const next = lv < t.costs.length ? t.costs[lv] : 0;
  const pips = t.costs.map((_, i) => h('span', { class: `badge ${i < lv ? 'green' : 'grey'}`, style: { padding: '0 4px' } }, ''));
  return h(
    'div',
    { class: 'line' },
    h('span', { class: 'n' }, t.label),
    h('span', { class: 'd' }, lv ? t.effect.replace('{v}', String(valueAt(t, lv))) : t.effect.replace('{v}', String(t.values[0]))),
    h('span', { class: 'row', style: { gap: '2px' } }, ...pips),
    lv >= t.costs.length
      ? h('span', { class: 'badge gold' }, 'Max')
      : h('button', { class: 'btn tiny gold', disabled: have < next, on: { click: buy } }, h('span', null, 'Buy '), costText(next, have, unit)),
  );
}

function openVivian(ui: Ui, game: Game, name: string) {
  ui.open('vivian', ({ close, refresh }) => {
    const save = game.save;
    const groups = [0, 1, 2, 3, 4].map((tier) => {
      const unlocked = tier <= save.vivianTiers;
      const rows = VIVIAN.filter((v) => v.tier === tier).map((v) =>
        tieredRow(v, level(save.vivian, v.id), save.crystals, ' cr', () => {
          const lv = level(save.vivian, v.id);
          if (save.crystals < v.costs[lv]) return;
          save.crystals -= v.costs[lv];
          save.vivian[v.id] = lv + 1;
          game.persist();
          game.world.sfx('coin');
          refresh();
        }),
      );
      return h(
        'div',
        { class: 'section' },
        tier === 0
          ? h('h2', null, 'Talents')
          : h('div', { class: 'row' }, h('h2', { class: 'grow' }, `Deeper talents (${VIVIAN_TIERS[tier]} Old Blood)`), unlocked ? h('span', { class: 'badge green' }, 'Unlocked') : h('button', { class: 'btn tiny purple', disabled: save.blood < VIVIAN_TIERS[tier] || tier !== save.vivianTiers + 1, on: { click: () => ((save.blood -= VIVIAN_TIERS[tier]), (save.vivianTiers = tier), game.persist(), refresh()) } }, `Unlock: ${VIVIAN_TIERS[tier]} blood`)),
        unlocked ? h('div', { class: 'rows' }, ...rows) : h('div', { class: 'small muted' }, 'Locked. Unlock the previous tier first.'),
      );
    });
    return h(
      'div',
      null,
      ...header(name, `Crystals ${fmtNum(save.crystals)} · Old Blood ${save.blood}`),
      h('div', { class: 'col' }, ...groups),
      h('div', { class: 'foot' }, h('button', { class: 'btn blue', on: { click: close } }, 'Done')),
    );
  });
}

function openLyon(ui: Ui, game: Game, name: string) {
  ui.open('lyon', ({ close, refresh }) => {
    const save = game.save;
    return h(
      'div',
      null,
      ...header(name, `Old Blood ${save.blood} — research improves every future run`),
      h('div', { class: 'rows' }, ...LYON.map((t) => tieredRow(t, level(save.lyon, t.id), save.blood, ' blood', () => {
        const lv = level(save.lyon, t.id);
        if (save.blood < t.costs[lv]) return;
        save.blood -= t.costs[lv];
        save.lyon[t.id] = lv + 1;
        game.persist();
        game.world.sfx('coin');
        refresh();
      }))),
      h('div', { class: 'foot' }, h('button', { class: 'btn blue', on: { click: close } }, 'Done')),
    );
  });
}

function openLilian(ui: Ui, game: Game, name: string) {
  ui.open('lilian', ({ close, refresh }) => {
    const save = game.save;
    const rows = LILIAN.map((p) => {
      const owned = !!save.lilianOwned[p.id];
      const items = [...p.spells.map((s) => game.content.spell[s]?.name ?? s), ...p.relics.map((r) => game.content.relic[r]?.name ?? r)];
      return h(
        'div',
        { class: 'line' },
        h('span', { class: 'n' }, p.label),
        h('span', { class: 'd' }, p.focus ? 'Spell rooms offer three spells to choose from instead of one.' : `Adds to the reward pool: ${items.join(', ')}`),
        owned
          ? h('button', { class: `btn tiny ${save.lilian[p.id] ? 'green' : 'grey'}`, on: { click: () => ((save.lilian[p.id] = !save.lilian[p.id]), game.persist(), refresh()) } }, save.lilian[p.id] ? 'Active' : 'Off')
          : h('button', { class: 'btn tiny gold', disabled: save.cores < p.cost, on: { click: () => ((save.cores -= p.cost), (save.lilianOwned[p.id] = true), (save.lilian[p.id] = true), game.persist(), game.world.sfx('levelUp'), refresh()) } }, h('span', null, 'Buy '), costText(p.cost, save.cores, ' cores')),
      );
    });
    return h(
      'div',
      null,
      ...header(name, `Chaotic Cores ${save.cores} — packs add items to the pool. Turn a pack off any time to remove it again.`),
      h('div', { class: 'rows' }, ...rows),
      h('div', { class: 'foot' }, h('button', { class: 'btn blue', on: { click: close } }, 'Done')),
    );
  });
}

function openGina(ui: Ui, game: Game, name: string) {
  ui.open('gina', ({ close, refresh }) => {
    const save = game.save;
    const n = save.gina.length;
    const nextCost = ginaCost(n + 1);
    const pool = game.content.data.spells.filter((s) => s.rarity !== 'Unique' && s.id !== 'spell_prototype');
    const grid = h('div', { class: 'grid' });
    for (const s of pool) {
      const banned = save.gina.includes(s.id);
      const card = spellCard(ui, game, { id: s.id, lv: 0 }, {
        sel: banned,
        onClick: () => {
          if (banned) {
            save.gina = save.gina.filter((x) => x !== s.id);
          } else {
            if (n >= GINA_MAX) return ui.toast(`At most ${GINA_MAX} spells can be banned`, 'bad');
            if (save.crystals < nextCost) return ui.toast('Not enough crystals', 'bad');
            save.crystals -= nextCost;
            save.gina.push(s.id);
          }
          game.persist();
          refresh();
        },
      });
      if (banned) card.style.opacity = '0.4';
      grid.append(card);
    }
    return h(
      'div',
      null,
      ...header(name, `Banned spells are never offered by rewards, shops or forges. ${n}/${GINA_MAX} banned · next ban ${nextCost ? `${nextCost} crystals` : 'free'} (first ${GINA_FREE} are free) · crystals ${fmtNum(save.crystals)}`),
      grid,
      h('div', { class: 'foot' }, h('button', { class: 'btn blue', on: { click: close } }, 'Done')),
    );
  });
}

function openLeah(ui: Ui, game: Game, name: string) {
  ui.open('leah', ({ close, refresh }) => {
    const save = game.save;
    const soulLv = save.setLevels.soul ?? 1;
    const rows = SETS.map((s) => {
      const owned = save.sets.includes(s.id);
      const nm = game.content.names.sets[s.id] ?? s.id;
      return h(
        'div',
        { class: 'line' },
        h('span', { class: 'n' }, owned ? nm : '???'),
        h('span', { class: 'd' }, owned ? s.desc : `Locked: ${s.unlock}`),
        s.id === 'soul' && owned ? h('button', { class: 'btn tiny purple', disabled: soulLv >= 3 || save.crystals < [60, 120][soulLv - 1], on: { click: () => (game.upgradeSoul(), refresh()) } }, soulLv >= 3 ? 'Max level' : `Upgrade Lv ${soulLv + 1} · ${[60, 120][soulLv - 1]} cr`) : null,
        owned ? h('button', { class: `btn tiny ${save.set === s.id ? 'gold' : 'blue'}`, on: { click: () => ((save.set = s.id), game.persist(), writeSave(save), refresh()) } }, save.set === s.id ? 'Chosen' : 'Choose') : null,
      );
    });
    return h(
      'div',
      null,
      ...header(name, 'Sets are starting kits. Each comes with its own signature relic.'),
      h('div', { class: 'rows' }, ...rows),
      h('div', { class: 'foot' }, h('button', { class: 'btn blue', on: { click: close } }, 'Done')),
    );
  });
}

function openTrainer(ui: Ui, game: Game, name: string) {
  let showAll = false;
  ui.open('trainer', ({ close, refresh }) => {
    const save = game.save;
    const run = game.run;
    const spells = game.content.data.spells.filter((s) => showAll || save.seenSpells.includes(s.id));
    const wands = game.content.data.wands.filter((w) => showAll || save.seenWands.includes(w.id));
    const spellGrid = h('div', { class: 'grid' }, ...spells.map((s) => spellCard(ui, game, { id: s.id, lv: 0 }, {
      onClick: () => {
        const free = run.backpack.findIndex((x) => !x);
        if (free < 0) return ui.toast('Backpack is full', 'bad');
        run.backpack[free] = { id: s.id, lv: 0 };
        ui.toast(`${s.name} added to the backpack`, 'info');
        refresh();
      },
    })));
    const wandGrid = h('div', { class: 'grid' }, ...wands.map((w) => {
      const el = h('div', { class: 'card t-Wand r-Normal', on: { click: () => game.giveWand(w.id) } }, icon(w.sprite, 32), h('div', { class: 'nm' }, w.name));
      ui.tip(el, () => ({ title: w.name, lines: [w.desc, `${w.mp} MP · ${w.regen}/s regen · ${w.slots} slots`] }));
      return el;
    }));
    return h(
      'div',
      null,
      ...header(name, 'Spells and wands you have met are free to try. Open the Bag to arrange them, then hit the dummy (DPS shows top-left).'),
      h('div', { class: 'row', style: { marginBottom: '8px' } }, h('button', { class: `btn tiny ${showAll ? 'gold' : 'grey'}`, on: { click: () => ((showAll = !showAll), refresh()) } }, showAll ? 'Showing everything' : 'Show everything')),
      h('div', { class: 'cols' }, h('div', { class: 'section' }, h('h2', null, `Spells (${spells.length})`), spells.length ? spellGrid : h('div', { class: 'small muted' }, 'Play a run to meet some spells.')), h('div', { class: 'section' }, h('h2', null, `Wands (${wands.length})`), wands.length ? wandGrid : h('div', { class: 'small muted' }, 'None seen yet.'))),
      h('div', { class: 'foot' }, h('button', { class: 'btn purple', on: { click: () => (close(), ui.openInventory()) } }, 'Open Bag'), h('button', { class: 'btn blue', on: { click: close } }, 'Done')),
    );
  });
}

export { RARITY_COLOR };
