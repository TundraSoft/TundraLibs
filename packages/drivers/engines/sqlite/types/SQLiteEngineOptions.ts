import type { SQLEngineOptions } from '../../../types/mod.ts';

/**
 * Configuration options for `SQLiteEngine`.
 *
 * SQLite is in-process, not networked — `host`/`port` are unused.
 *
 * `path` semantics:
 * - `':memory:'` — single in-process memory database.
 * - any other value — interpreted as a parent directory. The engine
 *   creates a subdirectory named after the engine's `name` (lowercased)
 *   and stores `main.db` there, so multiple named engines can share one
 *   parent directory without colliding on filenames.
 *
 * SQLite has no schema object in either mode — `CREATE_SCHEMA` /
 * `DROP_SCHEMA` are unsupported and throw. An OQL `schema` on any other
 * query is instead folded into the physical name as a `<schema>_<name>`
 * prefix, so every "schema" lives in the same `main.db`.
 *
 * @extends SQLEngineOptions
 */
export type SQLiteEngineOptions = SQLEngineOptions & {
  /** `':memory:'` for an in-process db, or a parent directory. Required. */
  path: string;
  /** Open the database read-only. Default: false. */
  readonly?: boolean;
  /**
   * Create the directory and `main.db` if missing. Default: true. Has no
   * effect in `':memory:'` mode.
   */
  create?: boolean;
};
