/** Hidden code that toggles Test Mode. Typed anywhere; matched on the character a key produces, not its physical position. */
export const CHEAT_CODE = 'ayenbang0';
export const CHEAT_IDLE_MS = 2000;

const MODIFIERS: Record<string, true> = { Shift: true, CapsLock: true, AltGraph: true, NumLock: true, Fn: true };

/**
 * Sliding-window matcher for a typed key sequence, fed one `KeyboardEvent.key` at a time (no DOM).
 * Comparing the tail of the last `code.length` characters makes overlapping prefixes ('aayenbang0') work without
 * any backtracking table. Any other key, or a pause longer than `idleMs`, drops the progress so far.
 *
 * `key` (the produced character) is matched rather than `code` (the physical key): the code is meant to be
 * typed, so it works on QWERTZ/AZERTY/Dvorak alike, and Shift or Caps Lock cannot break it.
 */
export class CheatCode {
  private typed = '';
  private last = -Infinity;

  constructor(private readonly code: string = CHEAT_CODE, private readonly idleMs: number = CHEAT_IDLE_MS) {}

  /** Feed one key press; true when it completes the code (progress restarts afterwards). */
  feed(key: string, now: number): boolean {
    if (MODIFIERS[key]) return false;
    if (now - this.last > this.idleMs) this.typed = '';
    this.last = now;
    if (key.length !== 1) {
      this.typed = '';
      return false;
    }
    this.typed = (this.typed + key.toLowerCase()).slice(-this.code.length);
    if (this.typed !== this.code) return false;
    this.typed = '';
    return true;
  }

  /** How many leading characters of the code the latest keys have typed (0 when the tail matches nothing). */
  get progress(): number {
    for (let k = Math.min(this.typed.length, this.code.length - 1); k > 0; k--) if (this.typed.endsWith(this.code.slice(0, k))) return k;
    return 0;
  }

  reset() {
    this.typed = '';
  }
}
