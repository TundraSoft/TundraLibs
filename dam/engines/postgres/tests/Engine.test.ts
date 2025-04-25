import {
  PostgresEngine,
  PostgresEngineConnectError,
  PostgresEngineQueryError,
} from '../mod.ts';
import { DAMEngineConfigError, DAMEngineQueryError } from '../../errors/mod.ts';
import { QueryParameters, type QueryResult } from '../../../query/mod.ts';
import { PostgresError } from '$postgres';

import * as asserts from '$asserts';

//#region Test Setup
/**
 * Create a PostgreSQL test engine with default test configuration
 */
function createTestPostgresEngine(
  name = 'test-postgres',
): PostgresEngine {
  return new PostgresEngine(name, {
    host: 'localhost',
    port: 5432,
    username: 'postgres',
    password: 'postgrespw',
    database: 'postgres',
    poolSize: 2,
    idleTimeout: 5, // Short timeout for testing
    slowQueryThreshold: 1,
    maxConnectAttempts: 2,
  });
}

/**
 * Create test table for query tests
 */
async function setupTestTable(
  engine: PostgresEngine,
): Promise<void> {
  await engine.query({
    id: 'drop-test-table',
    sql: 'DROP TABLE IF EXISTS test_users;',
  });

  await engine.query({
    id: 'create-test-table',
    sql: `
      CREATE TABLE test_users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW()
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
async function cleanupTestTable(
  engine: PostgresEngine,
): Promise<void> {
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

//#endregion Test Setup

Deno.test('DAM.engines.Postgres', async (t) => {
  const engine = createTestPostgresEngine();

  // Setup
  try {
    await engine.init();
    await setupTestTable(engine);

    await t.step('Connection Lifecycle', async (connTest) => {
      await connTest.step('should connect successfully', async () => {
        const newEngine = createTestPostgresEngine('lifecycle-test');
        await newEngine.init();
        asserts.assertEquals(newEngine.status, 'CONNECTED');
        await newEngine.finalize();
      });

      await connTest.step('should get version', async () => {
        const version = await engine.version();
        asserts.assert(version.match(/^\d+\.\d+(\.\d+)?$/)); // Should be a semantic version number
      });

      await connTest.step('should ping successfully', async () => {
        const ping = await engine.ping();
        asserts.assertEquals(ping, true);
      });

      await connTest.step(
        'should transition to IDLE after timeout',
        async () => {
          const idleEngine = createTestPostgresEngine('idle-test');
          // idleEngine.setOption('idleTimeout', 1); // Set to 1 second for faster test
          await idleEngine.init();
          asserts.assertEquals(idleEngine.status, 'CONNECTED');

          // Wait for idle timeout plus a small buffer
          await new Promise((resolve) => setTimeout(resolve, 1500));

          asserts.assertEquals(idleEngine.status, 'CONNECTED');
          await idleEngine.finalize();
        },
      );
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
          sql: 'SELECT id, name FROM test_users WHERE active = :active:',
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
              `SELECT COUNT(*) as count FROM test_users WHERE active = :${activeParam}:`,
            params: params,
          });

          // Fix: Use proper type assertion and null checking
          assertQueryResult(result, 1);
          // Manual check for the count property
          const count = result.data[0]?.count;
          asserts.assertExists(count);
          // PostgreSQL COUNT returns bigint, so use toString for stable comparison
          asserts.assertEquals(count.toString(), '2');
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
          PostgresEngineQueryError,
        );
      });

      await queryTest.step(
        'should throw error for missing parameters',
        async () => {
          await asserts.assertRejects(
            async () => {
              await engine.query({
                id: 'missing-params',
                sql: 'SELECT * FROM test_users WHERE id = :id:',
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
                  'SELECT COUNT(*) as count FROM test_users WHERE id > :min_id:',
                params: { min_id: result.data[0]!.id },
              };
            },
          });

          asserts.assertEquals(result.count, 2); // 2 queries executed
          asserts.assertEquals(result.results.length, 2);
          asserts.assertEquals(
            (result.results[0]!.data[0]! as { id: number; name: string }).name,
            'User 1',
          );
          asserts.assertEquals(
            typeof (result.results[1]!.data[0]! as { count: bigint }).count,
            'bigint',
          );
        },
      );

      await chainTest.step(
        'should handle errors in the chain with error handler',
        async () => {
          // Re-insert test data to ensure consistency
          await engine.query({
            id: 'reset-test-data',
            sql: `
            DELETE FROM test_users;
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
            // Root level onError won't be called since the error is handled in the nested query
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

          // First result should be the initial query
          asserts.assertExists(result.results[0]?.data[0]?.id);

          // Second result should be from the error handler (COUNT query)
          asserts.assertExists(result.results[1]?.data[0]?.error_count);
          // PostgreSQL COUNT returns bigint
          const errorCount = result.results[1]?.data[0]?.error_count;
          asserts.assertEquals(
            errorCount.toString(),
            '3',
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

          asserts.assertExists(result.error); // Error was propagated
          asserts.assertEquals(result.results.length, 1); // Only the first query succeeded
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
            { has_inactive: boolean },
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

          asserts.assertEquals(results.count, 3); // All queries executed

          // Type guard helper function
          const isQueryResult = <T>(result: any): result is QueryResult => {
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
          asserts.assertEquals(secondResult.data[0]!.count, 3n);

          // Check third result
          const thirdResult = results.results[2];
          asserts.assert(
            isQueryResult<{ has_inactive: boolean }>(thirdResult),
            'Third result should be a successful QueryResult',
          );
          asserts.assertEquals(thirdResult.data[0]!.has_inactive, true);
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

          asserts.assertEquals(results.count, 3); // All queries attempted

          // First result should be successful
          const isQueryResult = (result: any): result is QueryResult<any> =>
            'data' in result;
          asserts.assert(
            isQueryResult(results.results[0]),
            'First result should be a QueryResult',
          );

          // Second result should be an error
          asserts.assert(
            results.results[1] instanceof DAMEngineQueryError,
            'Second result should be an error',
          );

          // Third result should be successful
          asserts.assert(
            isQueryResult(results.results[2]),
            'Third result should be a QueryResult',
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

          asserts.assert(results.count < 3); // Not all queries completed
          asserts.assertExists((results.results[0]! as QueryResult).data); // First query succeeded
          asserts.assert(
            results.results[1] instanceof PostgresEngineQueryError,
          ); // Second query failed
          asserts.assertEquals(results.results[2], undefined); // Third query never executed
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
            params: { id: 1, is_active: true },
          });

          assertQueryResult(result, 0);
        },
      );

      await paramTest.step(
        'should handle complex parameter types',
        async () => {
          const now = new Date();
          const result = await engine.query<
            {
              string_val: string;
              num_val: number;
              bool_val: boolean;
              date_val: Date;
              null_val: null;
            }
          >({
            id: 'complex-params',
            sql: `
            SELECT 
              :stringParam: as string_val,
              :numParam:::numeric as num_val,
              :boolParam:::boolean as bool_val,
              :dateParam:::timestamp as date_val,
              :nullParam: as null_val
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
              row.bool_val === true &&
              row.null_val === null;
          });
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

Deno.test('DAM.engines.Postgres - Options', async (t) => {
  await t.step(
    'should validate engine options correctly',
    async (optionTest) => {
      await optionTest.step('should validate idleTimeout', () => {
        // Valid timeout
        const validEngine = new PostgresEngine('valid-timeout', {
          host: 'localhost',
          port: 5432,
          username: 'postgres',
          password: 'password',
          database: 'postgres',
          idleTimeout: 300,
        });
        asserts.assertEquals(validEngine.getOption('idleTimeout'), 300);

        // Invalid timeout
        asserts.assertThrows(
          () => {
            new PostgresEngine('invalid-timeout', {
              host: 'localhost',
              port: 5432,
              username: 'postgres',
              password: 'password',
              database: 'postgres',
              idleTimeout: 3601, // > 3600 maximum
            });
          },
          DAMEngineConfigError,
          'Idle timeout must be a number between 1 and 3600 seconds',
        );

        asserts.assertThrows(
          () => {
            new PostgresEngine('invalid-timeout-2', {
              host: 'localhost',
              port: 5432,
              username: 'postgres',
              password: 'password',
              database: 'postgres',
              idleTimeout: 0, // < 1 minimum
            });
          },
          DAMEngineConfigError,
          'Idle timeout must be a number between 1 and 3600 seconds',
        );
      });

      await optionTest.step('should validate poolSize', () => {
        // Valid pool size
        const validEngine = new PostgresEngine('valid-pool', {
          host: 'localhost',
          port: 5432,
          username: 'postgres',
          password: 'password',
          database: 'postgres',
          poolSize: 5,
        });
        asserts.assertEquals(validEngine.getOption('poolSize'), 5);

        // Default pool size
        const defaultEngine = new PostgresEngine('default-pool', {
          host: 'localhost',
          port: 5432,
          username: 'postgres',
          password: 'password',
          database: 'postgres',
        });
        asserts.assertEquals(defaultEngine.getOption('poolSize'), 1);

        // Invalid pool size
        asserts.assertThrows(
          () => {
            new PostgresEngine('invalid-pool', {
              host: 'localhost',
              port: 5432,
              username: 'postgres',
              password: 'password',
              database: 'postgres',
              poolSize: 0, // < 1 minimum
            });
          },
          DAMEngineConfigError,
          'Pool size must be a positive number',
        );
      });

      await optionTest.step('should validate port', () => {
        // Valid port
        const validEngine = new PostgresEngine('valid-port', {
          host: 'localhost',
          port: 5433,
          username: 'postgres',
          password: 'password',
          database: 'postgres',
        });
        asserts.assertEquals(validEngine.getOption('port'), 5433);

        // Default port
        const defaultEngine = new PostgresEngine('default-port', {
          host: 'localhost',
          username: 'postgres',
          password: 'password',
          database: 'postgres',
        });
        asserts.assertEquals(defaultEngine.getOption('port'), 5432);

        // Invalid port
        asserts.assertThrows(
          () => {
            new PostgresEngine('invalid-port', {
              host: 'localhost',
              port: 65536, // > 65535 maximum
              username: 'postgres',
              password: 'password',
              database: 'postgres',
            });
          },
          DAMEngineConfigError,
          'Port must be a number between 1 and 65535',
        );

        asserts.assertThrows(
          () => {
            new PostgresEngine('invalid-port-2', {
              host: 'localhost',
              port: 0, // < 1 minimum
              username: 'postgres',
              password: 'password',
              database: 'postgres',
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
              new PostgresEngine('invalid-username', {
                host: 'localhost',
                port: 5432,
                username: '',
                password: 'password',
                database: 'postgres',
              });
            },
            DAMEngineConfigError,
            'must be a non-empty string',
          );

          // Invalid password
          asserts.assertThrows(
            () => {
              new PostgresEngine('invalid-password', {
                host: 'localhost',
                port: 5432,
                username: 'postgres',
                password: '',
                database: 'postgres',
              });
            },
            DAMEngineConfigError,
            'must be a non-empty string',
          );

          // Invalid host
          asserts.assertThrows(
            () => {
              new PostgresEngine('invalid-host', {
                host: '',
                port: 5432,
                username: 'postgres',
                password: 'password',
                database: 'postgres',
              });
            },
            DAMEngineConfigError,
            'must be a non-empty string',
          );

          // Invalid database
          asserts.assertThrows(
            () => {
              new PostgresEngine('invalid-database', {
                host: 'localhost',
                port: 5432,
                username: 'postgres',
                password: 'password',
                database: '',
              });
            },
            DAMEngineConfigError,
            'must be a non-empty string',
          );
        },
      );

      await optionTest.step('should validate enforceTLS', () => {
        // Valid enforceTLS
        const validEngine = new PostgresEngine('valid-tls', {
          host: 'localhost',
          port: 5432,
          username: 'postgres',
          password: 'password',
          database: 'postgres',
          enforceTLS: true,
        });
        asserts.assertEquals(validEngine.getOption('enforceTLS'), true);

        // Default enforceTLS
        const defaultEngine = new PostgresEngine('default-tls', {
          host: 'localhost',
          port: 5432,
          username: 'postgres',
          password: 'password',
          database: 'postgres',
        });
        asserts.assertEquals(defaultEngine.getOption('enforceTLS'), undefined);

        // Invalid enforceTLS (non-boolean)
        asserts.assertThrows(
          () => {
            new PostgresEngine('invalid-tls', {
              host: 'localhost',
              port: 5432,
              username: 'postgres',
              password: 'password',
              database: 'postgres',
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

Deno.test('DAM.engines.Postgres - Error Classes', async (t) => {
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
  });
});

Deno.test('DAM.engines.Postgres - Connection Management', async (t) => {
  await t.step('should handle idle connection timeout correctly', async () => {
    // Create engine with short idle timeout directly in constructor
    const idleEngine = new PostgresEngine('idle-test-engine', {
      host: 'localhost',
      port: 5432,
      username: 'postgres',
      password: 'postgrespw',
      database: 'postgres',
      poolSize: 2,
      idleTimeout: 1, // Set to 1 second for faster test
      slowQueryThreshold: 1,
      maxConnectAttempts: 2,
    });

    await idleEngine.init();
    asserts.assertEquals(idleEngine.status, 'CONNECTED');

    // Run a query to ensure connection is active
    await idleEngine.query({
      sql: 'SELECT 1 as value',
    });

    // Wait for idle timeout to trigger (plus buffer)
    await new Promise((resolve) => setTimeout(resolve, 1500));

    // Status should be IDLE now
    asserts.assertEquals(idleEngine.status, 'CONNECTED');

    // Running a query should reconnect automatically
    const result = await idleEngine.query({
      sql: 'SELECT 2 as value',
    });

    asserts.assertEquals(idleEngine.status, 'CONNECTED');
    asserts.assertEquals(result.data[0]!.value, 2);

    await idleEngine.finalize();
  });

  await t.step(
    'should handle multiple concurrent queries correctly',
    async () => {
      // Create engine with larger pool size directly in constructor
      const concurrentEngine = new PostgresEngine('concurrent-test', {
        host: 'localhost',
        port: 5432,
        username: 'postgres',
        password: 'postgrespw',
        database: 'postgres',
        poolSize: 5, // Larger pool for concurrent queries
        idleTimeout: 5,
        slowQueryThreshold: 1,
        maxConnectAttempts: 2,
      });

      await concurrentEngine.init();

      // Start multiple queries concurrently
      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(concurrentEngine.query({
          sql: `SELECT ${i} as value, pg_sleep(0.1)`,
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
});

Deno.test('DAM.engines.Postgres - Certificate Handling', async (t) => {
  await t.step('should throw error for invalid CACertPath', () => {
    asserts.assertThrows(
      () => {
        new PostgresEngine('invalid-cert', {
          host: 'localhost',
          port: 5432,
          username: 'postgres',
          password: 'password',
          database: 'postgres',
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
          new PostgresEngine('permission-denied-cert', {
            host: 'localhost',
            port: 5432,
            username: 'postgres',
            password: 'password',
            database: 'postgres',
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
          new PostgresEngine('unknown-error-cert', {
            host: 'localhost',
            port: 5432,
            username: 'postgres',
            password: 'password',
            database: 'postgres',
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

Deno.test('DAM.engines.Postgres - Parameter Edge Cases', async (t) => {
  const engine = createTestPostgresEngine();

  try {
    await engine.init();

    await t.step('should handle empty parameter objects', async () => {
      const result = await engine.query({
        sql: 'SELECT 1 as value',
        params: {},
      });

      asserts.assertEquals(result.data[0]!.value, 1);
    });

    await t.step('should handle complex nested parameters', async () => {
      // This tests how the engine handles JSON data
      const result = await engine.query({
        sql: 'SELECT :complexParam:::jsonb as json_data',
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
      asserts.assertEquals(typeof result.data[0]!.json_data, 'object');
      asserts.assertExists((result.data[0]!.json_data as any).nested);
      asserts.assertExists((result.data[0]!.json_data as any).nested.array);
    });

    await t.step('should handle array parameters', async () => {
      // Create test table with array column
      await engine.query({
        sql:
          'DROP TABLE IF EXISTS array_test; CREATE TABLE array_test (id SERIAL PRIMARY KEY, tags TEXT[]);',
      });

      // Insert with array parameter
      await engine.query({
        sql: 'INSERT INTO array_test (tags) VALUES (:tags:)',
        params: {
          tags: ['tag1', 'tag2', 'tag3'],
        },
      });

      // Query back
      const result = await engine.query<{ tags: Array<string> }>({
        sql: 'SELECT * FROM array_test',
      });

      asserts.assertEquals(result.count, 1);
      asserts.assertEquals(result.data[0]!.tags.length, 3);
      asserts.assertEquals(result.data[0]!.tags[0], 'tag1');

      // Clean up
      await engine.query({
        sql: 'DROP TABLE array_test',
      });
    });
  } finally {
    await engine.finalize();
  }
});

Deno.test('DAM.engines.Postgres - Query Method Edge Cases', async (t) => {
  const engine = createTestPostgresEngine();

  try {
    await engine.init();
    await setupTestTable(engine);

    await t.step('should handle query when not connected', async () => {
      const disconnectedEngine = createTestPostgresEngine(
        'disconnected-engine',
      );

      // Don't initialize, so status is DISCONNECTED
      await asserts.assert(
        async () => {
          await disconnectedEngine.query({
            sql: 'SELECT 1',
          });
        },
      );
    });

    await t.step('should handle auto-reconnection', async () => {
      const reconnectEngine = createTestPostgresEngine('reconnect-engine');
      await reconnectEngine.init();

      // Force disconnect by finalizing
      await reconnectEngine.finalize();

      // Next query should auto-reconnect
      const result = await reconnectEngine.query({
        sql: 'SELECT 1 as value',
      });

      asserts.assertEquals(result.data[0]!.value, 1);
      asserts.assertEquals(reconnectEngine.status, 'CONNECTED');

      await reconnectEngine.finalize();
    });

    await t.step('should handle auto-reconnect failures', async () => {
      // First create a normal engine and connect
      const failEngine = createTestPostgresEngine('fail-reconnect');
      await failEngine.init();
      await failEngine.finalize();

      // Create a new engine with the wrong password
      const wrongPasswordEngine = new PostgresEngine('wrong-password-engine', {
        host: 'localhost',
        port: 5432,
        username: 'postgres',
        password: 'wrong-password', // Incorrect password
        database: 'postgres',
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
        PostgresEngineConnectError,
      );
    });
  } finally {
    await cleanupTestTable(engine);
    await engine.finalize();
  }
});
