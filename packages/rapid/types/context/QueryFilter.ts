/**
 * @fileoverview {@link RapidContextQueryFilter} — one parsed filter condition,
 * normalised to a single-operator object.
 *
 * @module
 */

/**
 * One parsed query filter, ALWAYS an operator object — a bare
 * `field=value` normalises to `{ $eq: value }`, so consumers switch on
 * exactly one shape. Values are raw STRINGS from the query (except the
 * comparison operators, which coerce numeric-looking values, and
 * `$null`'s boolean): the parser is structural only — semantic
 * validation (types, allowed fields) belongs to the consumer.
 */
export type RapidContextQueryFilter =
  | { $eq: string }
  | { $ne: string }
  | { $gt: string | number }
  | { $gte: string | number }
  | { $lt: string | number }
  | { $lte: string | number }
  | { $like: string }
  | { $ilike: string }
  | { $null: boolean }
  | { $in: string[] }
  | { $nin: string[] };
