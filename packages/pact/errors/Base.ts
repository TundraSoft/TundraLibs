/**
 * @fileoverview Base error class + typed metadata for `@tundralibs/pact`.
 *
 * Extends {@link BaseError} from `@tundralibs/utils` so every pact error
 * shares the project-wide contract (typed `context`, `${var}` substitution,
 * cause chains, JSON serialization) — mirrors the norm/drivers pattern.
 * Concrete errors (one per file) set a stable {@link PactErrorCode} on
 * `context.code`; callers branch on `instanceof` and/or {@link PactError.code}.
 *
 * @module
 */

import { BaseError } from '@tundralibs/utils';
import type { PactErrorCode } from './PactErrorCodes.ts';

/**
 * Metadata carried on a {@link PactError}'s `context` — a stable `code`
 * plus whatever the throw site attaches (`module`, `permission`,
 * `provider`, …).
 */
export type PactErrorMeta = {
  /** Stable error code — see {@link PactErrorCode}. */
  code: PactErrorCode;
} & Record<string, unknown>;

/**
 * Base error for the pact package. Concrete pact errors extend this class.
 *
 * @typeParam M - shape of the error `context`.
 */
export class PactError<
  M extends Record<string, unknown> = Record<string, unknown>,
> extends BaseError<M> {
  /**
   * Stable, machine-readable {@link PactErrorCode} when the throw site set
   * one on `context.code` — branch on this instead of parsing the message.
   * `undefined` when the site left it unset.
   */
  get code(): PactErrorCode | undefined {
    return (this.context as { code?: PactErrorCode }).code;
  }
}
