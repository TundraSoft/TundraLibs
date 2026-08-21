/**
 * @fileoverview Normalized per-statement metadata of a
 * {@link D1HttpClient.query} call.
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
