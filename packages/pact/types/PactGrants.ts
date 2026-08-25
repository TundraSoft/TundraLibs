/**
 * @fileoverview A principal's granted-permissions type for
 * `@tundralibs/pact`.
 * @module
 */

/**
 * A principal's granted permissions: module name → combined BigInt mask.
 *
 * @example `{ Post: 6n }` — the mask `6n` is `READ|EDIT`
 */
export type PactGrants = Record<string, bigint>;
