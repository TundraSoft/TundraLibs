/**
 * @fileoverview {@link RapidContextState} — the per-invocation state bag shape.
 *
 * @module
 */

/** The per-invocation state bag — an open string-keyed record apps refine with their own shape. */
export type RapidContextState = {
  [key: string]: unknown;
};
