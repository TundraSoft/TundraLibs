import {
  DAMEngineConnectError,
  type DAMEngineErrorMeta,
} from '../../../errors/mod.ts';

/**
 * Error thrown when connection to a SQLite database fails
 */
export class SQLiteEngineConnectError extends DAMEngineConnectError<
  DAMEngineErrorMeta & { type: 'MEMORY' | 'FILE'; storagePath?: string }
> {
  constructor(
    meta: {
      name: string;
      type: 'MEMORY' | 'FILE';
      storagePath?: string;
    },
    cause?: Error,
  ) {
    let message = 'Failed to connect to SQLite database';
    if (meta.type === 'FILE' && meta.storagePath) {
      message += ` at ${meta.storagePath}`;
    }

    super(
      message,
      {
        engine: 'SQLITE',
        ...meta,
      },
      cause,
    );
  }
}
