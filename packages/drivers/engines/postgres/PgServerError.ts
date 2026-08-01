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
  public readonly code: string;
  public readonly fields: Map<string, string>;

  constructor(code: string, fields: Map<string, string>) {
    super(fields.get('M') ?? 'Postgres server error', { code, fields });
    this.name = 'PgServerError';
    this.code = code;
    this.fields = fields;
  }
}
