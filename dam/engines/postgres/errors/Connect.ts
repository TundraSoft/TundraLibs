import { PostgresError } from '$postgres';
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
          // Authentication errors
          case '28P01':
            message = 'Invalid username or password';
            break;
          case '28000':
            message = 'Invalid authorization specification';
            break;

          // Database errors
          case '3D000':
            message = 'Invalid database name';
            break;
          case '3F000':
            message = 'Invalid schema name';
            break;

          // Connection errors
          case '53300':
            message = 'Too many connections';
            break;
          case '53400':
            message = 'Configuration limit exceeded';
            break;
          case '57P01':
            message = 'Server shut down during connection';
            break;
          case '57P03':
            message = 'Server unavailable - connection refused';
            break;
          case '08000':
            message = 'Connection exception';
            break;
          case '08003':
            message = 'Connection does not exist';
            break;
          case '08006':
            message = 'Connection failure';
            break;

          // Permission errors
          case '42501':
            message = 'Insufficient privilege to connect';
            break;
          case '42000':
            message = 'Syntax error or access rule violation';
            break;

          // SSL/TLS errors
          case '08P01':
            message = 'Protocol violation';
            break;
        }
      }
    }
    super(message, { engine: 'POSTGRES', ...meta }, cause);
  }
}
