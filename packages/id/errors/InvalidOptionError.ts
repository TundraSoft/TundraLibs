/**
 * @fileoverview {@link InvalidOptionError} — thrown when a generator is
 * called with an argument that fails validation (a negative counter, a
 * zero-length machine id, an out-of-range cuid2 length, an empty nanoID
 * alphabet, a ULID timestamp outside the 48-bit range, …).
 *
 * These are programming mistakes at the call site rather than runtime
 * conditions; the `error.context` carries which `generator` and `option`
 * were rejected, plus the offending `value`, so tooling can report the
 * exact misuse.
 *
 * @module
 */

import { IDError } from './Base.ts';

/** Metadata attached to an {@link InvalidOptionError}. */
export type InvalidOptionErrorMeta = {
  /** Name of the generator that rejected the argument (e.g. `'ObjectID'`). */
  generator: string;
  /** Name of the offending option/argument (e.g. `'counter'`). */
  option: string;
  /** The rejected value, when meaningful to surface. */
  value?: unknown;
};

/**
 * Thrown when a generator receives an argument it cannot accept. The
 * `error.context` names the `generator` and `option` and carries the
 * rejected `value`.
 *
 * @example
 * ```ts
 * try {
 *   ObjectID(-1);
 * } catch (e) {
 *   if (e instanceof InvalidOptionError) {
 *     console.error(e.context.generator, e.context.option); // 'ObjectID' 'counter'
 *   }
 * }
 * ```
 */
export class InvalidOptionError extends IDError<InvalidOptionErrorMeta> {
  constructor(
    message: string,
    meta: InvalidOptionErrorMeta,
    cause?: Error,
  ) {
    super(message, meta, cause);
  }
}
