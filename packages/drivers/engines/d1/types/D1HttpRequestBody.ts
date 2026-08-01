/**
 * @fileoverview JSON request body for a Cloudflare D1 REST query.
 *
 * @module
 */

/**
 * The JSON body POSTed to
 * `…/d1/database/{databaseId}/query` for a single statement.
 *
 * `params` are the positional bind values for the `?` placeholders in `sql`,
 * serialized as a JSON array in order. The client sends them exactly as given
 * (no coercion) — how values are encoded for the wire is the caller's / the
 * forthcoming `D1Engine`'s responsibility.
 */
export type D1HttpRequestBody = {
  /** SQL text with positional (`?`) placeholders. */
  sql: string;

  /** Positional bind values for the placeholders, in order. */
  params: readonly unknown[];
};
