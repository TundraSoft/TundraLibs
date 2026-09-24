/**
 * @fileoverview Per-request options for {@link RESTler._makeStreamRequest}.
 *
 * @module
 */

import type { RESTlerResponseHandler } from './RESTlerResponseHandler.ts';

/**
 * Options for a streamed request.
 *
 * Deliberately NOT {@link RESTlerRequestOptions}: a streamed response hands
 * back an unread `ReadableStream`, and `responseSchema` cannot validate one
 * without consuming it — so the option does not exist here rather than being
 * documented as ignored.
 *
 * `responseHandler` survives, but runs only on a FAILURE status (see
 * `errorStatus`). A vendor's error envelope is a small document worth reading;
 * a success body is the payload the caller asked to stream, and reading it to
 * hand to a hook would defeat the purpose.
 */
export type RESTlerStreamOptions<H = unknown> = {
  /**
   * Vendor hook that interprets a FAILED response; overrides
   * `_responseHandler`. Never runs on success — the success body is the
   * stream, and is handed to the caller unread.
   */
  responseHandler?: RESTlerResponseHandler<H>;
  /** Skip the auth injection this vendor would otherwise apply. */
  skipAuth?: boolean;
  /**
   * Statuses treated as a failure, meaning the body is read as a normal
   * (parsed) error document and `responseHandler` runs on it.
   *
   * Defaults to "anything outside 2xx". A vendor that signals failure inside a
   * 200 cannot be supported here — that convention needs the whole body, which
   * is the one thing streaming refuses to buffer.
   */
  errorStatus?: (status: number) => boolean;
  /**
   * Idle timeout in seconds: how long the transfer may go without receiving a
   * chunk before it is aborted. Resets on every chunk, so a large but healthy
   * download never trips it — unlike the vendor-wide `timeout`, which caps a
   * request's TOTAL duration at 120s and would kill any sizeable transfer.
   *
   * The vendor-wide `timeout` still bounds the wait for response HEADERS.
   *
   * @default 60
   */
  idleTimeout?: number;
};
