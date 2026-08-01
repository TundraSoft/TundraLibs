/**
 * Common options for all driver engines at the connection-lifecycle
 * level. Subclasses (e.g. `SQLEngineOptions`) extend this with their
 * own concerns (transactionTimeout, slowQueryThreshold,
 * autoRollbackOnFailure, etc.).
 *
 * @module
 */

import type { EngineNetworkOptions } from './EngineNetworkOptions.ts';
import type { EnginePoolOptions } from './EnginePoolOptions.ts';
import type { EngineSecurityOptions } from './EngineSecurityOptions.ts';

export type EngineOptions =
  & {
    /**
     * Function used to generate unique IDs for queries, transactions, etc.
     * Defaults to a ULID-based generator.
     */
    idGenerator?: (prefix?: string) => string;
    /** Pool configuration. */
    pool?: EnginePoolOptions;
  }
  & EngineNetworkOptions
  & EngineSecurityOptions;
