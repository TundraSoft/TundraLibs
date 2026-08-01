/**
 * @fileoverview Successful-login result type for `@tundralibs/pact`.
 * @module
 */

import type { PACTPrincipal } from './PACTPrincipal.ts';

/**
 * Successful result of `PACT.login`. `token` is present when the `autoIssue`
 * option is on (a JWT with `sub = principal.id`).
 */
export type PACTLoginResult = {
  principal: PACTPrincipal;
  /** True when the strategy reported a freshly provisioned principal. */
  isNew: boolean;
  /** Auto-issued JWT (only with the `autoIssue` option). */
  token?: string;
};
