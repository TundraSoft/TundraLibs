/**
 * @fileoverview Normalized result returned by {@link TursoHttpClient.execute}.
 *
 * @module
 */

import type { HranaCol } from './HranaCol.ts';
import type { HranaValue } from './HranaValue.ts';

/**
 * The normalized result of a {@link TursoHttpClient.execute} call.
 *
 * This is the raw Hrana `StmtResult` with its `snake_case` keys camel-cased
 * for the engine's convenience; the values themselves are untouched. In
 * particular `rows` are positional arrays of raw {@link HranaValue} cells
 * (aligned to `cols`) — the client performs **no** value coercion, so the
 * engine decodes each cell to a JS value using its `HranaValue` tag and the
 * matching {@link HranaCol}.
 */
export type HranaExecuteResult = {
  /** Column descriptors for the result set. */
  cols: HranaCol[];

  /** Result rows: each an array of raw {@link HranaValue} cells, aligned to `cols`. */
  rows: HranaValue[][];

  /** Number of rows the statement affected. */
  affectedRowCount: number;

  /**
   * `rowid` of the last inserted row as a decimal string (kept as a string to
   * preserve 64-bit precision), or `null` when no row was inserted.
   */
  lastInsertRowid: string | null;
};
