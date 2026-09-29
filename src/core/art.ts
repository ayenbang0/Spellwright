import { Assets, Rectangle, Texture, TextureSource } from 'pixi.js';

/** Shape of `assets/manifest.json` (fields the engine relies on). */
export interface ArtManifest {
  tile: number;
  scaleDisplay: number;
  attackTiming: { telegraph: number; windup: number; impactFrames: number };
  anims: Record<string, { frames: number; fps: number; loop: boolean; w: number; h: number }>;
  font: { path: string; cellW: number; cellH: number; cols: number; first: number };
  nineSlice: Record<string, number>;
  chapters: string[];
}

export interface Anim {
  frames: Texture[];
  fps: number;
  loop: boolean;
}

const BASE = `${import.meta.env.BASE_URL}assets/`;

/**
 * Registry over `assets/`: every path must appear in `assets/filelist.txt` (never guessed).
 * Animation groups (`<base>_f0..fN`) come from `manifest.anims`.
 */
export class Art {
  readonly files: Set<string>;
  private readonly textures = new Map<string, Texture>();
  private readonly anims = new Map<string, Anim>();
  private glyphs: Texture[] = [];

  private constructor(readonly manifest: ArtManifest, files: string[]) {
    this.files = new Set(files);
  }

  static async load(onProgress?: (p: number) => void): Promise<Art> {
    TextureSource.defaultOptions.scaleMode = 'nearest';
    const [manifest, list] = await Promise.all([
      fetch(`${BASE}manifest.json`).then((r) => r.json() as Promise<ArtManifest>),
      fetch(`${BASE}filelist.txt`).then((r) => r.text()),
    ]);
    const files = list.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    const art = new Art(manifest, files);
    const loaded = await Assets.load(
      files.map((f) => ({ alias: f, src: BASE + f })),
      onProgress,
    );
    for (const f of files) {
      const t = loaded[f] as Texture;
      t.source.scaleMode = 'nearest';
      art.textures.set(f, t);
    }
    art.buildFont();
    return art;
  }

  has(path: string): boolean {
    return this.files.has(path);
  }

  tex(path: string): Texture {
    const t = this.textures.get(path);
    if (!t) throw new Error(`Missing art "${path}" (not in assets/filelist.txt)`);
    return t;
  }

  /** First existing path among candidates; throws if none exists. */
  pick(...paths: string[]): string {
    for (const p of paths) if (this.files.has(p)) return p;
    throw new Error(`None of the art paths exist: ${paths.join(', ')}`);
  }

  /** Animation for `base` (path without `_fN.png`); falls back to the static `<base>.png`. */
  anim(base: string): Anim {
    let a = this.anims.get(base);
    if (a) return a;
    const meta = this.manifest.anims?.[base];
    if (meta) {
      const frames: Texture[] = [];
      for (let i = 0; i < meta.frames; i++) frames.push(this.tex(`${base}_f${i}.png`));
      a = { frames, fps: meta.fps, loop: meta.loop };
    } else {
      a = { frames: [this.tex(`${base}.png`)], fps: 1, loop: true };
    }
    this.anims.set(base, a);
    return a;
  }

  hasAnim(base: string): boolean {
    return !!this.manifest.anims?.[base] || this.files.has(`${base}.png`);
  }

  glyph(code: number): Texture | undefined {
    return this.glyphs[code - this.manifest.font.first];
  }

  private buildFont() {
    const f = this.manifest.font;
    const sheet = this.tex(f.path);
    const count = Math.floor(sheet.width / f.cellW) * Math.floor(sheet.height / f.cellH);
    for (let i = 0; i < count; i++) {
      const x = (i % f.cols) * f.cellW;
      const y = Math.floor(i / f.cols) * f.cellH;
      this.glyphs.push(new Texture({ source: sheet.source, frame: new Rectangle(x, y, f.cellW, f.cellH) }));
    }
  }
}
