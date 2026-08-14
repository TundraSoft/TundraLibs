/**
 * @fileoverview {@link InvalidULIDError} — thrown by {@link getTimestamp}
 * when the string it is asked to decode is not a valid ULID: the wrong
 * length, a character outside Crockford's Base32 (anywhere in the string),
 * or a timestamp segment above the 48-bit maximum.
 *
 * Unlike {@link InvalidOptionError}, this is a decode failure on external
 * input — a caller parsing a user-supplied ULID will typically want to
 * branch on it (bad input) rather than treat it as its own bug. The
 * `error.context` carries the offending `id` and the `reason`.
 *
 * @module
 */

import { IDError } from './Base.ts';

/** Metadata attached to an {@link InvalidULIDError}. */
export type InvalidULIDErrorMeta = {
  /** The string that failed to decode as a ULID. */
  id: string;
  /**
   * Why decoding failed: wrong length, an illegal character, or a timestamp
   * segment above the 48-bit maximum.
   */
  reason: 'length' | 'character' | 'timestamp';
  /** Expected length — set when `reason` is `'length'`. */
  expected?: number;
  /** The offending character — set when `reason` is `'character'`. */
  character?: string;
};

/**
 * Thrown when a string handed to {@link getTimestamp} is not a valid
 * ULID. The `error.context.reason` distinguishes an incorrect length
 * (carries `expected`) from an illegal character (carries `character`).
 *
 * @example
 * ```ts
 * import { getTimestamp } from '@tundralibs/id/ulid';
 *
 * try {
 *   getTimestamp('not-a-ulid');
 * } catch (e) {
 *   if (e instanceof InvalidULIDError) {
 *     console.error(e.context.reason); // 'length'
 *   }
 * }
 * ```
 */
export class InvalidULIDError extends IDError<InvalidULIDErrorMeta> {
  /**
   * Construct directly only when writing your own ULID decoder;
   * {@link getTimestamp} raises it itself.
   *
   * @param message - Error text; `${id}`, `${reason}` and the remaining
   *   `meta` keys are substituted as `${...}` placeholders.
   * @param meta - The string that failed to decode and why; becomes
   *   `error.context`.
   * @param cause - Underlying error for chaining.
   */
  constructor(
    message: string,
    meta: InvalidULIDErrorMeta,
    cause?: Error,
  ) {
    super(message, meta, cause);
  }
}
