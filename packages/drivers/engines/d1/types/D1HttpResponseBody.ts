/**
 * @fileoverview Raw wire response body of a Cloudflare D1 REST query.
 *
 * @module
 */

import type { D1Error } from './D1Error.ts';
import type { D1Message } from './D1Message.ts';
import type { D1QueryResultEntry } from './D1QueryResultEntry.ts';

/**
 * The raw JSON envelope Cloudflare D1 returns for a REST query.
 *
 * The same envelope is used for success and failure: `success` is `false` and
 * `errors` carries the `{ code, message }` failures when the query fails
 * (whether the HTTP status was 2xx or not). On success, `result` holds one
 * {@link D1QueryResultEntry} per statement.
 *
 * @typeParam R - Row shape; defaults to `Record<string, unknown>`.
 */
export type D1HttpResponseBody<R = Record<string, unknown>> = {
  /** Overall success flag for the request. */
  success: boolean;

  /** Failure entries; populated (with `success: false`) when the query fails. */
  errors: D1Error[];

  /** Informational messages, if any. */
  messages: D1Message[];

  /** One result entry per statement (a single-statement query uses `[0]`). */
  result: D1QueryResultEntry<R>[];
};
