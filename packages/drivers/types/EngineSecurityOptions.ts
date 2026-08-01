/**
 * Security-related options for a driver engine.
 *
 * @module
 */

import type { EngineSSLOptions } from './EngineSSLOptions.ts';

export type EngineSecurityOptions = {
  ssl?: boolean | EngineSSLOptions;
};
