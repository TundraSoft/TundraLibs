/**
 * @fileoverview Raw wire response body of a Cloudflare D1 REST query.
 *
 * @module
 */

import type { D1Error, D1Message } from './D1Error.ts';

/**
 * The raw `meta` object D1 returns alongside each statement result.
 *
 * Keys are `snake_case` on the wire; {@link D1HttpClient.query} camel-cases the
 * subset the engine needs into a {@link D1ResultMeta}. All fields are optional
 * because D1 omits some for read-only statements and may add more over time.
 *
 * Confirmed against the Cloudflare D1 REST API reference (operation
 * `d1-query-database`):
 * https://developers.cloudflare.com/api/resources/d1/subresources/database/methods/query/
 */
export type D1RawMeta = {
  /** Number of rows the statement changed. */
  changes?: number;

  /** `rowid` of the last inserted row, or `0`/`null` when none was inserted. */
  last_row_id?: number | null;

  /** Number of rows read while executing the statement. */
  rows_read?: number;

  /** Number of rows written while executing the statement. */
  rows_written?: number;

  /** Server-side execution time in milliseconds. */
  duration?: number;

  /** Whether the statement modified the database. */
  changed_db?: boolean;

  /** Whether the request was served by the primary database instance. */
  served_by_primary?: boolean;

  /** Region that served the request (e.g. `'EEUR'`). */
  served_by_region?: string;

  /** Identifier of the instance that served the request. */
  served_by?: string;

  /** Database file size (bytes) after the operation. */
  size_after?: number;
};

/**
 * One statement's result entry inside the D1 response `result` array.
 *
 * For a single-statement `query` the client reads `result[0]`. `results` holds
 * the rows as objects keyed by column name (the `/query` endpoint's object
 * form — the client does not use the array-form `/raw` endpoint), and the
 * client performs **no** value coercion.
 *
 * @typeParam R - Row shape; defaults to `Record<string, unknown>`.
 */
export type D1QueryResultEntry<R = Record<string, unknown>> = {
  /** Whether this statement succeeded. */
  success: boolean;

  /** Result rows (objects keyed by column name; raw values). */
  results: R[];

  /** Per-statement metadata (row counts, timing, last insert id, …). */
  meta: D1RawMeta;
};

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
