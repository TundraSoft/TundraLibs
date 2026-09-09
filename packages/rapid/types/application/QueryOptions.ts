/**
 * @fileoverview {@link RapidApplicationQueryOptions} — structural caps for
 * the query-string parser (part of the `server` group).
 *
 * @module
 */

/**
 * Structural caps for the query-string parser. These are ALWAYS-ON
 * denial-of-service guards, not semantic validation — a query exceeding
 * any cap is a 400 (`RAPID_QUERY_INVALID`), enforced lazily on first
 * `ctx.args` access so routes that never read the query never pay (or
 * fail) for it. Every key is optional at the type level; the rAPId
 * constructor fills defaults.
 */
export type RapidApplicationQueryOptions = {
  /**
   * Maximum number of distinct filter fields.
   * @default 50
   */
  maxFilters?: number;
  /**
   * Maximum number of sort instructions.
   * @default 5
   */
  maxSorts?: number;
  /**
   * Maximum length of a single filter value (characters).
   * @default 2048
   */
  maxValueLength?: number;
  /**
   * Maximum items in one array/`in`/`nin` filter.
   * @default 100
   */
  maxArrayItems?: number;
};
