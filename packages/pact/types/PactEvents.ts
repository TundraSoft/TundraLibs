import type { PactPrincipal } from './PactPrincipal.ts';

/**
 * The observability seam. Every emission is fire-and-forget with
 * listener errors isolated by the Events base, so a throwing listener
 * can never break an auth flow. Register via `pact.on(...)` or the
 * `_on<name>` keys of the create options.
 */
export type PactEvents<M extends string = string> = {
  /**
   * Successful interactive login; `method` is `'PASSWORD'`,
   * `'PASSKEY'`, an OAuth instance name, or the label `createSession`
   * was given (default `'DIRECT'`).
   */
  login: (principal: PactPrincipal<M>, method: string) => void;
  /**
   * Failed interactive login. `identifier` is what the caller presented
   * (`'<provider>:<subject>'` for OAuth); `code` is the thrown
   * PactError code.
   */
  loginFailed: (identifier: string, code: string) => void;
  /** A session ended via logout; the id is the token's sha-256. */
  logout: (sessionId: string) => void;
  /**
   * `authenticate` rejected a per-request credential with one of the
   * PACT_AUTH_FAILURE_CODES.
   */
  authenticateFailed: (scheme: string, code: string) => void;
  /**
   * An id_token's signature verification degraded to decode-only under
   * the `'PREFERRED'` policy — claims were still validated.
   */
  idTokenUnverified: (provider: string, reason: string) => void;
  /**
   * A refresh token from an older generation was presented outside the
   * grace window — the session family was revoked. Treat as a possible
   * token theft signal.
   */
  refreshReused: (sessionId: string, userId: string) => void;
  /**
   * A passkey assertion presented a signature counter at or below the
   * stored one (both non-zero) — the classic cloned-authenticator
   * signal. The login was rejected as `INVALID_CREDENTIALS`; this event
   * is where the distinction surfaces, server-side only.
   */
  passkeyCloneSuspected: (credentialId: string, userId: string) => void;
};
