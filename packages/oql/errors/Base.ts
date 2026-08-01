/**
 * @fileoverview Base error class + typed metadata for `@tundralibs/oql`.
 *
 * `OqlError` extends {@link BaseError} from `@tundralibs/utils`, so every oql
 * error shares the project-wide contract (typed `context`, `${var}`
 * substitution, cause chains, JSON serialisation) — the pattern every
 * package follows (see `CONVENTIONS.md` › "Custom errors live in an
 * `errors/` folder"; `packages/drivers/errors` is the canonical
 * codes-table example).
 *
 * Concrete oql errors extend this class; callers branch with
 * `instanceof OqlError` or on the stable {@link OqlError.code}.
 *
 * @module
 */

import { BaseError } from '@tundralibs/utils/BaseError';
import { type OqlErrorCode, OqlErrorCodes } from './OqlErrorCodes.ts';

/**
 * Structured `context` carried on an {@link OqlError}. Always carries a
 * stable `code`; concrete errors add whatever is useful (`dialect`,
 * `feature`, `ref`, `column`, …). `${code}`-style placeholders in a message
 * are substituted from here by {@link BaseError}.
 */
export type OqlErrorMeta = {
  /** Stable error code — see {@link OqlErrorCode}. */
  code: OqlErrorCode;
} & Record<string, unknown>;

/**
 * Base error for the oql package. A deliberately thin extension over
 * {@link BaseError} — it inherits the shared `(message, context, cause?)`
 * constructor and `'${message}'` template unchanged, and adds only the
 * stable {@link OqlError.code} accessor so callers can branch without
 * parsing message text.
 *
 * @typeParam M - the `context` shape (defaults to {@link OqlErrorMeta}).
 */
export class OqlError<M extends OqlErrorMeta = OqlErrorMeta>
  extends BaseError<M> {
  /**
   * Stable error code, read from `context.code` and guarded to a known
   * {@link OqlErrorCode} (falls back to `'UNKNOWN'` when unset/out-of-band).
   */
  get code(): OqlErrorCode {
    const c = (this.context as { code?: OqlErrorCode }).code;
    return c !== undefined && OqlErrorCodes[c] !== undefined ? c : 'UNKNOWN';
  }
}
