import type { HMACHashAlgorithm } from './HMACHashAlgorithm.ts';

/** Options for HMAC signing and verification. */
export type HMACOptions = {
  /**
   * Hash algorithm to use.
   * @default 'SHA-256'
   */
  hashAlgorithm?: HMACHashAlgorithm;
};
