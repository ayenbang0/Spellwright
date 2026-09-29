/**
 * DOM UI over the canvas, styled like the "Infinite Tower" reference (diep-style: Ubuntu bold, outlined white text,
 * two-tone pastel buttons, translucent panels, pill counters, rounded bars). Sprites come from assets/ (pixel art).
 */
import type { Enemy } from '../game/enemies';
import { RARITY_COLOR, type EndSummary, type Game } from '../game/game';
import type { PropInfo } from '../game/world';
import type { SpellInst } from '../game/wand';
import { clear, fmtNum, h, icon, mount } from './dom';
import { openDepart, openEnd, openForge, openInventory, openNpc, openPause, openRelicReset, openTitle } from './panels';
import { openTestPanel } from './testpanel';

export type ToastKind = 'info' | 'good' | 'bad' | 'gold' | 'purple';

export interface TipData {
  title: string;
  lines: string[];
  rarity?: string;
  price?: number;
}

export type ModalBuilder = (ctx: { close: () => void; refresh: () => void }) => HTMLElement;

interface ModalEntry {
  id: string;
  layer: HTMLElement;
  build: ModalBuilder;
  render: () => void;
  onClose?: () => void;
  closable: boolean;
}

export class Ui {
  private readonly hud: HTMLElement;
  private readonly toasts: HTMLElement;
  private readonly tipEl: HTMLElement;
  private readonly testBadge: HTMLElement;
  private readonly stack: ModalEntry[] = [];
  private refs!: {
    hp: HTMLElement; shield: HTMLElement; shieldPill: HTMLElement; coin: HTMLElement; key: HTMLElement; crystal: HTMLElement;
    room: HTMLElement; dps: HTMLElement; dpsPill: HTMLElement; boss: HTMLElement; bossFill: HTMLElement; bossLabel: HTMLElement;
    blood: HTMLElement; core: HTMLElement; tl: HTMLElement;
    wands: HTMLElement; potions: HTMLElement; prompt: HTMLElement; coinPill: HTMLElement; keyPill: HTMLElement; crystalPill: HTMLElement;
  };
  private wandSig = '';
  private potionSig = '';
  private promptSig = '';
  private bossEnemy: Enemy | null = null;
  private title = false;
  private last: Record<string, string> = {};

  constructor(readonly game: Game, readonly root: HTMLElement) {
    this.hud = h('div', { class: 'hud' });
    this.toasts = h('div', { class: 'toasts' });
    this.tipEl = h('div', { class: 'tip hidden' });
    this.testBadge = h('button', { class: 'test-badge hidden', title: 'Test Mode: progress is not saved. Click or press F2 for the panel.', on: { click: () => this.toggleTestPanel() } }, 'TEST MODE (F2)');
    this.buildHud();
    root.append(this.hud, this.toasts, this.tipEl, this.testBadge);
    window.addEventListener('pointermove', (e) => this.moveTip(e));
  }

  get modalOpen(): boolean {
    return this.stack.length > 0;
  }
  get onTitle(): boolean {
    return this.title;
  }

  // ------------------------------------------------------------------ HUD

  private pill(cls: string, label = ''): { pill: HTMLElement; text: HTMLElement } {
    const text = h('span', null, label);
    const pill = h('div', { class: `pill ${cls}` }, h('span', { class: 'ico' }), text);
    return { pill, text };
  }

  private buildHud() {
    const hp = this.pill('hp');
    const shield = this.pill('shield');
    const coin = this.pill('coin');
    const key = this.pill('key');
    const crystal = this.pill('crystal');
    const blood = this.pill('blood');
    const core = this.pill('core');
    const room = this.pill('room');
    const dps = this.pill('dps');
    const tl = h('div', { class: 'hud-tl' }, hp.pill, shield.pill, coin.pill, key.pill, crystal.pill, blood.pill, core.pill, room.pill, dps.pill);
    const tr = h(
      'div',
      { class: 'hud-tr' },
      h('button', { class: 'btn blue', on: { click: () => this.openInventory() } }, 'Bag [Tab]'),
      h('button', { class: 'btn grey', on: { click: () => this.openPause() } }, 'Menu [Esc]'),
    );
    const bossFill = h('div', { class: 'fill red', style: { width: '100%' } });
    const bossLabel = h('div', { class: 'label' });
    const boss = h('div', { class: 'bossbar hidden' }, h('div', { class: 'bar' }, bossFill, bossLabel));
    const wands = h('div', { class: 'wands' });
    const potions = h('div', { class: 'potions' });
    const prompt = h('div', { class: 'prompt hidden' });
    this.hud.append(tl, tr, boss, wands, potions, prompt);
    this.refs = {
      hp: hp.text, shield: shield.text, shieldPill: shield.pill, coin: coin.text, key: key.text, crystal: crystal.text, room: room.text,
      dps: dps.text, dpsPill: dps.pill, blood: blood.text, core: core.text, tl, boss, bossFill, bossLabel, wands, potions, prompt, coinPill: coin.pill, keyPill: key.pill, crystalPill: crystal.pill,
    };
  }

  private set(key: string, el: HTMLElement, text: string) {
    if (this.last[key] !== text) {
      this.last[key] = text;
      el.textContent = text;
    }
  }

  /** Called once per rendered frame. */
  frame() {
    const g = this.game;
    const run = g.run;
    const w = g.world;
    if (!run || !w) return;
    const r = this.refs;
    const camp = g.mode === 'camp';
    this.hud.classList.toggle('hidden', this.title);
    this.set('hp', r.hp, `${Math.ceil(w.player.hp)}/${w.stats.maxHp}`);
    const sh = run.shield + run.tempShield;
    r.shieldPill.classList.toggle('hidden', sh <= 0);
    this.set('sh', r.shield, String(Math.round(sh)));
    r.coinPill.classList.toggle('hidden', camp);
    r.keyPill.classList.toggle('hidden', camp);
    this.set('coin', r.coin, fmtNum(run.coins));
    this.set('key', r.key, String(run.keys));
    this.set('crystal', r.crystal, fmtNum(camp ? g.save.crystals : run.crystals));
    this.set('blood', r.blood, String(camp ? g.save.blood : run.blood));
    this.set('core', r.core, String(camp ? g.save.cores : run.cores));
    r.tl.classList.toggle('blurred', run.curses.includes('bewilderment'));
    document.body.classList.toggle('c-dark', run.curses.includes('nocturnal_blindness'));
    document.body.classList.toggle('c-aphasia', run.curses.includes('aphasia'));
    this.set('room', r.room, camp ? 'Camp' : `${g.chapterName(run.chapter)} · ${w.room.kind === 'boss' ? 'Boss' : `${run.room + 1}`}`);
    r.dpsPill.classList.toggle('hidden', !camp);
    if (camp) this.set('dps', r.dps, `DPS ${fmtNum(w.dps(2))}`);
    this.frameBoss();
    this.frameWands();
    this.framePotions();
  }

  setBoss(e: Enemy | null, name = '') {
    this.bossEnemy = e;
    this.refs.bossLabel.dataset.name = name;
  }

  private frameBoss() {
    const e = this.bossEnemy;
    const show = !!e && !e.dead && this.game.world.enemies.includes(e);
    this.refs.boss.classList.toggle('hidden', !show);
    if (!show || !e) return;
    const name = this.refs.bossLabel.dataset.name ?? '';
    this.refs.bossFill.style.width = `${Math.max(0, (e.hp / e.maxHp) * 100)}%`;
    this.set('boss', this.refs.bossLabel, `${name}  ${fmtNum(Math.max(0, e.hp))} / ${fmtNum(e.maxHp)}`);
  }

  private frameWands() {
    const g = this.game;
    const run = g.run;
    const pl = g.world.player;
    const sig = `${run.active}|` + run.wands.map((wd) => `${wd.uid}:${wd.slots.map((s) => (s ? s.id + s.lv : '-')).join(',')}`).join('|');
    const box = this.refs.wands;
    if (sig !== this.wandSig) {
      this.wandSig = sig;
      clear(box);
      run.wands.forEach((wd, i) => {
        const def = g.content.wand[wd.defId];
        const seq = h('div', { class: 'seq' });
        let cover = 0;
        wd.slots.forEach((s) => {
          if (cover > 0) {
            cover--;
            seq.append(h('div', { class: 's cont' }));
            return;
          }
          const cell = h('div', { class: 's' });
          if (s) {
            cell.append(icon(g.content.spell[s.id].icon, 16));
            cover = (g.content.spell[s.id].slots ?? 1) - 1;
          }
          seq.append(cell);
        });
        const fill = h('div', { class: 'fill blue', style: { width: '100%' } });
        const label = h('div', { class: 'label' });
        box.append(
          h(
            'div',
            { class: `wand${i === run.active ? ' active' : ''}`, on: { click: () => pl.swapWand(i) } },
            h('div', { class: 'top' }, h('span', { class: 'key' }, `${i + 1}`), h('span', null, def.name)),
            h('div', { class: 'bar slim' }, fill, label),
            seq,
          ),
        );
      });
    }
    run.wands.forEach((wd, i) => {
      const el = box.children[i] as HTMLElement | undefined;
      if (!el) return;
      const s = pl.statsOf(wd);
      const fill = el.querySelector<HTMLElement>('.fill');
      const label = el.querySelector<HTMLElement>('.label');
      if (fill) fill.style.width = `${Math.max(0, Math.min(100, (wd.mp / s.maxMp) * 100))}%`;
      if (label) this.set(`wl${i}`, label, `${Math.floor(wd.mp)} / ${s.maxMp}`);
      const cells = el.querySelectorAll('.seq .s');
      let idx = 0;
      let cover = 0;
      wd.slots.forEach((slot, k) => {
        if (cover > 0) cover--;
        else if (slot) cover = (g.content.spell[slot.id].slots ?? 1) - 1;
        cells[idx]?.classList.toggle('on', k === wd.ptr && i === run.active);
        idx++;
      });
    });
  }

  private framePotions() {
    const g = this.game;
    const run = g.run;
    const sig = `${run.potionSlots}|${run.potions.join(',')}`;
    if (sig === this.potionSig) return;
    this.potionSig = sig;
    const box = this.refs.potions;
    clear(box);
    for (let i = 0; i < run.potionSlots; i++) {
      const id = run.potions[i];
      const def = id ? g.content.potion[id] : null;
      const el = h('div', { class: `potion${def ? '' : ' empty'}`, on: { click: () => def && g.usePotion(i) } }, h('span', { class: 'k' }, `${i + 1}`), def ? icon(def.icon, 32) : null);
      if (def) this.tip(el, () => ({ title: def.name, lines: [def.desc, `Press ${i + 1} to drink.`] }));
      box.append(el);
    }
  }

  // ------------------------------------------------------------------ prompt, toasts, banners

  setPrompt(info: PropInfo | null) {
    const sig = info ? `${info.title}|${info.price ?? ''}|${info.lines.join('/')}` : '';
    if (sig === this.promptSig) return;
    this.promptSig = sig;
    const el = this.refs.prompt;
    el.classList.toggle('hidden', !info);
    if (!info) {
      clear(el);
      return;
    }
    el.style.setProperty('--r', info.rarity ? RARITY_COLOR[info.rarity] ?? '' : '');
    mount(
      el,
      info.icon ? icon(info.icon, 40) : null,
      h(
        'div',
        { class: 'col', style: { gap: '2px' } },
        h('div', { class: 't' }, info.title),
        ...info.lines.filter(Boolean).map((l) => h('div', { class: 'l' }, l)),
        info.price !== undefined ? h('div', { class: 'p' }, `${info.price} coins`) : null,
        h('div', { class: 'e' }, `[E] ${info.action ?? 'Use'}`),
      ),
    );
  }

  toast(msg: string, kind: ToastKind = 'info') {
    const t = h('div', { class: `toast ${kind}` }, msg);
    this.toasts.append(t);
    while (this.toasts.children.length > 5) this.toasts.firstElementChild?.remove();
    setTimeout(() => t.remove(), 3100);
  }

  banner(big: string, sub = '') {
    this.root.querySelector('.banner')?.remove();
    const b = h('div', { class: 'banner' }, big ? h('div', { class: 'big o' }, big) : null, sub ? h('div', { class: 'sub o' }, sub) : null);
    this.root.append(b);
    setTimeout(() => b.remove(), 3700);
  }

  // ------------------------------------------------------------------ tooltips

  private tipFn: (() => TipData) | null = null;

  /** Show a floating tooltip while hovering `el`. */
  tip(el: HTMLElement, data: () => TipData) {
    el.addEventListener('pointerenter', () => {
      this.tipFn = data;
      this.renderTip();
    });
    el.addEventListener('pointerleave', () => {
      this.tipFn = null;
      this.tipEl.classList.add('hidden');
    });
  }

  private renderTip() {
    if (!this.tipFn) return;
    const d = this.tipFn();
    this.tipEl.style.setProperty('--r', d.rarity ? RARITY_COLOR[d.rarity] ?? '' : '');
    mount(
      this.tipEl,
      h('div', { class: 't' }, d.title),
      ...d.lines.filter(Boolean).map((l) => h('div', { class: 'l' }, l)),
      d.price !== undefined ? h('div', { class: 'cost' }, `${d.price} coins`) : null,
    );
    this.tipEl.classList.remove('hidden');
  }

  private moveTip(e: PointerEvent) {
    if (this.tipEl.classList.contains('hidden')) return;
    const r = this.tipEl.getBoundingClientRect();
    let x = e.clientX + 16;
    let y = e.clientY + 16;
    if (x + r.width > window.innerWidth - 8) x = e.clientX - r.width - 16;
    if (y + r.height > window.innerHeight - 8) y = window.innerHeight - r.height - 8;
    this.tipEl.style.left = `${x}px`;
    this.tipEl.style.top = `${y}px`;
  }

  /** Spell tooltip data. */
  spellTip(s: SpellInst): TipData {
    const def = this.game.content.spell[s.id];
    const lv = ['', ' +', ' ++'][s.lv];
    const nums: string[] = [];
    if (def.mana[s.lv]) nums.push(`${def.mana[s.lv]} MP${def.castMode === 'continuous' ? '/s' : ''}`);
    if (def.damage[s.lv]) nums.push(`${def.damage[s.lv]} dmg${def.dps ? '/s' : ''}`);
    if (def.slots > 1) nums.push(`${def.slots} slots`);
    return {
      title: def.name + lv,
      lines: [def.desc[s.lv] ?? def.desc[0], `${def.type} · ${def.rarity}${def.upgrade === 'kills' ? ' · levels from kills' : def.upgrade === 'none' ? ' · cannot be fused' : ''}`, nums.join(' · ')],
      rarity: def.rarity,
    };
  }

  // ------------------------------------------------------------------ modal stack

  open(id: string, build: ModalBuilder, opts: { closable?: boolean; onClose?: () => void; narrow?: boolean } = {}) {
    const layer = h('div', { class: 'modal-bg' });
    const entry: ModalEntry = { id, layer, build, render: () => undefined, onClose: opts.onClose, closable: opts.closable ?? true };
    const render = () => {
      const scroll = layer.firstElementChild?.scrollTop ?? 0;
      clear(layer);
      const body = build({ close: () => this.close(entry), refresh: render });
      body.classList.add('modal');
      if (opts.narrow) body.classList.add('narrow');
      layer.append(body);
      body.scrollTop = scroll;
    };
    layer.addEventListener('pointerdown', (e) => {
      if (e.target === layer && entry.closable) this.close(entry);
    });
    entry.render = render;
    render();
    this.stack.push(entry);
    this.root.append(layer);
    document.body.classList.add('menu-open');
    this.tipFn = null;
    this.tipEl.classList.add('hidden');
    this.game.audio.play('select');
  }

  private close(entry: ModalEntry) {
    const i = this.stack.indexOf(entry);
    if (i < 0) return;
    this.stack.splice(i, 1);
    entry.layer.remove();
    entry.onClose?.();
    this.tipFn = null;
    this.tipEl.classList.add('hidden');
    if (!this.stack.length) document.body.classList.remove('menu-open');
  }

  closeTop() {
    const top = this.stack[this.stack.length - 1];
    if (top?.closable) this.close(top);
  }

  closeAll() {
    for (const e of [...this.stack]) this.close(e);
  }

  canCloseWithTab(): boolean {
    return this.stack[this.stack.length - 1]?.id === 'inventory';
  }

  /** Re-render the top modal (state changed elsewhere). */
  refreshTop() {
    this.stack[this.stack.length - 1]?.render();
  }

  // ------------------------------------------------------------------ screens (implemented in panels.ts)

  showTitle() {
    this.title = true;
    openTitle(this, this.game, () => {
      this.title = false;
    });
  }
  openInventory() {
    if (!this.stack.some((e) => e.id === 'inventory')) openInventory(this, this.game);
  }
  openPause() {
    if (!this.stack.length) openPause(this, this.game);
  }
  openForge() {
    openForge(this, this.game);
  }
  openNpc(id: string) {
    openNpc(this, this.game, id);
  }
  openDepart() {
    openDepart(this, this.game);
  }
  openEnd(s: EndSummary) {
    this.closeAll();
    openEnd(this, this.game, s);
  }
  chooseRelicReset() {
    openRelicReset(this, this.game);
  }
  setTestBadge(on: boolean) {
    this.testBadge.classList.toggle('hidden', !on);
    document.body.classList.toggle('test-mode', on);
  }
  /** F2 / badge: open the Test Mode panel, or close it if it is already on top. */
  toggleTestPanel() {
    if (this.stack[this.stack.length - 1]?.id === 'testpanel') return this.closeTop();
    if (!this.game.testMode) return;
    if (this.title) return this.toast('Start playing first, then press F2.', 'info');
    if (!this.stack.length && this.game.mode !== 'ended') openTestPanel(this, this.game);
  }
}
