/**
 * @module
 *
 * Base error class for `@tundralibs/norm`. Concrete norm errors
 * extend it; mirrors the pattern `@tundralibs/drivers` and the legacy
 * `@tundralibs/norm` package use so caller-side error handling looks
 * the same across packages.
 *
 * @since 1.0.0
 */

import { BaseError } from '@tundralibs/utils';
import type { NormErrorCode } from './NormErrorCodes.ts';

/**
 * Base error class for the norm package.
 *
 * @template M - Type of error metadata; defaults to a generic record.
 */
export class NormError<
  M extends Record<string, unknown> = Record<string, unknown>,
> extends BaseError<M> {
  /**
   * Stable, machine-readable {@link NormErrorCode} when the throw-site
   * set one on `context.code` — branch on this instead of parsing the
   * message. `undefined` when the site left it unset.
   */
  get code(): NormErrorCode | undefined {
    return (this.context as { code?: NormErrorCode }).code;
  }
}
