/**
 * @fileoverview Error raised by {@link TursoHttpClient} for a failed statement.
 *
 * `TursoHttpClient.execute` throws this when Turso / libSQL reports an error —
 * either a per-statement `{ type: 'error' }` result (HTTP still `200`) or a
 * top-level error body on a non-2xx response. It extends {@link DriverError}
 * (the drivers-package base, the same one `NeonHttpError` and `PgServerError`
 * use), so the forthcoming `TursoEngine` can catch it alongside the other
 * driver errors and translate its SQLite `code` into an `EngineError`.
 *
 * @module
 */

import { DriverError } from '../../errors/mod.ts';

/**
 * Structured metadata carried by a {@link TursoHttpError}.
 */
export type TursoHttpErrorMeta = {
  /**
   * SQLite error code, when the server supplied one — e.g. `SQLITE_ERROR` or
   * an extended code like `SQLITE_CONSTRAINT_PRIMARYKEY`. Absent for a
   * transport/protocol failure the server did not code.
   */
  code?: string;

  /**
   * HTTP status of the response, when the error came from a non-2xx reply
   * (the top-level pipeline-error form). Absent for a per-statement error,
   * which arrives inside a `200` response.
   */
  status?: number;

  /**
   * Raw response body when it was **not** a recognizable Hrana error JSON
   * (e.g. a gateway HTML/text error page), kept for diagnostics.
   */
  detail?: string;
};

/**
 * Thrown by {@link TursoHttpClient.execute} when Turso / libSQL reports an
 * error.
 *
 * The `message` is the server's error message, and `code` is the SQLite error
 * code when one was supplied. Both are surfaced as own properties (in addition
 * to `context`) so the engine can map `code` to an `EngineError` code without
 * reaching into metadata.
 */
export class TursoHttpError extends DriverError<TursoHttpErrorMeta> {
  /** SQLite error code, when the server supplied one. */
  public readonly code?: string;

  /** HTTP status, when the error came from a non-2xx response. */
  public readonly status?: number;

  constructor(message: string, meta: TursoHttpErrorMeta = {}, cause?: Error) {
    super(message, meta, cause);
    this.name = 'TursoHttpError';
    this.code = meta.code;
    this.status = meta.status;
  }
}
