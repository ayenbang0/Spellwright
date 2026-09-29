/** Hidden Test Mode panel (F2 while Test Mode is on): every spell, wand, relic, mob and boss, plus player cheats. */
import { BOSSES } from '../game/bosses';
import { ELITES, ENEMIES } from '../game/enemies';
import type { Game } from '../game/game';
import { RELICS } from '../game/relics';
import { mobCatalog, type MobEntry } from '../game/testmode';
import { h, icon, mount, type Child } from './dom';
import { spellCard } from './panels';
import type { Ui } from './ui';

type Tab = 'spells' | 'wands' | 'relics' | 'mobs' | 'player';

const TABS: [Tab, string][] = [['spells', 'Spells'], ['wands', 'Wands'], ['relics', 'Relics'], ['mobs', 'Mobs'], ['player', 'Player']];
const TYPE_ORDER = ['Projectile', 'Summon', 'Boost', 'Passive'];
const RARITY_ORDER: Record<string, number> = { Normal: 0, Rare: 1, Epic: 2, Unique: 3 };
const LV_MARK = ['', ' +', ' ++'];
const ELITE_IDS = new Set(Object.values(ELITES).flat());

export function openTestPanel(ui: Ui, game: Game) {
  const session = game.testMode;
  if (!session) return;
  const { content } = game;
  const catalog = mobCatalog(content);
  const types = [...new Set(content.data.spells.map((s) => s.type))].sort((a, b) => TYPE_ORDER.indexOf(a) - TYPE_ORDER.indexOf(b));

  let tab: Tab = 'spells';
  let spellType = 'All';
  let spellLv = 0;
  let mobCount = 1;
  let mobElite = false;
  const query: Record<Tab, string> = { spells: '', wands: '', relics: '', mobs: '', player: '' };

  const chip = (label: string, on: boolean, click: () => void) => h('button', { class: `btn tiny ${on ? 'blue active' : 'grey'}`, on: { click } }, label);
  const matches = (q: string, ...fields: string[]) => {
    const needle = q.trim().toLowerCase();
    return !needle || fields.some((f) => f.toLowerCase().includes(needle));
  };
  const said = (msg: string, kind: 'info' | 'good' | 'bad' | 'gold' | 'purple' = 'gold') => ui.toast(msg, kind);

  ui.open('testpanel', ({ close, refresh }) => {
    const list = h('div', { class: 'tp-list' });
    const status = h('div', { class: 'small tp-status' });
    const heldBox = h('div', { class: 'tp-bar' });

    const updateStatus = () => {
      const r = game.run;
      const wand = r.wands[r.active];
      const alive = game.world.enemies.filter((e) => !e.dead && !e.def.dummy).length;
      const text: Record<Tab, string> = {
        spells: `Held wand: ${wand ? `${content.wand[wand.defId].name} · ${wand.slots.filter(Boolean).length}/${wand.slots.length} slots` : 'none'} · Backpack ${r.backpack.filter(Boolean).length}/${r.backpack.length} (grows as needed)`,
        wands: `Wands held: ${r.wands.length} (the wand limit does not apply in Test Mode)`,
        relics: `Relics owned: ${r.relics.length}/${content.data.relics.length}`,
        mobs: `Hostiles alive: ${alive}`,
        player: `HP ${Math.ceil(game.world.player.hp)}/${game.world.stats.maxHp} · coins ${r.coins} · keys ${r.keys}`,
      };
      status.textContent = text[tab];
    };

    const renderHeld = () => {
      const r = game.run;
      mount(
        heldBox,
        h('span', { class: 'lbl' }, 'Held wands:'),
        ...r.wands.map((wd, i) =>
          h(
            'span',
            { class: 'row', style: { gap: '2px' } },
            chip(`${i + 1}. ${content.wand[wd.defId].name}`, i === r.active, () => (game.world.player.swapWand(i), renderHeld(), updateStatus())),
            h('button', { class: 'btn tiny red', title: 'Remove this wand (its spells go to the backpack)', disabled: r.wands.length < 2, on: { click: () => (session.removeWand(game, i), renderHeld(), updateStatus()) } }, '×'),
          ),
        ),
      );
    };

    // ---- spells
    const spellList = (): Child[] => {
      const spells = content.data.spells
        .filter((s) => (spellType === 'All' || s.type === spellType) && matches(query.spells, s.name, s.id))
        .sort((a, b) => TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type) || RARITY_ORDER[a.rarity] - RARITY_ORDER[b.rarity] || a.name.localeCompare(b.name));
      if (!spells.length) return [h('div', { class: 'small muted' }, 'No spell matches.')];
      return [
        h('div', { class: 'small muted' }, `${spells.length} spells. Click to add one to the first free slot of the held wand, else the backpack.`),
        h('div', { class: 'grid' }, ...spells.map((s) => {
          const inst = { id: s.id, lv: Math.min(spellLv, s.mana.length - 1) };
          return spellCard(ui, game, inst, {
            onClick: () => {
              const where = session.giveSpell(game, inst);
              said(`${s.name}${LV_MARK[inst.lv]} → ${where === 'wand' ? 'held wand' : 'backpack'}`);
              updateStatus();
            },
          });
        })),
      ];
    };

    // ---- wands
    const wandList = (): Child[] => {
      const wands = content.data.wands.filter((w) => matches(query.wands, w.name, w.id));
      if (!wands.length) return [h('div', { class: 'small muted' }, 'No wand matches.')];
      return [
        h('div', { class: 'small muted' }, `${wands.length} wands. Click to take one and hold it.`),
        h('div', { class: 'rows' }, ...wands.map((w) => {
          const stats = `${w.mp} MP · ${w.regen}/s regen · ${w.interval}s interval · ${w.cd}s CD · ${w.slots} slots`;
          const owned = game.run.wands.filter((x) => x.defId === w.id).length;
          const row = h(
            'div',
            { class: 'line', style: { cursor: 'pointer' }, on: { click: () => (session.giveWand(game, w.id), renderHeld(), renderList(), updateStatus()) } },
            icon(w.sprite, 32),
            h('span', { class: 'n' }, w.name),
            h('span', { class: 'd' }, stats),
            owned ? h('span', { class: 'badge blue' }, `held x${owned}`) : null,
          );
          ui.tip(row, () => ({ title: w.name, lines: [w.desc, stats] }));
          return row;
        })),
      ];
    };

    // ---- relics
    const relicList = (): Child[] => {
      const relics = content.data.relics.filter((r) => matches(query.relics, r.name, r.id));
      if (!relics.length) return [h('div', { class: 'small muted' }, 'No relic matches.')];
      return [
        h('div', { class: 'small muted' }, `${relics.length} relics. Click to give or level up, shift-click or Remove to take it away.`),
        h('div', { class: 'rows' }, ...relics.map((d) => {
          const have = game.run.relics.find((r) => r.id === d.id);
          const inert = !RELICS[d.id];
          const shown = Math.min(d.desc.length, have?.lv ?? 1) - 1;
          const act = (remove: boolean) => {
            if (remove) session.removeRelic(game, d.id);
            else if (!have || have.lv < d.maxLevel) game.giveRelic(d.id);
            else return;
            renderList();
            updateStatus();
          };
          const row = h(
            'div',
            { class: `line${inert ? ' dim' : ''}`, style: { cursor: 'pointer' }, on: { click: (e) => act(e.shiftKey) } },
            icon(d.icon, 32),
            h('span', { class: 'n' }, d.name),
            h('span', { class: 'd' }, d.desc[shown] ?? d.desc[0]),
            inert ? h('span', { class: 'badge red' }, 'Inert') : null,
            d.setOnly ? h('span', { class: 'badge purple' }, 'Set relic') : null,
            have ? h('span', { class: `badge ${have.lv >= d.maxLevel ? 'gold' : 'green'}` }, have.lv >= d.maxLevel ? `Max ${have.lv}` : `Lv ${have.lv}/${d.maxLevel}`) : h('span', { class: 'badge grey' }, `max ${d.maxLevel}`),
            have ? h('button', { class: 'btn tiny red', on: { click: (e) => (e.stopPropagation(), act(true)) } }, 'Remove') : null,
          );
          ui.tip(row, () => ({ title: `${d.name} · ${d.rarity}`, lines: [...d.desc, inert ? 'No implementation in RELICS: this relic does nothing.' : '', d.setOnly ? 'Set relic: never drops.' : ''], rarity: d.rarity }));
          return row;
        })),
      ];
    };

    // ---- mobs
    const mobCard = (m: MobEntry) => {
      const boss = m.kind === 'boss';
      const art = [`${m.art}.png`, `${m.art}_f0.png`].find((p) => game.art.has(p));
      const el = h(
        'div',
        {
          class: `card mob ${boss ? 't-Curse r-Epic' : 't-Relic r-Normal'}`,
          on: {
            click: () => {
              const placed = session.spawn(game, m, mobCount, mobElite && !boss);
              if (placed) said(`Spawned ${placed} × ${m.label}`, boss ? 'purple' : 'info');
              else said('No free floor around you', 'bad');
              updateStatus();
            },
          },
        },
        art ? icon(art, 40) : null,
        h('div', { class: 'nm' }, `${m.label}${!boss && ELITE_IDS.has(m.id) ? ' ★' : ''}`),
      );
      ui.tip(el, () => {
        if (boss) {
          const b = BOSSES[m.id];
          return { title: m.label, lines: [`Boss · chapter ${b.chapter} · ${b.hp} HP · ${b.move}`, m.hpFrac === undefined ? '' : 'Starts already in this phase.'] };
        }
        const d = ENEMIES[m.id];
        return { title: m.label, lines: [`${d.hp} HP · ${d.ai}${d.attack ? ` · ${d.attack.pattern}` : ' · contact only'}`, ELITE_IDS.has(m.id) ? '★ appears as an elite in runs' : ''] };
      });
      return el;
    };
    const mobList = (): Child[] => {
      const pick = (arr: MobEntry[]) => arr.filter((m) => matches(query.mobs, m.label, m.id));
      const enemies = pick(catalog.enemies);
      const bosses = pick(catalog.bosses);
      return [
        h('h2', null, `Enemies (${enemies.length})`),
        enemies.length ? h('div', { class: 'grid' }, ...enemies.map(mobCard)) : h('div', { class: 'small muted' }, 'None.'),
        h('h2', null, `Bosses (${bosses.length})`),
        bosses.length ? h('div', { class: 'grid' }, ...bosses.map(mobCard)) : h('div', { class: 'small muted' }, 'None.'),
      ];
    };

    // ---- player
    const toggle = (label: string, get: () => boolean, set: (v: boolean) => void) =>
      h('div', { class: 'setting' }, h('span', null, label), h('button', { class: `btn ${get() ? 'green' : 'grey'}`, on: { click: () => (set(!get()), refresh()) } }, get() ? 'On' : 'Off'));
    const playerList = (): Child[] => {
      const w = game.world;
      return [
        toggle('God mode (no damage)', () => session.god, (v) => (session.god = v)),
        toggle('Infinite MP (every wand refilled each step)', () => session.infiniteMp, (v) => (session.infiniteMp = v)),
        h(
          'div',
          { class: 'tp-bar' },
          h('button', { class: 'btn green', on: { click: () => ((w.player.hp = w.stats.maxHp), said('Fully healed', 'good'), updateStatus()) } }, 'Full heal'),
          h('button', { class: 'btn gold', on: { click: () => ((game.run.coins += 999), said('+999 coins'), updateStatus()) } }, '+999 coins'),
          h('button', { class: 'btn gold', on: { click: () => ((game.run.keys += 9), said('+9 keys'), updateStatus()) } }, '+9 keys'),
          h('button', { class: 'btn grey', on: { click: () => (game.run.potions.length = 0) } }, 'Clear potions'),
        ),
        h('h2', null, 'Potions: click one to fill every potion slot with it'),
        h('div', { class: 'grid' }, ...content.data.potions.map((p) => {
          const el = h('div', { class: 'card t-Boost r-Normal', on: { click: () => (session.fillPotions(game, p.id), said(`Potion slots: ${p.name}`)) } }, icon(p.icon, 32), h('div', { class: 'nm' }, p.name));
          ui.tip(el, () => ({ title: p.name, lines: [p.desc] }));
          return el;
        })),
      ];
    };

    const lists: Record<Tab, () => Child[]> = { spells: spellList, wands: wandList, relics: relicList, mobs: mobList, player: playerList };
    function renderList(resetScroll = false) {
      const top = list.scrollTop;
      mount(list, ...lists[tab]());
      list.scrollTop = resetScroll ? 0 : top;
    }

    const search = h('input', {
      class: 'tp-search',
      attrs: { type: 'text', placeholder: 'Search name or id', spellcheck: 'false', autocomplete: 'off' },
      on: { input: () => ((query[tab] = search.value), renderList(true)) },
    });
    search.value = query[tab];

    const toolbar: Record<Tab, () => Child[]> = {
      spells: () => [
        chip('All types', spellType === 'All', () => ((spellType = 'All'), refresh())),
        ...types.map((t) => chip(t, spellType === t, () => ((spellType = t), refresh()))),
        h('span', { class: 'lbl' }, 'Level:'),
        ...['Base', '+', '++'].map((label, lv) => chip(label, spellLv === lv, () => ((spellLv = lv), refresh()))),
        search,
        h('button', { class: 'btn tiny red', on: { click: () => (session.clearWand(game, game.run.active), said('Held wand cleared', 'info'), updateStatus()) } }, 'Clear held wand'),
        h('button', { class: 'btn tiny red', on: { click: () => (session.clearAllWands(game), said('All wands cleared', 'info'), updateStatus()) } }, 'Clear all wands'),
        h('button', { class: 'btn tiny red', on: { click: () => (session.clearBackpack(game), said('Backpack cleared', 'info'), updateStatus()) } }, 'Clear backpack'),
      ],
      wands: () => [search],
      relics: () => [
        search,
        h('button', { class: 'btn tiny gold', on: { click: () => (session.maxAllRelics(game), renderList(), updateStatus()) } }, 'Max all relics'),
        h('button', { class: 'btn tiny red', on: { click: () => (session.removeAllRelics(game), renderList(), updateStatus()) } }, 'Remove all relics'),
      ],
      mobs: () => [
        h('span', { class: 'lbl' }, 'Count:'),
        ...[1, 5, 10].map((n) => chip(`${n}`, mobCount === n, () => ((mobCount = n), refresh()))),
        chip('Elite', mobElite, () => ((mobElite = !mobElite), refresh())),
        search,
        h('button', { class: 'btn tiny red', on: { click: () => (said(`Killed ${session.killAll(game)} hostiles`, 'info'), updateStatus()) } }, 'Kill all mobs'),
        h('button', { class: 'btn tiny grey', on: { click: () => (game.world.clearEnemyProjectiles(), said('Enemy projectiles cleared', 'info')) } }, 'Clear enemy projectiles'),
      ],
      player: () => [],
    };

    renderHeld();
    renderList(true);
    updateStatus();
    return h(
      'div',
      null,
      h('h1', null, 'Test Mode'),
      h('div', { class: 'subtitle' }, 'Nothing here is saved. Typing the code again turns Test Mode off, restores your real progress and returns to camp.'),
      h('div', { class: 'tabs' }, ...TABS.map(([id, label]) => chip(label, tab === id, () => ((tab = id), refresh())))),
      h('div', { class: 'tp-bar' }, ...toolbar[tab]()),
      tab === 'wands' ? heldBox : null,
      status,
      list,
      h('div', { class: 'foot' }, h('button', { class: 'btn blue', on: { click: close } }, 'Close [Esc / F2]')),
    );
  });
}
