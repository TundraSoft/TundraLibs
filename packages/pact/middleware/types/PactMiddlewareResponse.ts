/**
 * @fileoverview {@link PactMiddlewareResponse} — the finished response an
 * adapter hands to a verdict's `respond()` after the handler ran.
 *
 * @module
 */

/**
 * The status and the body as it will be sent — the signature covers
 * these bytes. A streamed body cannot be signed or encrypted; adapters
 * skip `respond()` for streams.
 */
export type PactMiddlewareResponse = {
  readonly status: number;
  readonly body: Uint8Array | string | null;
};
