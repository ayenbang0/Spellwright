/**
 * Fixed-step clock: turns variable frame times into 60 Hz simulation steps plus the render interpolation factor.
 *
 * Two rules keep a slow frame from snowballing into a slow game:
 * - the steps of one frame stop once they have used `budgetMs` of wall-clock time (a step that costs more than a frame
 *   makes every extra step in that frame push the next one later still), and
 * - time the simulation could not run is dropped, never repaid later as bursts of extra steps (the character lurching
 *   ahead): an overloaded game runs in slow motion and returns to normal speed the moment the load goes away.
 */
export class FixedStep {
  private acc = 0;

  constructor(
    readonly step = 1 / 60,
    private readonly maxSteps = 4,
    private readonly budgetMs = 9,
    private readonly now: () => number = () => performance.now(),
  ) {}

  /**
   * Advance by `dt` seconds of real time, calling `run(step)` once per owed step.
   * Returns how far the frame is into the next step (0 ≤ alpha < 1), for drawing between the last two steps.
   */
  advance(dt: number, run: (step: number) => void): number {
    this.acc += Math.min(dt, 0.1);
    const t0 = this.now();
    let n = 0;
    while (this.acc >= this.step && n < this.maxSteps) {
      this.acc -= this.step;
      n++;
      run(this.step);
      if (this.now() - t0 > this.budgetMs) break;
    }
    if (this.acc >= this.step) this.acc %= this.step;
    return this.acc / this.step;
  }
}
