/**
 * @fileoverview Per-call options for {@link RESTler._makeRequest}.
 *
 * @module
 */
import type { RESTlerResponseHandler } from './RESTlerResponseHandler.ts';
import type { RESTlerResponseSchema } from './RESTlerResponseSchema.ts';

/**
 * Per-call options for `_makeRequest`
 *
 * `responseHandler` and `responseSchema` are independently optional and
 * compose into one pipeline: if `responseHandler` is present, it runs
 * first and its return value feeds `responseSchema` (if also present); if
 * only one is given, its result is final; if neither is given, the
 * response body is used as parsed. See {@link RESTlerResponseHandler} and
 * {@link RESTlerResponseSchema} for what each is for.
 *
 * @typeParam H - Type `responseHandler` resolves to (raw parsed body if
 *   no handler is given — the input `responseSchema` receives).
 * @typeParam B - Final type the request resolves to.
 */
export type RESTlerRequestOptions<H = unknown, B = H> = {
  /** Vendor hook that interprets the response; overrides `_responseHandler`. */
  responseHandler?: RESTlerResponseHandler<H>;
  /** Runtime validator/parser for the value this request resolves to. */
  responseSchema?: RESTlerResponseSchema<H, B>;
  /**
   * Skip the auth-injection step for this ONE request. For a `CUSTOM`
   * auth's own token-fetch — calling `_makeRequest` from inside
   * `_authInjector` would otherwise recurse into `_authInjector` again
   * before the token exists. Everything else `_makeRequest` normally
   * provides (timeout/abort, the `call` event, error normalization,
   * witness/tracing) still applies; only the auth step is skipped.
   */
  skipAuth?: boolean;
};
