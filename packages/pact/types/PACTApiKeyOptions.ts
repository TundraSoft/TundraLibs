/**
 * @fileoverview API-key minting options for `@tundralibs/pact`.
 * @module
 */

/** Options for `PACT.generateAPIKey`. */
export type PACTApiKeyOptions = {
  /**
   * Prefix stamped on both parts (`<prefix>_ak_…` / `<prefix>_sk_…`) so keys
   * are recognizable in logs and secret scanners.
   *
   * @default 'pact'
   */
  prefix?: string;
  /**
   * Random length of the key id (identifier part).
   *
   * @default 16
   */
  idLength?: number;
  /**
   * Random length of the secret. At the default 32 chars over nanoID's
   * 38-symbol web-safe alphabet this is ~168 bits of entropy.
   *
   * @default 32
   */
  secretLength?: number;
};
