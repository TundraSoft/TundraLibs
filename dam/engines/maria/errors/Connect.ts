import { SqlError } from '$maria';
import {
  DAMEngineConnectError,
  type DAMEngineErrorMeta,
} from '../../../errors/mod.ts';

export class MariaEngineConnectError extends DAMEngineConnectError<
  DAMEngineErrorMeta & { host: string; port: number; username: string }
> {
  constructor(
    meta: { name: string; host: string; port: number; username: string },
    cause: Error,
  ) {
    let message = cause.message || 'Failed to connect to MariaDB server';

    // Extract and translate Maria-specific error codes
    if (cause instanceof SqlError) {
      switch (cause.code) {
        case 'ER_ACCESS_DENIED_ERROR':
          message = 'Access denied: Invalid username or password';
          break;
        case 'ER_HOST_NOT_PRIVILEGED':
          message = 'Host is not allowed to connect to this MariaDB server';
          break;
        case 'ER_DBACCESS_DENIED_ERROR':
          message = 'Access denied to database';
          break;
        case 'ER_BAD_DB_ERROR':
          message = 'Database does not exist';
          break;
        case 'ER_CON_COUNT_ERROR':
          message = 'Too many connections to MariaDB server';
          break;
        case 'ER_HOST_IS_BLOCKED':
          message = 'Host is blocked due to too many connection errors';
          break;
        case 'ETIMEDOUT':
          message = 'Connection timed out when connecting to MariaDB server';
          break;
        case 'ECONNREFUSED':
          message = 'Connection refused by MariaDB server';
          break;
        case 'PROTOCOL_CONNECTION_LOST':
          message = 'Connection to MariaDB server was lost';
          break;
        case 'PROTOCOL_ENQUEUE_AFTER_FATAL_ERROR':
          message = 'Cannot establish new connection after fatal error';
          break;
        case 'ER_SERVER_SHUTDOWN':
          message = 'MariaDB server is shutting down';
          break;
        case 'ER_SSL_CONNECTION_ERROR':
          message = 'SSL connection error';
          break;
      }
    }

    super(message, { engine: 'MARIA', ...meta }, cause);
  }
}
