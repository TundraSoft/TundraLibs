/**
 * @fileoverview Error raised by {@link D1HttpClient} for a failed query.
 *
 * `D1HttpClient.query` throws this when Cloudflare D1 reports an error — either
 * a non-2xx response, or a 2xx envelope whose `success` is `false` and whose
 * `errors` array carries the failure. It extends {@link DriverError} (the
 * drivers-package base, the same one `NeonHttpError` and `TursoHttpError` use),
 * so the forthcoming `D1Engine` can catch it alongside the other driver errors
 * and translate its SQLite-style `message` (and, where useful, `code`) into an
 * `EngineError` via the shared `sqliteErrorToCode` / `parseSqliteErrorMeta`
 * helpers.
 *
 * @module
 */

import { DriverError } from '../../errors/mod.ts';

/**
 * Structured metadata carried by a {@link D1HttpError}.
 */
export type D1HttpErrorMeta = {
  /**
   * Cloudflare's **numeric** API/D1 error code, when the body carried a
   * recognizable D1 error entry (e.g. `7500`). This is Cloudflare's code, not
   * the SQLite `SQLITE_*` string — the SQLite-style detail is in `message`.
   */
  code?: number;

  /**
   * HTTP status of the response, when the error came from a non-2xx reply.
   * Absent for a query-level failure that arrived inside a 2xx envelope
   * (`success: false`).
   */
  status?: number;

  /**
   * Raw response body when it was **not** a recognizable D1 error JSON
   * (e.g. a gateway HTML/text error page), kept for diagnostics.
   */
  detail?: string;
};

/**
 * Thrown by {@link D1HttpClient.query} when Cloudflare D1 reports an error.
 *
 * The `message` is the server's error message — for a query failure this is
 * SQLite-style (e.g. `UNIQUE constraint failed: t.email`), the text the engine
 * maps to an `EngineError`. `code` is Cloudflare's numeric error code when one
 * was supplied, and `status` is the HTTP status when the error came from a
 * non-2xx reply. Both are surfaced as own properties (in addition to `context`)
 * so the engine can inspect them without reaching into metadata.
 */
export class D1HttpError extends DriverError<D1HttpErrorMeta> {
  /** Cloudflare numeric API/D1 error code, when the server supplied one. */
  public readonly code?: number;

  /** HTTP status, when the error came from a non-2xx response. */
  public readonly status?: number;

  constructor(message: string, meta: D1HttpErrorMeta = {}, cause?: Error) {
    super(message, meta, cause);
    this.name = 'D1HttpError';
    this.code = meta.code;
    this.status = meta.status;
  }
}
