/**
 * @fileoverview Hrana `StmtResult` — the raw wire result of one statement.
 *
 * @module
 */

import type { HranaCol } from './HranaCol.ts';
import type { HranaValue } from './HranaValue.ts';

/**
 * The raw result of a single executed statement, exactly as it appears on the
 * wire inside an `execute` stream response (`snake_case` keys, `rows` as an
 * array of positional {@link HranaValue} cells aligned to `cols`).
 *
 * {@link TursoHttpClient.execute} normalizes this into the camel-cased
 * {@link HranaExecuteResult} it returns; the extra bookkeeping fields
 * (`rows_read`, `rows_written`, `query_duration_ms`) are modelled for
 * completeness but dropped by that normalization.
 *
 * Confirmed against the Hrana v3 spec's `StmtResult` type:
 * https://github.com/tursodatabase/libsql/blob/main/docs/HRANA_3_SPEC.md
 */
export type HranaStmtResult = {
  /** Column descriptors for the result set. */
  cols: HranaCol[];

  /** Result rows: each an array of cell values positionally aligned to `cols`. */
  rows: HranaValue[][];

  /** Number of rows the statement affected (`snake_case` on the wire). */
  affected_row_count: number;

  /**
   * `rowid` of the last inserted row as a decimal string (64-bit, string to
   * preserve precision), or `null` when the statement inserted no row.
   */
  last_insert_rowid: string | null;

  /** Rows read while executing the statement (optional bookkeeping). */
  rows_read?: number;

  /** Rows written while executing the statement (optional bookkeeping). */
  rows_written?: number;

  /** Wall-clock execution time in milliseconds (optional bookkeeping). */
  query_duration_ms?: number;
};
