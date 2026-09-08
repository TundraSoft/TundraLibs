/**
 * @fileoverview {@link PactMiddlewareCore} — what `createPactMiddleware`
 * returns: the two framework-neutral halves every adapter wraps.
 *
 * @module
 */
import type { PactAuthContext, PermissionBits } from '../../types/mod.ts';
import type { PactMiddlewareDenial } from './PactMiddlewareDenial.ts';
import type { PactMiddlewareRequest } from './PactMiddlewareRequest.ts';
import type { PactMiddlewareVerdict } from './PactMiddlewareVerdict.ts';

/** The neutral core an adapter turns into framework handlers. */
export type PactMiddlewareCore<
  B extends PermissionBits = PermissionBits,
  M extends string = string,
> = {
  /** The `WWW-Authenticate` value — one challenge per accepted scheme. */
  readonly challenge: string;
  /**
   * Extract the credential from `req` and authenticate it. Absent →
   * `{ ok: true, auth: undefined }` when `optional`, else a 401 denial;
   * present but invalid → a 401 denial, never `auth: undefined`. When
   * the response must be signed (HMAC caller) or encrypted (a caller who
   * sent a JWE, accepts one, or `encryption.required`), the ok verdict
   * carries a `respond()` to run on the finished response, and the
   * decrypted `body` when one arrived.
   */
  authenticate(
    req: PactMiddlewareRequest,
  ): Promise<PactMiddlewareVerdict<M, B>>;
  /**
   * A guard over an attached auth context: `undefined` to proceed, a 401
   * denial when `auth` is absent, a 403 denial when the grant is missing.
   * Typed by the instance; the catalog is checked when the guard is
   * built, so a typo fails at boot.
   */
  authorize(
    module: M,
    permission: keyof B & string,
  ): (
    auth: PactAuthContext<M, B> | undefined,
  ) => Promise<PactMiddlewareDenial | undefined>;
};
