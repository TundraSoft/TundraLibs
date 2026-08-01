/**
 * Connection status for a driver engine.
 *
 * State machine: `CLOSED` → `CONNECTING` → `READY` → `CLOSED`.
 *
 * - **CLOSED**: Engine is disconnected. No active connections.
 * - **CONNECTING**: Engine is establishing its initial connection pool.
 * - **READY**: Engine is connected. Pool saturation (all connections
 *   checked out, callers queued) is reflected in `poolStats.waiting`,
 *   not as a distinct status — the engine is still functionally READY.
 *
 * @module
 */

export type EngineStatus =
  | 'CLOSED'
  | 'CONNECTING'
  | 'READY';
