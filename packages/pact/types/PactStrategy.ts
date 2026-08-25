/**
 * @fileoverview Custom login-strategy signature for `@tundralibs/pact` —
 * the escape hatch for methods pact does NOT verify itself (LDAP,
 * magic-link, SSO). The line: pact-verifies → hook; externally-verified →
 * strategy.
 *
 * @module
 */

import type { PactStrategyResult } from './PactStrategyResult.ts';

/** A strategy may be sync or async. */
type MaybePromise<T> = T | Promise<T>;

/** A named credential verifier — `login(name, credentials)` runs it. */
export type PactStrategy = (
  credentials: unknown,
) => MaybePromise<PactStrategyResult>;
