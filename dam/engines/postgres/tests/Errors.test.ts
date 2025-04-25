import {
  PostgresEngineConnectError,
  PostgresEngineQueryError,
} from '../mod.ts';
import { PostgresError } from '$postgres';

import * as asserts from '$asserts';

Deno.test('DAM.engines.Postgres.Errors', async (t) => {
  await t.step('PostgresEngineConnectError', async (connectErrorTest) => {
    await connectErrorTest.step('should create basic connection error', () => {
      const meta = {
        name: 'test-pg',
        host: 'localhost',
        port: 5432,
        username: 'postgres',
      };
      const error = new PostgresEngineConnectError(
        meta,
        new Error('Failed to connect'),
      );

      asserts.assertEquals(error.name, 'PostgresEngineConnectError');
      asserts.assertEquals(error.message, 'Failed to connect');
      asserts.assertEquals(error.context.engine, 'POSTGRES');
      asserts.assertEquals(error.context.name, 'test-pg');
      asserts.assertEquals(error.context.host, 'localhost');
      asserts.assertEquals(error.context.port, 5432);
      asserts.assertEquals(error.context.username, 'postgres');
    });

    await connectErrorTest.step(
      'should handle PostgresError with TimedOut name',
      () => {
        const meta = {
          name: 'timeout-db',
          host: 'slow-host',
          port: 5432,
          username: 'postgres',
        };
        // Create a PostgresError-like object
        const pgError = new PostgresError({
          message: 'Connection timed out',
          code: 'ER_DUP_ENTRY',
          severity: 'ERROR',
        });
        pgError.name = 'TimedOut';

        const error = new PostgresEngineConnectError(meta, pgError);

        asserts.assertEquals(error.name, 'PostgresEngineConnectError');
        asserts.assertEquals(
          error.message,
          'Connection timed out when trying to connect to Postgres',
        );
        asserts.assertEquals(error.context.engine, 'POSTGRES');
        asserts.assertEquals(error.context.name, 'timeout-db');
      },
    );

    await connectErrorTest.step(
      'should handle PostgresError with auth error code',
      () => {
        const meta = {
          name: 'auth-error-db',
          host: 'localhost',
          port: 5432,
          username: 'wrong-user',
        };
        // Create a PostgresError-like object with fields
        const pgError = new PostgresError({
          message: 'Auth failed',
          code: '28P01',
          severity: 'ERROR',
        });
        pgError.name = 'PostgresError';
        // @ts-ignore - Adding fields property for testing
        pgError.fields = { code: '28P01' };

        const error = new PostgresEngineConnectError(meta, pgError);

        asserts.assertEquals(error.name, 'PostgresEngineConnectError');
        asserts.assertEquals(error.message, 'Invalid username or password');
        asserts.assertEquals(error.context.engine, 'POSTGRES');
        asserts.assertEquals(error.context.name, 'auth-error-db');
      },
    );

    await connectErrorTest.step(
      'should handle PostgresError with db error code',
      () => {
        const meta = {
          name: 'db-error',
          host: 'localhost',
          port: 5432,
          username: 'postgres',
        };
        // Create a PostgresError-like object with fields
        const pgError = new PostgresError({
          message: 'DB error',
          code: '3D000',
          severity: 'ERROR',
        });
        pgError.name = 'PostgresError';
        // @ts-ignore - Adding fields property for testing
        pgError.fields = { code: '3D000' };

        const error = new PostgresEngineConnectError(meta, pgError);

        asserts.assertEquals(error.name, 'PostgresEngineConnectError');
        asserts.assertEquals(error.message, 'Invalid database name');
        asserts.assertEquals(error.context.engine, 'POSTGRES');
        asserts.assertEquals(error.context.name, 'db-error');
      },
    );

    await connectErrorTest.step(
      'should handle additional connection errors',
      () => {
        // Test connection limit exceeded
        const meta = {
          name: 'too-many-conns',
          host: 'localhost',
          port: 5432,
          username: 'postgres',
        };
        const limitError = new PostgresError({
          message: 'too many connections',
          code: '53300',
          severity: 'ERROR',
        });
        // @ts-ignore - Adding fields property for testing
        limitError.fields = { code: '53300' };

        const error1 = new PostgresEngineConnectError(meta, limitError);
        asserts.assertEquals(error1.message, 'Too many connections');

        // Test server shutdown error
        const shutdownError = new PostgresError({
          message: 'server shut down',
          code: '57P01',
          severity: 'ERROR',
        });
        // @ts-ignore - Adding fields property for testing
        shutdownError.fields = { code: '57P01' };

        const error2 = new PostgresEngineConnectError(meta, shutdownError);
        asserts.assertEquals(
          error2.message,
          'Server shut down during connection',
        );

        // Test connection refused error
        const refusedError = new PostgresError({
          message: 'connection refused',
          code: '57P03',
          severity: 'ERROR',
        });
        // @ts-ignore - Adding fields property for testing
        refusedError.fields = { code: '57P03' };

        const error3 = new PostgresEngineConnectError(meta, refusedError);
        asserts.assertEquals(
          error3.message,
          'Server unavailable - connection refused',
        );

        // Test insufficient privileges error
        const privError = new PostgresError({
          message: 'insufficient privilege',
          code: '42501',
          severity: 'ERROR',
        });
        // @ts-ignore - Adding fields property for testing
        privError.fields = { code: '42501' };

        const error4 = new PostgresEngineConnectError(meta, privError);
        asserts.assertEquals(
          error4.message,
          'Insufficient privilege to connect',
        );
      },
    );
  });

  await t.step('PostgresEngineQueryError', async (queryErrorTest) => {
    await queryErrorTest.step('should create basic query error', () => {
      const query = { id: 'test-query', sql: 'SELECT * FROM test' };
      const error = new PostgresEngineQueryError(
        { name: 'test-db', query },
        new Error('Query failed'),
      );

      asserts.assertEquals(error.name, 'PostgresEngineQueryError');
      asserts.assertEquals(error.message, 'Query failed');
      asserts.assertEquals(error.context.engine, 'POSTGRES');
      asserts.assertEquals(error.context.name, 'test-db');
      asserts.assertEquals(error.context.query, query);
    });

    await queryErrorTest.step('should handle timeout errors', () => {
      const query = { id: 'timeout-query', sql: 'SELECT pg_sleep(100)' };
      const pgError = new PostgresError({
        message: 'Query timed out',
        code: '3D000',
        severity: 'ERROR',
      });
      pgError.name = 'QueryTimeout';

      const error = new PostgresEngineQueryError(
        { name: 'test-db', query },
        pgError,
      );

      asserts.assertEquals(error.name, 'PostgresEngineQueryError');
      asserts.assertEquals(
        error.message,
        'Query timed out when executing Postgres query',
      );
      asserts.assertEquals(error.context.engine, 'POSTGRES');
      asserts.assertEquals(error.context.query, query);
    });

    await queryErrorTest.step('should handle constraint errors', () => {
      const query = { id: 'constraint-query', sql: 'INSERT INTO users...' };

      // Test unique constraint violation (23505)
      const uniqueError = new PostgresError({
        message: 'duplicate key value violates unique constraint',
        code: '23505',
        severity: 'ERROR',
      });

      const error1 = new PostgresEngineQueryError(
        { name: 'test-db', query },
        uniqueError,
      );
      asserts.assertEquals(error1.message, 'Unique constraint violation');

      // Test foreign key constraint violation (23503)
      const fkError = new PostgresError({
        message: 'insert or update on table violates foreign key constraint',
        code: '23503',
        severity: 'ERROR',
      });

      const error2 = new PostgresEngineQueryError(
        { name: 'test-db', query },
        fkError,
      );
      asserts.assertEquals(error2.message, 'Foreign key constraint violation');
    });

    await queryErrorTest.step('should handle syntax errors', () => {
      const query = { id: 'syntax-error', sql: 'SELCT * FROM users' };
      const syntaxError = new PostgresError({
        message: 'syntax error at or near "SELCT"',
        code: '42601',
        severity: 'ERROR',
      });

      const error = new PostgresEngineQueryError(
        { name: 'test-db', query },
        syntaxError,
      );
      asserts.assertEquals(error.message, 'Syntax error in SQL statement');
    });

    await queryErrorTest.step('should handle missing table errors', () => {
      const query = { id: 'no-table', sql: 'SELECT * FROM missing_table' };
      const tableError = new PostgresError({
        message: 'relation "missing_table" does not exist',
        code: '42P01',
        severity: 'ERROR',
      });

      const error = new PostgresEngineQueryError(
        { name: 'test-db', query },
        tableError,
      );
      asserts.assertEquals(error.message, 'Could not find table or view');
    });

    await queryErrorTest.step('should handle column not exist errors', () => {
      const query = { id: 'bad-column', sql: 'SELECT nonexistent FROM users' };
      const colError = new PostgresError({
        message: 'column "nonexistent" does not exist',
        code: '42703',
        severity: 'ERROR',
      });

      const error = new PostgresEngineQueryError(
        { name: 'test-db', query },
        colError,
      );
      asserts.assertEquals(
        error.message,
        'Column does not exist in table or view',
      );
    });

    await queryErrorTest.step('should handle generic query errors', () => {
      const query = { id: 'generic-error', sql: 'SELECT 1' };
      const genericError = new Error('Something went wrong');
      genericError.name = 'QueryError';

      const error = new PostgresEngineQueryError(
        { name: 'test-db', query },
        genericError,
      );
      asserts.assertEquals(error.message, 'Something went wrong');
    });

    await queryErrorTest.step('should work without cause', () => {
      const query = { id: 'no-cause', sql: 'SELECT 1' };
      const error = new PostgresEngineQueryError({ name: 'test-db', query });

      asserts.assertEquals(error.message, 'Failed to execute Postgres query');
      asserts.assertEquals(error.context.engine, 'POSTGRES');
      asserts.assertEquals(error.context.query, query);
    });

    await queryErrorTest.step('should handle data type errors', () => {
      const query = { id: 'datatype-errors', sql: 'SELECT data FROM table' };

      // Test string truncation error
      const truncError = new PostgresError({
        message: 'value too long for type character varying(10)',
        code: '22001',
        severity: 'ERROR',
      });
      // @ts-ignore - Setting fields for testing
      truncError.fields = { code: '22001' };

      const error1 = new PostgresEngineQueryError(
        { name: 'test-db', query },
        truncError,
      );
      asserts.assertEquals(error1.message, 'String data right truncation');

      // Test numeric range error
      const rangeError = new PostgresError({
        message: 'numeric field overflow',
        code: '22003',
        severity: 'ERROR',
      });
      // @ts-ignore - Setting fields for testing
      rangeError.fields = { code: '22003' };

      const error2 = new PostgresEngineQueryError(
        { name: 'test-db', query },
        rangeError,
      );
      asserts.assertEquals(error2.message, 'Numeric value out of range');

      // Test datetime error
      const dateError = new PostgresError({
        message: 'invalid datetime format',
        code: '22007',
        severity: 'ERROR',
      });
      // @ts-ignore - Setting fields for testing
      dateError.fields = { code: '22007' };

      const error3 = new PostgresEngineQueryError(
        { name: 'test-db', query },
        dateError,
      );
      asserts.assertEquals(error3.message, 'Invalid datetime format');

      // Test division by zero
      const divError = new PostgresError({
        message: 'division by zero',
        code: '22012',
        severity: 'ERROR',
      });
      // @ts-ignore - Setting fields for testing
      divError.fields = { code: '22012' };

      const error4 = new PostgresEngineQueryError(
        { name: 'test-db', query },
        divError,
      );
      asserts.assertEquals(error4.message, 'Division by zero');
    });

    await queryErrorTest.step('should handle transaction errors', () => {
      const query = { id: 'tx-errors', sql: 'INSERT INTO users VALUES (...)' };

      // Test serialization failure
      const serialError = new PostgresError({
        message: 'could not serialize access',
        code: '40001',
        severity: 'ERROR',
      });
      // @ts-ignore - Setting fields for testing
      serialError.fields = { code: '40001' };

      const error1 = new PostgresEngineQueryError(
        { name: 'test-db', query },
        serialError,
      );
      asserts.assertEquals(
        error1.message,
        'Serialization failure (deadlock detected)',
      );

      // Test deadlock detected
      const deadlockError = new PostgresError({
        message: 'deadlock detected',
        code: '40P01',
        severity: 'ERROR',
      });
      // @ts-ignore - Setting fields for testing
      deadlockError.fields = { code: '40P01' };

      const error2 = new PostgresEngineQueryError(
        { name: 'test-db', query },
        deadlockError,
      );
      asserts.assertEquals(error2.message, 'Deadlock detected');

      // Test transaction integrity constraint violation
      const integrityError = new PostgresError({
        message: 'transaction integrity violated',
        code: '40002',
        severity: 'ERROR',
      });
      // @ts-ignore - Setting fields for testing
      integrityError.fields = { code: '40002' };

      const error3 = new PostgresEngineQueryError(
        { name: 'test-db', query },
        integrityError,
      );
      asserts.assertEquals(
        error3.message,
        'Transaction integrity constraint violation',
      );

      // Test statement completion unknown
      const unknownCompletionError = new PostgresError({
        message: 'statement completion unknown',
        code: '40003',
        severity: 'ERROR',
      });
      // @ts-ignore - Setting fields for testing
      unknownCompletionError.fields = { code: '40003' };

      const error4 = new PostgresEngineQueryError(
        { name: 'test-db', query },
        unknownCompletionError,
      );
      asserts.assertEquals(error4.message, 'Statement completion unknown');
    });

    await queryErrorTest.step(
      'should handle check constraint violations',
      () => {
        const query = {
          id: 'check-violation',
          sql: 'INSERT INTO users VALUES (...)',
        };

        // Test check constraint
        const checkError = new PostgresError({
          message: 'check constraint violation',
          code: '23514',
          severity: 'ERROR',
        });
        // @ts-ignore - Setting fields for testing
        checkError.fields = { code: '23514' };

        const error = new PostgresEngineQueryError(
          { name: 'test-db', query },
          checkError,
        );
        asserts.assertEquals(error.message, 'Check constraint violation');
      },
    );

    await queryErrorTest.step('should handle not null violations', () => {
      const query = {
        id: 'null-violation',
        sql: 'INSERT INTO users VALUES (NULL)',
      };

      // Test not null constraint
      const nullError = new PostgresError({
        message: 'null value in column violates not-null constraint',
        code: '23502',
        severity: 'ERROR',
      });
      // @ts-ignore - Setting fields for testing
      nullError.fields = { code: '23502' };

      const error = new PostgresEngineQueryError(
        { name: 'test-db', query },
        nullError,
      );
      asserts.assertEquals(error.message, 'Not null constraint violation');
    });

    await queryErrorTest.step(
      'should handle additional syntax and semantics errors',
      () => {
        const query = { id: 'syntax-semantics', sql: 'SELECT * FROM users' };

        // Test parameter name not found
        const paramError = new PostgresError({
          message: 'parameter not found',
          code: '42P02',
          severity: 'ERROR',
        });
        // @ts-ignore - Setting fields for testing
        paramError.fields = { code: '42P02' };

        const error1 = new PostgresEngineQueryError(
          { name: 'test-db', query },
          paramError,
        );
        asserts.assertEquals(error1.message, 'Parameter name not found');

        // Test duplicate cursor name
        const cursorError = new PostgresError({
          message: 'duplicate cursor name',
          code: '42P03',
          severity: 'ERROR',
        });
        // @ts-ignore - Setting fields for testing
        cursorError.fields = { code: '42P03' };

        const error2 = new PostgresEngineQueryError(
          { name: 'test-db', query },
          cursorError,
        );
        asserts.assertEquals(error2.message, 'Duplicate cursor name');

        // Test duplicate database name
        const dbNameError = new PostgresError({
          message: 'duplicate database name',
          code: '42P04',
          severity: 'ERROR',
        });
        // @ts-ignore - Setting fields for testing
        dbNameError.fields = { code: '42P04' };

        const error3 = new PostgresEngineQueryError(
          { name: 'test-db', query },
          dbNameError,
        );
        asserts.assertEquals(error3.message, 'Duplicate database name');

        // Test duplicate prepared statement
        const stmtError = new PostgresError({
          message: 'duplicate prepared statement',
          code: '42P05',
          severity: 'ERROR',
        });
        // @ts-ignore - Setting fields for testing
        stmtError.fields = { code: '42P05' };

        const error4 = new PostgresEngineQueryError(
          { name: 'test-db', query },
          stmtError,
        );
        asserts.assertEquals(
          error4.message,
          'Duplicate prepared statement name',
        );

        // Test duplicate schema name
        const schemaError = new PostgresError({
          message: 'duplicate schema',
          code: '42P06',
          severity: 'ERROR',
        });
        // @ts-ignore - Setting fields for testing
        schemaError.fields = { code: '42P06' };

        const error5 = new PostgresEngineQueryError(
          { name: 'test-db', query },
          schemaError,
        );
        asserts.assertEquals(error5.message, 'Duplicate schema name');

        // Test duplicate table name
        const tableError = new PostgresError({
          message: 'duplicate table',
          code: '42P07',
          severity: 'ERROR',
        });
        // @ts-ignore - Setting fields for testing
        tableError.fields = { code: '42P07' };

        const error6 = new PostgresEngineQueryError(
          { name: 'test-db', query },
          tableError,
        );
        asserts.assertEquals(error6.message, 'Duplicate table name');

        // Test ambiguous parameter
        const ambParamError = new PostgresError({
          message: 'ambiguous parameter',
          code: '42P08',
          severity: 'ERROR',
        });
        // @ts-ignore - Setting fields for testing
        ambParamError.fields = { code: '42P08' };

        const error7 = new PostgresEngineQueryError(
          { name: 'test-db', query },
          ambParamError,
        );
        asserts.assertEquals(error7.message, 'Ambiguous parameter name');

        // Test ambiguous function
        const ambFuncError = new PostgresError({
          message: 'ambiguous function',
          code: '42P09',
          severity: 'ERROR',
        });
        // @ts-ignore - Setting fields for testing
        ambFuncError.fields = { code: '42P09' };

        const error8 = new PostgresEngineQueryError(
          { name: 'test-db', query },
          ambFuncError,
        );
        asserts.assertEquals(error8.message, 'Ambiguous function name');

        // Test invalid column reference
        const colRefError = new PostgresError({
          message: 'invalid column reference',
          code: '42P10',
          severity: 'ERROR',
        });
        // @ts-ignore - Setting fields for testing
        colRefError.fields = { code: '42P10' };

        const error9 = new PostgresEngineQueryError(
          { name: 'test-db', query },
          colRefError,
        );
        asserts.assertEquals(error9.message, 'Invalid column reference');

        // Test invalid column definition
        const colDefError = new PostgresError({
          message: 'invalid column definition',
          code: '42611',
          severity: 'ERROR',
        });
        // @ts-ignore - Setting fields for testing
        colDefError.fields = { code: '42611' };

        const error10 = new PostgresEngineQueryError(
          { name: 'test-db', query },
          colDefError,
        );
        asserts.assertEquals(error10.message, 'Invalid column definition');

        // Test type conversion error
        const typeConvError = new PostgresError({
          message: 'cannot convert type',
          code: '42846',
          severity: 'ERROR',
        });
        // @ts-ignore - Setting fields for testing
        typeConvError.fields = { code: '42846' };

        const error11 = new PostgresEngineQueryError(
          { name: 'test-db', query },
          typeConvError,
        );
        asserts.assertEquals(error11.message, 'Type conversion error');
      },
    );

    await queryErrorTest.step(
      'should handle additional data type errors',
      () => {
        const query = {
          id: 'more-datatype-errors',
          sql: 'SELECT data FROM table',
        };

        // Test datetime field overflow
        const dtOverflowError = new PostgresError({
          message: 'datetime field overflow',
          code: '22008',
          severity: 'ERROR',
        });
        // @ts-ignore - Setting fields for testing
        dtOverflowError.fields = { code: '22008' };

        const error1 = new PostgresEngineQueryError(
          { name: 'test-db', query },
          dtOverflowError,
        );
        asserts.assertEquals(error1.message, 'Datetime field overflow');

        // Test invalid text representation
        const textRepError = new PostgresError({
          message: 'invalid syntax for type',
          code: '22P02',
          severity: 'ERROR',
        });
        // @ts-ignore - Setting fields for testing
        textRepError.fields = { code: '22P02' };

        const error2 = new PostgresEngineQueryError(
          { name: 'test-db', query },
          textRepError,
        );
        asserts.assertEquals(error2.message, 'Invalid text representation');
      },
    );

    await queryErrorTest.step(
      'should handle resource and system errors',
      () => {
        const query = {
          id: 'resource-errors',
          sql: 'INSERT INTO large_table VALUES (...)',
        };

        // Test disk full
        const diskError = new PostgresError({
          message: 'could not write to file: disk full',
          code: '53100',
          severity: 'ERROR',
        });
        // @ts-ignore - Setting fields for testing
        diskError.fields = { code: '53100' };

        const error1 = new PostgresEngineQueryError(
          { name: 'test-db', query },
          diskError,
        );
        asserts.assertEquals(error1.message, 'Disk full');

        // Test out of memory
        const memoryError = new PostgresError({
          message: 'out of memory',
          code: '53200',
          severity: 'ERROR',
        });
        // @ts-ignore - Setting fields for testing
        memoryError.fields = { code: '53200' };

        const error2 = new PostgresEngineQueryError(
          { name: 'test-db', query },
          memoryError,
        );
        asserts.assertEquals(error2.message, 'Out of memory');

        // Test too many connections
        const connError = new PostgresError({
          message: 'too many connections',
          code: '53300',
          severity: 'ERROR',
        });
        // @ts-ignore - Setting fields for testing
        connError.fields = { code: '53300' };

        const error3 = new PostgresEngineQueryError(
          { name: 'test-db', query },
          connError,
        );
        asserts.assertEquals(error3.message, 'Too many connections');

        // Test IO error
        const ioError = new PostgresError({
          message: 'could not read file',
          code: '58030',
          severity: 'ERROR',
        });
        // @ts-ignore - Setting fields for testing
        ioError.fields = { code: '58030' };

        const error4 = new PostgresEngineQueryError(
          { name: 'test-db', query },
          ioError,
        );
        asserts.assertEquals(error4.message, 'IO error');

        // Test query canceled
        const cancelError = new PostgresError({
          message: 'canceling statement due to user request',
          code: '57014',
          severity: 'ERROR',
        });
        // @ts-ignore - Setting fields for testing
        cancelError.fields = { code: '57014' };

        const error5 = new PostgresEngineQueryError(
          { name: 'test-db', query },
          cancelError,
        );
        asserts.assertEquals(error5.message, 'Query canceled');
      },
    );

    await queryErrorTest.step('should handle authorization errors', () => {
      const query = {
        id: 'auth-errors',
        sql: 'SELECT * FROM restricted_table',
      };

      // Test insufficient privilege
      const privError = new PostgresError({
        message: 'permission denied for table restricted_table',
        code: '42501',
        severity: 'ERROR',
      });
      // @ts-ignore - Setting fields for testing
      privError.fields = { code: '42501' };

      const error1 = new PostgresEngineQueryError(
        { name: 'test-db', query },
        privError,
      );
      asserts.assertEquals(
        error1.message,
        'Insufficient privilege to execute query',
      );

      // Test invalid password
      const pwdError = new PostgresError({
        message: 'password authentication failed',
        code: '28P01',
        severity: 'ERROR',
      });
      // @ts-ignore - Setting fields for testing
      pwdError.fields = { code: '28P01' };

      const error2 = new PostgresEngineQueryError(
        { name: 'test-db', query },
        pwdError,
      );
      asserts.assertEquals(error2.message, 'Invalid password');
    });
  });
});
