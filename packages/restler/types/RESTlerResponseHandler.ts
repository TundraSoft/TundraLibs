/**
 * @fileoverview Vendor hook that interprets a parsed response.
 *
 * @module
 */
import type { RESTlerResponse } from './RESTlerResponse.ts';

/**
 * Vendor-specific hook that interprets a parsed response
 *
 * Runs after the body has been parsed (so it is independent of the
 * JSON/XML/TEXT content handling) on every response, including error
 * statuses and empty bodies. Receives the FULL response (status/headers
 * included, not just the body) — a vendor convention like "errors are a
 * `2xx` with an error envelope" needs more than the body to detect.
 *
 * - **throw** to signal the error (throw a {@link RESTlerError} subclass to
 *   surface it unwrapped; anything else is wrapped in a
 *   `RESTlerRequestError` with the original as `cause`), or
 * - **return** the value that becomes the request's result — unwrap a
 *   vendor envelope (`{ data, error } -> data`), or simply
 *   `response.body` unchanged if nothing needs transforming.
 *
 * Composes with {@link RESTlerResponseSchema}: if both are given to
 * `_makeRequest`, this handler's return value is what the schema then
 * validates. Neither is required — a schema alone (encoding the full
 * "wrapped or not" shape itself, e.g. via a discriminated union) is a
 * complete, valid way to use `_makeRequest` with no handler at all.
 *
 * Set a vendor-wide default via the client's `_responseHandler` field, or
 * pass one per call in {@link RESTlerRequestOptions} (which takes
 * precedence).
 */
export type RESTlerResponseHandler<H = unknown> = (
  response: RESTlerResponse<unknown>,
) => H | Promise<H>;
