/**
 * Security-related options for a driver engine.
 *
 * @module
 */

import type { EngineSSLOptions } from './EngineSSLOptions.ts';

/**
 * TLS opt-in for an engine's transport.
 */
export type EngineSecurityOptions = {
  /**
   * `true` enables TLS with the runtime's default trust store; an
   * {@link EngineSSLOptions} object additionally supplies CA/client
   * certificates or relaxes verification. Omitted means plaintext.
   */
  ssl?: boolean | EngineSSLOptions;
};
