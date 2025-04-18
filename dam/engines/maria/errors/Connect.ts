// import { SqlError } from '$maria';
import {
  DAMEngineConnectError,
  type DAMEngineErrorMeta,
} from '../../errors/mod.ts';

export class MariaEngineConnectError extends DAMEngineConnectError<
  DAMEngineErrorMeta & { host: string; port: number; username: string }
> {
  constructor(
    meta: { name: string; host: string; port: number; username: string },
    cause: Error,
  ) {
    const message = cause.message || 'Failed to connect to Postgres server';
    super(message, { engine: 'MARIA', ...meta }, cause);
  }
}
