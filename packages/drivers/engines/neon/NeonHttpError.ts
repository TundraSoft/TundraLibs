/**
 * @fileoverview Error raised by {@link NeonHttpClient} for a failed query.
 *
 * `NeonHttpClient.sql` throws this when Neon answers a query with a non-2xx
 * status. It extends {@link DriverError} (the drivers-package base, the same
 * one `PgServerError` uses), so the PR4 engine can catch it alongside the
 * other driver errors and translate its SQLSTATE `code` into an
 * `EngineError` code.
 *
 * @module
 */

import { DriverError } from '../../errors/mod.ts';
import type { NeonPostgresError } from './types/mod.ts';

/**
 * Structured metadata carried by a {@link NeonHttpError}.
 */
export type NeonHttpErrorMeta = {
  /** HTTP status of the failed response. */
  status: number;

  /** Postgres SQLSTATE code, when the body was a Postgres error JSON. */
  code?: string;

  /** The full Postgres error object, when one was returned. */
  fields?: NeonPostgresError;

  /**
   * Raw response body when it was **not** a recognizable Postgres error JSON
   * (e.g. a gateway HTML/text error page).
   */
  detail?: string;
};

/**
 * Thrown by {@link NeonHttpClient.sql} when Neon returns a non-2xx response.
 *
 * The `message` is the Postgres error message (or a generic HTTP-status
 * message when the body was not a Postgres error JSON), `code` is the
 * SQLSTATE when available, and `status` is the HTTP status. The complete
 * Postgres error object is preserved on `meta.fields` for the engine to
 * inspect.
 */
export class NeonHttpError extends DriverError<NeonHttpErrorMeta> {
  /** HTTP status of the failed response. */
  public readonly status: number;

  /** Postgres SQLSTATE code, when available. */
  public readonly code?: string;

  constructor(message: string, meta: NeonHttpErrorMeta, cause?: Error) {
    super(message, meta, cause);
    this.name = 'NeonHttpError';
    this.status = meta.status;
    this.code = meta.code;
  }
}
