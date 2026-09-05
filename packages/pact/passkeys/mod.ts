/**
 * Internal WebAuthn ceremony machinery for the Pact passkey methods.
 *
 * @module
 */
export {
  COSE_BY_ALGORITHM,
  type NormalizedPasskeyConfig,
  normalizePasskeyConfig,
  verifyAssertionCeremony,
  verifyRegistrationCeremony,
} from './verify.ts';
export type { AssertionVerdict } from './verify.ts';
