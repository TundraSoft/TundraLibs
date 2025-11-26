/**
 * SQLite Engine Module
 *
 * This module provides a complete SQLite database engine implementation
 * for the DAM (Database Access Manager) framework.
 *
 * @example Basic usage
 * ```typescript
 * import { SQLiteEngine } from '@tundralibs/dam/engines/sqlite';
 *
 * const engine = new SQLiteEngine('app-db', {
 *   database: './data/app.db',
 *   enableWAL: true,
 *   enableForeignKeys: true
 * });
 *
 * await engine.connect();
 * const result = await engine.execute({
 *   sql: 'SELECT * FROM users WHERE active = :active:',
 *   params: { active: true }
 * });
 * ```
 */

export { SQLiteEngine } from './Engine.ts';
export type { SQLiteEngineOptions } from './types/mod.ts';
