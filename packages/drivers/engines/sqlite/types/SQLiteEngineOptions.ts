import type { SQLEngineOptions } from '../../../types/mod.ts';

/**
 * Configuration options for `SQLiteEngine`.
 *
 * SQLite is in-process, not networked — `host`/`port` are unused.
 *
 * `path` semantics:
 * - `':memory:'` — single in-process memory database. CREATE_SCHEMA /
 *   DROP_SCHEMA are unsupported in this mode and throw.
 * - any other value — interpreted as a parent directory. The engine
 *   creates a subdirectory named after the engine's `name` (lowercased)
 *   and stores `main.db` there. CREATE_SCHEMA spawns one `<schema>.db`
 *   file per schema in the same subdirectory and ATTACHes it; DROP_SCHEMA
 *   detaches and unlinks the file. On `connect()` the engine scans the
 *   subdirectory for existing `*.db` files and ATTACHes each as its
 *   filename (sans extension), so schemas persist across reconnects.
 *
 * @extends SQLEngineOptions
 */
export type SQLiteEngineOptions = SQLEngineOptions & {
  /**
   * `':memory:'` for an in-process db, or a directory path that holds
   * one `.db` file per schema. Required.
   */
  path: string;
  /** Open the database read-only. Default: false. */
  readonly?: boolean;
  /**
   * Create the directory and `main.db` if missing. Default: true. Has no
   * effect in `':memory:'` mode.
   */
  create?: boolean;
};
