/**
 * @fileoverview Runtime-validating hook that types and checks a response.
 *
 * @module
 */

/**
 * Runtime validator/parser for the value a request ultimately resolves
 * to — the response-side counterpart of the compile-time-only generic
 * `_makeRequest<B>` used to carry today. `B` is INFERRED from this
 * function's return type, so a caller no longer has to separately write
 * out and manually keep in sync a type argument that nothing actually
 * checks against the wire.
 *
 * PLAIN FUNCTION, deliberately — no coupling to `@tundralibs/guardian` or
 * any other validation library. A guardian schema's own `.parse` (or
 * `.parseAsync`) satisfies this signature directly:
 *
 * ```typescript ignore
 * this._makeRequest(endpoint, {
 *   responseSchema: (data) => WeatherResponseSchema.parse(data),
 * });
 * ```
 *
 * Runs AFTER {@link RESTlerResponseHandler} if both are given — `data` is
 * the handler's return value, or the raw parsed body if no handler ran.
 * Throwing (a `GuardianError`, or anything else) is wrapped as
 * {@link RESTlerResponseValidationError}, distinguishing "the vendor sent
 * something that doesn't match" from a transport failure or timeout.
 *
 * A response wrapped in a vendor envelope (`{ data, error }`-shaped APIs)
 * needs no special support here: build the envelope as a schema itself —
 * a `Guardian.discriminatedUnion`/`oneOf` composing the per-endpoint inner
 * shape with the shared wrapper — and pass it alone, no handler needed.
 * A successful parse no longer implies success; it means the response
 * matched ONE of the declared shapes, and the caller narrows on the
 * result afterward (e.g. on a discriminant field) instead of being forced
 * into exception-based control flow for an expected error shape.
 */
export type RESTlerResponseSchema<H = unknown, B = H> = (
  data: H,
) => B | Promise<B>;
