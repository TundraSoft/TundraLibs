/**
 * @fileoverview Base permission registry type for `@tundralibs/pact`.
 * @module
 */

/**
 * Base permission registry: permission name → BigInt bit value. Values are
 * normally single bits (`1n << n`) but any positive, unique BigInt is valid
 * (a composite value acts as an all-of alias). BigInt (not `number`) is
 * deliberate — JS bitwise operators are 32-bit signed, capping `number`
 * masks at 31 usable bits; BigInt is unbounded.
 *
 * @example `{ READ: 1n, EDIT: 2n, DELETE: 4n, PUBLISH: 8n }`
 */
export type PactPermissionBits = Record<string, bigint>;
