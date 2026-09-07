/**
 * @fileoverview {@link PactMiddlewareVerdict} — the outcome of the core's
 * `authenticate(req)`.
 *
 * @module
 */
import type { PactAuthContext, PermissionBits } from '../../types/mod.ts';
import type { PactMiddlewareDenial } from './PactMiddlewareDenial.ts';
import type { PactMiddlewareResponder } from './PactMiddlewareResponder.ts';

/**
 * Either the request may proceed — with its auth context, or `undefined`
 * when no credential was presented and `optional` allows that — or it is
 * denied. A non-pact error (a failing hook) is THROWN, never a verdict:
 * the adapter hands it to the framework's own error handling.
 */
export type PactMiddlewareVerdict<
  M extends string = string,
  B extends PermissionBits = PermissionBits,
> =
  | {
    readonly ok: true;
    readonly auth: PactAuthContext<M, B> | undefined;
    /** The decrypted request payload, when one arrived encrypted. */
    readonly body?: Uint8Array;
    /**
     * Present when the response must be signed or encrypted for this
     * caller: call it with the finished response after the handler ran
     * and apply the patch before sending.
     */
    readonly respond?: PactMiddlewareResponder;
  }
  | { readonly ok: false; readonly denial: PactMiddlewareDenial };
