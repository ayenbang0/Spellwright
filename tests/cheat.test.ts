import { afterEach, describe, expect, it, vi } from 'vitest';
import { CHEAT_CODE, CHEAT_IDLE_MS, CheatCode } from '../src/core/cheat';
import { loadSave, setSaveLocked, writeSave } from '../src/meta/save';

/** Type `text` one key per `gap` ms starting at `t0`; returns how many times the code fired. */
function type(c: CheatCode, text: string, t0 = 0, gap = 100): number {
  let fired = 0;
  [...text].forEach((ch, i) => {
    if (c.feed(ch, t0 + i * gap)) fired++;
  });
  return fired;
}

describe('cheat code matcher', () => {
  it('fires exactly on the last key of the sequence', () => {
    const c = new CheatCode();
    expect(type(c, CHEAT_CODE.slice(0, -1))).toBe(0);
    expect(c.feed(CHEAT_CODE.slice(-1), 1000)).toBe(true);
  });

  it('survives overlapping prefixes and stray leading input', () => {
    expect(type(new CheatCode(), 'aayenbang0')).toBe(1);
    expect(type(new CheatCode(), 'ayenayenbang0')).toBe(1);
    expect(type(new CheatCode(), 'xyzayenbang0')).toBe(1);
  });

  it('a wrong key inside the sequence drops the progress', () => {
    expect(type(new CheatCode(), 'ayenbanx0')).toBe(0);
    expect(type(new CheatCode(), 'ayenb0ang0')).toBe(0);
    const c = new CheatCode();
    type(c, 'ayenban');
    expect(c.feed('Escape', 700)).toBe(false);
    expect(c.feed('g', 800)).toBe(false);
    expect(c.feed('0', 900)).toBe(false);
  });

  it('a pause longer than the idle timeout restarts the sequence', () => {
    const c = new CheatCode();
    type(c, 'ayen');
    expect(type(c, 'bang0', 300 + CHEAT_IDLE_MS + 1)).toBe(0);
    const d = new CheatCode();
    type(d, 'ayen');
    expect(type(d, 'bang0', 300 + CHEAT_IDLE_MS)).toBe(1);
  });

  it('ignores case and modifier keys such as Shift and Caps Lock', () => {
    const c = new CheatCode();
    const keys = ['Shift', 'A', 'Y', 'CapsLock', 'E', 'N', 'B', 'a', 'Shift', 'n', 'G', '0'];
    expect(keys.filter((k, i) => c.feed(k, i * 100)).length).toBe(1);
  });

  it('fires again after a full toggle without a second warm-up', () => {
    const c = new CheatCode();
    expect(type(c, CHEAT_CODE)).toBe(1);
    expect(type(c, CHEAT_CODE, 5000)).toBe(1);
    expect(type(c, CHEAT_CODE + CHEAT_CODE, 10_000)).toBe(2);
  });

  it('reset() drops partial progress', () => {
    const c = new CheatCode();
    type(c, 'ayenb');
    c.reset();
    expect(type(c, 'ang0', 500)).toBe(0);
  });

  it('progress counts the typed prefix, also after a stray restart', () => {
    const c = new CheatCode();
    expect(c.progress).toBe(0);
    type(c, 'aye');
    expect(c.progress).toBe(3);
    type(c, 'x', 400);
    expect(c.progress).toBe(0);
    type(c, 'aay', 800);
    expect(c.progress).toBe(2);
  });
});

describe('save lock (Test Mode progress isolation)', () => {
  const store = new Map<string, string>();
  const stub = () =>
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    });

  afterEach(() => {
    setSaveLocked(false);
    store.clear();
    vi.unstubAllGlobals();
  });

  it('leaves the stored bytes untouched while locked and writes again after unlocking', () => {
    stub();
    const save = loadSave();
    save.crystals = 5;
    writeSave(save);
    const before = [...store.entries()];
    expect(before).toHaveLength(1);

    setSaveLocked(true);
    save.crystals = 999_999;
    writeSave(save);
    expect([...store.entries()]).toEqual(before);

    setSaveLocked(false);
    writeSave(save);
    expect(JSON.parse([...store.values()][0]).crystals).toBe(999_999);
  });
});
