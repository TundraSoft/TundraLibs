/**
 * @fileoverview The single user-lookup key for `@tundralibs/pact` — a
 * discriminated query that collapses by-id / by-identifier / by-OAuth
 * lookups into one `getUser` hook.
 *
 * @module
 */

/**
 * The lookup key handed to the `getUser` hook. One hook serves every
 * lookup pact needs:
 *
 * - `IDENTIFIER` — credential login (the returned user carries `secret`)
 * - `ID` — token/session → principal resolution
 * - `OAUTH` — federated identity mapping (provider-scoped subject)
 */
export type PactUserQuery =
  | { by: 'IDENTIFIER'; identifier: string }
  | { by: 'ID'; id: string }
  | { by: 'OAUTH'; provider: string; subject: string };
