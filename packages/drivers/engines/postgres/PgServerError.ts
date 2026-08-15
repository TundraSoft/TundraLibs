/**
 * @fileoverview Postgres server-protocol error class.
 *
 * `PgConnection` raises this when the backend returns an
 * `ErrorResponse` ('E') message. It carries the SQLSTATE code and the
 * full field map so the engine can map it to an `EngineError` code.
 *
 * @module
 */

import { DriverError } from '../../errors/mod.ts';

type PgServerErrorMeta = {
  code: string;
  fields: Map<string, string>;
};

/** Errors raised by `PgConnection` carrying the server's ErrorResponse fields. */
export class PgServerError extends DriverError<PgServerErrorMeta> {
  /** SQLSTATE code from the server ErrorResponse. */
  public readonly code: string;
  /** Full server ErrorResponse field map. */
  public readonly fields: Map<string, string>;

  /**
   * Construct a Postgres server error from an ErrorResponse.
   *
   * @param fields Server ErrorResponse fields; the `M` field is the message.
   */
  constructor(code: string, fields: Map<string, string>) {
    super(fields.get('M') ?? 'Postgres server error', { code, fields });
    this.name = 'PgServerError';
    this.code = code;
    this.fields = fields;
  }
}
