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
 * declare function connect(): Promise<void>;
 *
 * const spin = new Spinner({ label: 'Connecting' });
 * spin.start();
 * try {
 *   await connect();
 *   spin.succeed('Connected');
 * } catch (err) {
 *   spin.fail(`Failed: ${(err as Error).message}`);
 * }
 * ```
 *
 * @example ASCII fallback
 * ```ts
 * const spin = new Spinner({ frames: SPINNER_FRAMES_ASCII });
 * ```
 */

import { loadBuiltin } from '../_runtime-globals.ts';
import { isTTY } from './terminal.ts';
import type { WritableLike } from './progress.ts';

// Resolved synchronously (see {@link loadBuiltin}); a top-level
// `await import()` would async-poison every bundle compat lands in.
// All three runtimes expose `node:process`; anything else gets
// `undefined` and falls back to the injected stream.
const nodeProcess: typeof import('node:process') = loadBuiltin('node:process');

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
  /** Animation frames, cycled in order. @internal */
  readonly __frames: readonly string[];
  /** Delay between frames, in milliseconds. @internal */
  readonly __intervalMs: number;
  /** Sink for rendered frames. @internal */
  readonly __stream: WritableLike;
  /** Animate in-place; non-TTY prints one static line. @internal */
  readonly __tty: boolean;

  /** Text shown beside the spinner. @internal */
  __label: string;
  /** Index into {@link __frames}. @internal */
  __frameIdx: number = 0;
  /** Animation timer, `null` when not running. @internal */
  __timer: ReturnType<typeof setInterval> | null = null;
  /** Set once finished; later calls no-op. @internal */
  __stopped: boolean = false;
  /** Set by {@link start}; guards against a second start. @internal */
  __started: boolean = false;

  /**
   * Defaults: braille frames, 80ms interval, `process.stdout`, TTY
   * auto-detected. An empty `frames` array falls back to the braille set.
   */
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

  /**
   * Shared tail of {@link succeed} and {@link fail}: stops the timer and
   * writes the final status line. `symbol` is dropped in non-TTY mode.
   *
   * @param label - Overrides the current label for the final line only.
   * @internal
   */
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

  /** Cancel the animation timer if one is pending. @internal */
  __clearTimer(): void {
    if (this.__timer !== null) {
      clearInterval(this.__timer);
      this.__timer = null;
    }
  }

  /** Step to the next frame, rendering only on a TTY. @internal */
  __advance(): void {
    this.__frameIdx = (this.__frameIdx + 1) % this.__frames.length;
    if (this.__tty) this.__render();
  }

  /** Clear the line and write the current frame plus label. @internal */
  __render(): void {
    const labelStr = this.__label.length > 0 ? ` ${this.__label}` : '';
    this.__stream.write(
      `${ESC_CLEAR_LINE}${this.__frames[this.__frameIdx]}${labelStr}`,
    );
  }
}
