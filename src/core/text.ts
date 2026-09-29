import { Container, Sprite } from 'pixi.js';
import type { Art } from './art';

export interface TextStyle {
  tint?: number;
  /** Wrap width in source pixels (0 = no wrap). */
  maxWidth?: number;
  align?: 'left' | 'center' | 'right';
  lineGap?: number;
  shadow?: boolean;
}

/**
 * Text rendered from the `ui/font.png` glyph sheet (6x8 cells). `{#rrggbb}` switches colour inline, `{/}` resets.
 */
export class PixelText extends Container {
  private _text = '';
  private width_ = 0;
  private height_ = 0;

  constructor(private readonly art: Art, text = '', private style: TextStyle = {}) {
    super();
    this.set(text);
  }

  get textWidth(): number {
    return this.width_;
  }
  get textHeight(): number {
    return this.height_;
  }

  setStyle(style: TextStyle): this {
    this.style = { ...this.style, ...style };
    const t = this._text;
    this._text = '';
    return this.set(t);
  }

  set(text: string): this {
    if (text === this._text) return this;
    this._text = text;
    for (const c of this.removeChildren()) c.destroy();
    const { cellW, cellH } = this.art.manifest.font;
    const adv = cellW;
    const lineH = cellH + (this.style.lineGap ?? 2);
    const base = this.style.tint ?? 0xffffff;
    const lines = layout(text, this.style.maxWidth ?? 0, adv);
    let maxW = 0;
    lines.forEach((line, li) => {
      const w = visibleLength(line) * adv;
      maxW = Math.max(maxW, w);
      const align = this.style.align ?? 'left';
      const maxWidth = this.style.maxWidth ?? 0;
      let x = align === 'center' ? Math.floor((maxWidth - w) / 2) : align === 'right' ? maxWidth - w : 0;
      if (maxWidth === 0 && align === 'center') x = -Math.floor(w / 2);
      let tint = base;
      for (let i = 0; i < line.length; i++) {
        if (line[i] === '{') {
          const end = line.indexOf('}', i);
          if (end > i) {
            const tag = line.slice(i + 1, end);
            tint = tag === '/' ? base : parseInt(tag.slice(1), 16);
            i = end;
            continue;
          }
        }
        const g = this.art.glyph(line.charCodeAt(i));
        if (g && line[i] !== ' ') {
          if (this.style.shadow) {
            const sh = new Sprite(g);
            sh.tint = 0x0a0a10;
            sh.position.set(x + 1, li * lineH + 1);
            this.addChild(sh);
          }
          const s = new Sprite(g);
          s.tint = tint;
          s.position.set(x, li * lineH);
          this.addChild(s);
        }
        x += adv;
      }
    });
    this.width_ = this.style.maxWidth || maxW;
    this.height_ = lines.length * lineH - (this.style.lineGap ?? 2);
    return this;
  }
}

function visibleLength(s: string): number {
  return s.replace(/\{[^}]*\}/g, '').length;
}

function layout(text: string, maxWidth: number, adv: number): string[] {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    if (!maxWidth) {
      out.push(para);
      continue;
    }
    const maxChars = Math.max(1, Math.floor(maxWidth / adv));
    let line = '';
    for (const word of para.split(' ')) {
      const cand = line ? `${line} ${word}` : word;
      if (visibleLength(cand) > maxChars && line) {
        out.push(line);
        line = word;
      } else line = cand;
    }
    out.push(line);
  }
  return out;
}
