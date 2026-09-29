import { CheatCode } from './cheat';

/** True while the user is typing into a form control (the Test Mode panel's search box). */
function typingTarget(t: EventTarget | null): boolean {
  return t instanceof HTMLElement && (t.isContentEditable || t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT');
}

/** Keyboard + mouse + gamepad state, sampled once per fixed step. */
export class Input {
  private down = new Set<string>();
  private pressedQ = new Set<string>();
  private pressed = new Set<string>();
  /** Mouse position in CSS pixels relative to the canvas. */
  mx = 0;
  my = 0;
  mouseDown = false;
  rightDown = false;
  private clickQ = false;
  private rclickQ = false;
  private releaseQ = false;
  clicked = false;
  rclicked = false;
  released = false;
  wheel = 0;
  private wheelQ = 0;
  private padDown = new Set<number>();
  gamepad: { lx: number; ly: number; rx: number; ry: number; fire: boolean } | null = null;
  /** Fired when the hidden Test Mode code has just been typed. */
  onCheatCode: (() => void) | null = null;
  private readonly cheat = new CheatCode();

  constructor(private readonly canvas: HTMLCanvasElement) {
    window.addEventListener('keydown', (e) => {
      const typing = typingTarget(e.target);
      if (!typing && ['Tab', 'Space', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
      if (!this.down.has(e.code)) this.pressedQ.add(e.code);
      this.down.add(e.code);
      if (typing || e.ctrlKey || e.metaKey || e.altKey) this.cheat.reset();
      else if (!e.repeat && this.cheat.feed(e.key, performance.now())) this.onCheatCode?.();
      // Deep into the code, the keys are for the cheat, not for the game: `e` would otherwise interact with whatever is near.
      if (this.cheat.progress >= 3) this.pressedQ.delete(e.code);
    });
    window.addEventListener('keyup', (e) => this.down.delete(e.code));
    window.addEventListener('blur', () => {
      this.down.clear();
      this.mouseDown = false;
      this.rightDown = false;
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('pointermove', (e) => this.move(e));
    canvas.addEventListener('pointerdown', (e) => {
      this.move(e);
      if (e.button === 0) {
        this.mouseDown = true;
        this.clickQ = true;
      } else if (e.button === 2) {
        this.rightDown = true;
        this.rclickQ = true;
      }
    });
    window.addEventListener('pointerup', (e) => {
      if (e.button === 0) {
        this.mouseDown = false;
        this.releaseQ = true;
      } else if (e.button === 2) this.rightDown = false;
    });
    canvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.wheelQ += Math.sign(e.deltaY);
      },
      { passive: false },
    );
  }

  private move(e: PointerEvent) {
    const r = this.canvas.getBoundingClientRect();
    this.mx = e.clientX - r.left;
    this.my = e.clientY - r.top;
  }

  /** Call at the start of each fixed update. */
  poll() {
    this.pressed = this.pressedQ;
    this.pressedQ = new Set();
    this.clicked = this.clickQ;
    this.rclicked = this.rclickQ;
    this.released = this.releaseQ;
    this.clickQ = this.rclickQ = this.releaseQ = false;
    this.wheel = this.wheelQ;
    this.wheelQ = 0;
    const pad = navigator.getGamepads?.().find((p) => p && p.connected);
    if (pad) {
      // buttons act like key presses on their rising edge: A skill, X interact, Y bag, LB swap wand, Start menu
      const map: [number, string][] = [[0, 'Space'], [2, 'KeyE'], [3, 'Tab'], [4, 'KeyQ'], [9, 'Escape']];
      for (const [b, code] of map) {
        const down = !!pad.buttons[b]?.pressed;
        if (down && !this.padDown.has(b)) this.pressed.add(code);
        if (down) this.padDown.add(b);
        else this.padDown.delete(b);
      }
      const dz = (v: number) => (Math.abs(v) < 0.2 ? 0 : v);
      this.gamepad = {
        lx: dz(pad.axes[0] ?? 0),
        ly: dz(pad.axes[1] ?? 0),
        rx: dz(pad.axes[2] ?? 0),
        ry: dz(pad.axes[3] ?? 0),
        fire: !!pad.buttons[7]?.pressed || !!pad.buttons[5]?.pressed,
      };
    } else this.gamepad = null;
  }

  held(code: string): boolean {
    return this.down.has(code);
  }
  hit(code: string): boolean {
    return this.pressed.has(code);
  }
  /** Consume a key press so later handlers in the same frame don't see it. */
  eat(code: string) {
    this.pressed.delete(code);
  }
  eatClick() {
    this.clicked = false;
  }

  moveAxis(): { x: number; y: number } {
    let x = (this.held('KeyD') || this.held('ArrowRight') ? 1 : 0) - (this.held('KeyA') || this.held('ArrowLeft') ? 1 : 0);
    let y = (this.held('KeyS') || this.held('ArrowDown') ? 1 : 0) - (this.held('KeyW') || this.held('ArrowUp') ? 1 : 0);
    if (this.gamepad && (this.gamepad.lx || this.gamepad.ly)) {
      x = this.gamepad.lx;
      y = this.gamepad.ly;
    }
    const l = Math.hypot(x, y);
    return l > 1 ? { x: x / l, y: y / l } : { x, y };
  }
}
