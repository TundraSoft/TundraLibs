/**
 * @fileoverview {@link PactMiddlewareResponsePatch} — what a verdict's
 * `respond()` returns: headers to add and, when the payload was
 * encrypted, the body that replaces the handler's.
 *
 * @module
 */

/** Apply both before the response leaves — the headers are lowercase. */
export type PactMiddlewareResponsePatch = {
  /** `x-signature`/`x-timestamp`/nonce echo, `content-type` when encrypted. */
  readonly headers: Readonly<Record<string, string>>;
  /** The compact JWE replacing the handler's body; absent when not encrypted. */
  readonly body?: string;
};
