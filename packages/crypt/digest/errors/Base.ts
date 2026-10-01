/**
 * @fileoverview Base error class for `@tundralibs/crypt/digest`.
 *
 * `DigestError` is raised when the runtime refuses a PBKDF2 derivation, for
 * example Cloudflare Workers rejecting more than 100 000 iterations. Malformed
 * input to {@link ../pbkdf2.ts | pbkdf2Verify} is not an error; it verifies
 * `false`.
 *
 * @module
 */

import { BaseError } from '@tundralibs/utils';
import type { PBKDF2Hash } from '../types/mod.ts';

/** Metadata attached to a {@link DigestError}. */
export type DigestErrorMeta = {
  /** Digest the derivation used. */
  hash: PBKDF2Hash;
  /** Iteration count the runtime was asked for. */
  iterations: number;
} & Record<string, unknown>;

/**
 * Thrown when the runtime rejects a PBKDF2 derivation. The runtime's own
 * error is the `cause`; `context` carries the `hash` and `iterations`.
 */
export class DigestError<M extends DigestErrorMeta = DigestErrorMeta>
  extends BaseError<M> {
  /**
   * Build a PBKDF2 derivation error.
   *
   * @param message - what went wrong.
   * @param meta - the `hash` and `iterations` that were requested.
   * @param cause - the runtime's rejection.
   */
  constructor(message: string, meta: M, cause?: Error) {
    super(message, meta, cause);
  }
}
