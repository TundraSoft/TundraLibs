/**
 * @fileoverview Normalized result returned by {@link D1HttpClient.query}.
 *
 * @module
 */

/**
 * The normalized `meta` of a {@link D1HttpClient.query} call.
 *
 * The wire keys D1 returns as `snake_case` are camel-cased here for the
 * engine's convenience; the values themselves are untouched. `lastRowId` is
 * `null` when the statement inserted no row.
 */
export type D1ResultMeta = {
  /** Number of rows the statement changed. */
  changes: number;

  /** `rowid` of the last inserted row, or `null` when none was inserted. */
  lastRowId: number | null;

  /** Number of rows read while executing the statement, when reported. */
  rowsRead?: number;

  /** Number of rows written while executing the statement, when reported. */
  rowsWritten?: number;

  /** Server-side execution time in milliseconds, when reported. */
  duration?: number;
};

/**
 * The typed result of a {@link D1HttpClient.query} call.
 *
 * `results` are the rows exactly as D1 returned them (objects keyed by column
 * name; this client requests the object-form `/query` endpoint and performs no
 * value coercion) — the forthcoming `D1Engine` decodes them to JS values. `meta`
 * is the camel-cased subset of D1's per-statement metadata.
 *
 * @typeParam R - Row shape; defaults to `Record<string, unknown>`.
 */
export type D1QueryResult<R = Record<string, unknown>> = {
  /** Result rows (objects keyed by column name; raw values). */
  results: R[];

  /** Normalized per-statement metadata. */
  meta: D1ResultMeta;
};
