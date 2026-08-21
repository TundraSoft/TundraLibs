/**
 * @fileoverview What a witness learns about the operation it wraps.
 *
 * @module
 */

/**
 * What a {@link Witness} learns about the operation it wraps: a span-style
 * name and flat attributes. RESTler names requests
 * `restler.<vendor> <METHOD>` and passes the vendor, method, and raw path
 * as attributes — never the resolved URL or query string, which can carry
 * credentials or PII.
 */
export type WitnessInfo = {
  /** Span-style operation name, e.g. `restler.github GET`. */
  name: string;
  /** Flat descriptive attributes, e.g. `{ 'restler.vendor': 'github' }`. */
  attributes?: Record<string, unknown>;
};
