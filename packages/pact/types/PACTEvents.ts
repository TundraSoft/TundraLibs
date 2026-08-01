/**
 * @fileoverview Event map for `@tundralibs/pact` — the `E` type parameter of
 * the `Options` base. Consumers subscribe via `_on<Event>` constructor options
 * or `.on(event, handler)`; PACT emits these for audit/side-effects while
 * staying stateless.
 *
 * @module
 */

import type { JWTPayload } from '@tundralibs/crypt/JWT';
import type { PACTGrants } from './PACTGrants.ts';
import type { PACTPrincipal } from './PACTPrincipal.ts';

/** Events emitted by the `PACT` facade. */
export type PACTEvents = {
  // authorization
  /** A permission check via `assert` passed. Useful for audit trails. */
  granted: (
    module: string,
    permission: string | bigint,
    grants: PACTGrants,
  ) => void;
  /** A permission check via `assert` was denied (fires just before the throw). */
  denied: (
    module: string,
    permission: string | bigint,
    grants: PACTGrants,
  ) => void;

  // tokens
  /** A JWT was issued via `generateJWT` (a refresh emits `refresh` instead). */
  issue: (token: string, claims: JWTPayload) => void;
  /**
   * A JWT passed verification (signature, claims, and the revocation seam).
   * Also fires during a successful `refreshJWT` — its inner verification.
   * Fires only after the outcome is final, with listener exceptions
   * isolated: a throwing listener can neither reject the operation nor
   * fire `verifyFailed`.
   */
  verify: (claims: JWTPayload, token: string) => void;
  /**
   * A JWT failed verification — bad signature/claims (crypt `JWTError`) or
   * revocation ({@link PactTokenError}). Fires once per failed `verifyJWT`
   * call, with listener exceptions isolated: a throwing (or rejecting)
   * listener cannot replace the typed error the caller must branch on.
   */
  verifyFailed: (error: Error, token: string) => void;
  /**
   * A JWT was refreshed (verified — including the revocation seam — then
   * re-issued with a fresh expiry). A successful refresh emits `verify`
   * first (from the inner verification), then this. Listener exceptions
   * are isolated — a throwing listener cannot reject the refresh.
   */
  refresh: (token: string, previous: string, claims: JWTPayload) => void;
  /**
   * The `isRevoked` seam vetoed a signature-valid token (fires alongside
   * `verifyFailed`).
   */
  revoked: (claims: JWTPayload, token: string) => void;

  // groups
  /**
   * Group grants were re-synced (manually via `syncGroups()` or by the
   * `syncInterval` timer). Not emitted when there was nothing to sync.
   */
  sync: (groupIds: string[]) => void;
  /**
   * A periodic (timer-driven) sync failed — the resolver threw. Manual
   * `syncGroups()` calls throw to the caller instead of emitting this.
   */
  syncFailed: (error: Error) => void;

  // login
  /**
   * A `login()` succeeded. Fires only after the outcome is final (including
   * any `autoIssue` mint), with listener exceptions isolated: a throwing
   * listener can neither fail the login nor fire `loginFailed`.
   */
  login: (strategy: string, principal: PACTPrincipal, isNew: boolean) => void;
  /**
   * A `login()` failed — bad credentials (strategy returned `null`, no
   * `error`) or an operational failure (strategy threw, `error` set). Fires
   * once per failed attempt, with listener exceptions isolated: a throwing
   * (or rejecting) listener cannot double-fire the event or replace the
   * operational error the caller receives.
   */
  loginFailed: (strategy: string, error?: Error) => void;

  // oauth
  /**
   * An `id_token` was accepted **without** a signature check because the
   * provider's JWKS could not be obtained (unreachable, non-2xx, malformed,
   * or an unresolvable `kid`) and the instance runs the default
   * `'preferred'` policy. Its standard claims were still validated.
   *
   * This is the security-relevant downgrade — alert on it. A token that
   * actually failed verification throws instead and never reaches here.
   * Listener exceptions are isolated.
   */
  idTokenUnverified: (provider: string, reason: string) => void;
};
