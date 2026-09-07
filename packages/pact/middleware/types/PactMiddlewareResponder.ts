/**
 * @fileoverview {@link PactMiddlewareResponder} — the per-request hook an
 * ok verdict carries when the response must be signed or encrypted.
 *
 * @module
 */
import type { PactMiddlewareResponse } from './PactMiddlewareResponse.ts';
import type { PactMiddlewareResponsePatch } from './PactMiddlewareResponsePatch.ts';

/** Call once with the finished response; apply the patch before sending. */
export type PactMiddlewareResponder = (
  res: PactMiddlewareResponse,
) => Promise<PactMiddlewareResponsePatch>;
