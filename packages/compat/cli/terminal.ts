/**
 * @fileoverview Terminal info — TTY detection and console dimensions.
 *
 * Used by callers that want to decide between rich, in-place output
 * (progress bars, spinners, colors) and plain output suitable for log
 * files / CI pipelines, and by formatters that need to wrap or align
 * to the terminal width.
 *
 * @module
 */

import { isBun, isDeno, isNode } from '../runtime.ts';

// deno-lint-ignore no-explicit-any
const g = globalThis as any;

/**
 * Reports whether the given standard stream is connected to a terminal.
 *
 * Useful for deciding between rich output (colors, progress bars) and
 * plain output suitable for log files and CI pipelines.
 *
 * - **Deno**: `Deno.stdin/stdout/stderr.isTerminal()`
 * - **Node.js / Bun**: `process.stdin/stdout/stderr.isTTY`
 * - **Unknown runtime**: `false`
 *
 * @param stream - Which stream to check (defaults to `'stdout'`)
 * @returns `true` if the stream is a TTY
 *
 * @example
 * ```ts
 * declare function renderProgressBar(): void;
 *
 * if (isTTY()) renderProgressBar();
 * else console.log('progress: 50%');
 * ```
 */
export const isTTY = (
  stream: 'stdin' | 'stdout' | 'stderr' = 'stdout',
): boolean => {
  /* c8 ignore start */
  if (isDeno) {
    const s = g.Deno[stream];
    return typeof s?.isTerminal === 'function' ? s.isTerminal() : false;
  }
  /* c8 ignore stop */
  /* c8 ignore start */
  if (isBun || isNode) {
    return Boolean(g.process[stream]?.isTTY);
  }
  /* c8 ignore stop */
  return false;
};

/**
 * Returns the dimensions of the controlling terminal in characters.
 *
 * Falls back to `{ columns: 80, rows: 24 }` — the historical default —
 * when no terminal is attached (CI pipelines, redirected output, unknown
 * runtimes). Callers don't need to handle a null/undefined result.
 *
 * - **Deno**: `Deno.consoleSize()` (may throw when stdout is not a TTY)
 * - **Node.js / Bun**: `process.stdout.columns / .rows`
 *
 * @returns Terminal dimensions; never null
 *
 * @example
 * ```ts
 * const { columns } = consoleSize();
 * console.log('-'.repeat(columns));
 * ```
 */
export const consoleSize = (): { columns: number; rows: number } => {
  /* c8 ignore start */
  if (isDeno) {
    try {
      const size = g.Deno.consoleSize?.();
      // Some pty wrappers (notably `script(1)`) return { 0, 0 } from
      // TIOCGWINSZ rather than throwing — guard on positive dimensions,
      // not just "is a number", so those degenerate values still hit
      // the 80x24 fallback below.
      if (
        size && typeof size.columns === 'number' && size.columns > 0 &&
        typeof size.rows === 'number' && size.rows > 0
      ) {
        return size;
      }
    } catch {
      // stdout is not a terminal — fall through to defaults.
    }
    return { columns: 80, rows: 24 };
  }
  /* c8 ignore stop */
  /* c8 ignore start */
  if (isBun || isNode) {
    const stdout = g.process.stdout;
    const columns = typeof stdout?.columns === 'number' && stdout.columns > 0
      ? stdout.columns
      : 80;
    const rows = typeof stdout?.rows === 'number' && stdout.rows > 0
      ? stdout.rows
      : 24;
    return { columns, rows };
  }
  /* c8 ignore stop */
  return { columns: 80, rows: 24 };
};
