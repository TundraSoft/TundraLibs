/**
 * @fileoverview {@link PactMiddlewareDenial} — what an adapter sends when
 * the core refuses a request.
 *
 * @module
 */

/**
 * A refusal the framework adapter turns into a response: the status, the
 * JSON body with the stable error code, and the headers to set —
 * `www-authenticate` on a 401 (unless challenges are off). Codes are
 * pact's, plus the middleware's own `NO_CREDENTIALS` and
 * `STALE_TIMESTAMP` (both 401).
 */
export type PactMiddlewareDenial = {
  readonly status: 400 | 401 | 403 | 409 | 500;
  readonly body: { readonly error: string };
  readonly headers: Readonly<Record<string, string>>;
};
