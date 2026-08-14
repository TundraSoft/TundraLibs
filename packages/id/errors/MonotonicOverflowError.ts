/**
 * @fileoverview {@link MonotonicOverflowError} — thrown when a monotonic
 * ULID generator exhausts its 80-bit random space within a single
 * millisecond (more than 2^80 IDs requested at the same timestamp).
 *
 * Per the ULID spec, wrapping the random component would make the next
 * ID sort *before* the previous one, silently breaking monotonicity, so
 * the generator throws instead. The `error.context` carries the
 * `timestamp` at which the space was exhausted.
 *
 * @module
 */

import { IDError } from './Base.ts';

/** Metadata attached to a {@link MonotonicOverflowError}. */
export type MonotonicOverflowErrorMeta = {
  /** Unix timestamp (ms) at which the random space was exhausted. */
  timestamp: number;
};

/**
 * Thrown when a monotonic ULID generator overflows its random component
 * within one millisecond. Realistically unreachable — it would take more
 * than 2^80 IDs at the same timestamp — but throwing preserves the
 * monotonic-ordering invariant rather than silently wrapping.
 *
 * @example
 * ```ts
 * try {
 *   // 2^80 + 1 monotonic IDs at a frozen timestamp
 * } catch (e) {
 *   if (e instanceof MonotonicOverflowError) {
 *     console.error(e.context.timestamp);
 *   }
 * }
 * ```
 */
export class MonotonicOverflowError
  extends IDError<MonotonicOverflowErrorMeta> {
  /**
   * Construct directly only when implementing a monotonic generator with
   * the same overflow guarantee; the bundled monotonic paths raise it
   * themselves.
   *
   * @param message - Error text; a `${timestamp}` placeholder is substituted
   *   from `meta`.
   * @param meta - Millisecond timestamp at which the random space was
   *   exhausted; becomes `error.context`.
   * @param cause - Underlying error for chaining.
   */
  constructor(
    message: string,
    meta: MonotonicOverflowErrorMeta,
    cause?: Error,
  ) {
    super(message, meta, cause);
  }
}
