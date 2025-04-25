import { MariaEngineConnectError, MariaEngineQueryError } from '../mod.ts';
import * as asserts from '$asserts';
import { SqlError } from '$maria';

Deno.test('DAM.engines.Maria.Errors', async (t) => {
  await t.step('MariaEngineConnectError', async (connectErrorTest) => {
    await connectErrorTest.step('should create basic connection error', () => {
      const meta = {
        name: 'test-maria',
        host: 'localhost',
        port: 3306,
        username: 'maria',
      };
      const error = new MariaEngineConnectError(
        meta,
        new Error('Failed to connect'),
      );

      asserts.assertEquals(error.name, 'MariaEngineConnectError');
      asserts.assertEquals(error.message, 'Failed to connect');
      asserts.assertEquals(error.context.engine, 'MARIA');
      asserts.assertEquals(error.context.name, 'test-maria');
      asserts.assertEquals(error.context.host, 'localhost');
      asserts.assertEquals(error.context.port, 3306);
      asserts.assertEquals(error.context.username, 'maria');
    });

    await connectErrorTest.step(
      'should use default error message for empty cause message',
      () => {
        const meta = {
          name: 'test-maria',
          host: 'localhost',
          port: 3306,
          username: 'maria',
        };
        const error = new MariaEngineConnectError(
          meta,
          new Error(),
        );

        asserts.assertEquals(
          error.message,
          'Failed to connect to MariaDB server',
        );
        asserts.assertEquals(error.context.engine, 'MARIA');
      },
    );

    await connectErrorTest.step(
      'should handle different MariaDB connect errors',
      () => {
        const meta = {
          name: 'test-maria',
          host: 'localhost',
          port: 3306,
          username: 'maria',
        };

        // Test access denied error
        const sqlError1 = new SqlError('Access denied');
        // @ts-ignore - Adding code field for SqlError compatibility
        sqlError1.code = 'ER_ACCESS_DENIED_ERROR';
        Object.defineProperty(sqlError1, 'constructor', { value: SqlError });

        const error1 = new MariaEngineConnectError(meta, sqlError1);
        asserts.assertEquals(
          error1.message,
          'Access denied: Invalid username or password',
        );

        // Test too many connections error
        const sqlError2 = new SqlError('Too many connections');
        // @ts-ignore - Adding code field for SqlError compatibility
        sqlError2.code = 'ER_CON_COUNT_ERROR';
        Object.defineProperty(sqlError2, 'constructor', { value: SqlError });

        const error2 = new MariaEngineConnectError(meta, sqlError2);
        asserts.assertEquals(
          error2.message,
          'Too many connections to MariaDB server',
        );

        // Test host blocked error
        const sqlError3 = new SqlError('Host is blocked');
        // @ts-ignore - Adding code field for SqlError compatibility
        sqlError3.code = 'ER_HOST_IS_BLOCKED';
        Object.defineProperty(sqlError3, 'constructor', { value: SqlError });

        const error3 = new MariaEngineConnectError(meta, sqlError3);
        asserts.assertEquals(
          error3.message,
          'Host is blocked due to too many connection errors',
        );

        // Test non-existent database error
        const sqlError4 = new SqlError('Unknown database');
        // @ts-ignore - Adding code field for SqlError compatibility
        sqlError4.code = 'ER_BAD_DB_ERROR';
        Object.defineProperty(sqlError4, 'constructor', { value: SqlError });

        const error4 = new MariaEngineConnectError(meta, sqlError4);
        asserts.assertEquals(error4.message, 'Database does not exist');

        // Test connection timeout error
        const sqlError5 = new SqlError('Connection timed out');
        // @ts-ignore - Adding code field for SqlError compatibility
        sqlError5.code = 'ETIMEDOUT';
        Object.defineProperty(sqlError5, 'constructor', { value: SqlError });

        const error5 = new MariaEngineConnectError(meta, sqlError5);
        asserts.assertEquals(
          error5.message,
          'Connection timed out when connecting to MariaDB server',
        );

        // Test connection refused error
        const sqlError6 = new SqlError('Connection refused');
        // @ts-ignore - Adding code field for SqlError compatibility
        sqlError6.code = 'ECONNREFUSED';
        Object.defineProperty(sqlError6, 'constructor', { value: SqlError });

        const error6 = new MariaEngineConnectError(meta, sqlError6);
        asserts.assertEquals(
          error6.message,
          'Connection refused by MariaDB server',
        );
      },
    );
  });

  await t.step('MariaEngineQueryError', async (queryErrorTest) => {
    await queryErrorTest.step('should create basic query error', () => {
      const query = { id: 'test-query', sql: 'SELECT * FROM test' };
      const error = new MariaEngineQueryError(
        { name: 'test-db', query },
        new Error('Query failed'),
      );

      asserts.assertEquals(error.name, 'MariaEngineQueryError');
      asserts.assertEquals(error.message, 'Query failed');
      asserts.assertEquals(error.context.engine, 'MARIA');
      asserts.assertEquals(error.context.name, 'test-db');
      asserts.assertEquals(error.context.query, query);
    });

    await queryErrorTest.step('should work without cause', () => {
      const query = { id: 'no-cause', sql: 'SELECT 1' };
      const error = new MariaEngineQueryError({ name: 'test-db', query });

      asserts.assertEquals(error.message, 'Failed to execute MariaDB query');
      asserts.assertEquals(error.context.engine, 'MARIA');
      asserts.assertEquals(error.context.query, query);
    });

    await queryErrorTest.step(
      'should handle different Maria error codes',
      () => {
        const query = { id: 'maria-error', sql: 'INSERT INTO test...' };

        // Test duplicate key error (ER_DUP_ENTRY)

        const dupError = new SqlError('Duplicate entry');
        // @ts-ignore - Setting code property for testing
        dupError.code = 'ER_DUP_ENTRY';
        Object.defineProperty(dupError, 'constructor', { value: SqlError });

        const error1 = new MariaEngineQueryError(
          { name: 'test-db', query },
          dupError,
        );
        asserts.assertEquals(error1.message, 'Unique constraint violation');

        // Test foreign key error (ER_NO_REFERENCED_ROW)
        const fkError = new SqlError('Cannot add or update a child row');
        // @ts-ignore - Setting code property for testing
        fkError.code = 'ER_NO_REFERENCED_ROW';
        Object.defineProperty(fkError, 'constructor', { value: fkError });

        const error2 = new MariaEngineQueryError(
          { name: 'test-db', query },
          fkError,
        );
        asserts.assertEquals(
          error2.message,
          'Foreign key constraint violation',
        );

        // Test parse error (ER_PARSE_ERROR)
        const parseError = new SqlError('You have an error in your SQL syntax');
        // @ts-ignore - Setting code property for testing
        parseError.code = 'ER_PARSE_ERROR';
        Object.defineProperty(parseError, 'constructor', { value: parseError });

        const error3 = new MariaEngineQueryError(
          { name: 'test-db', query },
          parseError,
        );
        asserts.assertEquals(error3.message, 'Syntax error in SQL statement');

        // Test bad table error (ER_BAD_TABLE_ERROR)
        const tableError = new SqlError('Unknown table');
        // @ts-ignore - Setting code property for testing
        tableError.code = 'ER_BAD_TABLE_ERROR';
        Object.defineProperty(tableError, 'constructor', { value: tableError });

        const error4 = new MariaEngineQueryError(
          { name: 'test-db', query },
          tableError,
        );
        asserts.assertEquals(error4.message, 'Could not find table or view');

        // Test lock timeout error (ER_LOCK_WAIT_TIMEOUT)
        const lockError = new SqlError('Lock wait timeout exceeded');
        // @ts-ignore - Setting code property for testing
        lockError.code = 'ER_LOCK_WAIT_TIMEOUT';
        Object.defineProperty(lockError, 'constructor', { value: lockError });

        const error5 = new MariaEngineQueryError(
          { name: 'test-db', query },
          lockError,
        );
        asserts.assertEquals(error5.message, 'Lock wait timeout exceeded');

        // Test query timeout error (ER_QUERY_TIMEOUT)
        const timeoutError = new SqlError('Query execution was interrupted');
        // @ts-ignore - Setting code property for testing
        timeoutError.code = 'ER_QUERY_TIMEOUT';
        Object.defineProperty(timeoutError, 'constructor', {
          value: timeoutError,
        });

        const error6 = new MariaEngineQueryError(
          { name: 'test-db', query },
          timeoutError,
        );
        asserts.assertEquals(
          error6.message,
          'Query execution timed out',
        );
      },
    );

    await queryErrorTest.step(
      'should handle advanced MariaDB error codes',
      () => {
        const query = { id: 'maria-error', sql: 'INSERT INTO test...' };

        // Test referenced row error
        const refError = new SqlError(
          'Cannot delete or update: row is referenced by a foreign key',
        );
        // @ts-ignore - Adding code field for SqlError compatibility
        refError.code = 'ER_ROW_IS_REFERENCED_2';
        Object.defineProperty(refError, 'constructor', { value: SqlError });

        const error1 = new MariaEngineQueryError(
          { name: 'test-db', query },
          refError,
        );
        asserts.assertEquals(
          error1.message,
          'Cannot delete or update: row is referenced by a foreign key',
        );

        // Test column errors
        const colError = new SqlError('Unknown column');
        // @ts-ignore - Adding code field for SqlError compatibility
        colError.code = 'ER_BAD_FIELD_ERROR';
        Object.defineProperty(colError, 'constructor', { value: SqlError });

        const error2 = new MariaEngineQueryError(
          { name: 'test-db', query },
          colError,
        );
        asserts.assertEquals(error2.message, 'Unknown column in query');

        // Test data too long error
        const dataError = new SqlError('Data too long for column');
        // @ts-ignore - Adding code field for SqlError compatibility
        dataError.code = 'ER_DATA_TOO_LONG';
        Object.defineProperty(dataError, 'constructor', { value: SqlError });

        const error3 = new MariaEngineQueryError(
          { name: 'test-db', query },
          dataError,
        );
        asserts.assertEquals(error3.message, 'Data too long for column');

        // Test truncated wrong value error
        const truncError = new SqlError('Incorrect value type');
        // @ts-ignore - Adding code field for SqlError compatibility
        truncError.code = 'ER_TRUNCATED_WRONG_VALUE';
        Object.defineProperty(truncError, 'constructor', { value: SqlError });

        const error4 = new MariaEngineQueryError(
          { name: 'test-db', query },
          truncError,
        );
        asserts.assertEquals(error4.message, 'Incorrect value type for column');

        // Test permission errors
        const permError = new SqlError('Access denied for table');
        // @ts-ignore - Adding code field for SqlError compatibility
        permError.code = 'ER_TABLEACCESS_DENIED_ERROR';
        Object.defineProperty(permError, 'constructor', { value: SqlError });

        const error5 = new MariaEngineQueryError(
          { name: 'test-db', query },
          permError,
        );
        asserts.assertEquals(
          error5.message,
          'Access denied for table operation',
        );

        // Test deadlock error
        const deadlockError = new SqlError('Deadlock found');
        // @ts-ignore - Adding code field for SqlError compatibility
        deadlockError.code = 'ER_LOCK_DEADLOCK';
        Object.defineProperty(deadlockError, 'constructor', {
          value: SqlError,
        });

        const error6 = new MariaEngineQueryError(
          { name: 'test-db', query },
          deadlockError,
        );
        asserts.assertEquals(
          error6.message,
          'Deadlock detected, transaction rolled back',
        );
      },
    );

    await queryErrorTest.step(
      'should handle additional constraint violations',
      () => {
        const query = {
          id: 'constraint-errors',
          sql: 'INSERT INTO test VALUES (...)',
        };

        // Test foreign key error (ER_NO_REFERENCED_ROW_2)
        const fkError = new SqlError('Cannot add or update a child row (v2)');
        // @ts-ignore - Setting code property for testing
        fkError.code = 'ER_NO_REFERENCED_ROW_2';
        Object.defineProperty(fkError, 'constructor', { value: SqlError });

        const error1 = new MariaEngineQueryError(
          { name: 'test-db', query },
          fkError,
        );
        asserts.assertEquals(
          error1.message,
          'Foreign key constraint violation',
        );

        // Test referenced row error (ER_ROW_IS_REFERENCED)
        const refError = new SqlError('Cannot delete or update a parent row');
        // @ts-ignore - Setting code property for testing
        refError.code = 'ER_ROW_IS_REFERENCED';
        Object.defineProperty(refError, 'constructor', { value: SqlError });

        const error2 = new MariaEngineQueryError(
          { name: 'test-db', query },
          refError,
        );
        asserts.assertEquals(
          error2.message,
          'Cannot delete or update: row is referenced by a foreign key',
        );
      },
    );

    await queryErrorTest.step(
      'should handle additional table and column errors',
      () => {
        const query = {
          id: 'table-column-errors',
          sql: 'SELECT * FROM missing_table',
        };

        // Test no such table error
        const tableError = new SqlError('Table does not exist');
        // @ts-ignore - Setting code property for testing
        tableError.code = 'ER_NO_SUCH_TABLE';
        Object.defineProperty(tableError, 'constructor', { value: SqlError });

        const error1 = new MariaEngineQueryError(
          { name: 'test-db', query },
          tableError,
        );
        asserts.assertEquals(error1.message, 'Could not find table or view');

        // Test unknown column error
        const columnError = new SqlError('Unknown column in field list');
        // @ts-ignore - Setting code property for testing
        columnError.code = 'ER_UNKNOWN_COLUMN';
        Object.defineProperty(columnError, 'constructor', { value: SqlError });

        const error2 = new MariaEngineQueryError(
          { name: 'test-db', query },
          columnError,
        );
        asserts.assertEquals(error2.message, 'Unknown column in query');

        // Test column access denied error
        const accessError = new SqlError('Access denied for column');
        // @ts-ignore - Setting code property for testing
        accessError.code = 'ER_COLUMNACCESS_DENIED_ERROR';
        Object.defineProperty(accessError, 'constructor', { value: SqlError });

        const error3 = new MariaEngineQueryError(
          { name: 'test-db', query },
          accessError,
        );
        asserts.assertEquals(
          error3.message,
          'Access denied for column operation',
        );
      },
    );

    await queryErrorTest.step(
      'should handle additional timeout errors',
      () => {
        const query = { id: 'timeout-errors', sql: 'SELECT SLEEP(100)' };

        // Test statement timeout error
        const stmtTimeoutError = new SqlError('Statement execution timeout');
        // @ts-ignore - Setting code property for testing
        stmtTimeoutError.code = 'ER_STATEMENT_TIMEOUT';
        Object.defineProperty(stmtTimeoutError, 'constructor', {
          value: SqlError,
        });

        const error = new MariaEngineQueryError(
          { name: 'test-db', query },
          stmtTimeoutError,
        );
        asserts.assertEquals(error.message, 'Query execution timed out');
      },
    );

    await queryErrorTest.step(
      'should handle data validation errors',
      () => {
        const query = {
          id: 'data-errors',
          sql: 'INSERT INTO test VALUES (1/0)',
        };

        // Test division by zero error
        const divError = new SqlError('Division by zero');
        // @ts-ignore - Setting code property for testing
        divError.code = 'ER_DIVISION_BY_ZERO';
        Object.defineProperty(divError, 'constructor', { value: SqlError });

        const error = new MariaEngineQueryError(
          { name: 'test-db', query },
          divError,
        );
        asserts.assertEquals(error.message, 'Division by zero in query');
      },
    );

    await queryErrorTest.step(
      'should handle operation errors',
      () => {
        const query = {
          id: 'operation-errors',
          sql: 'INSERT INTO test(a,b) VALUES (1)',
        };

        // Test wrong value count error
        const valueCountError = new SqlError(
          "Column count doesn't match value count",
        );
        // @ts-ignore - Setting code property for testing
        valueCountError.code = 'ER_WRONG_VALUE_COUNT_ON_ROW';
        Object.defineProperty(valueCountError, 'constructor', {
          value: SqlError,
        });

        const error1 = new MariaEngineQueryError(
          { name: 'test-db', query },
          valueCountError,
        );
        asserts.assertEquals(
          error1.message,
          "Column count doesn't match value count",
        );

        // Test table exists error
        const tableExistsError = new SqlError('Table already exists');
        // @ts-ignore - Setting code property for testing
        tableExistsError.code = 'ER_TABLE_EXISTS_ERROR';
        Object.defineProperty(tableExistsError, 'constructor', {
          value: SqlError,
        });

        const error2 = new MariaEngineQueryError(
          {
            name: 'test-db',
            query: { id: 'create-table', sql: 'CREATE TABLE test' },
          },
          tableExistsError,
        );
        asserts.assertEquals(error2.message, 'Table already exists');

        // Test not supported feature error
        const notSupportedError = new SqlError('Feature not supported');
        // @ts-ignore - Setting code property for testing
        notSupportedError.code = 'ER_NOT_SUPPORTED_YET';
        Object.defineProperty(notSupportedError, 'constructor', {
          value: SqlError,
        });

        const error3 = new MariaEngineQueryError(
          {
            name: 'test-db',
            query: { id: 'unsupported', sql: 'Some advanced SQL' },
          },
          notSupportedError,
        );
        asserts.assertEquals(error3.message, 'Feature not supported');

        // Test no default value error
        const noDefaultError = new SqlError('No default value for column');
        // @ts-ignore - Setting code property for testing
        noDefaultError.code = 'ER_NO_DEFAULT';
        Object.defineProperty(noDefaultError, 'constructor', {
          value: SqlError,
        });

        const error4 = new MariaEngineQueryError(
          {
            name: 'test-db',
            query: { id: 'no-default', sql: 'INSERT INTO test() VALUES ()' },
          },
          noDefaultError,
        );
        asserts.assertEquals(error4.message, 'No default value for column');
      },
    );

    await queryErrorTest.step(
      'should handle database operation errors',
      () => {
        const query = { id: 'db-ops', sql: 'USE nonexistent_db' };

        // Test no such database error
        const noDbError = new SqlError('Database does not exist');
        // @ts-ignore - Setting code property for testing
        noDbError.code = 'ER_NO_SUCH_DB';
        Object.defineProperty(noDbError, 'constructor', { value: SqlError });

        const error1 = new MariaEngineQueryError(
          { name: 'test-db', query },
          noDbError,
        );
        asserts.assertEquals(error1.message, 'Database does not exist');

        // Test cannot create database error
        const createDbError = new SqlError('Cannot create database');
        // @ts-ignore - Setting code property for testing
        createDbError.code = 'ER_CANT_CREATE_DB';
        Object.defineProperty(createDbError, 'constructor', {
          value: SqlError,
        });

        const error2 = new MariaEngineQueryError(
          {
            name: 'test-db',
            query: { id: 'create-db', sql: 'CREATE DATABASE test' },
          },
          createDbError,
        );
        asserts.assertEquals(error2.message, 'Cannot create database');

        // Test cannot create table error
        const createTableError = new SqlError('Cannot create table');
        // @ts-ignore - Setting code property for testing
        createTableError.code = 'ER_CANT_CREATE_TABLE';
        Object.defineProperty(createTableError, 'constructor', {
          value: SqlError,
        });

        const error3 = new MariaEngineQueryError(
          {
            name: 'test-db',
            query: { id: 'create-table', sql: 'CREATE TABLE test' },
          },
          createTableError,
        );
        asserts.assertEquals(error3.message, 'Cannot create table');
      },
    );

    await queryErrorTest.step(
      'should handle transaction and connection errors',
      () => {
        const query = { id: 'tx-errors', sql: 'COMMIT' };

        // Test transaction not allowed in stored function error
        const txNotAllowedError = new SqlError(
          'Not allowed in stored function',
        );
        // @ts-ignore - Setting code property for testing
        txNotAllowedError.code = 'ER_COMMIT_NOT_ALLOWED_IN_SF_OR_TRG';
        Object.defineProperty(txNotAllowedError, 'constructor', {
          value: SqlError,
        });

        const error1 = new MariaEngineQueryError(
          { name: 'test-db', query },
          txNotAllowedError,
        );
        asserts.assertEquals(
          error1.message,
          'Transaction operations not allowed in stored function or trigger',
        );

        // Test connection lost during query error
        const connLostError = new SqlError('Connection lost');
        // @ts-ignore - Setting code property for testing
        connLostError.code = 'PROTOCOL_CONNECTION_LOST';
        Object.defineProperty(connLostError, 'constructor', {
          value: SqlError,
        });

        const error2 = new MariaEngineQueryError(
          {
            name: 'test-db',
            query: { id: 'lost-conn', sql: 'SELECT * FROM large_table' },
          },
          connLostError,
        );
        asserts.assertEquals(
          error2.message,
          'Connection lost during query execution',
        );
      },
    );
  });
});
