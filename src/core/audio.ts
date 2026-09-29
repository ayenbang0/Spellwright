/** Procedural WebAudio sound effects (no audio assets needed). */
type Wave = OscillatorType | 'noise';
interface Tone {
  wave: Wave;
  f0: number;
  f1: number;
  dur: number;
  vol: number;
}

const SFX: Record<string, Tone[]> = {
  shoot: [{ wave: 'square', f0: 880, f1: 440, dur: 0.06, vol: 0.05 }],
  shootBig: [{ wave: 'sawtooth', f0: 300, f1: 90, dur: 0.18, vol: 0.07 }],
  hit: [{ wave: 'noise', f0: 1, f1: 1, dur: 0.05, vol: 0.06 }],
  crit: [{ wave: 'square', f0: 1400, f1: 1800, dur: 0.07, vol: 0.05 }],
  enemyShoot: [{ wave: 'triangle', f0: 520, f1: 260, dur: 0.08, vol: 0.05 }],
  telegraph: [{ wave: 'sine', f0: 200, f1: 420, dur: 0.25, vol: 0.05 }],
  explode: [
    { wave: 'noise', f0: 1, f1: 1, dur: 0.25, vol: 0.1 },
    { wave: 'sine', f0: 120, f1: 40, dur: 0.25, vol: 0.1 },
  ],
  hurt: [{ wave: 'sawtooth', f0: 220, f1: 80, dur: 0.2, vol: 0.1 }],
  die: [{ wave: 'noise', f0: 1, f1: 1, dur: 0.12, vol: 0.05 }],
  coin: [
    { wave: 'square', f0: 988, f1: 988, dur: 0.05, vol: 0.04 },
    { wave: 'square', f0: 1319, f1: 1319, dur: 0.1, vol: 0.04 },
  ],
  pickup: [{ wave: 'triangle', f0: 600, f1: 1200, dur: 0.12, vol: 0.06 }],
  door: [{ wave: 'triangle', f0: 180, f1: 360, dur: 0.3, vol: 0.06 }],
  select: [{ wave: 'square', f0: 660, f1: 660, dur: 0.04, vol: 0.03 }],
  deny: [{ wave: 'square', f0: 160, f1: 120, dur: 0.12, vol: 0.05 }],
  levelUp: [
    { wave: 'triangle', f0: 523, f1: 523, dur: 0.08, vol: 0.06 },
    { wave: 'triangle', f0: 784, f1: 1046, dur: 0.2, vol: 0.06 },
  ],
  boss: [{ wave: 'sawtooth', f0: 60, f1: 90, dur: 0.8, vol: 0.08 }],
  heal: [{ wave: 'sine', f0: 400, f1: 800, dur: 0.25, vol: 0.06 }],
};

export type Track = 'camp' | 'forest' | 'purgatory' | 'void' | 'abyss' | 'throne' | 'boss';

interface TrackDef {
  root: number;
  scale: number[];
  step: number;
  wave: OscillatorType;
}

/** Tiny generative music: a droning root and a random pentatonic-ish arpeggio per chapter. */
const TRACKS: Record<Track, TrackDef> = {
  camp: { root: 220, scale: [0, 3, 5, 7, 10], step: 0.55, wave: 'triangle' },
  forest: { root: 196, scale: [0, 2, 4, 7, 9], step: 0.5, wave: 'triangle' },
  purgatory: { root: 174.6, scale: [0, 3, 5, 6, 10], step: 0.45, wave: 'triangle' },
  void: { root: 164.8, scale: [0, 1, 5, 7, 8], step: 0.42, wave: 'sine' },
  abyss: { root: 146.8, scale: [0, 2, 3, 7, 8], step: 0.42, wave: 'sine' },
  throne: { root: 130.8, scale: [0, 1, 4, 5, 8], step: 0.36, wave: 'sawtooth' },
  boss: { root: 110, scale: [0, 3, 5, 6, 7, 10], step: 0.26, wave: 'sawtooth' },
};

export class Audio {
  private ctx: AudioContext | null = null;
  private track: Track | null = null;
  private musicTimer: ReturnType<typeof setInterval> | undefined;
  private step = 0;
  private noise: AudioBuffer | null = null;
  private last: Record<string, number> = {};
  muted = false;

  /** Browsers require a user gesture before audio starts. */
  unlock() {
    if (this.ctx) return;
    this.ctx = new AudioContext();
    const len = this.ctx.sampleRate * 0.5;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  /** Start (or switch to) a music track; it begins once audio is unlocked and stops while muted. */
  setMusic(track: Track | null) {
    if (track === this.track) return;
    this.track = track;
    clearInterval(this.musicTimer);
    this.musicTimer = undefined;
    if (!track) return;
    const def = TRACKS[track];
    this.musicTimer = setInterval(() => this.musicTick(def), def.step * 1000);
  }

  private musicTick(def: TrackDef) {
    const ctx = this.ctx;
    if (!ctx || this.muted || ctx.state !== 'running') return;
    this.step++;
    const now = ctx.currentTime;
    const note = (freq: number, len: number, vol: number, wave: OscillatorType) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = wave;
      o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, now);
      g.gain.linearRampToValueAtTime(vol, now + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, now + len);
      o.connect(g);
      g.connect(ctx.destination);
      o.start(now);
      o.stop(now + len + 0.05);
    };
    if (this.step % 4 === 1) note(def.root / 2, def.step * 4, 0.035, 'sine');
    if (this.step % 2 === 0 || Math.random() < 0.4) {
      const semis = def.scale[Math.floor(Math.random() * def.scale.length)] + (Math.random() < 0.3 ? 12 : 0);
      note(def.root * 2 ** (semis / 12), def.step * 1.6, 0.022, def.wave);
    }
  }

  play(name: keyof typeof SFX, volume = 1) {
    const ctx = this.ctx;
    if (!ctx || this.muted) return;
    const now = ctx.currentTime;
    // rate-limit identical sounds so bullet storms don't clip
    if ((this.last[name] ?? -1) > now - 0.035) return;
    this.last[name] = now;
    let t = now;
    for (const tone of SFX[name]) {
      const g = ctx.createGain();
      g.gain.setValueAtTime(tone.vol * volume, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + tone.dur);
      g.connect(ctx.destination);
      if (tone.wave === 'noise') {
        const src = ctx.createBufferSource();
        src.buffer = this.noise;
        src.connect(g);
        src.start(t);
        src.stop(t + tone.dur);
      } else {
        const o = ctx.createOscillator();
        o.type = tone.wave;
        o.frequency.setValueAtTime(tone.f0, t);
        o.frequency.exponentialRampToValueAtTime(Math.max(1, tone.f1), t + tone.dur);
        o.connect(g);
        o.start(t);
        o.stop(t + tone.dur);
      }
      t += tone.dur * 0.6;
    }
  }
}

export type SfxName = keyof typeof SFX;
