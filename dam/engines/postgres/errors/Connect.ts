import { PostgresError } from '$postgres2';
import {
  DAMEngineConnectError,
  type DAMEngineErrorMeta,
} from '../../errors/mod.ts';

export class PostgresEngineConnectError extends DAMEngineConnectError<
  DAMEngineErrorMeta & { host: string; port: number; username: string }
> {
  constructor(
    meta: { name: string; host: string; port: number; username: string },
    cause: Error,
  ) {
    let message = cause.message || 'Failed to connect to Postgres server';
    if (cause instanceof PostgresError) {
      if (cause.name === 'TimedOut') {
        message = 'Connection timed out when trying to connect to Postgres';
      } else if (cause.fields) {
        switch (cause.fields.code) {
          case '28P01':
            message = 'Invalid username or password';
            break;
          case '3D000':
            message = 'Invalid database name';
            break;
        }
      }
    }
    super(message, { engine: 'POSTGRES', ...meta }, cause);
  }
}
