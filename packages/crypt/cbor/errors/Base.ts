/**
 * @fileoverview Base error class for `@tundralibs/crypt/cbor`.
 *
 * `CBORError` is the only error the CBOR/COSE module raises — every failure
 * is "the bytes are malformed or unsupported". Extends `BaseError` from
 * `@tundralibs/utils` for typed `context` (the byte `offset`), cause chains,
 * and JSON serialisation.
 *
 * @module
 */

import { BaseError } from '@tundralibs/utils';

/** Metadata attached to a {@link CBORError}. */
export type CBORErrorMeta = {
  /** Byte offset at which decoding failed, when known. */
  offset?: number;
} & Record<string, unknown>;

/**
 * Thrown when CBOR bytes cannot be decoded, or a decoded value is not a
 * usable COSE key. Carries the failing byte `offset` on `context` when the
 * decoder knows it.
 */
export class CBORError<M extends CBORErrorMeta = CBORErrorMeta>
  extends BaseError<M> {
  /**
   * Build a CBOR/COSE decode error.
   *
   * @param message - what went wrong (malformed length, unsupported major
   *   type, trailing bytes, bad COSE key, …).
   * @param meta - extra context; `offset` is the byte position of the fault.
   * @param cause - the underlying error, if any.
   */
  constructor(message: string, meta?: M, cause?: Error) {
    super(message, (meta ?? {}) as M, cause);
  }
}
