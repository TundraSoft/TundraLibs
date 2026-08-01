/**
 * Events specific to SQL-style engines, on top of `EngineEvents`.
 *
 * @module
 */

import type { EngineEvents } from './EngineEvents.ts';
import type { QueryEngineEvents } from './QueryEngineEvents.ts';

/**
 * Events specific to SQL-style engines: the {@link EngineEvents}
 * lifecycle set, the {@link QueryEngineEvents} `query` / `slowQuery`
 * pair, and SQL-only transaction events.
 *
 * @see {@link EngineEvents}
 * @see {@link QueryEngineEvents}
 */
export type SQLEngineEvents = EngineEvents & QueryEngineEvents & {
  /** Emitted on successful BEGIN/START TRANSACTION. */
  transactionBegin: (instanceId: string, transactionId: string) => void;
  /** Emitted on successful COMMIT. */
  transactionCommit: (instanceId: string, transactionId: string) => void;
  /** Emitted on successful ROLLBACK (manual or auto). */
  transactionRollback: (instanceId: string, transactionId: string) => void;
  /** Emitted when a transaction is auto-rolled back due to timeout. */
  transactionTimeout: (instanceId: string, transactionId: string) => void;
};
