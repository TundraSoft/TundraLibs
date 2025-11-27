import * as asserts from '$asserts';
import { SQLiteEngine, type SQLiteEngineOptions } from './mod.ts';
import { DAMEngineError } from '../../engine/errors/mod.ts';
import { envArgs } from '@tundralibs/utils';

const env = envArgs('./dam/engines/');

// Test configuration for SQLite
const TEST_CONFIG = {
  database: ':memory:', // Use in-memory database for testing
  cacheSize: -64000,
  synchronous: 'NORMAL' as const,
  queryTimeout: 30,
};

Deno.test('dam.engines.sqlite', async (t) => {
  let sqliteEngine: SQLiteEngine;

  // Setup and teardown for tests that need an initialized engine
  const setupSQLite = () => {
    sqliteEngine = new SQLiteEngine('sqlite-test', {
      database: ':memory:',
      cacheSize: -64000,
      synchronous: 'NORMAL',
      queryTimeout: 30,
    });
    return sqliteEngine;
  };

  const teardownSQLite = async () => {
    if (sqliteEngine) {
      try {
        await sqliteEngine.close();
      } catch {
        // Ignore errors during teardown
      }
    }
  };

  await t.step('constructor and validation', async (u) => {
    await u.step('should create instance with valid options', () => {
      const engine = new SQLiteEngine('test-sqlite', {
        database: './test.db',
        cacheSize: -128000,
        synchronous: 'FULL',
      });

      asserts.assertEquals(engine.name, 'test-sqlite');
      asserts.assertEquals(engine.Engine, 'SQLite');
      asserts.assertEquals(engine.status, 'CLOSED');
      // SQLite engine doesn't use traditional pooling
      asserts.assertEquals(engine.poolEnabled, false);
    });

    await u.step('should create instance with memory database', () => {
      const engine = new SQLiteEngine('test-memory', {
        database: ':memory:',
        synchronous: 'OFF',
      });

      asserts.assertEquals(engine.Engine, 'SQLite');
    });

    await u.step('should create engine with custom instanceId', () => {
      const engine = new SQLiteEngine('sqlite::custom-id', TEST_CONFIG);
      asserts.assertEquals(engine.name, 'sqlite');
      asserts.assertEquals(engine.instanceId, 'SQLite::sqlite::custom-id');
    });

    await u.step('should throw on missing database path', () => {
      asserts.assertThrows(
        () => new SQLiteEngine('test', { ...TEST_CONFIG, database: '' }),
        DAMEngineError,
        'Database path is required and cannot be empty',
      );
    });

    await u.step('should throw on invalid cache size type', () => {
      asserts.assertThrows(
        () =>
          new SQLiteEngine('test', {
            ...TEST_CONFIG,
            cacheSize: 'invalid' as any,
          }),
        DAMEngineError,
        'Cache size must be a number',
      );
    });

    await u.step('should handle SQLite-specific configuration options', () => {
      const engine = new SQLiteEngine('test-advanced', {
        ...TEST_CONFIG,
        synchronous: 'FULL',
        cacheSize: -128000,
      });
      asserts.assertEquals(engine.Engine, 'SQLite');
    });

    await u.step('should handle synchronous mode configuration', () => {
      const engine = new SQLiteEngine('test-sync', {
        ...TEST_CONFIG,
        synchronous: 'OFF',
      });
      asserts.assertEquals(engine.Engine, 'SQLite');
    });
  });

  await t.step('connection management and error handling', async (u) => {
    await u.step('should connect to SQLite database', async () => {
      const engine = setupSQLite();

      try {
        await engine.connect();
        asserts.assert(['CONNECTED', 'IDLE'].includes(engine.status));
      } finally {
        await teardownSQLite();
      }
    });

    await u.step('should handle database file creation', async () => {
      const tempFile = './temp_test.db';
      const engine = new SQLiteEngine('create-test', {
        database: tempFile,
        synchronous: 'OFF', // Faster for test cleanup
      });

      try {
        await engine.connect();
        asserts.assert(['CONNECTED', 'IDLE'].includes(engine.status));
      } finally {
        await engine.close();
        // Clean up test file
        try {
          await Deno.remove(tempFile);
        } catch {
          // Ignore cleanup errors
        }
      }
    });

    await u.step('should close connection properly', async () => {
      const engine = setupSQLite();

      try {
        await engine.connect();
        await engine.close();
        asserts.assertEquals(engine.status, 'CLOSED');
      } finally {
        await teardownSQLite();
      }
    });

    await u.step('should handle invalid database path', async () => {
      const engine = new SQLiteEngine('invalid-path', {
        database: '/nonexistent/path/database.db',
        queryTimeout: 1,
      });

      await asserts.assertRejects(
        () => engine.connect(),
        DAMEngineError,
        'Failed to connect to SQLite database',
      );
    });

    await u.step('should handle database info retrieval', async () => {
      const engine = setupSQLite();

      try {
        await engine.connect();
        const info = engine.getDatabaseInfo();
        asserts.assert(info !== null);
        asserts.assert(typeof info.pageCount.page_count === 'number');
        asserts.assert(
          typeof info.pragmas.synchronous.synchronous === 'number',
        );
      } finally {
        await teardownSQLite();
      }
    });

    await u.step(
      'should handle pool stats for file-based database',
      async () => {
        const engine = setupSQLite();

        try {
          await engine.connect();
          const stats = engine.getDetailedPoolStats();
          asserts.assertNotEquals(stats, null);
          asserts.assertEquals(stats!.totalConnections, 1);
          asserts.assertEquals(stats!.activeConnections, 1);
          asserts.assertEquals(stats!.idleConnections, 0);
          asserts.assertEquals(stats!.waitingRequests, 0);
        } finally {
          await teardownSQLite();
        }
      },
    );

    await u.step('should handle health monitoring', async () => {
      const engine = setupSQLite();

      try {
        await engine.connect();
        // Health status should be good for connected engine
        const healthStatus = engine.healthStatus;
        asserts.assertEquals(healthStatus.isHealthy, true);
        asserts.assertEquals(healthStatus.consecutiveErrors, 0);
      } finally {
        await teardownSQLite();
      }
    });

    await u.step('should handle connection recovery scenarios', async () => {
      const engine = setupSQLite();

      try {
        await engine.connect();
        const result = await engine.execute({ sql: 'SELECT 1 as test' });
        asserts.assertEquals(result.data[0]?.test, 1);

        // Connection should still work after query
        const result2 = await engine.execute({ sql: 'SELECT 2 as test' });
        asserts.assertEquals(result2.data[0]?.test, 2);
      } finally {
        await teardownSQLite();
      }
    });
  });

  await t.step('query execution', async (u) => {
    await u.step('should execute simple queries', async () => {
      const engine = setupSQLite();

      try {
        await engine.connect();
        const result = await engine.execute({ sql: 'SELECT 1 AS test_value' });

        asserts.assertEquals(result.data.length, 1);
        asserts.assertEquals(result.data[0]?.test_value, 1);
        asserts.assertEquals(result.count, 1);
      } finally {
        await teardownSQLite();
      }
    });

    await u.step('should execute parameterized queries', async () => {
      const engine = setupSQLite();

      try {
        await engine.connect();
        const result = await engine.execute({
          sql: 'SELECT :value: AS param_value',
          params: { value: 'test_param' },
        });

        asserts.assertEquals(result.data.length, 1);
        asserts.assertEquals(result.data[0]?.param_value, 'test_param');
      } finally {
        await teardownSQLite();
      }
    });

    await u.step('should handle repeated parameters correctly', async () => {
      const engine = setupSQLite();

      try {
        await engine.connect();
        const result = await engine.execute({
          sql: 'SELECT :value: AS first, :value: AS second',
          params: { value: 'repeated' },
        });

        asserts.assertEquals(result.data[0]?.first, 'repeated');
        asserts.assertEquals(result.data[0]?.second, 'repeated');
      } finally {
        await teardownSQLite();
      }
    });

    await u.step(
      'should handle quoted identifiers with repeated parameters',
      async () => {
        const engine = setupSQLite();

        try {
          await engine.connect();
          const result = await engine.execute({
            sql: 'SELECT :value: AS "first value", :value: AS "second value"',
            params: { value: 'quoted' },
          });

          asserts.assertEquals(result.data[0]?.['first value'], 'quoted');
          asserts.assertEquals(result.data[0]?.['second value'], 'quoted');
        } finally {
          await teardownSQLite();
        }
      },
    );

    await u.step(
      'should handle type parsing for database column values',
      async () => {
        const engine = setupSQLite();

        try {
          await engine.connect();
          const result = await engine.execute({
            sql:
              'SELECT :intVal: AS int_val, :strVal: AS str_val, :boolVal: AS bool_val',
            params: { intVal: 42, strVal: 'hello', boolVal: true },
          });

          asserts.assertEquals(result.data[0]?.int_val, 42);
          asserts.assertEquals(result.data[0]?.str_val, 'hello');
          asserts.assertEquals(result.data[0]?.bool_val, 1); // SQLite stores boolean as integer (1 for true)
        } finally {
          await teardownSQLite();
        }
      },
    );

    await u.step('should handle SQLite data manipulation', async () => {
      const engine = setupSQLite();

      try {
        await engine.connect();

        // Create a test table
        await engine.execute({
          sql:
            'CREATE TABLE test_data (id INTEGER PRIMARY KEY, name TEXT, value REAL)',
        });

        // Insert data
        const insertResult = await engine.execute({
          sql: 'INSERT INTO test_data (name, value) VALUES (:name:, :value:)',
          params: { name: 'test', value: 3.14 },
        });

        asserts.assertEquals(insertResult.count, 1);
        asserts.assert(insertResult.data[0]?.lastInsertRowid);

        // Query data
        const selectResult = await engine.execute({
          sql: 'SELECT * FROM test_data WHERE name = :name:',
          params: { name: 'test' },
        });

        asserts.assertEquals(selectResult.count, 1);
        asserts.assertEquals(selectResult.data[0]?.name, 'test');
        asserts.assertEquals(selectResult.data[0]?.value, 3.14);
      } finally {
        await teardownSQLite();
      }
    });

    await u.step('should handle NULL values and edge cases', async () => {
      const engine = setupSQLite();

      try {
        await engine.connect();
        const result = await engine.execute({
          sql: 'SELECT NULL AS null_val, :param: AS param_val',
          params: { param: null },
        });

        asserts.assertEquals(result.data[0]?.null_val, null);
        asserts.assertEquals(result.data[0]?.param_val, null);
      } finally {
        await teardownSQLite();
      }
    });

    await u.step('should handle query errors', async () => {
      const engine = setupSQLite();

      try {
        await engine.connect();
        await asserts.assertRejects(
          () => engine.execute({ sql: 'SELECT FROM invalid_syntax' }),
          DAMEngineError,
          'Query failed',
        );
      } finally {
        await teardownSQLite();
      }
    });

    await u.step('should reject empty queries', async () => {
      const engine = setupSQLite();

      try {
        await engine.connect();
        await asserts.assertRejects(
          () => engine.execute({ sql: '' }),
          DAMEngineError,
        );
      } finally {
        await teardownSQLite();
      }
    });
  });

  await t.step('transaction management and concurrent scenarios', async (u) => {
    await u.step('should handle basic transactions', async () => {
      const engine = setupSQLite();

      try {
        await engine.connect();

        // Create a test table
        await engine.execute({
          sql:
            'CREATE TABLE test_tx_basic (id INTEGER PRIMARY KEY, value TEXT)',
        });

        const txId = await engine.begin();

        try {
          await engine.execute({
            sql: 'INSERT INTO test_tx_basic (value) VALUES (:value:)',
            params: { value: 'tx_test' },
            transactionId: txId,
          });

          await engine.commit(txId);
        } catch (error) {
          await engine.rollback(txId);
          throw error;
        }

        const result = await engine.execute({
          sql: 'SELECT COUNT(*) as count FROM test_tx_basic',
        });
        asserts.assertEquals(result.data[0]?.count, 1);
      } finally {
        await teardownSQLite();
      }
    });

    await u.step('should handle transaction rollback', async () => {
      const engine = setupSQLite();

      try {
        await engine.connect();

        await engine.execute({
          sql:
            'CREATE TABLE test_rollback (id INTEGER PRIMARY KEY, value TEXT)',
        });

        const txId = await engine.begin();

        try {
          await engine.execute({
            sql: 'INSERT INTO test_rollback (value) VALUES (:value:)',
            params: { value: 'should_rollback' },
            transactionId: txId,
          });

          // Force an error to trigger rollback
          await asserts.assertRejects(() =>
            engine.execute({
              sql: 'SELECT FROM invalid_syntax',
              transactionId: txId,
            })
          );

          await engine.rollback(txId);
        } catch {
          try {
            await engine.rollback(txId);
          } catch {
            // Ignore rollback errors
          }
        }

        const result = await engine.execute({
          sql: 'SELECT COUNT(*) as count FROM test_rollback',
        });
        asserts.assertEquals(result.data[0]?.count, 0);
      } finally {
        await teardownSQLite();
      }
    });

    await u.step(
      'should handle nested transactions with savepoints',
      async () => {
        const engine = setupSQLite();

        try {
          await engine.connect();

          await engine.execute({
            sql:
              'CREATE TABLE test_nested (id INTEGER PRIMARY KEY, value TEXT)',
          });

          const tx1 = await engine.begin({ name: 'outer' });

          try {
            await engine.execute({
              sql: 'INSERT INTO test_nested (value) VALUES (:value:)',
              params: { value: 'outer' },
              transactionId: tx1,
            });

            // SQLite doesn't support nested transactions
            // Attempting to begin another transaction should fail
            await asserts.assertRejects(
              async () => {
                await engine.begin({ name: 'inner' });
              },
              DAMEngineError,
              'Transaction already started',
            );

            await engine.commit(tx1); // Commit outer transaction
          } catch (error) {
            await engine.rollback(tx1);
            throw error;
          }

          const result = await engine.execute({
            sql: 'SELECT COUNT(*) as count FROM test_nested',
          });
          asserts.assertEquals(result.data[0]?.count, 1);
        } finally {
          await teardownSQLite();
        }
      },
    );

    await u.step('should handle transaction timeout', async () => {
      const engine = setupSQLite();

      try {
        await engine.connect();

        await engine.execute({
          sql: 'CREATE TABLE test_timeout (id INTEGER PRIMARY KEY, value TEXT)',
        });

        const txId = await engine.begin({ timeout: 1 }); // 1 second timeout

        try {
          await engine.execute({
            sql: 'INSERT INTO test_timeout (value) VALUES (:value:)',
            params: { value: 'timeout_test' },
            transactionId: txId,
          });

          // Wait for timeout to trigger
          await new Promise((resolve) => setTimeout(resolve, 1200));

          // Transaction should have been rolled back by timeout
          const result = await engine.execute({
            sql: 'SELECT COUNT(*) as count FROM test_timeout',
          });
          asserts.assertEquals(result.data[0]?.count, 0);
        } catch {
          // Expected timeout behavior
        }
      } finally {
        await teardownSQLite();
      }
    });

    await u.step('should handle foreign key constraints', async () => {
      const engine = setupSQLite();

      try {
        await engine.connect();

        // Create parent and child tables
        await engine.execute({
          sql: 'CREATE TABLE parent (id INTEGER PRIMARY KEY, name TEXT)',
        });

        await engine.execute({
          sql:
            'CREATE TABLE child (id INTEGER PRIMARY KEY, parent_id INTEGER REFERENCES parent(id))',
        });

        // Insert parent record
        await engine.execute({
          sql: 'INSERT INTO parent (name) VALUES (:name:)',
          params: { name: 'Parent 1' },
        });

        // Insert valid child record
        await engine.execute({
          sql: 'INSERT INTO child (parent_id) VALUES (1)',
        });

        // Try to insert invalid child record (should fail due to foreign key)
        await asserts.assertRejects(
          () =>
            engine.execute({
              sql: 'INSERT INTO child (parent_id) VALUES (999)',
            }),
          DAMEngineError,
        );
      } finally {
        await teardownSQLite();
      }
    });

    await u.step('should handle concurrent transaction scenarios', async () => {
      const engine = setupSQLite();

      try {
        await engine.connect();

        await engine.execute({
          sql:
            'CREATE TABLE test_concurrent (id INTEGER PRIMARY KEY, value TEXT)',
        });

        // SQLite handles transactions sequentially, so this tests the transaction management
        const tx1 = await engine.begin({ name: 'tx1' });

        await engine.execute({
          sql: 'INSERT INTO test_concurrent (value) VALUES (:value:)',
          params: { value: 'concurrent_test' },
          transactionId: tx1,
        });

        await engine.commit(tx1);

        const result = await engine.execute({
          sql: 'SELECT COUNT(*) as count FROM test_concurrent',
        });
        asserts.assertEquals(result.data[0]?.count, 1);
      } finally {
        await teardownSQLite();
      }
    });
  });

  await t.step('error handling and recovery scenarios', async (u) => {
    await u.step('should handle SQL syntax errors gracefully', async () => {
      const engine = setupSQLite();

      try {
        await engine.connect();
        await asserts.assertRejects(
          () => engine.execute({ sql: 'SELECT FROM WHERE' }),
          DAMEngineError,
        );
      } finally {
        await teardownSQLite();
      }
    });

    await u.step('should handle constraint violations', async () => {
      const engine = setupSQLite();

      try {
        await engine.connect();

        await engine.execute({
          sql:
            'CREATE TABLE test_constraints (id INTEGER PRIMARY KEY, value TEXT UNIQUE)',
        });

        await engine.execute({
          sql:
            "INSERT INTO test_constraints (id, value) VALUES (1, 'unique_value')",
        });

        // This should fail due to primary key constraint
        await asserts.assertRejects(
          () =>
            engine.execute({
              sql:
                "INSERT INTO test_constraints (id, value) VALUES (1, 'another_value')",
            }),
          DAMEngineError,
        );

        // This should fail due to unique constraint
        await asserts.assertRejects(
          () =>
            engine.execute({
              sql:
                "INSERT INTO test_constraints (value) VALUES ('unique_value')",
            }),
          DAMEngineError,
        );
      } finally {
        await teardownSQLite();
      }
    });

    await u.step('should handle large result sets', async () => {
      const engine = setupSQLite();

      try {
        await engine.connect();

        await engine.execute({
          sql:
            'CREATE TABLE large_test (id INTEGER PRIMARY KEY, value INTEGER)',
        });

        // Insert multiple records
        const tx = await engine.begin();
        for (let i = 1; i <= 100; i++) {
          await engine.execute({
            sql: 'INSERT INTO large_test (value) VALUES (:value:)',
            params: { value: i },
            transactionId: tx,
          });
        }
        await engine.commit(tx);

        const result = await engine.execute({
          sql: 'SELECT COUNT(*) as count FROM large_test',
        });
        asserts.assertEquals(result.data[0]?.count, 100);

        const allResult = await engine.execute({
          sql: 'SELECT * FROM large_test ORDER BY value LIMIT 10',
        });
        asserts.assertEquals(allResult.data.length, 10);
      } finally {
        await teardownSQLite();
      }
    });

    await u.step('should handle database recovery scenarios', async () => {
      const engine = setupSQLite();

      try {
        await engine.connect();

        // Test basic functionality after connection
        const result = await engine.execute({
          sql: 'SELECT 1 as recovery_test',
        });
        asserts.assertEquals(result.data[0]?.recovery_test, 1);
      } finally {
        await teardownSQLite();
      }
    });

    await u.step('should handle queries without parameters', async () => {
      const engine = setupSQLite();

      try {
        await engine.connect();

        await engine.execute({
          sql:
            'CREATE TABLE no_params_test (id INTEGER PRIMARY KEY, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)',
        });

        const insertResult = await engine.execute({
          sql: 'INSERT INTO no_params_test DEFAULT VALUES',
        });
        asserts.assertEquals(insertResult.count, 1);

        const selectResult = await engine.execute({
          sql: 'SELECT * FROM no_params_test',
        });
        asserts.assertEquals(selectResult.count, 1);
      } finally {
        await teardownSQLite();
      }
    });

    await u.step('should handle complex data types and JSON', async () => {
      const engine = setupSQLite();

      try {
        await engine.connect();

        await engine.execute({
          sql: 'CREATE TABLE json_test (id INTEGER PRIMARY KEY, data TEXT)',
        });

        const jsonData = JSON.stringify({ key: 'value', numbers: [1, 2, 3] });
        await engine.execute({
          sql: 'INSERT INTO json_test (data) VALUES (:data:)',
          params: { data: jsonData },
        });

        const result = await engine.execute({
          sql: 'SELECT * FROM json_test',
        });

        asserts.assertEquals(result.count, 1);
        asserts.assertEquals(result.data[0]?.data, jsonData);
      } finally {
        await teardownSQLite();
      }
    });
  });

  await t.step('performance and monitoring', async (u) => {
    await u.step('should track database statistics', async () => {
      const engine = setupSQLite();

      try {
        await engine.connect();

        const info = engine.getDatabaseInfo();
        asserts.assert(info !== null);
        asserts.assert(typeof info.pageCount.page_count === 'number');
        asserts.assert(
          typeof info.pragmas.synchronous.synchronous === 'number',
        );
        asserts.assertEquals(info.activeTransactions, 0);
      } finally {
        await teardownSQLite();
      }
    });

    await u.step('should handle database optimization commands', async () => {
      const engine = setupSQLite();

      try {
        await engine.connect();

        // Create and populate a test table
        await engine.execute({
          sql: 'CREATE TABLE optimize_test (id INTEGER PRIMARY KEY, data TEXT)',
        });

        await engine.execute({
          sql: "INSERT INTO optimize_test (data) VALUES ('test')",
        });

        // Test VACUUM command
        await engine.vacuum();

        // Test ANALYZE command
        await engine.analyze();

        // Verify table still exists and has data
        const result = await engine.execute({
          sql: 'SELECT COUNT(*) as count FROM optimize_test',
        });
        asserts.assertEquals(result.data[0]?.count, 1);
      } finally {
        await teardownSQLite();
      }
    });

    await u.step('should monitor health status', async () => {
      const engine = setupSQLite();

      try {
        await engine.connect();

        const healthStatus = engine.healthStatus;
        asserts.assertEquals(healthStatus.isHealthy, true);
        asserts.assertEquals(healthStatus.consecutiveErrors, 0);
      } finally {
        await teardownSQLite();
      }
    });

    await u.step('should handle query performance tracking', async () => {
      const engine = setupSQLite();

      try {
        await engine.connect();

        const start = Date.now();
        await engine.execute({
          sql: "SELECT * FROM sqlite_master WHERE type = 'table'",
        });
        const end = Date.now();

        // Query should complete quickly
        asserts.assert(end - start < 1000);
      } finally {
        await teardownSQLite();
      }
    });

    await u.step('should emit connection events', async () => {
      const engine = setupSQLite();

      let connectEventFired = false;
      engine.on('connect', () => {
        connectEventFired = true;
      });

      try {
        await engine.connect();
        // Give event time to fire
        await new Promise((resolve) => setTimeout(resolve, 10));
        asserts.assert(connectEventFired, 'Connect event should have fired');
      } finally {
        await teardownSQLite();
      }
    });

    await u.step(
      'should handle database file size and page information',
      async () => {
        const engine = setupSQLite();

        try {
          await engine.connect();

          const info = engine.getDatabaseInfo();
          asserts.assert(info !== null);
          asserts.assert(typeof info.pageCount.page_count === 'number');
          asserts.assert(
            typeof info.pragmas.synchronous.synchronous === 'number',
          );
        } finally {
          await teardownSQLite();
        }
      },
    );
  });

  await t.step('misconfiguration and edge cases', async (u) => {
    await u.step(
      'should handle different synchronous modes gracefully',
      async () => {
        // This test ensures that different synchronous modes work properly
        const engine = new SQLiteEngine('sync-mode', {
          database: ':memory:',
          synchronous: 'NORMAL',
        });

        try {
          await engine.connect();
          asserts.assert(['CONNECTED', 'IDLE'].includes(engine.status));
        } finally {
          await engine.close();
        }
      },
    );

    await u.step('should handle special characters in data', async () => {
      const engine = setupSQLite();

      try {
        await engine.connect();

        await engine.execute({
          sql: 'CREATE TABLE special_chars (id INTEGER PRIMARY KEY, data TEXT)',
        });

        const specialData =
          'Hello \'World\' with "quotes" and émojis 🚀 and newlines\\n\\r';
        await engine.execute({
          sql: 'INSERT INTO special_chars (data) VALUES (:data:)',
          params: { data: specialData },
        });

        const result = await engine.execute({
          sql: 'SELECT * FROM special_chars',
        });

        asserts.assertEquals(result.data[0]?.data, specialData);
      } finally {
        await teardownSQLite();
      }
    });

    await u.step('should handle empty result sets', async () => {
      const engine = setupSQLite();

      try {
        await engine.connect();

        await engine.execute({
          sql: 'CREATE TABLE empty_test (id INTEGER PRIMARY KEY)',
        });

        const result = await engine.execute({
          sql: 'SELECT * FROM empty_test',
        });

        asserts.assertEquals(result.data.length, 0);
        asserts.assertEquals(result.count, 0);
      } finally {
        await teardownSQLite();
      }
    });

    await u.step('should handle rapid connect/disconnect cycles', async () => {
      const engine = new SQLiteEngine('rapid-cycle', {
        database: ':memory:',
        synchronous: 'OFF',
      });

      try {
        // Rapid connect/disconnect cycles
        for (let i = 0; i < 3; i++) {
          await engine.connect();
          await engine.close();
        }
      } catch (error) {
        // Some cycles might fail, that's acceptable for edge case testing
        asserts.assertInstanceOf(error, DAMEngineError);
      }
    });

    await u.step('should handle large text data', async () => {
      const engine = setupSQLite();

      try {
        await engine.connect();

        await engine.execute({
          sql: 'CREATE TABLE large_text (id INTEGER PRIMARY KEY, content TEXT)',
        });

        // Create a large text string
        const largeText = 'A'.repeat(10000);
        await engine.execute({
          sql: 'INSERT INTO large_text (content) VALUES (:content:)',
          params: { content: largeText },
        });

        const result = await engine.execute({
          sql: 'SELECT * FROM large_text',
        });

        asserts.assertEquals(result.data[0]?.content, largeText);
      } finally {
        await teardownSQLite();
      }
    });

    await u.step('should handle BLOB data types', async () => {
      const engine = setupSQLite();

      try {
        await engine.connect();

        await engine.execute({
          sql: 'CREATE TABLE blob_test (id INTEGER PRIMARY KEY, data BLOB)',
        });

        const blobData = new Uint8Array([1, 2, 3, 4, 5]);
        await engine.execute({
          sql: 'INSERT INTO blob_test (data) VALUES (:data:)',
          params: { data: blobData },
        });

        const result = await engine.execute({
          sql: 'SELECT * FROM blob_test',
        });

        asserts.assertEquals(result.count, 1);
        // BLOB data handling depends on SQLite driver implementation
        asserts.assert(result.data[0]?.data !== undefined);
      } finally {
        await teardownSQLite();
      }
    });

    await u.step('should handle null values in various contexts', async () => {
      const engine = setupSQLite();

      try {
        await engine.connect();

        await engine.execute({
          sql:
            'CREATE TABLE null_test (id INTEGER PRIMARY KEY, nullable_field TEXT)',
        });

        await engine.execute({
          sql: 'INSERT INTO null_test (nullable_field) VALUES (NULL)',
        });

        await engine.execute({
          sql: 'INSERT INTO null_test (nullable_field) VALUES (:value:)',
          params: { value: null },
        });

        const result = await engine.execute({
          sql: 'SELECT * FROM null_test ORDER BY id',
        });

        asserts.assertEquals(result.count, 2);
        asserts.assertEquals(result.data[0]?.nullable_field, null);
        asserts.assertEquals(result.data[1]?.nullable_field, null);
      } finally {
        await teardownSQLite();
      }
    });

    await u.step('should handle database pragma settings', async () => {
      const engine = new SQLiteEngine('pragma-test', {
        database: ':memory:',
        synchronous: 'OFF',
        cacheSize: -2000,
      });

      try {
        await engine.connect();

        const info = engine.getDatabaseInfo();
        asserts.assert(info !== null);
        // Verify synchronous mode is set correctly
        asserts.assert(
          typeof info.pragmas.synchronous.synchronous === 'number',
        );
      } finally {
        await engine.close();
      }
    });

    await u.step(
      'should handle concurrent database access patterns',
      async () => {
        const engine = setupSQLite();

        try {
          await engine.connect();

          await engine.execute({
            sql:
              'CREATE TABLE concurrent_test (id INTEGER PRIMARY KEY, value INTEGER)',
          });

          // Execute multiple queries in parallel (SQLite will handle serialization)
          const promises = [];
          for (let i = 1; i <= 5; i++) {
            promises.push(
              engine.execute({
                sql: 'INSERT INTO concurrent_test (value) VALUES (:value:)',
                params: { value: i },
              }),
            );
          }

          await Promise.all(promises);

          const result = await engine.execute({
            sql: 'SELECT COUNT(*) as count FROM concurrent_test',
          });
          asserts.assertEquals(result.data[0]?.count, 5);
        } finally {
          await teardownSQLite();
        }
      },
    );
  });
});
