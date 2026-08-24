/**
 * @fileoverview `@tundralibs/pact/authz` — the dependency-free
 * authorization core: the bitmask {@link Permissions} engine and the
 * grants codec. Pure, synchronous BigInt math with no crypto, network, or
 * hook machinery — importable from any runtime including the browser
 * (permission editors, mask tooling, authz-only services).
 *
 * @module
 */

export { Permissions } from '../Permissions.ts';
export {
  combineGrants,
  deserializeGrants,
  serializeGrants,
} from '../grants.ts';
