import { SQLiteEngineConnectError, SQLiteEngineQueryError } from '../mod.ts';
import * as asserts from '$asserts';
import { SqliteError } from '$sqlite';

Deno.test('DAM.engines.SQLite.Errors', async (t) => {
  await t.step('SQLiteEngineConnectError', async (connectErrorTest) => {
    await connectErrorTest.step('should create memory-type error', () => {
      const error = new SQLiteEngineConnectError(
        { name: 'test-db', type: 'MEMORY' },
        new Error('Original error'),
      );

      asserts.assertEquals(error.name, 'SQLiteEngineConnectError');
      console.log(error.message, '-');
      asserts.assert(
        error.message.includes('Failed to connect to SQLite database'),
      );
      asserts.assertEquals(error.context.engine, 'SQLITE');
      asserts.assertEquals(error.context.name, 'test-db');
      asserts.assertEquals(error.context.type, 'MEMORY');
      asserts.assertEquals((error.cause as Error)?.message, 'Original error');
    });

    await connectErrorTest.step(
      'should create file-type error with path',
      () => {
        const error = new SQLiteEngineConnectError(
          { name: 'test-file-db', type: 'FILE', storagePath: '/path/to/db' },
          new Error('File error'),
        );

        asserts.assertEquals(error.name, 'SQLiteEngineConnectError');
        asserts.assert(
          error.message.includes('Failed to connect to SQLite database'),
        );
        asserts.assertEquals(error.context.engine, 'SQLITE');
        asserts.assertEquals(error.context.name, 'test-file-db');
        asserts.assertEquals(error.context.type, 'FILE');
        asserts.assertEquals(error.context.storagePath, '/path/to/db');
        asserts.assertEquals((error.cause as Error)?.message, 'File error');
      },
    );

    await connectErrorTest.step('should work without cause', () => {
      const error = new SQLiteEngineConnectError(
        { name: 'no-cause-db', type: 'MEMORY' },
      );

      asserts.assertEquals(error.name, 'SQLiteEngineConnectError');
      asserts.assert(
        error.message.includes('Failed to connect to SQLite database'),
      );
      asserts.assertEquals(error.context.engine, 'SQLITE');
      asserts.assertEquals(error.context.name, 'no-cause-db');
      asserts.assertEquals(error.context.type, 'MEMORY');
      asserts.assertEquals(error.cause, undefined);
    });
  });

  await t.step('SQLiteEngineQueryError', async (queryErrorTest) => {
    await queryErrorTest.step('should create error with query details', () => {
      const query = { id: 'test-query', sql: 'SELECT * FROM test' };
      const error = new SQLiteEngineQueryError(
        { name: 'test-db', query },
        new Error('Query failed'),
      );

      asserts.assertEquals(error.name, 'SQLiteEngineQueryError');
      asserts.assertEquals(error.message, 'Query failed');
      asserts.assertEquals(error.context.engine, 'SQLITE');
      asserts.assertEquals(error.context.name, 'test-db');
      asserts.assertEquals(error.context.query, query);
      asserts.assertEquals((error.cause as Error)?.message, 'Query failed');
    });

    await queryErrorTest.step('should work without cause', () => {
      const query = { id: 'no-cause-query', sql: 'SELECT 1' };
      const error = new SQLiteEngineQueryError(
        { name: 'test-db', query },
      );

      asserts.assertEquals(error.name, 'SQLiteEngineQueryError');
      asserts.assertEquals(error.message, 'Failed to execute SQLite query');
      asserts.assertEquals(error.context.engine, 'SQLITE');
      asserts.assertEquals(error.context.name, 'test-db');
      asserts.assertEquals(error.context.query, query);
      asserts.assertEquals(error.cause, undefined);
    });

    await queryErrorTest.step('should handle SQLite error instances', () => {
      const query = { id: 'sqlite-error', sql: 'SELECT * FROM non_existent' };
      // Create a SqliteError-like object since we can't directly instantiate one
      const sqliteError = new Error('no such table: non_existent');
      Object.defineProperty(sqliteError, 'constructor', { value: sqliteError });

      const error = new SQLiteEngineQueryError(
        { name: 'test-db', query },
        sqliteError,
      );

      asserts.assertEquals(error.name, 'SQLiteEngineQueryError');
      asserts.assertEquals(error.message, 'no such table: non_existent');
      asserts.assertEquals(error.context.engine, 'SQLITE');
      asserts.assertEquals(error.context.query, query);
    });

    await queryErrorTest.step('should handle basic SQLite error codes', () => {
      const query = { id: 'error-codes', sql: 'SELECT * FROM test' };

      // Create a SqliteError with code 1 (syntax error)
      const syntaxError = new SqliteError(1, 'near "SLECT": syntax error');

      const error1 = new SQLiteEngineQueryError(
        { name: 'test-db', query },
        syntaxError,
      );
      asserts.assertEquals(error1.message, 'SQL syntax error');

      // Test database locked (5)
      const lockedError = new SqliteError(5, 'database is locked');

      const error2 = new SQLiteEngineQueryError(
        { name: 'test-db', query },
        lockedError,
      );
      asserts.assertEquals(error2.message, 'Database is locked');

      // Test readonly database (8)
      const readonlyError = new Error('Attempt to write to readonly database');
      // @ts-ignore - Adding code for testing
      readonlyError.code = 8;
      Object.defineProperty(readonlyError, 'constructor', {
        value: SqliteError,
      });

      const error3 = new SQLiteEngineQueryError(
        { name: 'test-db', query },
        readonlyError as SqliteError,
      );
      asserts.assertEquals(
        error3.message,
        'Attempt to write to readonly database',
      );
    });

    await queryErrorTest.step('should handle constraint error codes', () => {
      const query = {
        id: 'constraint-errors',
        sql: 'INSERT INTO users VALUES (...)',
      };

      // Test general constraint violation (19)
      const constraintError = new SqliteError(19, 'constraint failed');
      // @ts-ignore - Adding code for testing
      constraintError.code = 19;
      Object.defineProperty(constraintError, 'constructor', {
        value: SqliteError,
      });

      const error1 = new SQLiteEngineQueryError(
        { name: 'test-db', query },
        constraintError as SqliteError,
      );
      asserts.assertEquals(error1.message, 'Constraint violation');

      // Test foreign key constraint (787)
      const fkError = new SqliteError(787, 'FOREIGN KEY constraint failed');
      // @ts-ignore - Adding code for testing
      fkError.code = 787;
      Object.defineProperty(fkError, 'constructor', { value: SqliteError });

      const error2 = new SQLiteEngineQueryError(
        { name: 'test-db', query },
        fkError as SqliteError,
      );
      asserts.assertEquals(error2.message, 'Foreign key constraint failed');

      // Test NOT NULL constraint (1299)
      const notNullError = new SqliteError(1299, 'NOT NULL constraint failed');
      // @ts-ignore - Adding code for testing
      notNullError.code = 1299;
      Object.defineProperty(notNullError, 'constructor', {
        value: SqliteError,
      });

      const error3 = new SQLiteEngineQueryError(
        { name: 'test-db', query },
        notNullError as SqliteError,
      );
      asserts.assertEquals(error3.message, 'NOT NULL constraint failed');

      // Test PRIMARY KEY constraint (1555)
      const pkError = new SqliteError(1555, 'PRIMARY KEY constraint failed');
      // @ts-ignore - Adding code for testing
      pkError.code = 1555;
      Object.defineProperty(pkError, 'constructor', { value: SqliteError });

      const error4 = new SQLiteEngineQueryError(
        { name: 'test-db', query },
        pkError as SqliteError,
      );
      asserts.assertEquals(error4.message, 'PRIMARY KEY constraint failed');

      // Test UNIQUE constraint (2067)
      const uniqueError = new SqliteError(2067, 'UNIQUE constraint failed');
      // @ts-ignore - Adding code for testing
      uniqueError.code = 2067;
      Object.defineProperty(uniqueError, 'constructor', { value: SqliteError });

      const error5 = new SQLiteEngineQueryError(
        { name: 'test-db', query },
        uniqueError as SqliteError,
      );
      asserts.assertEquals(error5.message, 'UNIQUE constraint failed');

      // Test CHECK constraint (275)
      const checkError = new SqliteError(275, 'CHECK constraint failed');
      // @ts-ignore - Adding code for testing
      checkError.code = 275;
      Object.defineProperty(checkError, 'constructor', { value: SqliteError });

      const error6 = new SQLiteEngineQueryError(
        { name: 'test-db', query },
        checkError as SqliteError,
      );
      asserts.assertEquals(error6.message, 'CHECK constraint failed');
    });

    await queryErrorTest.step('should handle I/O error codes', () => {
      const query = { id: 'io-errors', sql: 'SELECT * FROM test' };

      // Test disk I/O error (10)
      const ioError = new SqliteError(1, 'disk I/O error');
      // @ts-ignore - Adding code for testing
      ioError.code = 10;
      Object.defineProperty(ioError, 'constructor', { value: SqliteError });

      const error1 = new SQLiteEngineQueryError(
        { name: 'test-db', query },
        ioError as SqliteError,
      );
      asserts.assertEquals(error1.message, 'Disk I/O error');

      // Test database corrupted (11)
      const corruptError = new SqliteError(
        1,
        'database disk image is malformed',
      );
      // @ts-ignore - Adding code for testing
      corruptError.code = 11;
      Object.defineProperty(corruptError, 'constructor', {
        value: SqliteError,
      });

      const error2 = new SQLiteEngineQueryError(
        { name: 'test-db', query },
        corruptError as SqliteError,
      );
      asserts.assertEquals(error2.message, 'Database is corrupted');

      // Test full database (13)
      const fullError = new SqliteError(1, 'database or disk is full');
      // @ts-ignore - Adding code for testing
      fullError.code = 13;
      Object.defineProperty(fullError, 'constructor', { value: SqliteError });

      const error3 = new SQLiteEngineQueryError(
        { name: 'test-db', query },
        fullError as SqliteError,
      );
      asserts.assertEquals(error3.message, 'Database is full');

      // Test unable to open (14)
      const openError = new SqliteError(1, 'unable to open database file');
      // @ts-ignore - Adding code for testing
      openError.code = 14;
      Object.defineProperty(openError, 'constructor', { value: SqliteError });

      const error4 = new SQLiteEngineQueryError(
        { name: 'test-db', query },
        openError as SqliteError,
      );
      asserts.assertEquals(error4.message, 'Unable to open database file');
    });

    await queryErrorTest.step(
      'should handle permission and auth errors',
      () => {
        const query = { id: 'auth-errors', sql: 'DROP TABLE test' };

        // Test permission error (3)
        const permError = new SqliteError(1, 'access permission denied');
        // @ts-ignore - Adding code for testing
        permError.code = 3;
        Object.defineProperty(permError, 'constructor', { value: SqliteError });

        const error1 = new SQLiteEngineQueryError(
          { name: 'test-db', query },
          permError as SqliteError,
        );
        asserts.assertEquals(error1.message, 'Access permission denied');

        // Test authorization error (23)
        const authError = new SqliteError(1, 'authorization denied');
        // @ts-ignore - Adding code for testing
        authError.code = 23;
        Object.defineProperty(authError, 'constructor', { value: SqliteError });

        const error2 = new SQLiteEngineQueryError(
          { name: 'test-db', query },
          authError as SqliteError,
        );
        asserts.assertEquals(error2.message, 'Authorization denied');
      },
    );

    await queryErrorTest.step('should handle resource errors', () => {
      const query = { id: 'resource-errors', sql: 'SELECT * FROM test' };

      // Test out of memory error (7)
      const memError = new SqliteError(1, 'out of memory');
      // @ts-ignore - Adding code for testing
      memError.code = 7;
      Object.defineProperty(memError, 'constructor', { value: SqliteError });

      const error1 = new SQLiteEngineQueryError(
        { name: 'test-db', query },
        memError as SqliteError,
      );
      asserts.assertEquals(error1.message, 'Out of memory');

      // Test too big error (18)
      const bigError = new SqliteError(1, 'string or blob too big');
      // @ts-ignore - Adding code for testing
      bigError.code = 18;
      Object.defineProperty(bigError, 'constructor', { value: SqliteError });

      const error2 = new SQLiteEngineQueryError(
        { name: 'test-db', query },
        bigError as SqliteError,
      );
      asserts.assertEquals(error2.message, 'String or BLOB exceeds size limit');
    });

    await queryErrorTest.step('should handle extended error codes', () => {
      const query = { id: 'extended-errors', sql: 'SELECT * FROM test' };

      // Test busy recovery error (261)
      const busyRecoveryError = new SqliteError(
        1,
        'database is busy recovering',
      );
      // @ts-ignore - Adding code for testing
      busyRecoveryError.code = 261;
      Object.defineProperty(busyRecoveryError, 'constructor', {
        value: SqliteError,
      });

      const error1 = new SQLiteEngineQueryError(
        { name: 'test-db', query },
        busyRecoveryError as SqliteError,
      );
      asserts.assertEquals(error1.message, 'Database is busy recovering');

      // Test read I/O error (266)
      const readError = new SqliteError(1, 'I/O error during read');
      // @ts-ignore - Adding code for testing
      readError.code = 266;
      Object.defineProperty(readError, 'constructor', { value: SqliteError });

      const error2 = new SQLiteEngineQueryError(
        { name: 'test-db', query },
        readError as SqliteError,
      );
      asserts.assertEquals(error2.message, 'I/O error during read operation');

      // Test delete I/O error (2570)
      const deleteError = new SqliteError(1, 'I/O error during delete');
      // @ts-ignore - Adding code for testing
      deleteError.code = 2570;
      Object.defineProperty(deleteError, 'constructor', { value: SqliteError });

      const error3 = new SQLiteEngineQueryError(
        { name: 'test-db', query },
        deleteError as SqliteError,
      );
      asserts.assertEquals(error3.message, 'I/O error while deleting file');
    });
  });

  await t.step('SQLiteEngineSchemaError', async (schemaErrorTest) => {
    await schemaErrorTest.step('should create schema creation error', () => {
      const error = new SQLiteEngineQueryError(
        { name: 'test-db', query: { sql: `CREATE DATABASE test_schema` } },
        new Error('Schema already exists'),
      );

      asserts.assertEquals(error.name, 'SQLiteEngineQueryError');
      asserts.assert(error.message.includes('Schema already exists'));
      asserts.assertEquals(error.context.engine, 'SQLITE');
      asserts.assertEquals(error.context.name, 'test-db');
      asserts.assertEquals(
        error.context.query.sql,
        'CREATE DATABASE test_schema',
      );
    });

    await schemaErrorTest.step('should create schema drop error', () => {
      const error = new SQLiteEngineQueryError(
        { name: 'test-db', query: { sql: `DROP DATABASE test_schema` } },
        new Error('Schema does not exist'),
      );

      asserts.assertEquals(error.name, 'SQLiteEngineQueryError');
      asserts.assert(error.message.includes('Schema does not exist'));
      asserts.assertEquals(error.context.engine, 'SQLITE');
      asserts.assertEquals(
        error.context.query.sql,
        'DROP DATABASE test_schema',
      );
    });

    await schemaErrorTest.step('should work without cause', () => {
      const error = new SQLiteEngineQueryError(
        { name: 'test-db', query: { sql: `CREATE DATABASE test_schema` } },
      );

      asserts.assertEquals(error.name, 'SQLiteEngineQueryError');
      asserts.assertEquals(error.context.engine, 'SQLITE');
      asserts.assertEquals(error.context.name, 'test-db');
      asserts.assertEquals(
        error.context.query.sql,
        'CREATE DATABASE test_schema',
      );
    });
  });
});
