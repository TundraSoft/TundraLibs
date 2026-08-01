/**
 * @fileoverview Typed result returned by {@link NeonHttpClient.sql}.
 *
 * @module
 */

import type { NeonField } from './NeonField.ts';

/**
 * The typed result of a {@link NeonHttpClient.sql} call.
 *
 * Values in `rows` are the raw Postgres text encodings as returned by Neon
 * (this client requests raw-text output and performs no coercion) — the PR4
 * engine decodes them to JS values using each {@link NeonField}'s
 * `dataTypeID`.
 *
 * @typeParam R - Row shape; defaults to `Record<string, unknown>`.
 */
export type NeonQueryResult<R = Record<string, unknown>> = {
  /** Result rows (objects keyed by column name; raw text values). */
  rows: R[];

  /** Column descriptors for the result set. */
  fields: NeonField[];

  /** Number of rows affected/returned, as reported by Postgres. */
  rowCount: number;

  /** Command tag, e.g. `'SELECT'`, `'INSERT'`. */
  command: string;
};
