export interface Vec {
  x: number;
  y: number;
}

/** 1 m = 1 tile = 16 source pixels. World coordinates are in source pixels. */
export const TILE = 16;
export const M = TILE;

export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const dist2 = (ax: number, ay: number, bx: number, by: number) => (ax - bx) ** 2 + (ay - by) ** 2;
export const dist = (ax: number, ay: number, bx: number, by: number) => Math.sqrt(dist2(ax, ay, bx, by));
export const angleTo = (ax: number, ay: number, bx: number, by: number) => Math.atan2(by - ay, bx - ax);
export const DEG = Math.PI / 180;

export function angleDiff(a: number, b: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export function approach(cur: number, target: number, step: number): number {
  return cur < target ? Math.min(cur + step, target) : Math.max(cur - step, target);
}

export function fmt(n: number, digits = 0): string {
  const p = 10 ** digits;
  return String(Math.round(n * p) / p);
}
