import type { PactBoundPrincipal } from './PactBoundPrincipal.ts';
import type { PactOAuthProfile } from './PactOAuthProfile.ts';
import type { PermissionBits } from './PermissionBits.ts';

/**
 * Outcome of `Pact.verifyOAuth` — a verified provider identity WITHOUT a
 * session. `principal` is the local user it resolved to (by link, a
 * verified-email link, or auto-provisioning), or `null` when none
 * matched: the application decides what an unlinked identity may do
 * (link it to a signed-in account, invite-only refusal) before
 * `createSession`. `mfaRequired` is `verifyCredentials`'s flag.
 */
export type PactVerifiedOAuth<
  M extends string = string,
  B extends PermissionBits = PermissionBits,
> = {
  readonly principal: PactBoundPrincipal<M, B> | null;
  readonly profile: PactOAuthProfile;
  readonly mfaRequired: boolean;
};
