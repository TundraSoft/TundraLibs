/**
 * @fileoverview {@link PactMiddlewareResponder} — the per-request hook an
 * ok verdict carries when the response must be signed or encrypted.
 *
 * @module
 */
import type { PactMiddlewareResponse } from './PactMiddlewareResponse.ts';
import type { PactMiddlewareResponsePatch } from './PactMiddlewareResponsePatch.ts';

/**
 * Call once with the finished response; apply the patch before sending.
 *
 * @throws {PactError} INVALID_CREDENTIALS / NOT_ACTIVE when the key was
 *   revoked or its owner disabled between `authenticate` and the
 *   response — the handler has already run; the adapter lets the
 *   framework's error path take it.
 */
export type PactMiddlewareResponder = (
  res: PactMiddlewareResponse,
) => Promise<PactMiddlewareResponsePatch>;
