/** Wiki mirror loading + small parsing helpers shared by build-data.ts. */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const ROOT = resolve(import.meta.dirname, '..', '..');

export function readJson<T = any>(rel: string): T {
  return JSON.parse(readFileSync(resolve(ROOT, rel), 'utf8')) as T;
}

export type Lv3<T> = [T, T, T];
export type MaybeLv3 = Lv3<number | undefined>;
export type IdEntry = { id: string; wikiName: string };

/** Lowercase alphanumerics only — tolerates the wiki's stray hyphens/spacing ("Pros-pector's Vest"). */
export const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/** Round away float noise (0.01 * 78 etc.) so output is stable and readable. */
export const r6 = (n: number): number => Math.round(n * 1e6) / 1e6;

/**
 * First number in a wiki stat string. '%' directly after the number divides by 100
 * ("x60%" → 0.6, "+30%" → 0.3, "40%" → 0.4); "-0.1s" → -0.1; "22 (DPS)" → 22; "Duration x16" → 16.
 * Placeholders ("???", "TBD", "int1", "float1") and empty values → undefined.
 */
export function parseStat(raw: string | undefined): number | undefined {
  if (raw == null) return undefined;
  const s = String(raw).trim();
  if (!s || /\?\?\?|TBD|\b(?:int|float)\d/i.test(s)) return undefined;
  const m = /([-+]?\d+(?:\.\d+)?)\s*(%)?/.exec(s);
  if (!m) return undefined;
  const n = parseFloat(m[1]);
  return r6(m[2] ? n / 100 : n);
}

/** Section of wiki/corpus.md for a page title ("### <Title>  [..."), or '' if absent. */
export function corpusSections(corpus: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const chunk of corpus.split(/\n(?=### )/)) {
    const m = /^### (.+?)\s{2}\[/.exec(chunk);
    if (m) map.set(norm(m[1]), chunk);
  }
  return map;
}

/** Rows "A | B | ..." of a pipe table that follows `anchor` inside `text`, stopping at the first blank line after rows start. */
export function tableAfter(text: string, anchor: string): string[][] {
  const at = text.indexOf(anchor);
  if (at < 0) throw new Error(`corpus anchor not found: ${anchor}`);
  const rows: string[][] = [];
  for (const line of text.slice(at + anchor.length).split('\n')) {
    if (line.includes('|')) rows.push(line.split('|').map((c) => c.trim()));
    else if (rows.length && !line.trim()) break;
  }
  return rows;
}

/** Bullet items ("* Foo") that follow `anchor`, stopping at the first non-bullet line after bullets start. */
export function bulletsAfter(text: string, anchor: string): string[] {
  const at = text.indexOf(anchor);
  if (at < 0) throw new Error(`corpus anchor not found: ${anchor}`);
  const out: string[] = [];
  for (const line of text.slice(at + anchor.length).split('\n')) {
    const m = /^\s*\*\s*(.+?)\s*$/.exec(line);
    if (m) out.push(m[1]);
    else if (out.length && line.trim()) break;
  }
  return out;
}

/**
 * Carry-forward fill of a per-level value. Leading gaps become 0 (the wiki lists nothing at those levels);
 * a gap after a known value copies the previous level and — when that level is reachable — counts as invented.
 */
export function fill(vals: MaybeLv3, reachable: boolean, onInvent: () => void): Lv3<number> {
  const out: number[] = [];
  let last: number | undefined;
  for (const v of vals) {
    if (v !== undefined) last = v;
    else if (last !== undefined && reachable) onInvent();
    out.push(v ?? last ?? 0);
  }
  return out as Lv3<number>;
}

/** Replace `{spell:id}` / `{relic:id}` / `{wand:id}` tokens with clean-room names. */
export function resolveTokens(text: string, names: Record<string, Record<string, string>>): string {
  return text.replace(/\{(spell|relic|wand|curse|potion):([a-z0-9_]+)\}/g, (_, group: string, id: string) => {
    const name = names[`${group}s`]?.[id];
    if (!name) throw new Error(`unknown token {${group}:${id}}`);
    return name;
  });
}
