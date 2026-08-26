/**
 * @fileoverview `authorize(module, permission)` — the pact adapter's
 * permission check. Built on layer 1's `authorize(check)` (single
 * source of truth for the 401/403 enforcement), so it's really just
 * `pact.can()` wired in as the check — no separate `can()` export (see
 * DESIGN-Auth.md's "Considered & rejected").
 *
 * @module
 */

import { inject } from '@tundralibs/doctor';
import type { PactPrincipal } from '@tundralibs/pact';
import type { RapidMiddleware } from '../../types/mod.ts';
import { authorize as coreAuthorize } from '../mod.ts';
import { PACT } from './pact.ts';

/**
 * Require the caller to be authenticated AND hold `permission` on
 * `module` — `pact.can(principal, module, permission)` under the hood.
 * 401 when `ctx.auth` is absent, 403 when the permission check fails.
 * A `ctx.auth` set by something other than this adapter (e.g. BYO auth)
 * is treated as an active principal with no grants unless it already
 * carries a `grants` bag.
 *
 * Argument order is `(module, permission)`, matching pact's own
 * `can(principal, module, permission)` (pact 0.6.0+).
 *
 * @throws {RapidError} RAPID_UNAUTHENTICATED / RAPID_ACCESS_DENIED.
 * @throws {PactDefinitionError} on catalog validation — an unknown
 *   `module` or a `permission` not applicable to it — via pact's
 *   `Permissions.has`.
 * @throws {UnregisteredVialError} when `pact()` has not run yet.
 */
export function authorize(
  module: string,
  permission: string,
): RapidMiddleware {
  const { pact } = inject(PACT);
  return coreAuthorize((auth) => {
    const principal = auth as Partial<PactPrincipal>;
    return pact.can(
      { ...principal, grants: principal.grants ?? {} } as PactPrincipal,
      module,
      permission,
    );
  });
}
