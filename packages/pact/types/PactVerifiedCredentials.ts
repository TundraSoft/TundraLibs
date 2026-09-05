import type { PactBoundPrincipal } from './PactBoundPrincipal.ts';
import type { PermissionBits } from './PermissionBits.ts';

/**
 * Outcome of `Pact.verifyCredentials` — proven identity WITHOUT a
 * session. The first half of the login seam: apps insert their own
 * steps (an MFA challenge via `verifyMFA`, device checks, terms
 * acceptance) between this and `createSession`. `mfaRequired` reflects
 * whether the stored user carries an MFA secret; enforcing the
 * challenge is the application's responsibility.
 */
export type PactVerifiedCredentials<
  M extends string = string,
  B extends PermissionBits = PermissionBits,
> = {
  readonly principal: PactBoundPrincipal<M, B>;
  readonly mfaRequired: boolean;
};
