/**
 * Events emitted by a driver engine at the connection lifecycle level.
 *
 * Engine subclasses (e.g. `SQLEngine`) extend this with their own events
 * (`transactionBegin`, `query`, `slowQuery`, etc.).
 *
 * @example
 * ```ts
 * engine.on('connect', (instanceId) => console.log(`${instanceId} ready`));
 * engine.on('connectionFailed', (instanceId, err) => console.error(err));
 * ```
 *
 * @module
 */

export type EngineEvents = {
  /** Emitted when the engine successfully connects (pool established). */
  connect: (instanceId: string) => void;
  /** Emitted when the engine disconnects (pool drained). */
  disconnect: (instanceId: string) => void;
  /** Emitted when initial connection establishment fails. */
  connectionFailed: (instanceId: string, error: Error) => void;
  /** Emitted for non-fatal errors during the engine's lifetime. */
  error: (instanceId: string, error: Error) => void;
  /** Emitted for warning conditions (pool saturation, unusual states, etc.). */
  warn: (instanceId: string, message: string) => void;
  /**
   * Emitted for server-side notice / informational messages
   * (Postgres `NOTICE`, MariaDB warning, Redis/Memcached TLS-downgrade
   * notices, etc.). Distinct from `warn` — `notice` is "the server told
   * us something", `warn` is "we noticed something off".
   */
  notice: (instanceId: string, message: string) => void;
};
