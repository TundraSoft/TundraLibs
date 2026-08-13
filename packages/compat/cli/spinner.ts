/**
 * @fileoverview Cross-runtime terminal spinner.
 *
 * In TTY mode renders an animated spinner that updates in place. In
 * non-TTY mode (CI, redirected output) emits a single "starting" line
 * with no animation. Calls to {@link Spinner.succeed}, {@link
 * Spinner.fail}, or {@link Spinner.stop} write a final line and stop
 * the timer.
 *
 * @module
 *
 * @example
 * ```ts
 * import { Spinner } from '@tundralibs/compat/cli';
 *
 * const spin = new Spinner({ label: 'Connecting' });
 * spin.start();
 * try {
 *   await connect();
 *   spin.succeed('Connected');
 * } catch (err) {
 *   spin.fail(`Failed: ${err.message}`);
 * }
 * ```
 *
 * @example ASCII fallback
 * ```ts
 * const spin = new Spinner({ frames: SPINNER_FRAMES_ASCII });
 * ```
 */

import { isBun, isDeno, isNode } from '../runtime.ts';
import { loadBuiltin } from '../_runtime-globals.ts';
import { isTTY } from './terminal.ts';
import type { WritableLike } from './progress.ts';

// Resolved synchronously (see {@link loadBuiltin}); a top-level
// `await import()` would async-poison every bundle compat lands in.
const nodeProcess: typeof import('node:process') = isDeno || isBun || isNode
  ? loadBuiltin('node:process')
  : undefined;

/**
 * Default spinner frames — Unicode braille pattern, renders as a
 * smooth rotating dot in any UTF-8 capable terminal (modern macOS,
 * Linux, Windows Terminal).
 */
export const SPINNER_FRAMES_BRAILLE: readonly string[] = [
  '⠋',
  '⠙',
  '⠹',
  '⠸',
  '⠼',
  '⠴',
  '⠦',
  '⠧',
  '⠇',
  '⠏',
];

/**
 * Plain ASCII spinner frames. Use as `frames` option when targeting
 * terminals that may not handle UTF-8 (legacy Windows cmd, dumb
 * terminals).
 */
export const SPINNER_FRAMES_ASCII: readonly string[] = ['|', '/', '-', '\\'];

/**
 * Construction options for {@link Spinner}.
 */
export type SpinnerOptions = {
  /** Initial label shown next to the spinner */
  label?: string;
  /** Frame sequence. Default: {@link SPINNER_FRAMES_BRAILLE} */
  frames?: readonly string[];
  /** Animation interval in milliseconds. Default 80. */
  intervalMs?: number;
  /**
   * Output stream. Defaults to `process.stdout`. Inject a mock
   * `{ write(s): … }` for testing.
   */
  stream?: WritableLike;
  /**
   * Override TTY detection. When `false`, the spinner emits a single
   * line on `start()` and a final line on `succeed`/`fail`/`stop`,
   * with no inline animation.
   * Default: auto-detect via `isTTY('stdout')`.
   */
  tty?: boolean;
};

const ESC_CLEAR_LINE = '\r\x1b[2K';

/**
 * Animated terminal spinner.
 *
 * Lifecycle: `start()` → optional `setLabel()` / `tick()` →
 * `succeed()` | `fail()` | `stop()`.
 */
export class Spinner {
  readonly __frames: readonly string[];
  readonly __intervalMs: number;
  readonly __stream: WritableLike;
  readonly __tty: boolean;

  __label: string;
  __frameIdx: number = 0;
  __timer: ReturnType<typeof setInterval> | null = null;
  __stopped: boolean = false;
  __started: boolean = false;

  constructor(options: SpinnerOptions = {}) {
    this.__frames = options.frames && options.frames.length > 0
      ? options.frames
      : SPINNER_FRAMES_BRAILLE;
    this.__intervalMs = options.intervalMs ?? 80;
    this.__stream = options.stream ??
      (nodeProcess?.stdout as unknown as WritableLike | undefined) ??
      { write: () => {} };
    this.__tty = options.tty ?? isTTY('stdout');
    this.__label = options.label ?? '';
  }

  /** Whether the spinner is currently animating. */
  get running(): boolean {
    return this.__started && !this.__stopped;
  }

  /**
   * Begin animating. In non-TTY mode emits a single "label…" line and
   * the spinner is otherwise inert. Calling `start()` after a previous
   * `start()` is a no-op.
   */
  start(label?: string): void {
    if (this.__started || this.__stopped) return;
    if (label !== undefined) this.__label = label;
    this.__started = true;

    if (!this.__tty) {
      if (this.__label.length > 0) this.__stream.write(`${this.__label}...\n`);
      return;
    }

    this.__render();
    this.__timer = setInterval(() => this.__advance(), this.__intervalMs);
    // Don't keep the event loop alive just to spin (Node/Bun timers
    // expose `.unref()`; the Web `number` handle in Deno does not).
    const timer = this.__timer as unknown as { unref?: () => void };
    timer.unref?.();
  }

  /**
   * Advance one frame and render. Called by the internal timer; also
   * exposed so tests can step the animation deterministically without
   * waiting on real timers.
   */
  tick(): void {
    if (!this.__started || this.__stopped) return;
    this.__advance();
  }

  /**
   * Update the label shown next to the spinner. Takes effect on the
   * next render.
   */
  setLabel(label: string): void {
    this.__label = label;
    if (this.running && this.__tty) this.__render();
  }

  /** Stop the spinner and write `✓ {label}` (status line). */
  succeed(label?: string): void {
    this.__finish('✓', label);
  }

  /** Stop the spinner and write `✗ {label}` (status line). */
  fail(label?: string): void {
    this.__finish('✗', label);
  }

  /**
   * Stop the spinner without a status indicator. Clears the spinner
   * line in TTY mode; in non-TTY mode is a no-op.
   */
  stop(): void {
    if (this.__stopped) return;
    this.__clearTimer();
    if (this.__tty) this.__stream.write(ESC_CLEAR_LINE);
    this.__stopped = true;
  }

  __finish(symbol: string, label: string | undefined): void {
    if (this.__stopped) return;
    this.__clearTimer();
    const text = label ?? this.__label;
    if (this.__tty) {
      this.__stream.write(ESC_CLEAR_LINE);
      this.__stream.write(`${symbol} ${text}\n`);
    } else {
      this.__stream.write(`${text}\n`);
    }
    this.__stopped = true;
  }

  __clearTimer(): void {
    if (this.__timer !== null) {
      clearInterval(this.__timer);
      this.__timer = null;
    }
  }

  __advance(): void {
    this.__frameIdx = (this.__frameIdx + 1) % this.__frames.length;
    if (this.__tty) this.__render();
  }

  __render(): void {
    const labelStr = this.__label.length > 0 ? ` ${this.__label}` : '';
    this.__stream.write(
      `${ESC_CLEAR_LINE}${this.__frames[this.__frameIdx]}${labelStr}`,
    );
  }
}
