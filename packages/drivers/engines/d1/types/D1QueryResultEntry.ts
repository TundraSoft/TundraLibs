/**
 * @fileoverview One statement's result entry inside a Cloudflare D1 REST
 * response `result` array.
 *
 * @module
 */

import type { D1RawMeta } from './D1RawMeta.ts';

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
