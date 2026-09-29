import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = new URL('../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const files = new Set(readFileSync(join(root, 'assets/filelist.txt'), 'utf8').split(/\r?\n/).filter(Boolean));
const manifest = JSON.parse(readFileSync(join(root, 'assets/manifest.json'), 'utf8')) as { anims: Record<string, { frames: number }> };

function walk(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.ts')) out.push(p);
  }
  return out;
}

describe('art paths (assets/ is the single source of truth)', () => {
  const src = walk(join(root, 'src')).map((p) => [p, readFileSync(p, 'utf8')] as const);
  // literal asset references: 'effects/impact_small', 'tiles/portal.png', ...
  const re = /'((?:effects|projectiles|tiles|pickups|ui|player|npcs|enemies|bosses|overlays)\/[a-z0-9_/.]+)'/g;

  it('every literal asset path in src/ exists in filelist.txt or is an animation group', () => {
    const missing: string[] = [];
    for (const [file, text] of src) {
      for (const m of text.matchAll(re)) {
        const p = m[1];
        if (/\/(elite_)?ch$/.test(p)) continue; // string-replace prefixes in enemies.ts, not paths
        const ok = files.has(p) || files.has(`${p}.png`) || p in manifest.anims;
        if (!ok) missing.push(`${file.replace(root, '')}: ${p}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('every animation group has contiguous frames', () => {
    const bad: string[] = [];
    for (const [g, meta] of Object.entries(manifest.anims)) for (let i = 0; i < meta.frames; i++) if (!files.has(`${g}_f${i}.png`)) bad.push(`${g}_f${i}`);
    expect(bad).toEqual([]);
  });

  it('every listed file exists on disk', () => {
    const missing = [...files].filter((f) => {
      try {
        return !statSync(join(root, 'assets', f)).isFile();
      } catch {
        return true;
      }
    });
    expect(missing).toEqual([]);
  });
});

describe('boss roster', async () => {
  const { BOSSES } = await import('../src/game/bosses');
  const names = JSON.parse(readFileSync(join(root, 'public/data/names.json'), 'utf8')) as { bosses: Record<string, string> };
  const groups = (id: string) => (id === 'demon_lord' ? ['demon_lord_p1', 'demon_lord_p2', 'demon_lord_p3'] : [id]);

  it('every boss has idle/hit/telegraph art and an original name', () => {
    const missing: string[] = [];
    for (const id of Object.keys(BOSSES)) {
      if (!names.bosses[id]) missing.push(`name:${id}`);
      for (const g of groups(id)) for (const f of [`bosses/boss_${g}_f0.png`, `bosses/boss_${g}_hit.png`, `bosses/boss_${g}_telegraph.png`]) if (!files.has(f)) missing.push(f);
    }
    expect(missing).toEqual([]);
  });
});
