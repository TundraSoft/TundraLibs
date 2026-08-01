/**
 * @fileoverview JSON request body for a Neon SQL-over-HTTP query.
 *
 * @module
 */

/**
 * The JSON body POSTed to `https://<host>/sql` for a single query.
 *
 * `params` are the positional bind values for the `$1`, `$2`, … placeholders
 * in `query`, serialized as a JSON array in order. The client sends them
 * exactly as given (no coercion) — how values are encoded for the wire is the
 * caller's / PR4 engine's responsibility.
 */
export type NeonHttpRequestBody = {
  /** SQL text with positional (`$1`, `$2`, …) placeholders. */
  query: string;

  /** Positional bind values for the placeholders, in order. */
  params: readonly unknown[];
};
