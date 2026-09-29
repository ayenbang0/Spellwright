import type { ContentData, CurseDef, PotionDef, RelicDef, SpellDef, WandDef } from '../data/types';

export interface Names {
  bosses: Record<string, string>;
  npcs: Record<string, string>;
  sets: Record<string, string>;
}

/** Runtime content from `public/data/*.json` (built by scripts/build-data.ts), indexed by id. */
export class Content {
  readonly spell: Record<string, SpellDef> = {};
  readonly wand: Record<string, WandDef> = {};
  readonly relic: Record<string, RelicDef> = {};
  readonly curse: Record<string, CurseDef> = {};
  readonly potion: Record<string, PotionDef> = {};

  constructor(readonly data: ContentData, readonly names: Names) {
    for (const s of data.spells) this.spell[s.id] = s;
    for (const w of data.wands) this.wand[w.id] = w;
    for (const r of data.relics) this.relic[r.id] = r;
    for (const c of data.curses) this.curse[c.id] = c;
    for (const p of data.potions) this.potion[p.id] = p;
  }

  static async load(): Promise<Content> {
    const base = `${import.meta.env.BASE_URL}data/`;
    const get = (f: string) => fetch(base + f).then((r) => {
      if (!r.ok) throw new Error(`Missing data file ${f} — run "npm run build:data"`);
      return r.json();
    });
    const [spells, wands, relics, curses, potions, names] = await Promise.all(
      ['spells', 'wands', 'relics', 'curses', 'potions', 'names'].map((n) => get(`${n}.json`)),
    );
    return new Content({ spells, wands, relics, curses, potions }, names);
  }

  bossName(id: string): string {
    return this.names.bosses[id] ?? id;
  }
  npcName(id: string): string {
    return this.names.npcs[id] ?? id;
  }
}
