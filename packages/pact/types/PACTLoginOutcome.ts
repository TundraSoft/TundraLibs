/**
 * @fileoverview Login-outcome type for `@tundralibs/pact`.
 * @module
 */

import type { PACTPrincipal } from './PACTPrincipal.ts';

/**
 * What a strategy may return: a principal, a `{ principal, isNew }` wrapper
 * (OAuth find-or-create flows use `isNew` to signal a just-provisioned
 * account), or `null` for failed credentials.
 */
export type PACTLoginOutcome =
  | PACTPrincipal
  | { principal: PACTPrincipal; isNew?: boolean }
  | null;
