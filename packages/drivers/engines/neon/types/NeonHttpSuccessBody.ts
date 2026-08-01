/**
 * @fileoverview Raw 200-response body of a Neon SQL-over-HTTP query.
 *
 * @module
 */

import type { NeonField } from './NeonField.ts';

/**
 * The raw JSON body Neon returns for a successful (HTTP 2xx) query.
 *
 * Because the client sets `Neon-Raw-Text-Output: true` and does **not** set
 * `Neon-Array-Mode`, each entry in `rows` is an object keyed by column name
 * whose values are the raw Postgres text encodings (`string`) or `null` — no
 * type coercion is applied here (that is PR4's job, via the Postgres
 * `decodeValue` path keyed on each {@link NeonField}'s `dataTypeID`).
 *
 * @typeParam R - Row shape; defaults to `Record<string, unknown>`.
 */
export type NeonHttpSuccessBody<R = Record<string, unknown>> = {
  /** Command tag, e.g. `'SELECT'`, `'INSERT'`, `'UPDATE'`. */
  command: string;

  /** Number of rows affected/returned, as reported by Postgres. */
  rowCount: number;

  /** Result rows (objects keyed by column name; raw text values). */
  rows: R[];

  /** Column descriptors, positionally aligned with each row's columns. */
  fields: NeonField[];

  /**
   * `true` when the response was requested in array mode. This client does
   * not enable array mode, so it is expected to be absent/`false`.
   */
  rowAsArray?: boolean;
};
