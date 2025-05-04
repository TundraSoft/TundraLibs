import { SqliteError } from '$sqlite';

import {
  type DAMEngineErrorMeta,
  DAMEngineQueryError,
} from '../../../errors/mod.ts';
import type { Query } from '../../../types/mod.ts';

/**
 * Error thrown when a query to a SQLite database fails
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
    let message = cause?.message || 'Failed to execute SQLite query';

    // Extract and translate SQLite-specific error codes
    if (cause instanceof SqliteError && typeof cause.code === 'number') {
      // Map SQLite error codes to more user-friendly messages
      // See: https://www.sqlite.org/rescode.html
      switch (cause.code) {
        // SQLITE_ERROR (1): SQL error or missing database
        case 1:
          message = 'SQL syntax error';
          break;

        // SQLITE_INTERNAL (2): Internal logic error
        case 2:
          message = 'SQLite internal logic error';
          break;

        // SQLITE_PERM (3): Access permission denied
        case 3:
          message = 'Access permission denied';
          break;

        // SQLITE_ABORT (4): Callback routine requested an abort
        case 4:
          message = 'Operation aborted';
          break;

        // SQLITE_BUSY (5): Database is locked
        case 5:
          message = 'Database is locked';
          break;

        // SQLITE_LOCKED (6): Database table is locked
        case 6:
          message = 'Database table is locked';
          break;

        // SQLITE_NOMEM (7): Out of memory
        case 7:
          message = 'Out of memory';
          break;

        // SQLITE_READONLY (8): Attempt to write to readonly database
        case 8:
          message = 'Attempt to write to readonly database';
          break;

        // SQLITE_INTERRUPT (9): Operation terminated by sqlite3_interrupt
        case 9:
          message = 'Operation interrupted';
          break;

        // SQLITE_IOERR (10): Disk I/O error
        case 10:
          message = 'Disk I/O error';
          break;

        // SQLITE_CORRUPT (11): Database disk image is malformed
        case 11:
          message = 'Database is corrupted';
          break;

        // SQLITE_NOTFOUND (12): Unknown opcode in sqlite3_file_control
        case 12:
          message = 'File control operation not found';
          break;

        // SQLITE_FULL (13): Insertion failed because database is full
        case 13:
          message = 'Database is full';
          break;

        // SQLITE_CANTOPEN (14): Unable to open database file
        case 14:
          message = 'Unable to open database file';
          break;

        // SQLITE_PROTOCOL (15): Database lock protocol error
        case 15:
          message = 'Database lock protocol error';
          break;

        // SQLITE_EMPTY (16): Database is empty
        case 16:
          message = 'Database is empty';
          break;

        // SQLITE_SCHEMA (17): Database schema changed
        case 17:
          message = 'Database schema changed';
          break;

        // SQLITE_TOOBIG (18): String or BLOB exceeds size limit
        case 18:
          message = 'String or BLOB exceeds size limit';
          break;

        // SQLITE_CONSTRAINT (19): Abort due to constraint violation
        case 19:
          message = 'Constraint violation';
          break;

        // SQLITE_MISMATCH (20): Data type mismatch
        case 20:
          message = 'Data type mismatch';
          break;

        // SQLITE_MISUSE (21): Library used incorrectly
        case 21:
          message = 'SQLite API used incorrectly';
          break;

        // SQLITE_NOLFS (22): Uses OS features not supported on host
        case 22:
          message = 'OS feature not supported on host';
          break;

        // SQLITE_AUTH (23): Authorization denied
        case 23:
          message = 'Authorization denied';
          break;

        // SQLITE_FORMAT (24): Auxiliary database format error
        case 24:
          message = 'Auxiliary database format error';
          break;

        // SQLITE_RANGE (25): 2nd parameter to sqlite3_bind out of range
        case 25:
          message = 'Parameter binding out of range';
          break;

        // SQLITE_NOTADB (26): File opened that is not a database file
        case 26:
          message = 'File is not a database file';
          break;

        // Extended result codes
        // SQLITE_BUSY_RECOVERY (261): Another process is recovering a WAL mode database file
        case 261:
          message = 'Database is busy recovering';
          break;

        // SQLITE_LOCKED_SHAREDCACHE (262): Shared cache mode table is locked
        case 262:
          message = 'Shared cache table is locked';
          break;

        // SQLITE_READONLY_RECOVERY (264): Recovery in progress, database is readonly
        case 264:
          message = 'Database is in recovery mode (readonly)';
          break;

        // SQLITE_IOERR_READ (266): I/O error during read operation
        case 266:
          message = 'I/O error during read operation';
          break;

        // SQLITE_CORRUPT_VTAB (267): Virtual table content is corrupt
        case 267:
          message = 'Virtual table content is corrupt';
          break;

        // SQLITE_CONSTRAINT_CHECK (275): A CHECK constraint failed
        case 275:
          message = 'CHECK constraint failed';
          break;

        // SQLITE_CONSTRAINT_COMMITHOOK (531): Commit hook caused rollback
        case 531:
          message = 'Commit hook caused rollback';
          break;

        // SQLITE_CONSTRAINT_FOREIGNKEY (787): Foreign key constraint failed
        case 787:
          message = 'Foreign key constraint failed';
          break;

        // SQLITE_CONSTRAINT_FUNCTION (1043): Function failed
        case 1043:
          message = 'Function constraint failed';
          break;

        // SQLITE_CONSTRAINT_NOTNULL (1299): NOT NULL constraint failed
        case 1299:
          message = 'NOT NULL constraint failed';
          break;

        // SQLITE_CONSTRAINT_PRIMARYKEY (1555): PRIMARY KEY constraint failed
        case 1555:
          message = 'PRIMARY KEY constraint failed';
          break;

        // SQLITE_CONSTRAINT_TRIGGER (1811): RAISE function within trigger failed
        case 1811:
          message = 'Trigger constraint failed';
          break;

        // SQLITE_CONSTRAINT_UNIQUE (2067): UNIQUE constraint failed
        case 2067:
          message = 'UNIQUE constraint failed';
          break;

        // SQLITE_CONSTRAINT_VTAB (2323): Virtual table constraint failed
        case 2323:
          message = 'Virtual table constraint failed';
          break;

        // SQLITE_READONLY_CANTLOCK (520): Database is readonly; cannot get a lock
        case 520:
          message = 'Cannot lock readonly database';
          break;

        // SQLITE_IOERR_DELETE (2570): I/O error while deleting file
        case 2570:
          message = 'I/O error while deleting file';
          break;
      }
    }

    super(message, { engine: 'SQLITE', ...meta }, cause);
  }
}
