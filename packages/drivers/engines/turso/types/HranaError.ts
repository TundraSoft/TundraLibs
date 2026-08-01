/**
 * @fileoverview Hrana `Error` — the wire shape of a server-reported error.
 *
 * @module
 */

/**
 * A server-reported error in the Hrana wire protocol.
 *
 * It appears in two places, both handled by {@link TursoHttpClient.execute}:
 * inside a per-statement `{ type: 'error', error }` stream result (the HTTP
 * response is still `200`), and as the whole JSON body of a non-2xx response
 * when the pipeline itself failed.
 *
 * `message` is a human-readable description; `code` is an optional
 * machine-readable code — for SQLite failures this is the `SQLITE_*` /
 * extended (`SQLITE_CONSTRAINT_PRIMARYKEY`, …) error code the engine maps to
 * an `EngineError`.
 *
 * Confirmed against the Hrana v3 spec's `Error` type:
 * https://github.com/tursodatabase/libsql/blob/main/docs/HRANA_3_SPEC.md
 */
export type HranaError = {
  /** Human-readable error message. */
  message: string;

  /** Machine-readable error code (e.g. `SQLITE_CONSTRAINT_PRIMARYKEY`). */
  code?: string | null;
};
