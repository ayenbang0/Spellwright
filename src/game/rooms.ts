import { Rng } from '../core/rng';
import { TILE } from '../core/math';

export const T_FLOOR = 0;
export const T_WALL = 1;
export const T_PIT = 2;
export const T_SPIKES = 3;

export type RoomKind =
  | 'camp' | 'training' | 'start' | 'combat' | 'elite' | 'boss' | 'spell' | 'relic' | 'gold' | 'health'
  | 'shop' | 'forge' | 'fountain' | 'crimson' | 'portal' | 'author';

/** Door icon asset per room kind (`ui/door_icon_<type>.png`). */
export const DOOR_ICON: Record<RoomKind, string> = {
  camp: 'unknown', training: 'unknown', start: 'unknown', combat: 'combat', elite: 'elite', boss: 'boss', spell: 'spell',
  relic: 'relic', gold: 'gold', health: 'health', shop: 'shop', forge: 'forge', fountain: 'fountain', crimson: 'crimson', portal: 'unknown', author: 'boss',
};

/** Rooms that contain a fight before their reward. */
export const FIGHT_KINDS: RoomKind[] = ['combat', 'elite', 'boss', 'spell', 'relic', 'gold', 'health'];

export interface Door {
  tx: number;
  ty: number;
  kind: RoomKind;
  open: boolean;
}

export interface Room {
  w: number;
  h: number;
  grid: Uint8Array;
  /** Tile variant index per cell (floor variants / decor). */
  variant: Uint8Array;
  decor: { tx: number; ty: number; i: number }[];
  pots: { x: number; y: number }[];
  tileset: string;
  kind: RoomKind;
  doors: Door[];
  spawn: { x: number; y: number };
  center: { x: number; y: number };
}

export function tileAt(room: Room, tx: number, ty: number): number {
  if (tx < 0 || ty < 0 || tx >= room.w || ty >= room.h) return T_WALL;
  return room.grid[ty * room.w + tx];
}

export function solidAtPx(room: Room, x: number, y: number, flying: boolean): boolean {
  const t = tileAt(room, Math.floor(x / TILE), Math.floor(y / TILE));
  return t === T_WALL || (!flying && t === T_PIT);
}

const SIZE: Partial<Record<RoomKind, [number, number]>> = {
  camp: [20, 12], training: [22, 14], boss: [26, 18], combat: [24, 15], elite: [24, 16], shop: [18, 12], forge: [16, 11],
  fountain: [14, 10], crimson: [16, 11], start: [16, 11], portal: [16, 11], author: [26, 18],
};

export function genRoom(kind: RoomKind, tileset: string, seed: number, nextDoors: RoomKind[]): Room {
  const rng = new Rng(seed);
  const [w, h] = SIZE[kind] ?? [20, 13];
  const grid = new Uint8Array(w * h);
  const variant = new Uint8Array(w * h);
  const set = (x: number, y: number, v: number) => {
    if (x > 0 && y > 1 && x < w - 1 && y < h - 1) grid[y * w + x] = v;
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const border = x === 0 || x === w - 1 || y <= 1 || y === h - 1;
      grid[y * w + x] = border ? T_WALL : T_FLOOR;
      variant[y * w + x] = rng.chance(0.82) ? 0 : rng.int(1, 3);
    }
  }
  const cx = Math.floor(w / 2);
  const cy = Math.floor(h / 2);
  const spawn = { x: cx * TILE + TILE / 2, y: (h - 3) * TILE + TILE / 2 };
  const keepClear = (x: number, y: number) =>
    Math.abs(x - cx) <= 1 || (y >= h - 4 && Math.abs(x - cx) <= 3) || y <= 3;

  const fight = kind === 'combat' || kind === 'elite' || kind === 'spell' || kind === 'relic' || kind === 'gold' || kind === 'health';
  const pots: Room['pots'] = [];
  if (fight) {
    const layout = rng.int(0, 4);
    if (layout === 0) {
      // four pillars
      for (const [px, py] of [[5, 5], [w - 7, 5], [5, h - 7], [w - 7, h - 7]]) {
        for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) set(px + dx, py + dy, T_WALL);
      }
    } else if (layout === 1) {
      // central pit ring
      for (let y = cy - 1; y <= cy + 1; y++) for (let x = cx - 3; x <= cx + 3; x++) if (!(x === cx)) set(x, y, T_PIT);
    } else if (layout === 2) {
      // scattered blocks
      for (let i = 0; i < 7; i++) {
        const x = rng.int(3, w - 4);
        const y = rng.int(4, h - 5);
        if (!keepClear(x, y)) set(x, y, rng.chance(0.5) ? T_WALL : T_PIT);
      }
    } else if (layout === 3) {
      // spike lanes
      for (let x = 4; x < w - 4; x++) if (x % 5 !== 0 && !keepClear(x, cy)) set(x, cy, T_SPIKES);
    }
    const potCount = rng.int(2, 5);
    for (let i = 0; i < potCount; i++) {
      const x = rng.int(2, w - 3);
      const y = rng.int(3, h - 3);
      if (!keepClear(x, y) && grid[y * w + x] === T_FLOOR) pots.push({ x: x * TILE + 8, y: y * TILE + 8 });
    }
  }
  const decor: Room['decor'] = [];
  const nDecor = Math.floor((w * h) / 18);
  for (let i = 0; i < nDecor; i++) {
    const x = rng.int(1, w - 2);
    const y = rng.int(2, h - 2);
    if (grid[y * w + x] === T_FLOOR && !keepClear(x, y)) decor.push({ tx: x, ty: y, i: rng.int(0, 3) });
  }
  const doors: Door[] = [];
  const n = nextDoors.length;
  nextDoors.forEach((k, i) => {
    const tx = n === 1 ? cx : Math.round(((i + 1) * w) / (n + 1));
    doors.push({ tx, ty: 1, kind: k, open: false });
    grid[1 * w + tx] = T_WALL;
  });
  return { w, h, grid, variant, decor, pots, tileset, kind, doors, spawn, center: { x: cx * TILE + 8, y: cy * TILE + 8 } };
}

/** Choose the door kinds offered after clearing a room (Hades-style choice). */
export function doorChoices(rng: Rng, chapter: number, nextRoom: number, roomsPerChapter: number, extra = 0): RoomKind[] {
  if (nextRoom >= roomsPerChapter - 1) return ['boss'];
  if (nextRoom === roomsPerChapter - 2) return rng.shuffle(['shop', 'forge', 'fountain'] as RoomKind[]).slice(0, 2);
  if (nextRoom === Math.floor(roomsPerChapter / 2)) return ['elite'];
  const pool: RoomKind[] = ['spell', 'spell', 'relic', 'gold', 'health', 'combat', 'shop', 'forge'];
  const count = (chapter >= 3 ? 3 : rng.chance(0.5) ? 3 : 2) + extra;
  const out: RoomKind[] = [];
  while (out.length < count) {
    const k = rng.pick(pool);
    if (!out.includes(k)) out.push(k);
  }
  return out;
}
