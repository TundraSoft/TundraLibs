/**
 * @fileoverview Construction options for the `@tundralibs/pact`
 * `IdTokenVerifier`.
 * @module
 */

import type { IdTokenVerificationPolicy } from './IdTokenVerificationPolicy.ts';

/** Construction options for {@link IdTokenVerifier}. */
export type IdTokenVerifierOptions = {
  /** Availability policy — see {@link IdTokenVerificationPolicy}. */
  policy?: IdTokenVerificationPolicy;
  /** JWKS cache lifetime in ms. @default 3600000 */
  ttl?: number;
  /**
   * Called when verification degraded to decode-only under `'preferred'`.
   * The facade turns this into the `idTokenUnverified` event so operators can
   * alert on silent downgrades.
   */
  onDegraded?: (reason: string) => void;
};
