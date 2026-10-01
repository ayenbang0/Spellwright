import { Application, Container, Graphics, Sprite, Texture, TilingSprite } from 'pixi.js';
import { Art } from '../core/art';
import { Audio, type Track } from '../core/audio';
import { FixedStep } from '../core/fixedstep';
import { Input } from '../core/input';
import { dist2, TILE } from '../core/math';
import { ACHIEVEMENTS, bonuses, DIFFICULTY_ACH, type MetaBonuses } from '../meta/meta';
import { loadSave, setSaveLocked, writeSave, type Save } from '../meta/save';
import { Ui } from '../ui/ui';
import { CHAPTER_BOSSES, spawnBoss } from './bosses';
import { Content } from './content';
import { CHAPTER_ROSTER, ELITES, ENEMIES, Enemy } from './enemies';
import { crimsonChoices, relicChoices, rollWand, shopStock, spellChoices, type PoolCtx, type ShopItem, applyMerge, mergeCandidates, spellPrice } from './loot';
import { CURSES } from './curses';
import { drinkPotion } from './potions';
import { RELICS } from './relics';
import { doorChoices, genRoom, type Room, type RoomKind, T_FLOOR, T_PIT, T_SPIKES } from './rooms';
import { CHAPTERS, ROOMS_PER_CHAPTER, type RunState } from './run';
import { SET_BY_ID, SOUL_UPGRADE_COST } from './sets';
import { computeStats } from './stats';
import { Visuals, AnimSprite } from './visuals';
import { TestSession } from './testmode';
import { newWand, type SpellInst } from './wand';
import { World, type Prop, type PropInfo } from './world';

export type Mode = 'camp' | 'run' | 'ended';

export interface EndSummary {
  won: boolean;
  chapter: number;
  room: number;
  kills: number;
  time: number;
  crystals: number;
  blood: number;
  cores: number;
  newSets: string[];
  newAchievements: string[];
  cause: string;
}

const FINAL_CHAPTER = 4;
/** Chapter 5 (design, not on the wiki): a boss rush of rematches ending with the three-phase Demon Lord. Hard and up. */
const RUSH_CHAPTER = 5;
const RUSH_ROOMS = 3;
const RUSH_POOL = ['void_imp', 'all_seeing_eye', 'indescribable', 'skeletal_centaur', 'abyssal_lord', 'cage', 'master_mind'];
/** Last chapter of a run: the rush on Hard and up, chapter 3 below that. */
const lastChapter = (difficulty: number) => (difficulty >= 2 ? RUSH_CHAPTER : 3);
const RARITY_COLOR: Record<string, string> = { Normal: '#b8b8b8', Rare: '#00b2e1', Epic: '#bf7ff5', Unique: '#ffc629' };
export { RARITY_COLOR };

/** Top-level controller: owns Pixi, the current World, the run/save state and the DOM UI. */
export class Game {
  readonly art: Art;
  readonly content: Content;
  readonly audio = new Audio();
  readonly vis: Visuals;
  readonly input: Input;
  readonly ui: Ui;
  readonly app: Application;
  save: Save = loadSave();
  meta: MetaBonuses = bonuses(this.save);
  mode: Mode = 'camp';
  run!: RunState;
  world!: World;
  private readonly clock = new FixedStep();
  private bg!: TilingSprite;
  private crosshair!: Sprite;
  private waves = 0;
  private roomSpawned = false;
  private discount = 1;
  private shopStockItems: ShopItem[] = [];
  private shopRefills = 0;
  private endTimer = -1;
  private nearProp: Prop | null = null;
  private deathCause = '';
  private lastAutoSave = 0;
  /** Set by the camp death timer; the world is only replaced between steps, never from inside `World.update`. */
  private respawnCamp = false;
  end: EndSummary | null = null;
  /** Hidden Test Mode session (cheat code); `null` while off. */
  testMode: TestSession | null = null;

  private constructor(app: Application, art: Art, content: Content, canvas: HTMLCanvasElement, uiRoot: HTMLElement) {
    this.app = app;
    this.art = art;
    this.content = content;
    this.vis = new Visuals(art);
    this.input = new Input(canvas);
    this.ui = new Ui(this, uiRoot);
  }

  static async create(canvas: HTMLCanvasElement, uiRoot: HTMLElement, onProgress?: (p: number) => void): Promise<Game> {
    const app = new Application();
    await app.init({ canvas, resizeTo: window, background: 0xb8b8b8, antialias: false, resolution: 1, roundPixels: true });
    const [art, content] = await Promise.all([Art.load(onProgress), Content.load()]);
    const g = new Game(app, art, content, canvas, uiRoot);
    g.boot();
    return g;
  }

  private boot() {
    const { app, vis } = this;
    this.bg = new TilingSprite({ texture: Texture.WHITE, width: 1, height: 1 });
    app.stage.addChild(this.bg, vis.root, vis.flashG);
    this.crosshair = new Sprite(this.art.tex('ui/cursor.png'));
    this.crosshair.anchor.set(0.5);
    app.stage.addChild(this.crosshair);
    const fit = () => {
      vis.resize(app.screen.width, app.screen.height);
      this.rebuildBg();
    };
    window.addEventListener('resize', fit);
    // closing the tab mid-run keeps the crystals you found
    window.addEventListener('pagehide', () => {
      if (this.mode === 'run' && !this.run.finished) this.bank();
    });
    fit();
    this.audio.muted = this.save.settings.muted;
    this.input.onCheatCode = () => this.toggleTestMode();
    window.addEventListener('pointerdown', () => this.audio.unlock(), { once: true });
    window.addEventListener('keydown', () => this.audio.unlock(), { once: true });
    this.unlock('launch');
    this.enterCamp();
    app.ticker.add((t) => this.frame(t.deltaMS / 1000));
    this.ui.showTitle();
  }

  private rebuildBg() {
    const s = this.vis.root.scale.x;
    const cell = TILE * s;
    const c = document.createElement('canvas');
    c.width = c.height = cell;
    const g = c.getContext('2d')!;
    g.fillStyle = 'rgba(0,0,0,0.075)';
    g.fillRect(0, 0, cell, 2);
    g.fillRect(0, 0, 2, cell);
    this.bg.texture = Texture.from(c);
    this.bg.width = this.app.screen.width;
    this.bg.height = this.app.screen.height;
  }

  // ------------------------------------------------------------------ run state

  private poolCtx(): PoolCtx {
    return { content: this.content, save: this.save, meta: this.meta, run: this.run, stats: this.world.stats, rng: this.world.rng };
  }

  newRunState(setId: string, difficulty: number): RunState {
    const set = SET_BY_ID[setId] ?? SET_BY_ID.original;
    const seed = (Math.random() * 2 ** 31) | 0;
    const soulLv = Math.max(1, this.save.setLevels.soul ?? 1);
    const run: RunState = {
      seed, setId: set.id, difficulty, chapter: 1, room: 0, hp: 0, maxHpBonus: 0, shield: 0, tempShield: 0,
      coins: this.meta.startCoins, keys: this.meta.keys, diamonds: 0, crystals: 0, blood: 0, cores: 0,
      wands: [], wandLimit: 1 + this.meta.wands, active: 0, backpack: [], relics: [], curses: [], potions: [],
      potionSlots: 1 + this.meta.potionSlots, kills: 0, spellKills: {}, bossHit: false,
      perm: { speed: 0, regen: 0, maxHp: 0, maxMp: 0, scale: 1 }, temp: { flight: false, regenT: 0 },
      time: 0, maxDps: 0, venomPeak: 0, finished: false,
    };
    run.backpack = Array(8 + this.meta.backpack).fill(null);
    if (set.relic) run.relics.push({ id: set.relic.id, lv: set.id === 'soul' ? soulLv : set.relic.lv });
    const wandCount = set.id === 'soul' ? 1 + soulLv : 1;
    if (set.id === 'soul') run.wandLimit += soulLv;
    for (let i = 0; i < wandCount; i++) {
      for (const w of set.wands) {
        const def = this.content.wand[w.wand];
        if (def) run.wands.push(newWand(def, w.spells.map((id) => ({ id, lv: 0 }))));
      }
    }
    run.wandLimit = Math.max(run.wandLimit, run.wands.length);
    return run;
  }

  /** Rebuild derived stats after anything changed (relics, curses, potions, meta). */
  refreshStats() {
    const w = this.world;
    const run = this.run;
    const before = w.stats?.maxHp ?? 0;
    w.stats = computeStats(run, this.content, this.meta);
    w.meta.summonLimitStop = this.save.settings.summonLimitStop;
    const pack = 8 + this.meta.backpack + w.stats.backpackAdd;
    while (run.backpack.length < pack) run.backpack.push(null);
    while (!this.testMode && run.backpack.length > Math.max(1, pack) && run.backpack[run.backpack.length - 1] === null) run.backpack.pop();
    run.potionSlots = 1 + this.meta.potionSlots + (run.relics.find((r) => r.id === 'bird_beak_mask')?.lv ?? 0);
    for (const wand of run.wands) {
      const def = this.content.wand[wand.defId];
      const want = Math.max(1, def.slots + w.stats.globals.slotsAdd);
      while (wand.slots.length < want) wand.slots.push(null);
      while (wand.slots.length > want && wand.slots[wand.slots.length - 1] === null) wand.slots.pop();
    }
    w.player.invalidateWands();
    if (w.stats.maxHp > before && before > 0) w.player.hp = Math.min(w.stats.maxHp, w.player.hp + (w.stats.maxHp - before));
    w.player.hp = Math.min(w.player.hp, w.stats.maxHp);
    this.checkSets();
  }

  private makeWorld(run: RunState) {
    this.run = run;
    this.vis.clearAll();
    const stats = computeStats(run, this.content, this.meta);
    const world = new World(this.content, run, this.vis, this.audio, run.seed ^ 0x5bd1e995, stats);
    world.hooks = {
      onPlayerDeath: () => this.onDeath(),
      onBossDefeated: (e) => this.onBossDefeated(e),
      onDoor: (ev) => this.event(ev),
      toast: (m, c) => this.ui.toast(m, c === undefined ? 'info' : colorKind(c)),
    };
    this.world = world;
    world.player.hp = stats.maxHp;
    world.meta.summonLimitStop = this.save.settings.summonLimitStop;
  }

  // ------------------------------------------------------------------ camp

  enterCamp() {
    this.mode = 'camp';
    this.audio.setMusic('camp');
    this.end = null;
    this.endTimer = -1;
    this.discount = 1;
    const run = this.newRunState(this.save.set, this.save.difficulty);
    this.makeWorld(run);
    this.refreshStats();
    const w = this.world;
    const room = genRoom('camp', 'camp', 4242, []);
    w.loadRoom(room);
    this.roomSpawned = true;
    this.waves = 0;
    this.buildCamp();
    w.cleared = true;
    document.body.classList.remove('menu-open');
  }

  private buildCamp() {
    const w = this.world;
    const t = (x: number, y: number) => ({ x: x * TILE + 8, y: y * TILE + 8 });
    const npc = (id: string, x: number, y: number, verb: string, desc: string) => {
      const p = t(x, y);
      w.addProp(this.makeProp({
        ...p, r: 14, art: `npcs/${id}`, label: this.content.npcName(id),
        info: { title: this.content.npcName(id), lines: [desc], action: verb },
        use: () => (this.ui.openNpc(id), false),
      }));
    };
    npc('vivian', 3, 5, 'Talk', 'Talents: spend Crystals on lasting upgrades.');
    npc('gina', 6, 5, 'Talk', 'Bans spells from ever being offered.');
    npc('lyon', 13, 5, 'Talk', 'Research, paid in Old Blood.');
    npc('lilian', 16, 5, 'Talk', 'Activates spell and relic packs (Chaotic Cores).');
    if (this.save.metLeah) npc('leah', 10, 6, 'Talk', 'Swap starting sets.');
    npc('nimiao', 16, 9, 'Pet', 'A small, contented creature.');
    npc('trainer', 3, 9, 'Train', 'Spawns spells and wands to test on the dummy.');
    // portal
    const pp = t(10, 3);
    w.addProp(this.makeProp({
      ...pp, r: 16, art: 'tiles/portal', label: 'Portal',
      info: { title: 'The Portal', lines: ['Begin a run.'], action: 'Depart' },
      use: () => (this.ui.openDepart(), false),
    }));
    // training dummy
    const d = t(6, 9);
    const dummy = new Enemy(w, ENEMIES.dummy, d.x, d.y);
    dummy.passive = true;
    w.addEnemy(dummy);
    dummy.invuln = 0;
  }

  // ------------------------------------------------------------------ run flow

  startRun(setId: string, difficulty: number) {
    this.save.set = setId;
    this.save.difficulty = difficulty;
    this.save.stats.runs++;
    writeSave(this.save);
    this.rewardProps = [];
    this.mode = 'run';
    this.end = null;
    this.endTimer = -1;
    const run = this.newRunState(setId, difficulty);
    this.makeWorld(run);
    this.refreshStats();
    for (const wnd of run.wands) {
      if (!this.save.seenWands.includes(wnd.defId)) this.save.seenWands.push(wnd.defId);
      for (const s of wnd.slots) if (s) this.noteSpell(s.id);
    }
    this.enterRoom('start');
    this.ui.banner(this.chapterName(1), `${this.content.data ? 'Room 1' : ''}`);
  }

  chapterName(ch: number): string {
    return ['', 'The Whispering Wood', 'The Cinder Ward', 'The Hollow Between', 'The Sunken Deep', 'The Ancient Throne'][ch] ?? '';
  }

  private tileset(): string {
    if (this.run.chapter >= RUSH_CHAPTER) return 'throne';
    return CHAPTERS[Math.min(CHAPTERS.length, this.run.chapter) - 1] ?? 'forest';
  }

  enterRoom(kind: RoomKind) {
    const run = this.run;
    const w = this.world;
    this.discount = 1;
    this.waves = 0;
    this.roomSpawned = false;
    const nextRoom = run.room + 1;
    const hat = run.relics.some((r) => r.id === 'explorers_hat') ? 1 : 0;
    const doors = kind === 'boss' || kind === 'author' || kind === 'crimson' ? [] : doorChoices(w.rng, run.chapter, nextRoom, ROOMS_PER_CHAPTER, nextRoom < ROOMS_PER_CHAPTER - 2 ? hat : 0);
    // Merchant's Bauble: shops and forges always come with a bonus room
    if ((kind === 'shop' || kind === 'forge') && run.relics.some((r) => r.id === 'merchants_bauble')) doors.push(w.rng.pick(['spell', 'relic'] as RoomKind[]));
    const doorsFinal = kind === 'crimson' ? (['portal'] as RoomKind[]) : doors;
    const ts = kind === 'author' ? 'throne' : this.tileset();
    const room = genRoom(kind, ts, (run.seed + run.chapter * 977 + run.room * 131) | 0, doorsFinal);
    w.loadRoom(room);
    w.player.invuln = 1;
    w.player.hurtT = 0;
    this.refreshStats();
    // entry effects
    if (this.meta.entryHeal && kind !== 'camp') w.player.heal(this.meta.entryHeal);
    for (const r of run.relics) RELICS[r.id]?.onRoomEnter?.(w, r.lv);
    for (const c of [...run.curses]) {
      const def = this.content.curse[c];
      if (def) CURSES[c]?.onRoomEnter?.(w, def.params);
    }
    if (run.relics.some((r) => r.id === 'reaper')) this.autoCraft();
    if (run.curses.includes('grim_wager') && run.spellKills.__hitLevel !== undefined) {
      const p = this.content.curse.grim_wager?.params ?? [10, 5];
      if (run.spellKills.__hitLevel) run.perm.maxMp -= p[0];
      else run.maxHpBonus += p[1];
      run.spellKills.__hitLevel = 0;
    }
    this.refreshStats();
    w.player.invalidateWands();
    this.buildRoom(kind);
    this.audio.setMusic(kind === 'boss' || kind === 'author' ? 'boss' : (this.tileset() as Track));
    if (kind === 'boss' || kind === 'author') this.ui.banner('Boss', '');
    this.autoSaveTick();
  }

  private buildRoom(kind: RoomKind) {
    const w = this.world;
    const run = this.run;
    const c = w.room.center;
    switch (kind) {
      case 'start':
      case 'combat':
      case 'spell':
      case 'relic':
      case 'gold':
      case 'health':
      case 'elite':
        this.spawnFight(kind);
        break;
      case 'boss':
      case 'author': {
        const rush = kind === 'boss' && run.chapter >= RUSH_CHAPTER;
        const id = kind === 'author' ? 'author' : rush ? (run.room >= RUSH_ROOMS - 1 ? 'demon_lord' : w.rng.pick(RUSH_POOL)) : w.rng.pick(CHAPTER_BOSSES[run.chapter] ?? CHAPTER_BOSSES[1]);
        run.bossHit = false;
        const boss = spawnBoss(w, id, c.x, w.room.spawn.y - 8 * TILE, rush && id !== 'demon_lord' ? 1.5 : 1);
        this.ui.setBoss(boss, this.content.bossName(id));
        this.roomSpawned = true;
        this.waves = 0;
        break;
      }
      case 'shop':
        this.buildShop(true);
        this.finishRoom(false);
        break;
      case 'forge':
        w.addProp(this.makeProp({
          x: c.x, y: c.y - 8, r: 16, art: 'tiles/forge', label: 'Forge',
          info: { title: 'The Forge', lines: ['Fuse three identical spells into a stronger one, or reroll a spell.'], action: 'Use' },
          use: () => (this.ui.openForge(), false),
        }));
        this.finishRoom(false);
        break;
      case 'fountain':
        this.buildFountain();
        this.finishRoom(false);
        break;
      case 'crimson':
        this.buildCrimson();
        this.finishRoom(false);
        break;
      default:
        this.finishRoom(false);
    }
    this.roomSpawned = true;
  }

  // ------------------------------------------------------------------ fights

  private spawnPoint(): { x: number; y: number } {
    const w = this.world;
    const r = w.room;
    for (let i = 0; i < 60; i++) {
      const tx = w.rng.int(2, r.w - 3);
      const ty = w.rng.int(3, r.h - 3);
      const px = tx * TILE + 8;
      const py = ty * TILE + 8;
      const t = r.grid[ty * r.w + tx];
      if (t !== T_FLOOR) continue;
      if (dist2(px, py, w.player.x, w.player.y) < (6 * TILE) ** 2 && i < 50) continue;
      if (w.blocked(px, py, 5, false)) continue;
      return { x: px, y: py };
    }
    return { x: w.room.center.x, y: w.room.center.y };
  }

  private spawnFight(kind: RoomKind) {
    const w = this.world;
    const run = this.run;
    const roster = CHAPTER_ROSTER[Math.min(4, run.chapter)] ?? CHAPTER_ROSTER[1];
    const rm = kind === 'start' ? 0 : run.room;
    let count = Math.min(14, 2 + Math.floor(rm * 0.9) + run.chapter);
    if (kind === 'start') count = 2 + run.chapter;
    if (run.curses.includes('savage_proliferation') && w.rng.chance((this.content.curse.savage_proliferation?.params[0] ?? 20) / 100)) count *= 2;
    this.waves = (rm >= 3 ? 2 : 1) - 1;
    if (kind === 'elite') {
      const elites = ELITES[Math.min(4, run.chapter)] ?? ELITES[1];
      const n = run.chapter >= 3 ? 2 : 1;
      for (let i = 0; i < n; i++) {
        const p = this.spawnPoint();
        w.addEnemy(new Enemy(w, ENEMIES[w.rng.pick(elites)], p.x, p.y, { elite: true }));
      }
      count = Math.max(2, Math.floor(count / 2));
    }
    for (let i = 0; i < count; i++) {
      const p = this.spawnPoint();
      w.addEnemy(new Enemy(w, ENEMIES[w.rng.pick(roster)], p.x, p.y));
    }
    if (run.chapter === 2 && w.rng.chance(0.2)) {
      const p = this.spawnPoint();
      w.addEnemy(new Enemy(w, ENEMIES.armor_spider, p.x, p.y));
    }
    // decorative breakables: pots
    for (const pot of w.room.pots) this.addPot(pot.x, pot.y);
    if (this.meta.berries && run.chapter === 1 && w.rng.chance(0.3)) this.addBerry();
    if (this.meta.vault && run.chapter === 2 && w.rng.chance(0.25)) this.pendingVault = true;
    this.pendingVault = this.pendingVault && run.chapter === 2;
  }
  private pendingVault = false;

  private addPot(x: number, y: number) {
    const w = this.world;
    const view = this.vis ? this.spriteView('tiles/breakable_pot') : null;
    w.addProp({
      x, y, r: 6, label: 'Pot', use: null, view, solid: true, dead: false, hp: 1,
      onBreak: (ww) => {
        const r = ww.rng.next();
        if (r < 0.55) for (let i = 0; i < ww.rng.int(1, 3); i++) ww.spawnPickup('coin', x, y);
        else if (r < 0.62) ww.spawnPickup('heart', x, y, 4);
      },
    });
  }

  private addBerry() {
    const w = this.world;
    const p = this.spawnPoint();
    w.addProp(this.makeProp({
      x: p.x, y: p.y, r: 12, art: 'pickups/heart', label: 'Berry bush',
      info: { title: 'Berry bush', lines: ['Sweet and restoring.'], action: 'Eat' },
      use: (ww) => (ww.player.heal(12), true),
    }));
  }

  private checkClear() {
    const w = this.world;
    if (w.cleared || !this.roomSpawned || this.mode === 'camp') return;
    const kind = w.room.kind;
    if (kind === 'boss' || kind === 'author') return; // cleared on boss defeat
    if (w.enemiesAlive() > 0) return;
    if (this.waves > 0) {
      this.waves--;
      const roster = CHAPTER_ROSTER[Math.min(4, this.run.chapter)] ?? CHAPTER_ROSTER[1];
      const n = Math.max(2, Math.floor((2 + this.run.room * 0.6 + this.run.chapter) * 0.8));
      for (let i = 0; i < n; i++) {
        const p = this.spawnPoint();
        w.addEnemy(new Enemy(w, ENEMIES[w.rng.pick(roster)], p.x, p.y));
      }
      this.ui.toast('Another wave!', 'bad');
      return;
    }
    this.finishRoom(true);
  }

  /** Open doors and hand out the room's reward. `fought` = a fight just ended. */
  private finishRoom(fought: boolean) {
    const w = this.world;
    const run = this.run;
    const kind = w.room.kind;
    w.cleared = true;
    w.clearEnemyProjectiles();
    w.openDoors();
    if (fought) {
      this.ui.toast('Room cleared', 'good');
      run.spellKills.__fights = (run.spellKills.__fights ?? 0) + 1;
      if (run.relics.some((r) => r.id === 'bird_beak_mask') && run.spellKills.__fights % 2 === 0) w.spawnPickup('potion', w.player.x, w.player.y, 1, w.rng.pick(this.content.data.potions).id);
    }
    const c = w.room.center;
    const rng = w.rng;
    switch (kind) {
      case 'spell': {
        const choices = spellChoices(this.poolCtx());
        this.spawnSpellPedestals(choices, c.x, c.y);
        break;
      }
      case 'relic': {
        const n = w.stats.relicOptions;
        const list = relicChoices(this.poolCtx(), n);
        list.forEach((rel, i) => this.spawnRelicPedestal(rel.id, c.x + (i - (list.length - 1) / 2) * 34, c.y, 0));
        break;
      }
      case 'gold': {
        const n = Math.round((16 + run.chapter * 6) * (1 + this.meta.coinRoomPct / 100) * (run.relics.some((r) => r.id === 'summoning_wealth_bell') ? 1.3 : 1));
        for (let i = 0; i < n; i++) w.spawnPickup('coin', c.x, c.y);
        break;
      }
      case 'health': {
        const gain = Math.round((8 + this.meta.hpRoom) * (run.relics.some((r) => r.id === 'cardiotonic') ? 1.3 : 1));
        w.addProp(this.makeProp({
          x: c.x, y: c.y, r: 14, art: 'pickups/heart', label: 'Heart of vigor',
          info: { title: 'Heart of vigor', lines: [`+${gain} max HP and heals that much.`], action: 'Take' },
          use: (ww) => {
            this.run.maxHpBonus += gain;
            this.refreshStats();
            ww.player.heal(gain);
            return true;
          },
        }));
        break;
      }
      case 'elite': {
        const wand = rollWand(this.poolCtx(), run.chapter);
        this.spawnWandPedestal(wand.id, c.x, c.y, 0);
        for (let i = 0; i < 2; i++) w.spawnPickup('heart', c.x, c.y, 8);
        if (rng.chance(0.5)) w.spawnPickup('key', c.x, c.y);
        w.spawnPickup('blood', c.x, c.y, 1);
        if (rng.chance(0.5)) this.addCore(1);
        this.spawnChest(c.x + 40, c.y);
        break;
      }
      case 'combat':
      case 'start':
        if (rng.chance(0.28)) this.spawnChest(c.x, c.y);
        break;
      default:
        break;
    }
    if (this.pendingVault) {
      this.pendingVault = false;
      this.spawnChest(c.x - 40, c.y);
    }
    if (kind === 'combat' || kind === 'start' || kind === 'spell' || kind === 'relic' || kind === 'gold' || kind === 'health') {
      if (rng.chance(0.4)) w.spawnPickup('coin', c.x, c.y, 1);
    }
    if (run.relics.some((r) => r.id === 'silver_compass') && kind !== 'shop' && kind !== 'forge' && kind !== 'fountain' && kind !== 'crimson' && kind !== 'boss') this.spawnChest(c.x - 70, c.y + 20);
    this.addDiceReroll(kind, c.x, c.y);
  }

  private rewardProps: Prop[] = [];

  /** Hexagonal / Octagonal Die: rerolls for relic / spell offers. */
  private addDiceReroll(kind: RoomKind, cx: number, cy: number) {
    const run = this.run;
    const die = kind === 'relic' ? run.relics.find((r) => r.id === 'hexagonal_die') : kind === 'spell' ? run.relics.find((r) => r.id === 'octagonal_die') : null;
    if (!die) return;
    let left = die.lv;
    const w = this.world;
    const prop: Prop = this.makeProp({
      x: cx, y: cy + 46, r: 12, art: 'pickups/potion_blue', label: 'Reroll', info: { title: 'Reroll the offer', lines: [`${left} reroll(s) left`], action: 'Reroll' },
      use: () => {
        for (const p of this.rewardProps) p.dead = true;
        relicGroup.delete(w);
        if (kind === 'spell') this.spawnSpellPedestals(spellChoices(this.poolCtx()), cx, cy);
        else {
          const list = relicChoices(this.poolCtx(), w.stats.relicOptions);
          list.forEach((rel, i) => this.spawnRelicPedestal(rel.id, cx + (i - (list.length - 1) / 2) * 34, cy, 0));
        }
        left--;
        if (prop.info) prop.info = { ...prop.info, lines: [`${left} reroll(s) left`] };
        if (left <= 0) prop.dead = true;
        return false;
      },
    });
    w.addProp(prop);
  }

  addCore(n: number) {
    this.run.cores += n;
    this.ui.toast(`+${n} Chaotic Core`, 'purple');
  }

  // ------------------------------------------------------------------ props

  private spriteView(base: string): AnimSprite {
    return this.vis.sprite(base);
  }

  makeProp(o: {
    x: number; y: number; r: number; art?: string; icon?: string; label: string; info?: PropInfo;
    use: Prop['use']; solid?: boolean; pedestal?: boolean; price?: number;
  }): Prop {
    let view: Container | null = null;
    if (this.vis) {
      const root = new Container();
      if (o.pedestal) {
        const ped = this.vis.staticSprite('tiles/pedestal.png');
        ped.y = 4;
        root.addChild(ped);
      }
      if (o.art) {
        const s = this.art.hasAnim(o.art) ? this.vis.sprite(o.art) : this.vis.staticSprite(`${o.art}.png`);
        root.addChild(s);
        const animated = s;
        (root as Container & { anim?: AnimSprite }).anim = animated instanceof AnimSprite ? animated : undefined;
      }
      if (o.icon) {
        const s = this.vis.staticSprite(o.icon);
        s.y = o.pedestal ? -6 : 0;
        root.addChild(s);
      }
      root.position.set(o.x, o.y);
      root.zIndex = o.y;
      view = root;
    }
    const prop: Prop = {
      x: o.x, y: o.y, r: o.r, label: o.label, use: o.use, view, solid: o.solid ?? false, dead: false, info: o.info, price: o.price,
      tick: (_w, dt) => {
        const a = (view as (Container & { anim?: AnimSprite }) | null)?.anim;
        a?.step(dt);
      },
    };
    return prop;
  }

  private spawnSpellPedestals(choices: SpellInst[], cx: number, cy: number) {
    const w = this.world;
    const props: Prop[] = [];
    this.rewardProps = props;
    choices.forEach((s, i) => {
      const def = this.content.spell[s.id];
      const p = this.makeProp({
        x: cx + (i - (choices.length - 1) / 2) * 34, y: cy, r: 13, icon: def.icon, pedestal: true, label: def.name,
        info: this.spellInfo(s, 'Take'),
        use: () => {
          if (!this.giveSpell(s)) return false;
          for (const o of props) if (o !== p) o.dead = true;
          return true;
        },
      });
      props.push(p);
      w.addProp(p);
    });
  }

  private spawnRelicPedestal(id: string, x: number, y: number, hpCost: number, group?: Prop[]) {
    const w = this.world;
    const def = this.content.relic[id];
    const have = this.run.relics.find((r) => r.id === id);
    const nextLv = (have?.lv ?? 0) + 1;
    const p = this.makeProp({
      x, y, r: 13, icon: def.icon, pedestal: true, label: def.name,
      info: {
        title: def.name + (have ? ` (Lv ${nextLv})` : ''), lines: [def.desc[Math.min(def.desc.length, nextLv) - 1] ?? def.desc[0], hpCost ? `Costs ${hpCost} max HP` : ''],
        icon: def.icon, rarity: def.rarity, action: 'Take',
      },
      use: () => {
        if (hpCost) {
          if (w.stats.maxHp - hpCost < 10) {
            this.ui.toast('Not enough max HP', 'bad');
            return false;
          }
          this.run.maxHpBonus -= hpCost;
        }
        this.giveRelic(id);
        for (const o of group ?? relicGroup.get(w) ?? []) if (o !== p) o.dead = true;
        return true;
      },
    });
    if (!group) {
      let g = relicGroup.get(w);
      if (!g || !g.length || g.every((x) => x.dead)) relicGroup.set(w, (g = []));
      g.push(p);
      this.rewardProps = g;
    } else group.push(p);
    w.addProp(p);
    return p;
  }

  private spawnWandPedestal(id: string, x: number, y: number, price: number, onBuy?: () => boolean) {
    const w = this.world;
    const def = this.content.wand[id];
    const p = this.makeProp({
      x, y, r: 13, icon: def.sprite, pedestal: true, label: def.name, price,
      info: { title: def.name, lines: [def.desc, `${def.mp} MP · ${def.regen} regen/s · ${def.slots} slots`], icon: def.sprite, price: price || undefined, action: price ? 'Buy' : 'Take' },
      use: () => {
        if (onBuy && !onBuy()) return false;
        return this.giveWand(id);
      },
    });
    w.addProp(p);
    return p;
  }

  spellInfo(s: SpellInst, action: string, price?: number): PropInfo {
    const def = this.content.spell[s.id];
    return {
      title: `${def.name}${['', ' +', ' ++'][s.lv]}`,
      lines: [def.desc[s.lv] ?? def.desc[0], `${def.type} · ${def.rarity}`],
      icon: def.icon, rarity: def.rarity, price, action,
    };
  }

  private buildFountain() {
    const w = this.world;
    const c = w.room.center;
    let used = false;
    w.addProp(this.makeProp({
      x: c.x, y: c.y, r: 16, art: 'tiles/fountain', label: 'Fountain',
      info: { title: 'Healing fountain', lines: [`Restores ${this.meta.springPct}% of your HP.`], action: 'Drink' },
      use: (ww) => {
        if (used) return false;
        used = true;
        ww.player.heal(Math.round(ww.stats.maxHp * (this.meta.springPct / 100)));
        return false;
      },
    }));
  }

  private buildCrimson() {
    const w = this.world;
    const c = w.room.center;
    const list = crimsonChoices(this.poolCtx());
    const group: Prop[] = [];
    list.forEach((o, i) => this.spawnRelicPedestal(o.relic.id, c.x + (i - (list.length - 1) / 2) * 36, c.y, o.cost, group));
    this.ui.banner('Crimson Room', 'Epic relics, paid in max HP');
  }

  // ---- shop

  private buildShop(fresh: boolean) {
    const w = this.world;
    const c = w.room.center;
    if (fresh) {
      this.shopStockItems = shopStock(this.poolCtx());
      this.shopRefills = this.meta.refills;
    }
    this.renderShop(c.x, c.y);
  }
  private shopProps: Prop[] = [];

  private renderShop(cx: number, cy: number) {
    const w = this.world;
    for (const p of this.shopProps) p.dead = true;
    this.shopProps = [];
    const items = this.shopStockItems;
    const black = this.run.relics.some((r) => r.id === 'black_mark');
    const freeIdx = black ? 0 : -1;
    const cols = Math.min(items.length, 6);
    items.forEach((it, i) => {
      const x = cx + ((i % cols) - (cols - 1) / 2) * 34;
      const y = cy - 12 + Math.floor(i / cols) * 40;
      const price = Math.max(0, Math.round(it.price * this.discount * (i === freeIdx ? 0 : 1)));
      const buy = (): boolean => {
        if (this.run.coins < price) {
          this.ui.toast('Not enough coins', 'bad');
          this.world.sfx('deny');
          return false;
        }
        let ok = true;
        if (it.kind === 'spell') ok = this.giveSpell(it.spell);
        else if (it.kind === 'wand') ok = this.giveWand(it.wand);
        else if (it.kind === 'key') this.run.keys++;
        else if (it.kind === 'heart') {
          if (this.world.player.hp >= this.world.stats.maxHp) {
            this.ui.toast('Already healthy', 'info');
            return false;
          }
          this.world.player.heal(30);
        } else this.run.shield += 15;
        if (!ok) return false;
        this.run.coins -= price;
        this.world.sfx('coin');
        return true;
      };
      let prop: Prop;
      if (it.kind === 'spell') {
        const def = this.content.spell[it.spell.id];
        prop = this.makeProp({ x, y, r: 13, icon: def.icon, pedestal: true, label: def.name, price, info: this.spellInfo(it.spell, 'Buy', price), use: buy });
      } else if (it.kind === 'wand') {
        const def = this.content.wand[it.wand];
        prop = this.makeProp({
          x, y, r: 13, icon: def.sprite, pedestal: true, label: def.name, price,
          info: { title: def.name, lines: [def.desc, `${def.mp} MP · ${def.regen} regen/s · ${def.slots} slots`], icon: def.sprite, price, action: 'Buy' }, use: buy,
        });
      } else {
        const name = it.kind === 'key' ? 'Key' : it.kind === 'heart' ? 'Healing draught' : 'Ward cell';
        const art = it.kind === 'key' ? 'pickups/key' : it.kind === 'heart' ? 'pickups/heart' : 'pickups/shield_cell';
        const line = it.kind === 'key' ? 'Opens a locked chest.' : it.kind === 'heart' ? 'Heals 30 HP.' : 'Grants a 15 point shield.';
        prop = this.makeProp({ x, y, r: 13, art, pedestal: true, label: name, price, info: { title: name, lines: [line], price, action: 'Buy' }, use: buy });
      }
      const inner = prop.use;
      prop.use = (ww) => {
        const ok = inner?.(ww) ?? false;
        if (ok) {
          this.shopStockItems.splice(i, 1);
          this.renderShop(cx, cy);
        }
        return false;
      };
      this.shopProps.push(prop);
      w.addProp(prop);
    });
    if (this.shopRefills > 0) {
      const p = this.makeProp({
        x: cx, y: cy + 46, r: 14, art: 'tiles/shop_mat', label: 'Restock',
        info: { title: 'Restock', lines: [`Re-roll the wares (${this.shopRefills} left).`], action: 'Restock' },
        use: () => {
          this.shopRefills--;
          this.shopStockItems = shopStock(this.poolCtx());
          this.renderShop(cx, cy);
          return false;
        },
      });
      this.shopProps.push(p);
      w.addProp(p);
    }
  }

  // ---- chests

  private spawnChest(x: number, y: number, forced?: 'locked' | 'spike' | 'cursed') {
    const w = this.world;
    const kind = forced ?? (w.rng.chance(0.6) ? 'locked' : w.rng.chance(0.6) ? 'spike' : 'cursed');
    const art = `pickups/chest_${kind}`;
    const info: PropInfo =
      kind === 'locked'
        ? { title: 'Locked chest', lines: [`Costs ${w.stats.keyCost || 0} key(s).`], action: 'Unlock' }
        : kind === 'spike'
          ? { title: 'Spiked chest', lines: ['Costs 10 HP. It can kill you.'], action: 'Open' }
          : { title: 'Cursed chest', lines: ['Accept a curse for double the loot.'], action: 'Open' };
    const p = this.makeProp({
      x, y, r: 12, art, label: info.title, info,
      use: (ww) => this.openChest(kind, ww, false, p),
    });
    w.addProp(p);
  }

  private openChest(kind: 'locked' | 'spike' | 'cursed', w: World, free: boolean, prop: Prop): boolean {
    const run = this.run;
    if (!free) {
      if (kind === 'locked') {
        const cost = w.stats.keyCost;
        if (run.keys < cost) {
          this.ui.toast(`Needs ${cost} key(s)`, 'bad');
          return false;
        }
        run.keys -= cost;
      } else if (kind === 'spike') {
        w.hurtPlayer(10, { trap: true, ignoreInvuln: true });
        if (w.player.dead) return true;
      } else this.addRandomCurse();
    }
    this.chestLoot(w, prop.x, prop.y, kind === 'cursed' ? 2 : 1);
    if (run.relics.some((r) => r.id === 'endless_chest') && w.rng.chance(0.3)) this.spawnChest(prop.x + 24, prop.y, 'locked');
    prop.dead = true;
    w.vis?.oneShot('effects/level_up', prop.x, prop.y);
    return true;
  }

  private chestLoot(w: World, x: number, y: number, mult: number) {
    const rng = w.rng;
    for (let k = 0; k < mult; k++) {
      const r = rng.next();
      if (r < 0.5) for (let i = 0; i < rng.int(8, 16) * mult; i++) w.spawnPickup('coin', x, y);
      else if (r < 0.7) w.spawnPickup('potion', x, y, 1, rng.pick(this.content.data.potions).id);
      else if (r < 0.85) {
        const s = spellChoices(this.poolCtx())[0];
        if (s) this.giveSpell(s);
      } else if (r < 0.95) {
        const rel = relicChoices(this.poolCtx(), 1)[0];
        if (rel) this.giveRelic(rel.id);
      } else w.spawnPickup('blood', x, y, 1);
    }
    w.spawnPickup('crystal', x, y, 3);
  }

  addRandomCurse() {
    const ids = this.content.data.curses.filter((c) => !this.run.curses.includes(c.id) && c.id !== 'vanished' && c.id !== 'relentless_snail').map((c) => c.id);
    const id = this.world.rng.pick(ids);
    this.giveCurse(id);
  }

  giveCurse(id: string) {
    const def = this.content.curse[id];
    if (!def) return;
    this.run.curses.push(id);
    this.ui.toast(`Cursed: ${def.name}`, 'purple');
    CURSES[id]?.onGain?.(this.world, def.params);
    this.refreshStats();
    if (this.run.curses.length >= 15) this.unlock('kingdom');
  }

  // ------------------------------------------------------------------ inventory operations

  noteSpell(id: string) {
    if (!this.save.seenSpells.includes(id)) this.save.seenSpells.push(id);
  }

  giveSpell(s: SpellInst): boolean {
    const run = this.run;
    let slot = run.backpack.findIndex((x) => !x);
    if (slot < 0 && this.testMode) slot = run.backpack.push(null) - 1;
    if (slot < 0) {
      this.ui.toast('Backpack is full', 'bad');
      this.world.sfx('deny');
      return false;
    }
    run.backpack[slot] = { ...s };
    const def = this.content.spell[s.id];
    this.noteSpell(s.id);
    this.ui.toast(`${def.name}${['', ' +', ' ++'][s.lv]} added`, 'gold');
    this.world.sfx('pickup');
    if (def.rarity === 'Epic') this.unlock('epic');
    if (def.rarity === 'Unique') this.unlock('special');
    if (s.lv >= 2) this.unlock('twostar');
    return true;
  }

  giveWand(id: string): boolean {
    const run = this.run;
    const def = this.content.wand[id];
    if (run.wands.length >= run.wandLimit + this.world.stats.wandLimitAdd) {
      // no free hand: the new wand replaces the one you are holding; its spells go back to the backpack
      const old = run.wands[run.active];
      const oldName = this.content.wand[old.defId].name;
      let lost = 0;
      for (const s of [...old.slots, ...old.post]) {
        if (!s) continue;
        const free = run.backpack.findIndex((x) => !x);
        if (free >= 0) run.backpack[free] = s;
        else lost++;
      }
      if (lost) this.ui.toast(`${lost} spell(s) lost: backpack full`, 'bad');
      run.wands[run.active] = newWand(def);
      this.ui.toast(`Swapped ${oldName} for ${def.name}`, 'gold');
      if (!this.save.seenWands.includes(id)) this.save.seenWands.push(id);
      this.refreshStats();
      this.world.player.updateWandView();
      this.world.sfx('pickup');
      return true;
    }
    run.wands.push(newWand(def));
    if (!this.save.seenWands.includes(id)) this.save.seenWands.push(id);
    this.refreshStats();
    this.ui.toast(`${def.name} acquired`, 'gold');
    this.world.sfx('pickup');
    return true;
  }

  giveRelic(id: string) {
    const run = this.run;
    const def = this.content.relic[id];
    const have = run.relics.find((r) => r.id === id);
    if (have) have.lv = Math.min(def.maxLevel, have.lv + 1);
    else run.relics.push({ id, lv: 1 });
    const lv = (have ?? run.relics[run.relics.length - 1]).lv;
    RELICS[id]?.onGain?.(this.world, lv);
    this.ui.toast(`${def.name}${lv > 1 ? ` Lv ${lv}` : ''}`, 'gold');
    this.world.sfx('levelUp');
    this.refreshStats();
    this.world.vis?.oneShot('effects/level_up', this.world.player.x, this.world.player.y - 8);
  }

  private autoCraft() {
    const run = this.run;
    let n = 0;
    for (let guard = 0; guard < 20; guard++) {
      const m = mergeCandidates(run.backpack, this.content)[0];
      if (!m) break;
      applyMerge(run.backpack, m);
      n++;
    }
    if (n) this.ui.toast(`Auto-fused ${n} spell${n > 1 ? 's' : ''}`, 'good');
  }

  spellPriceOf(s: SpellInst) {
    return spellPrice(this.content.spell[s.id], s.lv, this.run.chapter);
  }

  // ------------------------------------------------------------------ events from relics / potions

  private event(ev: string) {
    const w = this.world;
    const run = this.run;
    const [k, arg] = ev.split(':');
    switch (k) {
      case 'stats':
        this.refreshStats();
        break;
      case 'drop':
        if (arg === 'enchanting_coin') this.giveSpell({ id: 'enchanting_coin', lv: 0 });
        break;
      case 'relic':
        if (arg === 'upgrade') this.upgradeRandomRelic();
        else if (arg === 'reset') this.ui.chooseRelicReset();
        break;
      case 'reforge':
        this.reforgeBackpack(Number(arg));
        break;
      case 'refresh':
        if (w.room.kind === 'shop') {
          this.shopStockItems = shopStock(this.poolCtx());
          this.renderShop(w.room.center.x, w.room.center.y);
        }
        break;
      case 'unlockAll':
        for (const p of [...w.props]) if (p.label.endsWith('chest')) p.use?.(w);
        break;
      case 'discount':
        this.discount = 0.5;
        if (w.room.kind === 'shop') this.renderShop(w.room.center.x, w.room.center.y);
        break;
      case 'chest':
        this.spawnChest(w.player.x + 20, w.player.y, 'locked');
        break;
      default:
        break;
    }
    void run;
  }

  private upgradeRandomRelic() {
    const run = this.run;
    const list = run.relics.filter((r) => r.lv < this.content.relic[r.id].maxLevel);
    if (list.length) this.giveRelic(this.world.rng.pick(list).id);
    else {
      const rel = relicChoices(this.poolCtx(), 1)[0];
      if (rel) this.giveRelic(rel.id);
    }
  }

  resetRelic(id: string) {
    const run = this.run;
    const def = this.content.relic[id];
    run.relics = run.relics.filter((r) => r.id !== id);
    const pool = this.content.data.relics.filter((r) => r.rarity === def.rarity && !r.setOnly && r.id !== id && !run.relics.some((x) => x.id === r.id));
    if (pool.length) this.giveRelic(this.world.rng.pick(pool).id);
    this.refreshStats();
  }

  reforgeBackpack(n: number) {
    const run = this.run;
    let done = 0;
    for (let i = 0; i < run.backpack.length && done < n; i++) {
      const s = run.backpack[i];
      if (!s) continue;
      const def = this.content.spell[s.id];
      if (def.upgrade === 'none') continue;
      const pool = this.content.data.spells.filter((x) => x.rarity === def.rarity && x.id !== s.id && x.shop === def.shop && x.upgrade === 'craft');
      if (!pool.length) continue;
      run.backpack[i] = { id: this.world.rng.pick(pool).id, lv: s.lv };
      done++;
    }
    if (done) this.ui.toast(`Reforged ${done} spell${done > 1 ? 's' : ''}`, 'purple');
  }

  usePotion(i: number) {
    if (this.mode === 'ended' || this.world.player.dead) return;
    drinkPotion(this.world, i);
  }

  // ------------------------------------------------------------------ death / victory

  private onDeath() {
    if (this.mode === 'camp') {
      // dying in camp (own spells, or a Test Mode mob): respawn
      this.world.after(1.2, () => (this.respawnCamp = true));
      return;
    }
    this.deathCause = this.world.player.hp <= 0 && this.world.dmgLog.length ? 'Slain' : 'Slain';
    if (this.run.spellKills.__diedIndisc) this.unlock('friendly');
    this.endTimer = 1.8;
    this.run.finished = true;
  }

  private onBossDefeated(e: Enemy) {
    const run = this.run;
    const w = this.world;
    if (this.testMode?.spawned.has(e)) {
      // a panel-spawned boss: no rewards, doors or run end
      w.clearEnemyProjectiles();
      w.vis?.flash(0xffffff, 0.2);
      return;
    }
    for (const m of w.enemies) if (m.minion && !m.dead) w.killEnemy(m);
    w.clearEnemyProjectiles();
    this.addCore(1);
    w.vis?.flash(0xffffff, 0.3);
    w.slowmo = 0.3;
    w.after(0.6, () => (w.slowmo = 1));
    if (e.def.id === 'boss_author') {
      this.unlock('author');
      this.finishRun(true);
      return;
    }
    if (e.def.id === 'boss_demon_lord') {
      this.finishRun(true);
      return;
    }
    if (run.chapter === 1) this.save.metLeah = true;
    this.checkSets();
    const final = run.chapter >= lastChapter(run.difficulty);
    const flawless = !run.bossHit;
    const c = w.room.center;
    this.finishRoom(true);
    // extra doors: crimson if flawless (or Blood Key on the final boss), portal onward
    const doors = w.room.doors;
    const offs = [] as RoomKind[];
    const blood = final && run.relics.some((r) => r.id === 'blood_key');
    if ((flawless || blood) && !final) offs.push('crimson');
    if (flawless && final) offs.push('crimson');
    offs.push('portal');
    if (run.chapter === FINAL_CHAPTER) offs.push('author');
    const n = offs.length;
    offs.forEach((k, i) => {
      const tx = Math.round(((i + 1) * w.room.w) / (n + 1));
      const d = { tx, ty: 1, kind: k, open: true };
      doors.push(d);
      w.drawDoor(d);
    });
    if (flawless) this.ui.toast('Flawless! A crimson door opens.', 'purple');
    void c;
  }

  finishRun(won: boolean) {
    const run = this.run;
    const save = this.save;
    if (this.mode === 'ended') return;
    this.mode = 'ended';
    run.finished = true;
    this.bank();
    const before = new Set(save.sets);
    const achBefore = new Set(save.achievements);
    if (won) {
      save.stats.wins++;
      this.unlock(DIFFICULTY_ACH[run.difficulty] ?? 'normal');
      save.maxDifficulty = Math.max(save.maxDifficulty, Math.min(5, run.difficulty + 1));
    }
    this.checkSets(true);
    writeSave(save);
    this.end = {
      won, chapter: run.chapter, room: run.room + 1, kills: run.kills, time: run.time, crystals: run.crystals, blood: run.blood, cores: run.cores,
      newSets: save.sets.filter((s) => !before.has(s)), newAchievements: save.achievements.filter((a) => !achBefore.has(a)), cause: this.deathCause,
    };
    this.ui.openEnd(this.end);
  }

  /** Add this run's crystals / blood / cores / kills to the save (once). */
  private bank() {
    const run = this.run;
    const save = this.save;
    if (run.banked) return;
    run.banked = true;
    save.crystals += run.crystals;
    save.blood += run.blood;
    save.cores += run.cores;
    save.stats.kills += run.kills;
    save.stats.evilSwordKills += run.spellKills.evil_slayer_sword ?? 0;
    save.stats.bestChapter = Math.max(save.stats.bestChapter, run.chapter);
    writeSave(save);
  }

  // ------------------------------------------------------------------ meta checks

  unlock(id: string) {
    if (this.save.achievements.includes(id)) return;
    this.save.achievements.push(id);
    const a = ACHIEVEMENTS.find((x) => x.id === id);
    if (a && id !== 'launch') this.ui.toast(`Achievement: ${a.name}`, 'gold');
    writeSave(this.save);
  }

  /** Unlock sets whose condition is met (Leah). */
  checkSets(final = false) {
    const save = this.save;
    const run = this.run;
    const add = (id: string) => {
      if (save.sets.includes(id)) return;
      save.sets.push(id);
      this.ui.toast(`Set unlocked: ${this.content.names.sets[id] ?? id}`, 'gold');
    };
    if (save.metLeah) add('magician');
    let spirit = 0;
    if (this.world) for (const wand of run.wands) if (this.world.player.statsOf(wand).spirit >= 0) spirit++;
    if (spirit >= 3) add('soul');
    if (save.stats.evilSwordKills + (run.spellKills.evil_slayer_sword ?? 0) >= 300) add('melee');
    if (run.spellKills.__judgeBoss) add('bian');
    if (run.venomPeak >= 1500) add('reaper');
    if (save.sets.length >= 6) add('bing');
    void final;
  }

  onChapterCleared(chapter: number, difficulty: number) {
    if (chapter >= 2 && !this.save.sets.includes('summoner')) {
      this.save.sets.push('summoner');
      this.ui.toast(`Set unlocked: ${this.content.names.sets.summoner}`, 'gold');
    }
    if (chapter >= 3 && difficulty >= 2 && !this.save.sets.includes('dash')) {
      this.save.sets.push('dash');
      this.ui.toast(`Set unlocked: ${this.content.names.sets.dash}`, 'gold');
    }
  }

  upgradeSoul(): boolean {
    const lv = this.save.setLevels.soul ?? 1;
    if (lv >= 3) return false;
    const cost = SOUL_UPGRADE_COST[lv - 1];
    if (this.save.crystals < cost) return false;
    this.save.crystals -= cost;
    this.save.setLevels.soul = lv + 1;
    writeSave(this.save);
    return true;
  }

  persist() {
    writeSave(this.save);
    this.meta = bonuses(this.save);
    if (this.mode === 'camp') this.refreshStats();
  }

  private autoSaveTick() {
    if (this.world.time - this.lastAutoSave > 20) {
      this.lastAutoSave = this.world.time;
      writeSave(this.save);
    }
  }

  // ------------------------------------------------------------------ test mode (hidden cheat code)

  /**
   * ON: snapshot the save and lock persistence. OFF: put the snapshot back and drop the cheated run (back to a fresh camp),
   * so nothing earned or unlocked under Test Mode can reach the real progress.
   */
  toggleTestMode() {
    if (!this.testMode) {
      this.testMode = new TestSession(this.save);
      setSaveLocked(true);
      this.ui.setTestBadge(true);
      this.ui.toast('Test Mode ON: progress is not saved. F2 opens the panel.', 'purple');
      return;
    }
    this.testMode.restore(this.save);
    this.testMode = null;
    setSaveLocked(false);
    this.meta = bonuses(this.save);
    this.audio.muted = this.save.settings.muted;
    this.ui.setTestBadge(false);
    if (this.ui.onTitle) this.refreshStats();
    else {
      this.ui.closeAll();
      this.enterCamp();
    }
    this.ui.toast('Test Mode OFF: your real progress is back.', 'purple');
  }

  // ------------------------------------------------------------------ frame

  private frame(dt: number) {
    this.world.renderFrame(this.clock.advance(dt, (step) => this.step(step)));
    this.ui.frame();
    const i = this.input;
    this.crosshair.visible = !this.ui.modalOpen && !this.ui.onTitle;
    this.crosshair.position.set(i.mx, i.my);
    this.crosshair.scale.set(Math.max(2, this.vis.root.scale.x - 1));
    const r = this.vis.root;
    this.bg.tilePosition.set(r.x % (TILE * r.scale.x), r.y % (TILE * r.scale.x));
  }

  private step(dt: number) {
    if (this.respawnCamp) {
      this.respawnCamp = false;
      this.enterCamp();
    }
    const w = this.world;
    const i = this.input;
    i.poll();
    const pl = w.player;
    if (this.testMode && !this.ui.onTitle && i.hit('F2')) this.ui.toggleTestPanel();
    const modal = this.ui.modalOpen;
    if (this.ui.onTitle) {
      w.update(dt);
      return;
    }
    if (!modal) {
      if (i.hit('Tab')) {
        this.ui.openInventory();
        return;
      }
      if (i.hit('Escape')) {
        this.ui.openPause();
        return;
      }
    } else if (i.hit('Escape') || (i.hit('Tab') && this.ui.canCloseWithTab())) this.ui.closeTop();
    w.paused = modal;
    if (modal) return;

    // intent
    const ax = i.moveAxis();
    const root = this.vis.root;
    const s = root.scale.x;
    pl.intent.mx = ax.x;
    pl.intent.my = ax.y;
    if (i.gamepad && (i.gamepad.rx || i.gamepad.ry)) {
      pl.intent.aimX = pl.x + i.gamepad.rx * 60;
      pl.intent.aimY = pl.y - 6 + i.gamepad.ry * 60;
    } else {
      pl.intent.aimX = (i.mx - root.x) / s;
      pl.intent.aimY = (i.my - root.y) / s;
    }
    pl.intent.fire = (i.mouseDown || !!i.gamepad?.fire) && !pl.dead;
    pl.intent.skill = i.hit('Space');
    if (i.hit('KeyQ') || i.wheel !== 0) pl.swapWand((this.run.active + (i.wheel < 0 ? -1 : 1) + this.run.wands.length) % Math.max(1, this.run.wands.length));
    for (let k = 0; k < 4; k++) if (i.hit(`Digit${k + 1}`)) this.usePotion(k);
    if (i.hit('KeyR')) this.ui.toast(`DPS ${Math.round(w.dps())}`, 'info');

    this.testMode?.tick(this);
    w.update(dt);
    this.checkInteractions();
    this.checkDoors();
    this.checkClear();
    this.trackStats();
    if (this.endTimer >= 0) {
      this.endTimer -= dt;
      if (this.endTimer < 0) this.finishRun(false);
    }
  }

  private trackStats() {
    const w = this.world;
    const run = this.run;
    if (run.coins >= 1000) this.unlock('coins');
    if (this.mode === 'camp') {
      const dps = w.dps(1);
      run.maxDps = Math.max(run.maxDps, dps);
      if (dps >= 100000) this.unlock('dps');
    }
  }

  private checkInteractions() {
    const w = this.world;
    const pl = w.player;
    let best: Prop | null = null;
    let bd = Infinity;
    for (const p of w.props) {
      if (p.dead || !p.info) continue;
      const d = dist2(p.x, p.y, pl.x, pl.y);
      if (d < (p.r + 22) ** 2 && d < bd) {
        best = p;
        bd = d;
      }
    }
    this.nearProp = best;
    this.ui.setPrompt(best?.info ?? null);
    if (best && this.input.hit('KeyE')) {
      const used = best.use?.(w) ?? false;
      if (used) {
        best.dead = true;
        this.ui.setPrompt(null);
      }
    }
  }

  private checkDoors() {
    const w = this.world;
    if (!w.cleared || this.mode === 'camp') return;
    const pl = w.player;
    for (const d of w.room.doors) {
      if (!d.open) continue;
      const dx = d.tx * TILE + 8;
      if (Math.abs(pl.x - dx) < 12 && pl.y < 2 * TILE + 10) {
        this.takeDoor(d.kind);
        return;
      }
    }
  }

  private takeDoor(kind: RoomKind) {
    const run = this.run;
    const w = this.world;
    if (run.curses.includes('grim_wager')) run.spellKills.__hitLevel = run.bossHit || w.player.noHitT < 30 ? 1 : 0;
    if (run.curses.includes('thorned_entry') || run.curses.includes('tattered_pouch')) void 0;
    w.sfx('door');
    if (kind === 'portal') {
      this.onChapterCleared(run.chapter, run.difficulty);
      if (run.chapter >= RUSH_CHAPTER) {
        // boss rush: next rematch (or the Demon Lord); a breather heals a bit
        run.room++;
        w.player.heal(Math.round(w.stats.maxHp * 0.4));
        this.enterRoom('boss');
        this.ui.banner(run.room >= RUSH_ROOMS - 1 ? 'The Demon Lord' : 'Boss rush', `${run.room + 1}/${RUSH_ROOMS}`);
        return;
      }
      if (run.chapter >= lastChapter(run.difficulty)) {
        this.finishRun(true);
        return;
      }
      run.chapter++;
      run.room = 0;
      this.enterRoom(run.chapter >= RUSH_CHAPTER ? 'boss' : 'start');
      this.ui.banner(this.chapterName(run.chapter), run.chapter >= RUSH_CHAPTER ? 'No time to build. Only bosses remain.' : '');
      return;
    }
    if (kind === 'author') {
      run.chapter = 5;
      run.room = 0;
      this.enterRoom('author');
      this.ui.banner(this.chapterName(5), 'You were not meant to be here.');
      return;
    }
    if (kind === 'crimson') {
      this.enterRoom('crimson');
      return;
    }
    run.room++;
    this.enterRoom(kind);
    this.ui.banner('', `${this.chapterName(run.chapter)} · ${run.room + 1}/${ROOMS_PER_CHAPTER}`);
  }

  get nearby(): Prop | null {
    return this.nearProp;
  }
}

function colorKind(c: number): 'info' | 'good' | 'bad' | 'gold' | 'purple' {
  if (c === 0xfacc15 || c === 0xffe869) return 'gold';
  if (c === 0x4ade80) return 'good';
  if (c === 0xa78bfa || c === 0xa855f7 || c === 0xdc2626) return c === 0xdc2626 ? 'bad' : 'purple';
  return 'info';
}

const relicGroup = new WeakMap<World, Prop[]>();

export { T_PIT, T_SPIKES, Graphics };
export type { Room };
