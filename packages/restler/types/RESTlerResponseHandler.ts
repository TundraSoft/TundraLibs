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
 * statuses and empty bodies. Use it to translate vendor conventions —
 * e.g. a `200` whose body carries an error envelope:
 *
 * - **throw** to signal the error (throw a {@link RESTlerError} subclass to
 *   surface it unwrapped; anything else is wrapped in a
 *   `RESTlerRequestError` with the original as `cause`), or
 * - **mutate** `response.body` to unwrap an envelope
 *   (`{ data, error } -> data`).
 *
 * Set a vendor-wide default via the client's `_responseHandler` field, or
 * pass one per call as the second argument of `_makeRequest` (which takes
 * precedence).
 */
export type RESTlerResponseHandler = (
  response: RESTlerResponse<unknown>,
) => void | Promise<void>;
