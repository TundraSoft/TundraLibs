/**
 * @fileoverview `isThenable` — the one promise-detection guard the
 * sync-fast-path seams share (stores, module invokes, formState), so
 * every seam treats the same values as async.
 *
 * @module
 */

/** Whether `v` is a thenable OBJECT (a bare then-bearing function is not). */
export const isThenable = (v: unknown): v is Promise<unknown> =>
  v !== null && typeof v === 'object' &&
  typeof (v as { then?: unknown }).then === 'function';
