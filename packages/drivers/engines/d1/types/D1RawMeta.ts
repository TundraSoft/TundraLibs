/**
 * @fileoverview Raw `meta` object of a Cloudflare D1 REST statement result.
 *
 * @module
 */

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
