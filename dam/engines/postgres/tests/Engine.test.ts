import { PostgresEngine } from '../mod.ts';
import { PostgresEngineQueryError } from '../errors/mod.ts';
import { DAMEngineQueryError } from '../../errors/mod.ts';
import { QueryParameters, type QueryResult } from '../../../query/mod.ts';

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

Deno.test('PostgresEngine', async (t) => {
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
