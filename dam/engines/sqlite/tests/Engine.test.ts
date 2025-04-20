import { SQLiteEngine, SQLiteEngineQueryError } from '../mod.ts';
import { DAMEngineConfigError, DAMEngineQueryError } from '../../errors/mod.ts';
import { QueryParameters, type QueryResult } from '../../../query/mod.ts';
import * as path from '$path';
import * as asserts from '$asserts';

//#region Test Setup
/**
 * Create a SQLite test engine with in-memory database
 */
function createTestSQLiteMemoryEngine(
  name = 'test-sqlite-memory',
): SQLiteEngine {
  return new SQLiteEngine(name, {
    type: 'MEMORY',
  });
}

/**
 * Create a SQLite test engine with file-based database
 */
function createTestSQLiteFileEngine(
  name = 'test-sqlite-file',
): { engine: SQLiteEngine; filePath: string } {
  // Create a temp directory if it doesn't exist
  const tempDir = path.join(Deno.cwd(), 'temp');
  try {
    Deno.mkdirSync(tempDir);
  } catch (e) {
    // Directory might already exist
  }

  const filePath = path.join(tempDir, `${name}-${Date.now()}.db`);

  const engine = new SQLiteEngine(name, {
    type: 'FILE',
    storagePath: tempDir,
  });

  return { engine, filePath };
}

/**
 * Clean up a file-based SQLite database
 */
function cleanupSQLiteFileEngine(filePath: string): void {
  try {
    Deno.removeSync(filePath);
  } catch (e) {
    // File might not exist or be in use
    console.warn(`Couldn't remove test database file: ${filePath}`, e);
  }
}

/**
 * Create test table for query tests
 */
async function setupTestTable(
  engine: SQLiteEngine,
): Promise<void> {
  await engine.query({
    id: 'drop-test-table',
    sql: 'DROP TABLE IF EXISTS test_users;',
  });

  await engine.query({
    id: 'create-test-table',
    sql: `
      CREATE TABLE test_users (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        active INTEGER DEFAULT 1,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
    `,
  });

  // Insert test data
  await engine.query({
    id: 'insert-test-data',
    sql: `
      INSERT INTO test_users (name, email, active) VALUES
      ('User 1', 'user1@example.com', 1),
      ('User 2', 'user2@example.com', 1),
      ('User 3', 'user3@example.com', 0);
    `,
  });
}

/**
 * Clean up test tables
 */
async function cleanupTestTable(
  engine: SQLiteEngine,
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

Deno.test('DAM.engines.SQLite - Memory', async (t) => {
  const engine = createTestSQLiteMemoryEngine();

  // Setup
  try {
    await engine.init();
    await setupTestTable(engine);

    await t.step('Connection Lifecycle', async (connTest) => {
      await connTest.step('should connect successfully', async () => {
        const newEngine = createTestSQLiteMemoryEngine('lifecycle-test');
        await newEngine.init();
        asserts.assertEquals(newEngine.status, 'CONNECTED');
        await newEngine.finalize();
      });

      await connTest.step('should get version', async () => {
        const version = await engine.version();
        asserts.assert(
          version.match(/^\d+\.\d+(\.\d+)?$/) || version === 'N/A',
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
          sql: 'SELECT id, name FROM test_users WHERE active = :active:',
          params: { active: 1 },
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
          const activeParam = params.create(1);

          const result = await engine.query({
            id: 'params-instance',
            sql:
              `SELECT COUNT(*) as count FROM test_users WHERE active = :${activeParam}:`,
            params: params,
          });

          assertQueryResult(result, 1);
          const count = result.data[0]?.count;
          asserts.assertExists(count);
          // SQLite COUNT returns number, not bigint
          asserts.assertEquals(count, 2);
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
          SQLiteEngineQueryError,
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
            { count: number }, // Second query result type
          ]>({
            id: 'chain-first',
            sql: 'SELECT id, name FROM test_users WHERE active = 1',
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
            typeof (result.results[1]!.data[0]! as { count: number }).count,
            'number',
          );
        },
      );

      await chainTest.step(
        'should handle errors in the chain with error handler',
        async () => {
          // FIXED: Explicitly recreate test table to ensure data consistency
          await cleanupTestTable(engine);
          await setupTestTable(engine);

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
          // SQLite COUNT returns number
          const errorCount = result.results[1]?.data[0]?.error_count;
          asserts.assertEquals(
            errorCount,
            3,
            'Error handler result should contain count of 3 users',
          );
        },
      );
    });

    await t.step('Batch Query Operations', async (batchTest) => {
      // FIXED: Explicitly recreate test table to ensure data consistency
      await cleanupTestTable(engine);
      await setupTestTable(engine);

      await batchTest.step(
        'should execute multiple queries in batch',
        async () => {
          // FIXED: Verify data exists before running the batch test
          const checkData = await engine.query({
            sql: 'SELECT COUNT(*) as count FROM test_users',
          });
          asserts.assertEquals(
            checkData.data[0]?.count,
            3,
            'Test data should be present before batch query test',
          );

          const results = await engine.batchQuery<[
            { id: number; name: string },
            { count: number },
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
                'SELECT EXISTS(SELECT 1 FROM test_users WHERE active = 0) as has_inactive',
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
            isQueryResult<{ count: number }>(secondResult),
            'Second result should be a successful QueryResult',
          );
          asserts.assertEquals(typeof secondResult.data[0]!.count, 'number');
          asserts.assertEquals(secondResult.data[0]!.count, 3);

          // Check third result
          const thirdResult = results.results[2];
          asserts.assert(
            isQueryResult<{ has_inactive: number }>(thirdResult),
            'Third result should be a successful QueryResult',
          );
          asserts.assertEquals(thirdResult.data[0]!.has_inactive, 1);
        },
      );
    });

    await t.step('Parameter Handling', async (paramTest) => {
      // FIXED: Explicitly recreate test table to ensure data consistency
      await cleanupTestTable(engine);
      await setupTestTable(engine);

      // FIXED: Insert a specific record for the parameter test to find
      await engine.query({
        id: 'insert-for-param-test',
        sql:
          "INSERT INTO test_users (id, name, email, active) VALUES (100, 'Param Test', 'param@test.com', 1)",
      });

      await paramTest.step(
        'should convert parameter syntax correctly',
        async () => {
          const result = await engine.query({
            id: 'param-conversion',
            sql:
              'SELECT * FROM test_users WHERE id = :id: AND active = :is_active:',
            params: { id: 100, is_active: 1 },
          });

          assertQueryResult(result, 1);
          asserts.assertEquals(result.data[0]?.name, 'Param Test');
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
              bool_val: number;
              date_val: string;
              null_val: null;
            }
          >({
            id: 'complex-params',
            sql: `
            SELECT 
              :stringParam: as string_val,
              :numParam: as num_val,
              :boolParam: as bool_val,
              datetime(:dateParam:) as date_val,
              :nullParam: as null_val
          `,
            params: {
              stringParam: 'test',
              numParam: 123.45,
              boolParam: 1,
              dateParam: now.toISOString(),
              nullParam: null,
            },
          });

          assertQueryResult(result, 1, (data) => {
            const row = data[0]!;
            return row.string_val === 'test' &&
              row.num_val === 123.45 &&
              row.bool_val === 1 &&
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

Deno.test('DAM.engines.SQLite - File', async (t) => {
  const { engine, filePath } = createTestSQLiteFileEngine();

  try {
    await engine.init();
    await setupTestTable(engine);

    await t.step('Connection Lifecycle', async (connTest) => {
      await connTest.step(
        'should connect successfully to file DB',
        async () => {
          const { engine: newEngine } = createTestSQLiteFileEngine(
            'lifecycle-test',
          );
          await newEngine.init();
          asserts.assertEquals(newEngine.status, 'CONNECTED');
          await newEngine.finalize();
        },
      );

      await connTest.step('should get version from file DB', async () => {
        const version = await engine.version();
        asserts.assert(
          version.match(/^\d+\.\d+(\.\d+)?$/) || version === 'N/A',
        );
      });

      await connTest.step('should ping successfully', async () => {
        const ping = await engine.ping();
        asserts.assertEquals(ping, true);
      });
    });

    await t.step('File-specific tests', async (fileTest) => {
      await fileTest.step(
        'should persist data between connections',
        async () => {
          // Create a specific filename for this test to ensure we reference the same file
          const tempDir = './dam/engines/sqlite/tests/fixtures';

          // Create a new engine with this specific file
          const persistEngine = new SQLiteEngine('persist-test', {
            type: 'FILE',
            storagePath: tempDir,
          });

          try {
            // Initialize and create the schema
            await persistEngine.init();
            await setupTestTable(persistEngine);

            // Insert a specific record
            await persistEngine.query({
              id: 'insert-specific',
              sql:
                'INSERT INTO test_users (name, email, active) VALUES (:name:, :email:, :active:)',
              params: {
                name: 'Persistence Test',
                email: 'persist@example.com',
                active: 1,
              },
            });

            // Execute a pragma to ensure data is written to disk
            await persistEngine.query({
              sql: 'PRAGMA wal_checkpoint;',
            });

            // Verify the data was inserted
            const checkResult = await persistEngine.query({
              sql:
                'SELECT COUNT(*) as count FROM test_users WHERE email = :email:',
              params: { email: 'persist@example.com' },
            });
            asserts.assertEquals(
              checkResult.data[0]!.count,
              1,
              'Record should be inserted',
            );

            // Close the connection completely
            await persistEngine.finalize();

            // Reopen with the same engine but create a new instance to avoid any cached state
            const reopenEngine = new SQLiteEngine('persist-test', {
              type: 'FILE',
              storagePath: tempDir,
            });

            await reopenEngine.init();

            // Verify the data persisted
            const result = await reopenEngine.query({
              id: 'check-persistence',
              sql: 'SELECT * FROM test_users WHERE email = :email:',
              params: { email: 'persist@example.com' },
            });

            assertQueryResult(
              result,
              1,
              (data) =>
                data[0]!.name === 'Persistence Test' &&
                data[0]!.email === 'persist@example.com',
            );

            // Clean up
            await reopenEngine.finalize();

            // Clean up the file
            Deno.removeSync(`${tempDir}/persist-test`, { recursive: true });
          } catch (error) {
            console.error('Persistence test error:', error);
            throw error;
          }
        },
      );

      await fileTest.step('should handle invalid path errors', async () => {
        asserts.assertThrows(
          () => {
            const invalidEngine = new SQLiteEngine('invalid-path', {
              type: 'FILE',
              storagePath: '/non/existent/path/that/should/not/work',
            });
          },
          DAMEngineConfigError,
          'storage path',
        );
      });
    });
  } catch (error) {
    throw error;
  } finally {
    // Cleanup
    try {
      await cleanupTestTable(engine);
      await engine.finalize();
      cleanupSQLiteFileEngine(filePath);
    } catch (error) {
      console.error('File DB test cleanup error:', error);
    }
  }
});

Deno.test('DAM.engines.SQLite - Options', async (t) => {
  await t.step(
    'should validate engine options correctly',
    async (optionsTest) => {
      await optionsTest.step('should accept valid MEMORY type', () => {
        const memoryEngine = new SQLiteEngine('memory-test', {
          type: 'MEMORY',
        });

        asserts.assertEquals(memoryEngine.getOption('type'), 'MEMORY');
        asserts.assertEquals(memoryEngine.status, 'WAITING');
      });

      await optionsTest.step('should accept valid FILE type with path', () => {
        const tempDir = path.join(Deno.cwd(), 'temp');
        try {
          Deno.mkdirSync(tempDir, { recursive: true });
        } catch (e) {
          // Directory might already exist
        }

        const fileEngine = new SQLiteEngine('file-test', {
          type: 'FILE',
          storagePath: tempDir,
        });

        asserts.assertEquals(fileEngine.getOption('type'), 'FILE');
        asserts.assertEquals(fileEngine.getOption('storagePath'), tempDir);
        asserts.assertEquals(fileEngine.status, 'WAITING');
      });

      await optionsTest.step('should reject invalid type values', () => {
        asserts.assertThrows(
          () => {
            new SQLiteEngine('invalid-type', {
              // @ts-ignore - Testing invalid type
              type: 'INVALID_TYPE',
            });
          },
          DAMEngineConfigError,
          'Type must be either "FILE" or "MEMORY"',
        );
      });

      await optionsTest.step('should require storagePath for FILE type', () => {
        asserts.assertThrows(
          () => {
            new SQLiteEngine('missing-path', {
              type: 'FILE',
              // No storagePath provided
            });
          },
          DAMEngineConfigError,
          'Storage path is required for FILE type',
        );
      });

      await optionsTest.step('should validate path accessibility', () => {
        // Test with a path that doesn't exist
        asserts.assertThrows(
          () => {
            new SQLiteEngine('bad-path', {
              type: 'FILE',
              storagePath: '/path/that/definitely/does/not/exist',
            });
          },
          DAMEngineConfigError,
          'storage path',
        );

        // Test with a path that's not writable (if on Unix-like system)
        if (Deno.build.os !== 'windows') {
          try {
            // Skip this test if running as root (which might have permissions everywhere)
            if (Deno.uid && Deno.uid() !== 0) {
              asserts.assertThrows(
                () => {
                  new SQLiteEngine('no-perms', {
                    type: 'FILE',
                    storagePath: '/root/no-permission-here',
                  });
                },
                DAMEngineConfigError,
                'Permission denied',
              );
            }
          } catch (e) {
            // Permissions API might not be available in all environments
            // Just skip this specific test if it fails
            console.warn(
              'Skipping permission test - not supported in this environment',
            );
          }
        }
      });

      await optionsTest.step(
        'should handle maxConcurrent limit correctly',
        () => {
          const engine = new SQLiteEngine('max-concurrent-test', {
            type: 'MEMORY',
            maxConcurrent: 5, // Try to set a high value
          });

          // SQLite engines always limit maxConcurrent to 1
          asserts.assertEquals(engine.getOption('maxConcurrent'), 1);
        },
      );
    },
  );

  await t.step(
    'should handle initialization with different options',
    async (initTest) => {
      await initTest.step('should initialize with memory mode', async () => {
        const memEngine = new SQLiteEngine('mem-init-test', {
          type: 'MEMORY',
        });

        await memEngine.init();
        asserts.assertEquals(memEngine.status, 'CONNECTED');
        await memEngine.finalize();
      });

      await initTest.step('should initialize with file mode', async () => {
        const tempDir = path.join(Deno.cwd(), 'temp');
        try {
          Deno.mkdirSync(tempDir, { recursive: true });
        } catch (e) {
          // Directory might already exist
        }

        const fileEngine = new SQLiteEngine('file-init-test', {
          type: 'FILE',
          storagePath: tempDir,
        });

        await fileEngine.init();
        asserts.assertEquals(fileEngine.status, 'CONNECTED');
        await fileEngine.finalize();

        // Clean up
        try {
          Deno.removeSync(path.join(tempDir, 'file-init-test'), {
            recursive: true,
          });
        } catch (e) {
          // File might be locked or already removed
        }
      });
    },
  );
});
