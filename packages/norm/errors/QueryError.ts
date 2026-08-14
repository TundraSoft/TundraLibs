/**
 * @module
 *
 * `NormQueryError` — a caller-side misuse of the QUERY surface:
 * filtering/ordering on a non-filterable column, malformed
 * projections, unknown entities or relation aliases, upsert conflict
 * keys on nondeterministic ciphertext, filtering an encrypted column
 * with no `.hash()` sibling. Raised BEFORE any engine call.
 *
 * @since 1.0.0
 */

import { NormError } from './Base.ts';
import type { NormErrorCode } from './NormErrorCodes.ts';

/** Metadata for {@link NormQueryError}. */
export type QueryErrorMeta = {
  /** Registry key of the entity the operation targeted. */
  entity: string;
  /** Column / alias / key the rejection is about, when applicable. */
  subject?: string;
  /** Stable machine-readable code — read it as `error.code`. */
  code?: NormErrorCode;
} & Record<string, unknown>;

/**
 * The requested read/write shape is invalid for the target entity.
 *
 * @example
 * ```ts ignore
 * try {
 *   await db.repo('Users').find({ '@ssn': 'nope' });
 * } catch (e) {
 *   if (e instanceof NormQueryError) {
 *     console.error(`${e.code} on ${e.context.entity}: ${e.message}`);
 *   }
 * }
 * ```
 */
export class NormQueryError extends NormError<QueryErrorMeta> {
  /**
   * Unlike the other norm errors this one takes its `message` verbatim
   * — the throw sites phrase the rejection themselves.
   *
   * @param meta - Set `code` here; it is what `error.code` reads.
   */
  constructor(message: string, meta: QueryErrorMeta, cause?: Error) {
    super(message, meta, cause);
  }
}
