/**
 * SQLite Engine Configuration Options
 *
 * Defines the configuration type for SQLite database connections.
 * SQLite uses file-based storage with simple configuration options.
 *
 * @example Basic SQLite configuration
 * ```typescript
 * const options: SQLiteEngineOptions = {
 *   database: './data/app.db',
 *   cacheSize: -64000,
 *   synchronous: 'NORMAL'
 * };
 * ```
 *
 * @example In-memory database
 * ```typescript
 * const options: SQLiteEngineOptions = {
 *   database: ':memory:'
 * };
 * ```
 */

import type { EngineOptions } from '../../../engine/types/mod.ts';

/**
 * SQLite-specific engine configuration options
 */
export type SQLiteEngineOptions = EngineOptions & {
  /**
   * Path to the SQLite database file
   * Use ':memory:' for in-memory database
   * @example './data/myapp.db'
   * @example ':memory:'
   */
  database: string;

  /**
   * Cache size in pages (negative for KB)
   * Larger cache improves performance
   * @default -64000 (64MB)
   */
  cacheSize?: number;

  /**
   * Synchronous mode setting
   * - 'OFF': No syncing (fastest, least safe)
   * - 'NORMAL': Sync at critical moments (default)
   * - 'FULL': Always sync (safest, slowest)
   * @default 'NORMAL'
   */
  synchronous?: 'OFF' | 'NORMAL' | 'FULL';
};
