/**
 * @fileoverview Minted API-key type for `@tundralibs/pact`.
 * @module
 */

/** A freshly minted API key pair — see `PACT.generateAPIKey`. */
export type PACTApiKey = {
  /** Public identifier (`<prefix>_ak_…`) — safe to store/index in plaintext. */
  id: string;
  /**
   * The secret (`<prefix>_sk_…`) — show it once, never store it. Consumers
   * authenticate later requests by presenting it.
   */
  secret: string;
  /** SHA-256 hex of `secret` — what the consumer persists for verification. */
  secretHash: string;
};
