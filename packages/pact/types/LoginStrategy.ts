/**
 * @fileoverview Login-strategy type for `@tundralibs/pact`.
 * @module
 */

import type { PACTLoginOutcome } from './PACTLoginOutcome.ts';

/**
 * A pluggable credential verifier: given opaque `credentials`, return the
 * principal (or `null` when they don't check out). Throw only for
 * *operational* failures (store unreachable) — bad credentials are `null`,
 * not an exception.
 */
export type LoginStrategy = (
  credentials: unknown,
) => PACTLoginOutcome | Promise<PACTLoginOutcome>;
