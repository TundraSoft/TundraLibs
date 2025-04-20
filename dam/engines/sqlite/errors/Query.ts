import { SqliteError } from '$sqlite';

import {
  type DAMEngineErrorMeta,
  DAMEngineQueryError,
} from '../../errors/mod.ts';
import type { Query } from '../../../query/mod.ts';

/**
 * Error thrown when connection to a SQLite database fails
 */
export class SQLiteEngineQueryError extends DAMEngineQueryError<
  DAMEngineErrorMeta & {
    query: Query;
  }
> {
  constructor(
    meta: { name: string; query: Query },
    cause?: Error,
  ) {
    const message = cause?.message || 'Failed to execute SQLite query';

    // Extract and translate PostgreSQL-specific error codes
    // @TODO: Add SQLite error code mapping
    if (cause instanceof SqliteError) {
      console.log(cause);
    }

    super(message, { engine: 'SQLITE', ...meta }, cause);
  }
}
