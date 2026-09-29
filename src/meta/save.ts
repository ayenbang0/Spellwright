/** Meta progress persisted in localStorage (key prefix is per-project: GitHub Pages shares one origin per user). */
export interface Save {
  v: 1;
  crystals: number;
  blood: number;
  cores: number;
  vivian: Record<string, number>;
  vivianTiers: number;
  lyon: Record<string, number>;
  /** Lilian packs: `lilianOwned` = bought once, `lilian` = currently active. */
  lilian: Record<string, boolean>;
  lilianOwned: Record<string, boolean>;
  gina: string[];
  sets: string[];
  setLevels: Record<string, number>;
  set: string;
  difficulty: number;
  maxDifficulty: number;
  achievements: string[];
  seenSpells: string[];
  seenWands: string[];
  metLeah: boolean;
  stats: { runs: number; kills: number; bestChapter: number; wins: number; evilSwordKills: number };
  settings: { summonLimitStop: boolean; muted: boolean };
}

const KEY = 'mc-clone:v1:save';

export function freshSave(): Save {
  return {
    v: 1, crystals: 0, blood: 0, cores: 1, vivian: {}, vivianTiers: 0, lyon: {}, lilian: {}, lilianOwned: {}, gina: [], sets: ['original'],
    setLevels: {}, set: 'original', difficulty: 1, maxDifficulty: 1, achievements: [], seenSpells: [], seenWands: [],
    metLeah: false, stats: { runs: 0, kills: 0, bestChapter: 0, wins: 0, evilSwordKills: 0 }, settings: { summonLimitStop: false, muted: false },
  };
}

export function loadSave(): Save {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return freshSave();
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !('v' in parsed) || parsed.v !== 1) return freshSave();
    // Merge onto defaults so new fields get initial values.
    const base = freshSave();
    return { ...base, ...(parsed as Partial<Save>), stats: { ...base.stats, ...(parsed as Partial<Save>).stats }, settings: { ...base.settings, ...(parsed as Partial<Save>).settings } };
  } catch {
    return freshSave();
  }
}

/** While locked (Test Mode) nothing reaches localStorage, so the real progress on disk cannot change. */
let locked = false;

export function setSaveLocked(v: boolean) {
  locked = v;
}

export function writeSave(s: Save) {
  if (locked) return;
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // storage full / disabled: progress stays in memory for this session
  }
}

export function resetSave() {
  if (locked) return;
  localStorage.removeItem(KEY);
}
