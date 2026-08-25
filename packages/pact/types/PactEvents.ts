/**
 * @fileoverview Event map for `@tundralibs/pact` — the audit seam.
 * Consumers subscribe via `_on<Event>` constructor options or `.on()`;
 * the hardened `Events` base isolates listener faults (a throwing or
 * rejecting listener can never alter an operation's outcome).
 *
 * @module
 */

import type { PactPrincipal } from './PactPrincipal.ts';

/** Events emitted by the `Pact` engine. */
export type PactEvents = {
  /** An account was provisioned via `register()`. */
  register: (principal: PactPrincipal) => void;
  /** A `login()` succeeded (after any session mint). */
  login: (method: string, principal: PactPrincipal, isNew: boolean) => void;
  /** A `login()` failed — bad credentials (no `error`) or operational. */
  loginFailed: (method: string, error?: Error) => void;
  /**
   * A token failed verification — bad signature/claims, wrong token
   * type, revoked, or a dead session. `verify` then resolves `null`;
   * this event carries the typed error for audit.
   */
  verifyFailed: (error: Error, token: string) => void;
  /** An `assert()` was denied (fires just before the throw). */
  denied: (
    principal: PactPrincipal | null,
    permission: string | bigint,
    module: string,
  ) => void;
  /** A stale refresh generation was replayed — family revoked. ALERT. */
  refreshReuse: (userId: string, familyId: string) => void;
  /** A session/family was ended via `logout()`/`logoutAll()`. */
  logout: (userId: string, familyId?: string) => void;
  /**
   * An `id_token` was accepted WITHOUT a signature check because the
   * provider's JWKS could not be obtained and the instance runs the
   * default `'PREFERRED'` policy. Claims were still validated. This is
   * the security-relevant downgrade — alert on it.
   */
  idTokenUnverified: (provider: string, reason: string) => void;
};
