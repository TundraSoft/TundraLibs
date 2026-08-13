/**
 * @fileoverview Cross-runtime terminal progress bar.
 *
 * In TTY mode renders an in-place updating bar with carriage-return.
 * In non-TTY mode (CI, redirected output) emits one line per percent
 * change so logs stay readable. Rate-limits TTY renders to ~60fps so
 * tight update loops don't flood the terminal.
 *
 * @module
 *
 * @example
 * ```ts
 * import { ProgressBar } from '@tundralibs/compat/cli';
 *
 * const bar = new ProgressBar({ total: items.length, label: 'Indexing' });
 * for (const item of items) {
 *   await process(item);
 *   bar.increment();
 * }
 * bar.complete('Done');
 * ```
 */

import { isBun, isDeno, isNode } from '../runtime.ts';
import { loadBuiltin } from '../_runtime-globals.ts';
import { isTTY } from './terminal.ts';

// Resolved synchronously (see {@link loadBuiltin}); a top-level
// `await import()` would async-poison every bundle compat lands in.
const nodeProcess: typeof import('node:process') = isDeno || isBun || isNode
  ? loadBuiltin('node:process')
  : undefined;

/**
 * Minimal writable interface — just the `write` method. Lets us inject
 * any string-collecting target for tests.
 */
export type WritableLike = { write(chunk: string): unknown };

/**
 * Construction options for {@link ProgressBar}.
 */
export type ProgressBarOptions = {
  /** Total number of units; must be positive and finite */
  total: number;
  /** Optional text shown before the bar */
  label?: string;
  /** Bar width in characters (excluding label and percentage). Default 40. */
  width?: number;
  /** Character used for the filled portion. Default `█`. */
  fillChar?: string;
  /** Character used for the empty portion. Default `░`. */
  emptyChar?: string;
  /**
   * Output stream. Defaults to `process.stdout`. Pass any
   * `{ write(s): … }` target for testing.
   */
  stream?: WritableLike;
  /**
   * Override TTY detection. When `false`, the bar renders one line per
   * percent change instead of in-place — appropriate for CI logs.
   * Default: auto-detect via `isTTY('stdout')`.
   */
  tty?: boolean;
};

const FRAME_INTERVAL_MS = 16; // ~60fps render cap in TTY mode

/**
 * In-terminal progress bar.
 *
 * Lifecycle: construct → call {@link update} or {@link increment} as
 * work proceeds → call {@link complete} when done (or {@link stop} on
 * an error path to leave the bar at its current state with a newline).
 */
export class ProgressBar {
  readonly __total: number;
  readonly __width: number;
  readonly __fillChar: string;
  readonly __emptyChar: string;
  readonly __stream: WritableLike;
  readonly __tty: boolean;

  __label: string;
  __current: number = 0;
  __lastRenderAt: number = 0;
  __lastRenderedPct: number = -1;
  __stopped: boolean = false;

  constructor(options: ProgressBarOptions) {
    if (
      typeof options.total !== 'number' ||
      !Number.isFinite(options.total) ||
      options.total <= 0
    ) {
      throw new RangeError(
        `ProgressBar 'total' must be a positive finite number, got ${options.total}`,
      );
    }
    this.__total = options.total;
    this.__label = options.label ?? '';
    this.__width = options.width ?? 40;
    this.__fillChar = options.fillChar ?? '█';
    this.__emptyChar = options.emptyChar ?? '░';
    this.__stream = options.stream ??
      (nodeProcess?.stdout as unknown as WritableLike | undefined) ??
      { write: () => {} };
    this.__tty = options.tty ?? isTTY('stdout');
  }

  /** Current value (0..total). Read-only. */
  get value(): number {
    return this.__current;
  }

  /** Total target; set at construction time. Read-only. */
  get total(): number {
    return this.__total;
  }

  /**
   * Set the current value, optionally updating the label, then render.
   * Values outside `[0, total]` are clamped.
   */
  update(value: number, label?: string): void {
    if (this.__stopped) return;
    this.__current = Math.max(0, Math.min(value, this.__total));
    if (label !== undefined) this.__label = label;
    this.__render(false);
  }

  /** Add `by` to the current value (default 1) and render. */
  increment(by: number = 1): void {
    this.update(this.__current + by);
  }

  /**
   * Finalize the bar at 100%, render once more (forced), and emit a
   * newline. After this the bar is inert — further calls are no-ops.
   */
  complete(label?: string): void {
    if (this.__stopped) return;
    this.__current = this.__total;
    if (label !== undefined) this.__label = label;
    this.__render(true);
    if (this.__tty) this.__stream.write('\n');
    this.__stopped = true;
  }

  /**
   * Abandon the bar at its current value and emit a newline. Use this
   * on error paths where you don't want to imply completion.
   */
  stop(): void {
    if (this.__stopped) return;
    if (this.__tty) this.__stream.write('\n');
    this.__stopped = true;
  }

  __render(force: boolean): void {
    const pct = Math.floor((this.__current / this.__total) * 100);

    if (!this.__tty) {
      // Non-TTY: emit one line per percent change to keep CI logs sane.
      if (!force && pct === this.__lastRenderedPct) return;
      this.__lastRenderedPct = pct;
      const labelStr = this.__label.length > 0 ? `${this.__label}: ` : '';
      this.__stream.write(
        `${labelStr}${pct}% (${this.__current}/${this.__total})\n`,
      );
      return;
    }

    // TTY: rate-limit to ~60fps unless this is a forced (final) render.
    const now = Date.now();
    if (!force && now - this.__lastRenderAt < FRAME_INTERVAL_MS) return;
    this.__lastRenderAt = now;
    this.__lastRenderedPct = pct;

    const filled = Math.round((this.__current / this.__total) * this.__width);
    const empty = this.__width - filled;
    const bar = this.__fillChar.repeat(filled) + this.__emptyChar.repeat(empty);
    const labelStr = this.__label.length > 0 ? `${this.__label} ` : '';
    this.__stream.write(
      `\r${labelStr}[${bar}] ${pct}% (${this.__current}/${this.__total})`,
    );
  }
}
