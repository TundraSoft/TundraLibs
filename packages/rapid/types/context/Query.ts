/**
 * @fileoverview {@link RapidContextQuery} — the parsed query-string shape
 * carried in `ctx.args.query`.
 *
 * @module
 */

import type { RapidContextQueryFilter } from './QueryFilter.ts';
import type { RapidContextQuerySort } from './QuerySort.ts';

/**
 * The parsed query string: filters (keys LOWERCASED, values normalised
 * to operator objects) and sort instructions, in order. UNTRUSTED
 * carrier — the parser applies structural caps only; field allowlists,
 * re-casing, and type validation are the consumer's job (or the binder
 * tier's, once modules land).
 */
export type RapidContextQuery = {
  filters: Readonly<Record<string, RapidContextQueryFilter>>;
  sorting: readonly RapidContextQuerySort[];
};
