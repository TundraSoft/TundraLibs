import type { PactPrincipal } from './PactPrincipal.ts';

/**
 * Successful login outcome: the resolved principal plus the minted
 * opaque session. The token is shown once — pact stores only its
 * sha-256 — and `expiresAt` is the session's absolute expiry.
 */
export type PactLoginResult<M extends string = string> = {
  readonly principal: PactPrincipal<M>;
  readonly session: {
    readonly token: string;
    readonly expiresAt: Date;
  };
};
