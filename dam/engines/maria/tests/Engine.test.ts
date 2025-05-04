import {
  MariaEngine,
  MariaEngineConnectError,
  MariaEngineQueryError,
} from '../mod.ts';
import {
  DAMEngineConfigError,
  DAMEngineQueryError,
} from '../../../errors/mod.ts';
import type { QueryResult } from '../../../types/mod.ts';
import * as asserts from '$asserts';
import { SqlError } from '$maria';

/**
 * Create a MariaDB test engine with default test configuration
 */
function createTestMariaEngine(name = 'test-maria'): MariaEngine {
  return new MariaEngine(name, {
    host: 'localhost',
    port: 3306,
    username: 'maria',
    password: 'mariapw',
    database: 'mysql',
    poolSize: 2,
    idleTimeout: 5, // Short timeout for testing
    slowQueryThreshold: 1,
    maxConnectAttempts: 2,
  });
}

/**
 * Create test table for query tests
 */
async function setupTestTable(engine: MariaEngine): Promise<void> {
  await engine.query({
    id: 'drop-test-table',
    sql: 'DROP TABLE IF EXISTS test_users;',
  });

  await engine.query({
    id: 'create-test-table',
    sql: `
      CREATE TABLE test_users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(100) NOT NULL,
        active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY (email)
      );
    `,
  });

  // Insert test data
  await engine.query({
    id: 'insert-test-data',
    sql: `
      INSERT INTO test_users (name, email, active) VALUES
      ('User 1', 'user1@example.com', true),
      ('User 2', 'user2@example.com', true),
      ('User 3', 'user3@example.com', false);
    `,
  });
}

/**
 * Clean up test tables
 */
async function cleanupTestTable(engine: MariaEngine): Promise<void> {
  await engine.query({
    id: 'drop-test-table',
    sql: 'DROP TABLE IF EXISTS test_users;',
  });
}

/**
 * Assert that a query result has the expected count and structure
 */
function assertQueryResult<T extends Record<string, unknown>>(
  result: { count: number; data: T[] },
  expectedCount: number,
  dataPropertyCheck?: (data: T[]) => boolean,
): void {
  asserts.assertEquals(result.count, expectedCount);
  asserts.assert(Array.isArray(result.data));

  if (dataPropertyCheck) {
    asserts.assert(dataPropertyCheck(result.data));
  }
}

Deno.test({
  name: 'DAM.Engines.Maria',
  sanitizeOps: false,
  sanitizeResources: false,
}, async (t) => {
  const engine = createTestMariaEngine();

  // Setup
  try {
    await engine.init();
    await setupTestTable(engine);

    await t.step('Connection Lifecycle', async (connTest) => {
      await connTest.step('should connect successfully', async () => {
        const newEngine = createTestMariaEngine('lifecycle-test');
        await newEngine.init();
        asserts.assertEquals(newEngine.status, 'CONNECTED');
        await newEngine.finalize();
      });

      await connTest.step('should get version', async () => {
        const version = await engine.version();
        asserts.assert(
          version.match(/^\d+\.\d+(\.\d+)?$/),
          `Expected version to match semantic versioning but got ${version}`,
        );
      });

      await connTest.step('should ping successfully', async () => {
        const ping = await engine.ping();
        asserts.assertEquals(ping, true);
      });
    });

    await t.step('Basic Query Operations', async (queryTest) => {
      await queryTest.step('should execute a simple query', async () => {
        const result = await engine.query({
          id: 'select-all',
          sql: 'SELECT * FROM test_users',
        });

        assertQueryResult(result, 3, (data) => data.length === 3);
        asserts.assert(result.id);
        asserts.assert(result.time >= 0);
      });

      await queryTest.step('should handle query parameters', async () => {
        const result = await engine.query<{ id: number; name: string }>({
          id: 'select-where',
          sql: 'SELECT id, name FROM test_users WHERE active = :active',
          params: { active: true },
        });

        assertQueryResult(
          result,
          2,
          (data) =>
            data.every((row) =>
              typeof row.id === 'number' && typeof row.name === 'string'
            ),
        );
      });

      await queryTest.step('should throw error for invalid SQL', async () => {
        await asserts.assertRejects(
          async () => {
            await engine.query({
              id: 'invalid-sql',
              sql: 'SELECT * FROM non_existent_table',
            });
          },
          MariaEngineQueryError,
        );
      });

      await queryTest.step(
        'should throw error for missing parameters',
        async () => {
          await asserts.assertRejects(
            async () => {
              await engine.query({
                id: 'missing-params',
                sql: 'SELECT * FROM test_users WHERE id = :id',
                // No id parameter provided
                params: { name: 'test' },
              });
            },
            DAMEngineQueryError,
          );
        },
      );
    });

    await t.step('Chained Query Operations', async (chainTest) => {
      await chainTest.step(
        'should execute a chain of successful queries',
        async () => {
          const result = await engine.chainedQuery<[
            { id: number; name: string }, // First query result type
            { count: bigint }, // Second query result type
          ]>({
            id: 'chain-first',
            sql: 'SELECT id, name FROM test_users WHERE active = true',
            onSuccess: (result) => {
              return {
                id: 'chain-second',
                sql:
                  'SELECT COUNT(*) as count FROM test_users WHERE id > :min_id',
                params: { min_id: result.data[0]?.id || 0 },
              };
            },
          });

          asserts.assertEquals(
            result.count,
            2,
            'Should execute 2 queries in the chain',
          );
          asserts.assertEquals(
            result.results.length,
            2,
            'Should have 2 results in the chain',
          );

          // Type guard helper function
          const isQueryResult = <T>(result: any): result is { data: T[] } => {
            return result && 'data' in result && Array.isArray(result.data);
          };

          // Check first result - user data
          const firstResult = result.results[0];
          asserts.assert(
            isQueryResult<{ id: number; name: string }>(firstResult),
            'First result should be a successful QueryResult',
          );
          asserts.assertEquals(firstResult.data[0]!.name, 'User 1');

          // Check second result - count
          const secondResult = result.results[1];
          asserts.assert(
            isQueryResult<{ count: bigint }>(secondResult),
            'Second result should be a successful QueryResult',
          );
          asserts.assertEquals(typeof secondResult.data[0]!.count, 'bigint');
        },
      );

      await chainTest.step(
        'should handle errors in the chain with error handler',
        async () => {
          await engine.query({
            sql: 'DELETE FROM test_users;',
          });
          // Reset test data to ensure consistency
          await engine.query({
            id: 'reset-test-data',
            sql: `
            INSERT INTO test_users (name, email, active) VALUES
            ('User 1', 'user1@example.com', true),
            ('User 2', 'user2@example.com', true),
            ('User 3', 'user3@example.com', false);
          `,
          });

          const result = await engine.chainedQuery({
            id: 'chain-with-error',
            sql: 'SELECT id FROM test_users LIMIT 1',
            onSuccess: (firstResult) => ({
              id: 'will-fail',
              sql: 'SELECT * FROM non_existent_table',
              // Add onError at this level to handle the error directly
              onError: (error) => ({
                id: 'nested-error-handler',
                sql: 'SELECT COUNT(*) as error_count FROM test_users',
              }),
            }),
          });

          // Check that we got both the initial query result and the error handler result
          asserts.assertEquals(
            result.error,
            undefined,
            'Error should be handled',
          );
          asserts.assertEquals(
            result.results.length,
            2,
            'Should have 2 results: initial query and error handler',
          );

          // Type guard helper function
          const isQueryResult = <T>(result: any): result is { data: T[] } => {
            return result && 'data' in result && Array.isArray(result.data);
          };

          // First result should be the initial query
          const firstResult = result.results[0];
          asserts.assert(
            isQueryResult(firstResult),
            'First result should be a successful QueryResult',
          );
          asserts.assertExists(firstResult.data[0]?.id);

          // Second result should be from the error handler (COUNT query)
          const secondResult = result.results[1];
          asserts.assert(
            isQueryResult(secondResult),
            'Second result should be a successful QueryResult',
          );
          asserts.assertExists(secondResult.data[0]?.error_count);
          asserts.assertEquals(
            Number(secondResult.data[0]?.error_count),
            3,
            'Error handler result should contain count of 3 users',
          );
        },
      );

      await chainTest.step(
        'should propagate errors when no error handler',
        async () => {
          const result = await engine.chainedQuery({
            id: 'chain-propagate-error',
            sql: 'SELECT id FROM test_users LIMIT 1',
            onSuccess: () => ({
              id: 'will-fail-no-handler',
              sql: 'SELECT * FROM non_existent_table',
            }),
            // No onError handler
          });

          asserts.assertExists(result.error, 'Error should be propagated');
          asserts.assertEquals(
            result.results.length,
            1,
            'Only the first query should succeed',
          );
        },
      );
    });

    await t.step('Batch Query Operations', async (batchTest) => {
      await batchTest.step(
        'should execute multiple queries in batch',
        async () => {
          const results = await engine.batchQuery<[
            { id: number; name: string },
            { count: bigint },
            { has_inactive: number },
          ]>([
            {
              id: 'batch-1',
              sql: 'SELECT id, name FROM test_users ORDER BY id LIMIT 1',
            },
            {
              id: 'batch-2',
              sql: 'SELECT COUNT(*) as count FROM test_users',
            },
            {
              id: 'batch-3',
              sql:
                'SELECT EXISTS(SELECT 1 FROM test_users WHERE active = false) as has_inactive',
            },
          ]);

          asserts.assertEquals(
            results.count,
            3,
            'All 3 queries should execute',
          );

          // Type guard helper function
          const isQueryResult = <T>(result: any): result is { data: T[] } => {
            return result && 'data' in result && Array.isArray(result.data);
          };

          // Check first result
          const firstResult = results.results[0];
          asserts.assert(
            isQueryResult<{ id: number; name: string }>(firstResult),
            'First result should be a successful QueryResult',
          );
          asserts.assertEquals(firstResult.data[0]!.name, 'User 1');

          // Check second result
          const secondResult = results.results[1];
          asserts.assert(
            isQueryResult<{ count: bigint }>(secondResult),
            'Second result should be a successful QueryResult',
          );
          asserts.assertEquals(typeof secondResult.data[0]!.count, 'bigint');
          asserts.assertEquals(Number(secondResult.data[0]!.count), 3);

          // Check third result
          const thirdResult = results.results[2];
          asserts.assert(
            isQueryResult<{ has_inactive: number }>(thirdResult),
            'Third result should be a successful QueryResult',
          );
          // MariaDB returns 0/1 for boolean EXISTS query
          asserts.assertEquals(Number(thirdResult.data[0]!.has_inactive), 1);
        },
      );

      await batchTest.step(
        'should handle errors in batch with continueOnError=true',
        async () => {
          const results = await engine.batchQuery([
            {
              id: 'batch-success',
              sql: 'SELECT COUNT(*) as count FROM test_users',
            },
            {
              id: 'batch-fail',
              sql: 'SELECT * FROM non_existent_table',
            },
            {
              id: 'batch-after-fail',
              sql: 'SELECT 1 as value',
            },
          ], { continueOnError: true });

          asserts.assertEquals(
            results.count,
            3,
            'All 3 queries should be attempted',
          );

          // Type guard helper function
          const isQueryResult = (result: any): result is { data: any[] } =>
            'data' in result;

          // First result should be successful
          asserts.assert(
            isQueryResult(results.results[0]),
            'First result should be a successful QueryResult',
          );

          // Second result should be an error
          asserts.assert(
            results.results[1] instanceof DAMEngineQueryError,
            'Second result should be an error',
          );

          // Third result should be successful
          asserts.assert(
            isQueryResult(results.results[2]),
            'Third result should be a successful QueryResult',
          );
        },
      );

      await batchTest.step(
        'should stop on first error with continueOnError=false',
        async () => {
          const results = await engine.batchQuery([
            {
              id: 'batch-success-2',
              sql: 'SELECT COUNT(*) as count FROM test_users',
            },
            {
              id: 'batch-fail-2',
              sql: 'SELECT * FROM non_existent_table',
            },
            {
              id: 'batch-never-runs',
              sql: 'SELECT 1 as value',
            },
          ], { continueOnError: false });

          asserts.assert(results.count < 3, 'Not all queries should complete');

          // First result should be successful
          asserts.assertExists(
            (results.results[0]! as QueryResult).data,
            'First query should succeed',
          );

          // Second result should be an error
          asserts.assert(
            results.results[1] instanceof MariaEngineQueryError,
            'Second result should be an error',
          );

          // Third result should not exist
          asserts.assertEquals(
            results.results[2],
            undefined,
            'Third query should not execute',
          );
        },
      );
    });

    await t.step('Parameter Handling', async (paramTest) => {
      await paramTest.step(
        'should convert parameter syntax correctly',
        async () => {
          // This tests the _standardizeQuery method internally
          const result = await engine.query({
            id: 'param-conversion',
            sql:
              'SELECT * FROM test_users WHERE id = :id: AND active = :is_active:',
            params: { id: 4, is_active: true },
          });
          // There should be at least one row matching this criteria
          assertQueryResult(result, 1);
        },
      );

      await paramTest.step(
        'should handle complex parameter types',
        async () => {
          const now = new Date();
          const result = await engine.query<{
            string_val: string;
            num_val: number;
            bool_val: number; // MariaDB returns boolean as 0/1
            date_val: Date;
            null_val: null;
          }>({
            id: 'complex-params',
            sql: `
            SELECT 
              :stringParam as string_val,
              :numParam as num_val,
              :boolParam as bool_val,
              :dateParam as date_val,
              :nullParam as null_val
          `,
            params: {
              stringParam: 'test',
              numParam: 123.45,
              boolParam: true,
              dateParam: now,
              nullParam: null,
            },
          });

          assertQueryResult(result, 1, (data) => {
            const row = data[0]!;
            return row.string_val === 'test' &&
              Math.abs(Number(row.num_val) - 123.45) < 0.0001 &&
              row.bool_val === 1 &&
              row.null_val === null;
          });
        },
      );

      await paramTest.step(
        'should handle INSERT with params',
        async () => {
          const result = await engine.query({
            id: 'insert-with-params',
            sql:
              'INSERT INTO test_users (name, email, active) VALUES (:name, :email, :active)',
            params: {
              name: 'Test User',
              email: 'test@example.com',
              active: true,
            },
          });

          // Should affect 1 row and return an insertId
          asserts.assertEquals(result.count, 1, 'Should insert 1 row');
        },
      );
    });
  } catch (error) {
    console.error('Test setup error:', error);
    throw error;
  } finally {
    // Cleanup
    try {
      await cleanupTestTable(engine);
      await engine.finalize();
    } catch (error) {
      console.error('Test cleanup error:', error);
    }
  }
});

Deno.test({
  name: 'DAM.engines.Maria - Options',
  sanitizeOps: false,
  sanitizeResources: false,
}, async (t) => {
  await t.step(
    'should validate engine options correctly',
    async (optionTest) => {
      await optionTest.step('should validate idleTimeout', () => {
        // Valid timeout
        const validEngine = new MariaEngine('valid-timeout', {
          host: 'localhost',
          port: 3306,
          username: 'maria',
          password: 'password',
          database: 'mysql',
          idleTimeout: 300,
        });
        asserts.assertEquals(validEngine.getOption('idleTimeout'), 300);

        // Invalid timeout
        asserts.assertThrows(
          () => {
            new MariaEngine('invalid-timeout', {
              host: 'localhost',
              port: 3306,
              username: 'maria',
              password: 'password',
              database: 'mysql',
              idleTimeout: 3601, // > 3600 maximum
            });
          },
          DAMEngineConfigError,
          'Idle timeout must be a number between 1 and 3600 seconds',
        );
      });

      await optionTest.step('should validate connectionTimeout', () => {
        // Valid connection timeout
        const validEngine = new MariaEngine('valid-conn-timeout', {
          host: 'localhost',
          port: 3306,
          username: 'maria',
          password: 'password',
          database: 'mysql',
          connectionTimeout: 60,
        });
        asserts.assertEquals(validEngine.getOption('connectionTimeout'), 60);

        // Invalid connection timeout
        asserts.assertThrows(
          () => {
            new MariaEngine('invalid-conn-timeout', {
              host: 'localhost',
              port: 3306,
              username: 'maria',
              password: 'password',
              database: 'mysql',
              connectionTimeout: 301, // > 300 maximum
            });
          },
          DAMEngineConfigError,
          'Connection timeout must be a number between 1 and 300 seconds',
        );
      });

      await optionTest.step('should validate poolSize', () => {
        // Valid pool size
        const validEngine = new MariaEngine('valid-pool', {
          host: 'localhost',
          port: 3306,
          username: 'maria',
          password: 'password',
          database: 'mysql',
          poolSize: 5,
        });
        asserts.assertEquals(validEngine.getOption('poolSize'), 5);

        // Default pool size
        const defaultEngine = new MariaEngine('default-pool', {
          host: 'localhost',
          port: 3306,
          username: 'maria',
          password: 'password',
          database: 'mysql',
        });
        asserts.assertEquals(defaultEngine.getOption('poolSize'), 1);

        // Invalid pool size
        asserts.assertThrows(
          () => {
            new MariaEngine('invalid-pool', {
              host: 'localhost',
              port: 3306,
              username: 'maria',
              password: 'password',
              database: 'mysql',
              poolSize: 0, // < 1 minimum
            });
          },
          DAMEngineConfigError,
          'Pool size must be a positive number',
        );
      });

      await optionTest.step('should validate port', () => {
        // Valid port
        const validEngine = new MariaEngine('valid-port', {
          host: 'localhost',
          port: 3307,
          username: 'maria',
          password: 'password',
          database: 'mysql',
        });
        asserts.assertEquals(validEngine.getOption('port'), 3307);

        // Default port
        const defaultEngine = new MariaEngine('default-port', {
          host: 'localhost',
          username: 'maria',
          password: 'password',
          database: 'mysql',
        });
        asserts.assertEquals(defaultEngine.getOption('port'), 3306);

        // Invalid port
        asserts.assertThrows(
          () => {
            new MariaEngine('invalid-port', {
              host: 'localhost',
              port: 65536, // > 65535 maximum
              username: 'maria',
              password: 'password',
              database: 'mysql',
            });
          },
          DAMEngineConfigError,
          'Port must be a number between 1 and 65535',
        );
      });

      await optionTest.step(
        'should validate connection string parameters',
        () => {
          // Invalid username
          asserts.assertThrows(
            () => {
              new MariaEngine('invalid-username', {
                host: 'localhost',
                port: 3306,
                username: '',
                password: 'password',
                database: 'mysql',
              });
            },
            DAMEngineConfigError,
            'must be a non-empty string',
          );

          // Invalid host
          asserts.assertThrows(
            () => {
              new MariaEngine('invalid-host', {
                host: '',
                port: 3306,
                username: 'maria',
                password: 'password',
                database: 'mysql',
              });
            },
            DAMEngineConfigError,
            'must be a non-empty string',
          );
        },
      );

      await optionTest.step('should validate enforceTLS', () => {
        // Valid enforceTLS
        const validEngine = new MariaEngine('valid-tls', {
          host: 'localhost',
          port: 3306,
          username: 'maria',
          password: 'password',
          database: 'mysql',
          enforceTLS: true,
        });
        asserts.assertEquals(validEngine.getOption('enforceTLS'), true);

        // Default enforceTLS
        const defaultEngine = new MariaEngine('default-tls', {
          host: 'localhost',
          port: 3306,
          username: 'maria',
          password: 'password',
          database: 'mysql',
        });
        asserts.assertEquals(defaultEngine.getOption('enforceTLS'), undefined);

        // Invalid enforceTLS (non-boolean)
        asserts.assertThrows(
          () => {
            new MariaEngine('invalid-tls', {
              host: 'localhost',
              port: 3306,
              username: 'maria',
              password: 'password',
              database: 'mysql',
              // @ts-ignore - Testing invalid type
              enforceTLS: 'yes',
            });
          },
          DAMEngineConfigError,
          'Enforce TLS must be a boolean',
        );
      });
    },
  );
});

Deno.test({
  name: 'DAM.engines.Maria - Error Classes',
  sanitizeOps: false,
  sanitizeResources: false,
}, async (t) => {
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
  });
});

Deno.test({
  name: 'DAM.Engines.Maria - Connection Management',
  sanitizeOps: false,
  sanitizeResources: false,
}, async (t) => {
  await t.step(
    'should handle multiple concurrent queries correctly',
    async () => {
      // Create engine with larger pool size directly in constructor
      const concurrentEngine = new MariaEngine('concurrent-test', {
        host: 'localhost',
        port: 3306,
        username: 'maria',
        password: 'mariapw',
        database: 'mysql',
        poolSize: 5, // Larger pool for concurrent queries
        idleTimeout: 5,
        slowQueryThreshold: 1,
        maxConnectAttempts: 2,
      });

      await concurrentEngine.init();

      // Start multiple queries concurrently
      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(concurrentEngine.query<{ value: number }>({
          sql: `SELECT ${i} as value, SLEEP(0.1)`,
        }));
      }

      // All should complete without errors
      const results = await Promise.all(promises);
      asserts.assertEquals(results.length, 10);

      // Verify results contain the expected values
      for (let i = 0; i < 10; i++) {
        asserts.assertEquals(Number(results[i]!.data[0]!.value), i);
      }

      await concurrentEngine.finalize();
    },
  );

  await t.step('should handle auto-reconnection', async () => {
    const reconnectEngine = createTestMariaEngine('reconnect-engine');
    await reconnectEngine.init();

    // Force disconnect by finalizing
    await reconnectEngine.finalize();

    // Next query should auto-reconnect
    const result = await reconnectEngine.query({
      sql: 'SELECT 1 as value',
    });

    asserts.assertEquals(Number(result.data[0]!.value), 1);
    asserts.assertEquals(reconnectEngine.status, 'CONNECTED');

    await reconnectEngine.finalize();
  });
});

Deno.test({
  name: 'DAM.Engines.Maria - Certificate Handling',
  sanitizeOps: false,
  sanitizeResources: false,
}, async (t) => {
  await t.step('should throw error for invalid CACertPath', () => {
    asserts.assertThrows(
      () => {
        new MariaEngine('invalid-cert', {
          host: 'localhost',
          port: 3306,
          username: 'maria',
          password: 'password',
          database: 'mysql',
          CACertPath: '/nonexistent/cert.pem',
        });
      },
      DAMEngineConfigError,
      'CACertPath file not found',
    );

    // Mock Deno.readTextFileSync to simulate permission error
    const originalReadTextFileSync = Deno.readTextFileSync;
    try {
      // @ts-ignore - Mocking for test
      Deno.readTextFileSync = () => {
        throw new Deno.errors.PermissionDenied('Permission denied');
      };

      asserts.assertThrows(
        () => {
          new MariaEngine('permission-denied-cert', {
            host: 'localhost',
            port: 3306,
            username: 'maria',
            password: 'password',
            database: 'mysql',
            CACertPath: '/some/cert.pem',
          });
        },
        DAMEngineConfigError,
        'Permission denied',
      );

      // @ts-ignore - Mocking for test
      Deno.readTextFileSync = () => {
        throw new Error('Unknown error');
      };

      asserts.assertThrows(
        () => {
          new MariaEngine('unknown-error-cert', {
            host: 'localhost',
            port: 3306,
            username: 'maria',
            password: 'password',
            database: 'mysql',
            CACertPath: '/some/cert.pem',
          });
        },
        DAMEngineConfigError,
        'Error reading CACertPath file',
      );
    } finally {
      // Restore original function
      Deno.readTextFileSync = originalReadTextFileSync;
    }
  });
});

Deno.test({
  name: 'DAM.Engines.Maria - Parameter Edge Cases',
  sanitizeOps: false,
  sanitizeResources: false,
}, async (t) => {
  const engine = createTestMariaEngine();

  try {
    await engine.init();

    await t.step('should handle empty parameter objects', async () => {
      const result = await engine.query({
        sql: 'SELECT 1 as value',
        params: {},
      });

      asserts.assertEquals(Number(result.data[0]!.value), 1);
    });

    await t.step('should handle complex nested parameters', async () => {
      // This tests how the engine handles JSON data
      const result = await engine.query<
        {
          json_data: string;
        }
      >({
        sql: 'SELECT :complexParam: as json_data',
        params: {
          complexParam: JSON.stringify({
            nested: {
              array: [1, 2, 3],
              value: 'test',
            },
            timestamp: new Date().toISOString(),
          }),
        },
      });

      asserts.assertExists(result.data[0]!.json_data);
      const parsedJson = JSON.parse(result.data[0]!.json_data);
      asserts.assertEquals(typeof parsedJson, 'object');
      asserts.assertExists(parsedJson.nested);
      asserts.assertExists(parsedJson.nested.array);
    });

    await t.step('should handle multiple parameter references', async () => {
      const result = await engine.query({
        sql: 'SELECT :param: as first, :param: as second, :param: as third',
        params: {
          param: 'reused-value',
        },
      });

      asserts.assertEquals(result.data[0]!.first, 'reused-value');
      asserts.assertEquals(result.data[0]!.second, 'reused-value');
      asserts.assertEquals(result.data[0]!.third, 'reused-value');
    });
  } finally {
    await engine.finalize();
  }
});

Deno.test({
  name: 'DAM.Engines.Maria - Query Method Edge Cases',
  sanitizeOps: false,
  sanitizeResources: false,
}, async (t) => {
  const engine = createTestMariaEngine();

  try {
    await engine.init();
    await setupTestTable(engine);

    await t.step('should handle query when not connected', async () => {
      const disconnectedEngine = createTestMariaEngine('disconnected-engine');

      // Don't initialize, so status is DISCONNECTED
      await asserts.assert(
        async () => {
          await disconnectedEngine.query({
            sql: 'SELECT 1',
          });
        },
      );
    });

    await t.step('should handle auto-reconnect failures', async () => {
      // First create a normal engine and connect
      const failEngine = createTestMariaEngine('fail-reconnect');
      await failEngine.init();
      await failEngine.finalize();

      // Create a new engine with the wrong password
      const wrongPasswordEngine = new MariaEngine('wrong-password-engine', {
        host: 'localhost',
        port: 3306,
        username: 'maria',
        password: 'wrong-password', // Incorrect password
        database: 'mysql',
        poolSize: 2,
        idleTimeout: 5,
        maxConnectAttempts: 2,
      });

      await asserts.assertRejects(
        async () => {
          await wrongPasswordEngine.query({
            sql: 'SELECT 1',
          });
        },
        MariaEngineConnectError,
      );
    });
  } finally {
    await cleanupTestTable(engine);
    await engine.finalize();
  }
});
