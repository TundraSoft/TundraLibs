/**
 * Engine-feature flags. The abstract base reads these to decide
 * whether a given query type is supported on the dialect; throws a
 * friendly error if not (e.g. SQLite has no schemas, no
 * materialised views, no `TRUNCATE`).
 */
export type DialectSupport = {
  /** Schema/namespace DDL (`CREATE_SCHEMA`, `DROP_SCHEMA`). */
  schema: boolean;
  /**
   * Materialised views (`CREATE_VIEW { materialized: true }`,
   * `REFRESH_MATERIALIZED_VIEW`).
   */
  materializedView: boolean;
  /** `TRUNCATE` statement. SQLite emulates with `DELETE FROM`. */
  truncate: boolean;
  /** `RIGHT JOIN`. Older SQLite (<3.39) doesn't support it. */
  rightJoin: boolean;
  /** `FULL JOIN`. SQLite supports it as of 3.39. */
  fullJoin: boolean;
  /**
   * `RETURNING` support. The package only emits RETURNING on
   * `INSERT` and `UPSERT` across the board — `UPDATE` and
   * `DELETE` intentionally never carry it. Engines fetch the
   * affected rows separately when callers need them.
   *
   * Per-dialect:
   * - Postgres / SQLite (3.35+): both true.
   * - MariaDB 10.5+: `insert: true`, `upsert: false`
   *   (`ON DUPLICATE KEY UPDATE` has no RETURNING form).
   */
  returning: {
    insert: boolean;
    upsert: boolean;
  };
};
