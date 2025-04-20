import { MariaEngine } from '../Engine.ts';
import { MariaEngineQueryError } from '../errors/mod.ts';
import { DAMEngineConfigError, DAMEngineQueryError } from '../../errors/mod.ts';
import { QueryParameters, QueryResult } from '../../../query/mod.ts';
import * as asserts from '$asserts';

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

Deno.test('DAM.Engines.Maria', async (t) => {
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

      await queryTest.step(
        'should handle QueryParameters instance',
        async () => {
          const params = new QueryParameters('p');
          const activeParam = params.create(true);

          const result = await engine.query({
            id: 'params-instance',
            sql:
              `SELECT COUNT(*) as count FROM test_users WHERE active = :${activeParam}`,
            params: params,
          });

          assertQueryResult(result, 1);

          // Manual check for the count property - MariaDB returns this differently than Postgres
          const count = result.data[0]?.count;
          asserts.assertExists(count);
          asserts.assertEquals(Number(count), 2);
        },
      );

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

Deno.test('DAM.engines.Maria - Options', async (t) => {
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
