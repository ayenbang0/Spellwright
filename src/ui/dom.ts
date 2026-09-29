/** Tiny DOM helper. Text is always inserted as text nodes (never innerHTML). */
export type Child = string | number | Node | null | undefined | false | Child[];

export interface Props {
  class?: string;
  style?: Record<string, string>;
  on?: Partial<{ [K in keyof HTMLElementEventMap]: (ev: HTMLElementEventMap[K]) => void }>;
  attrs?: Record<string, string>;
  title?: string;
  disabled?: boolean;
}

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Props | null = null, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props) {
    if (props.class) el.className = props.class;
    if (props.style) for (const [k, v] of Object.entries(props.style)) el.style.setProperty(k, v);
    if (props.title) el.title = props.title;
    if (props.attrs) for (const [k, v] of Object.entries(props.attrs)) el.setAttribute(k, v);
    if (props.disabled && el instanceof HTMLButtonElement) el.disabled = true;
    if (props.on) for (const [k, fn] of Object.entries(props.on)) el.addEventListener(k, fn as EventListener);
  }
  append(el, children);
  return el;
}

function append(el: Node, children: Child[]): void {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else if (c instanceof Node) el.appendChild(c);
    else el.appendChild(document.createTextNode(String(c)));
  }
}

export function clear(el: Element): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}

export function mount(el: Element, ...children: Child[]): void {
  clear(el);
  append(el, children);
}

const BASE = `${import.meta.env.BASE_URL}assets/`;

/** Pixel-art <img> from assets/ (nearest-neighbour). `size` is the CSS pixel size. */
export function icon(path: string, size = 32): HTMLImageElement {
  const el = document.createElement('img');
  el.src = BASE + path;
  el.className = 'px';
  el.draggable = false;
  el.style.width = `${size}px`;
  el.style.height = `${size}px`;
  return el;
}

export function fmtNum(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M`;
  if (n >= 1e4) return `${(n / 1e3).toFixed(n >= 1e5 ? 0 : 1)}k`;
  return String(Math.round(n));
}
