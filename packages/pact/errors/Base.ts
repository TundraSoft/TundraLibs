/**
 * @fileoverview {@link PactError} — the package base error, tagged with a
 * code from {@link PactErrorCodes} so callers can branch without parsing
 * messages.
 *
 * @module
 */

import { BaseError, type BaseErrorJson } from '@tundralibs/utils';
import { type PactErrorCode, PactErrorCodes } from './PactErrorCodes.ts';

/**
 * Render bigints (and bigints nested in plain objects/arrays) to strings
 * so the JSON form of an error context is always serializable. Non-plain
 * objects (Dates, class instances) pass through untouched.
 * @internal
 */
const debigint = (value: unknown): unknown => {
  if (typeof value === 'bigint') return value.toString();
  if (Array.isArray(value)) return value.map(debigint);
  if (
    value !== null && typeof value === 'object' &&
    Object.getPrototypeOf(value) === Object.prototype
  ) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = debigint(v);
    return out;
  }
  return value;
};

/**
 * Base error for `@tundralibs/pact`. The code's message template is
 * rendered against `context` (BaseError's `${var}` substitution), so
 * callers branch on {@link PactError.code} or `instanceof` rather than
 * message text.
 *
 * @typeParam M - Shape of the context record.
 */
export class PactError<
  M extends Record<string, unknown> = Record<string, unknown>,
> extends BaseError<M> {
  /** Branch on this rather than the message text. */
  public readonly code: PactErrorCode;

  /**
   * Builds an error from a code, resolving its message template against
   * `context`.
   *
   * @param code - Key into {@link PactErrorCodes}.
   * @param context - Template variables, attached as `error.context`.
   * @param cause - Underlying error to chain.
   */
  constructor(code: PactErrorCode, context: M = {} as M, cause?: Error) {
    super(PactErrorCodes[code], context, cause);
    this.code = code;
  }

  /**
   * BaseError emits `context` as-is, and pact contexts carry bigint
   * permission bits that would make `JSON.stringify` throw. Stringify
   * bigints in the JSON form only — `error.context` keeps the raw
   * values — and expose `code` alongside the standard fields. Patching
   * `BigInt.prototype.toJSON` instead is an app-level decision a library
   * must not make (global side effect on import).
   */
  public override toJSON<T extends BaseErrorJson = BaseErrorJson>(): T {
    return {
      ...super.toJSON<T>(),
      code: this.code,
      context: debigint(this.context) as Record<string, unknown>,
    } as T;
  }
}
