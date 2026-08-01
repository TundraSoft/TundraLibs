/**
 * @fileoverview Authenticated-principal type for `@tundralibs/pact`.
 * @module
 */

/**
 * The authenticated identity a strategy resolves to. `id` is the only
 * required field (it becomes the JWT `sub` when `autoIssue` is on);
 * everything else is consumer-defined.
 */
export type PACTPrincipal = {
  /** Stable unique identifier of the principal. */
  id: string;
} & Record<string, unknown>;
