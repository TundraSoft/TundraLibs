import type { PactPrincipal } from './PactPrincipal.ts';
import type { PermissionBits } from './PermissionBits.ts';

/**
 * A pact-minted principal: the plain {@link PactPrincipal} data plus
 * bound `hasPermission`/`assert` evaluating against grants the minting
 * pact keeps fresh (re-resolved when stale or after a revocation API
 * bumps the pact's epoch). Obtained ONLY from `authenticate` (on the
 * auth context) or `Pact.principalOf` — hand-built objects have no
 * working methods, and the capability does not survive serialization or
 * structured clone: across a boundary, pass the id and re-resolve.
 */
export type PactBoundPrincipal<
  M extends string = string,
  B extends PermissionBits = PermissionBits,
> = PactPrincipal<M> & {
  hasPermission(module: M, permission: keyof B): Promise<boolean>;
  assert(module: M, permission: keyof B): Promise<void>;
};
