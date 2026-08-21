/**
 * @fileoverview Normalized result returned by {@link D1HttpClient.query}.
 *
 * @module
 */

import type { D1ResultMeta } from './D1ResultMeta.ts';

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
