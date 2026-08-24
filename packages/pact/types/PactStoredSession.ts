/**
 * @fileoverview Stored-session contract for `@tundralibs/pact` — one record
 * serving both the opaque-session strategy and JWT refresh families.
 *
 * @module
 */

/**
 * Opaque session AND refresh-family record (one concept, two token
 * strategies). `generation` is the refresh rotation counter; `revokedAt`
 * is the reuse-detection tombstone.
 */
export type PactStoredSession = {
  /** Opaque session id / refresh family id (pact mints it). */
  id: string;
  userId: string;
  /** Epoch ms. */
  expiresAt: number;
  /** Current refresh generation (refresh rotation only). */
  generation?: number;
  /**
   * Epoch ms of the last rotation — bounds the `grace` window in which
   * the immediately-previous generation is still accepted (absorbs
   * legitimate concurrent refreshes).
   */
  rotatedAt?: number;
  /** Set when a stale generation was replayed — the family is dead. */
  revokedAt?: number;
  metadata?: Record<string, unknown>;
};
