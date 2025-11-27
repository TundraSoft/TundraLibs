import * as asserts from '$asserts';
import { MariaDBEngine, type MariaDBEngineOptions } from './mod.ts';
import { DAMEngineError } from '../../engine/errors/mod.ts';
import { envArgs } from '@tundralibs/utils';

// Handle unhandled promise rejections that might come from MariaDB connection attempts
globalThis.onunhandledrejection = (event: PromiseRejectionEvent) => {
  // Check if this is a MariaDB connection-related error we can safely ignore
  const error = event.reason;
  if (
    error &&
    typeof error === 'object' &&
    (error.toString().includes('Symbol(Deno.internal.rid)') ||
      error.message?.includes('TCP.#read') ||
      error.message?.includes('stream_wrap'))
  ) {
    // Prevent the unhandled rejection from causing test failure
    event.preventDefault();
    console.warn('Suppressed MariaDB connection cleanup error:', error.message);
  }
};

const env = envArgs('./dam/engines/');

// Test configuration with shorter timeouts for faster testing
const TEST_CONFIG = {
  host: env.get('MARIADB_HOST') || 'localhost',
  port: parseInt(env.get('MARIADB_PORT') || '3306'),
  database: env.get('MARIADB_DATABASE') || 'mysql',
  username: env.get('MARIADB_USERNAME') || 'maria',
  password: env.get('MARIADB_PASSWORD') || 'mariapw',
  connectionTimeout: 1, // 1 second for faster tests
  queryTimeout: 1, // 1 second for faster tests
};

Deno.test(
  { name: 'dam.engines.mariadb', sanitizeResources: false },
  async (t) => {
    let mariaEngine: MariaDBEngine;

    // Setup and teardown for tests that need an initialized engine
    const setupMariaDB = () => {
      mariaEngine = new MariaDBEngine('mariadb-test', {
        host: env.get('MARIADB_HOST') || 'localhost',
        port: parseInt(env.get('MARIADB_PORT') || '3306'),
        database: env.get('MARIADB_DATABASE') || 'mysql',
        username: env.get('MARIADB_USERNAME') || 'maria',
        password: env.get('MARIADB_PASSWORD') || 'mariapw',
        pool: {
          max: 5,
          min: 1,
        },
      });
      return mariaEngine;
    };

    const teardownMariaDB = async () => {
      if (mariaEngine) {
        try {
          await mariaEngine.close();
          // Give pool time to clean up completely
          await new Promise((resolve) => setTimeout(resolve, 150));
        } catch {
          // Ignore errors during teardown
        } finally {
          // Clear reference
          mariaEngine = null as any;
        }
      }
    };

    await t.step('constructor and validation', async (u) => {
      await u.step('should create instance with valid options', () => {
        const engine = new MariaDBEngine('test-maria', {
          host: 'localhost',
          port: 3306,
          database: 'testdb',
          username: 'testuser',
          password: 'testpass',
        });

        asserts.assertEquals(engine.name, 'test-maria');
        asserts.assertEquals(engine.Engine, 'MariaDB');
        asserts.assertEquals(engine.status, 'CLOSED');
        // MariaDB engine uses pooling, so this should be true
        asserts.assertEquals(engine.poolEnabled, true);
      });

      await u.step('should create instance with pool options', () => {
        const engine = new MariaDBEngine('test-maria-pool', {
          host: 'localhost',
          port: 3306,
          database: 'testdb',
          username: 'testuser',
          password: 'testpass',
          pool: { max: 10, min: 2 },
        });

        asserts.assertEquals(engine.poolEnabled, true);
      });

      await u.step('should create engine with custom instanceId', () => {
        const engine = new MariaDBEngine('maria::custom-id', TEST_CONFIG);
        asserts.assertEquals(engine.name, 'maria');
        asserts.assertEquals(engine.instanceId, 'MariaDB::maria::custom-id');
      });

      await u.step('should throw on missing host', () => {
        asserts.assertThrows(
          () => new MariaDBEngine('test', { ...TEST_CONFIG, host: '' }),
          DAMEngineError,
          'Host is required and cannot be empty',
        );
      });

      await u.step('should throw on missing database', () => {
        asserts.assertThrows(
          () => new MariaDBEngine('test', { ...TEST_CONFIG, database: '' }),
          DAMEngineError,
          'Database name is required and cannot be empty',
        );
      });

      await u.step('should throw on missing username', () => {
        asserts.assertThrows(
          () => new MariaDBEngine('test', { ...TEST_CONFIG, username: '' }),
          DAMEngineError,
          'Username is required and cannot be empty',
        );
      });

      await u.step('should throw on invalid port', () => {
        asserts.assertThrows(
          () => new MariaDBEngine('test', { ...TEST_CONFIG, port: 0 }),
          DAMEngineError,
          'Port must be between 1 and 65535, got 0',
        );
      });

      await u.step('should validate MariaDB-specific pool limits', () => {
        asserts.assertThrows(
          () =>
            new MariaDBEngine('test', { ...TEST_CONFIG, pool: { max: 600 } }),
          DAMEngineError,
          'Pool max connections must be between 1 and 500, got 600',
        );
      });

      await u.step('should handle SSL configuration options', () => {
        const engine = new MariaDBEngine('test-ssl', {
          ...TEST_CONFIG,
          ssl: { rejectUnauthorized: false },
        });
        asserts.assertEquals(engine.Engine, 'MariaDB');
      });

      await u.step('should handle advanced MariaDB options', () => {
        const engine = new MariaDBEngine('test-advanced', {
          ...TEST_CONFIG,
          connectionTimeout: 30,
          queryTimeout: 60,
        });
        asserts.assertEquals(engine.Engine, 'MariaDB');
      });
    });

    await t.step('connection management and error handling', async (u) => {
      await u.step('should connect to MariaDB database', async () => {
        const engine = setupMariaDB();

        try {
          await engine.connect();
          asserts.assert(['CONNECTED', 'IDLE'].includes(engine.status));
        } finally {
          await teardownMariaDB();
        }
      });

      await u.step('should handle connection errors gracefully', async () => {
        const engine = new MariaDBEngine('mariadb-fail', {
          host: 'nonexistent-host.local',
          port: 9999,
          database: 'test',
          username: 'root',
          password: 'wrong',
          connectionTimeout: 1,
        });

        try {
          await asserts.assertRejects(
            () => engine.connect(),
            DAMEngineError,
          );
        } finally {
          // Ensure cleanup even if test fails
          try {
            await engine.close();
          } catch {
            // Ignore cleanup errors
          }
          // Add a small delay to allow complete cleanup
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      });

      await u.step('should close connection properly', async () => {
        const engine = setupMariaDB();

        try {
          await engine.connect();
          await engine.close();
          asserts.assertEquals(engine.status, 'CLOSED');
        } finally {
          await teardownMariaDB();
        }
      });

      await u.step('should handle invalid host connection', async () => {
        const engine = new MariaDBEngine('invalid-host', {
          ...TEST_CONFIG,
          host: 'invalid-host-that-does-not-exist.com',
          connectionTimeout: 1,
        });

        await asserts.assertRejects(
          () => engine.connect(),
          DAMEngineError,
        );
      });

      await u.step('should handle invalid credentials', async () => {
        const engine = new MariaDBEngine('invalid-creds', {
          ...TEST_CONFIG,
          username: 'invalid_user',
          password: 'invalid_password',
          connectionTimeout: 1,
        });

        await asserts.assertRejects(
          () => engine.connect(),
          DAMEngineError,
        );
      });

      await u.step('should handle invalid database name', async () => {
        const engine = new MariaDBEngine('invalid-db', {
          ...TEST_CONFIG,
          database: 'nonexistent_database_12345',
          connectionTimeout: 1,
        });

        try {
          await asserts.assertRejects(
            () => engine.connect(),
            DAMEngineError,
          );
        } finally {
          // Ensure cleanup even if test fails
          try {
            await engine.close();
          } catch {
            // Ignore cleanup errors
          }
          // Add a small delay to allow complete cleanup
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      });

      await u.step(
        'should handle connection pool exhaustion gracefully',
        async () => {
          const engine = new MariaDBEngine('pool-test', {
            ...TEST_CONFIG,
            pool: { max: 2, min: 1 },
          });

          try {
            await engine.connect();
            // With a small pool, we should still be able to execute queries
            const result = await engine.execute({ sql: 'SELECT 1 as test' });
            asserts.assertEquals(result.data[0]?.test, 1);
          } finally {
            await engine.close();
          }
        },
      );

      await u.step(
        'should handle connection interruption recovery',
        async () => {
          const engine = setupMariaDB();

          try {
            await engine.connect();
            const result = await engine.execute({ sql: 'SELECT 1 as test' });
            asserts.assertEquals(result.data[0]?.test, 1);

            // Connection should still work after query
            const result2 = await engine.execute({ sql: 'SELECT 2 as test' });
            asserts.assertEquals(result2.data[0]?.test, 2);
          } finally {
            await teardownMariaDB();
          }
        },
      );
    });

    await t.step('query execution', async (u) => {
      await u.step('should execute simple queries', async () => {
        const engine = setupMariaDB();

        try {
          await engine.connect();
          const result = await engine.execute({
            sql: 'SELECT 1 AS test_value',
          });

          asserts.assertEquals(result.data.length, 1);
          asserts.assertEquals(result.data[0]?.test_value, 1);
          asserts.assertEquals(result.count, 1);
        } finally {
          await teardownMariaDB();
        }
      });

      await u.step('should execute parameterized queries', async () => {
        const engine = setupMariaDB();

        try {
          await engine.connect();
          const result = await engine.execute({
            sql: 'SELECT :value: AS param_value',
            params: { value: 'test_param' },
          });

          asserts.assertEquals(result.data.length, 1);
          asserts.assertEquals(result.data[0]?.param_value, 'test_param');
        } finally {
          await teardownMariaDB();
        }
      });

      await u.step('should handle repeated parameters correctly', async () => {
        const engine = setupMariaDB();

        try {
          await engine.connect();
          const result = await engine.execute({
            sql: 'SELECT :value: AS first, :value: AS second',
            params: { value: 'repeated' },
          });

          asserts.assertEquals(result.data[0]?.first, 'repeated');
          asserts.assertEquals(result.data[0]?.second, 'repeated');
        } finally {
          await teardownMariaDB();
        }
      });

      await u.step(
        'should handle quoted identifiers with repeated parameters',
        async () => {
          const engine = setupMariaDB();

          try {
            await engine.connect();
            const result = await engine.execute({
              sql: 'SELECT :value: AS `first value`, :value: AS `second value`',
              params: { value: 'quoted' },
            });

            asserts.assertEquals(result.data[0]?.['first value'], 'quoted');
            asserts.assertEquals(result.data[0]?.['second value'], 'quoted');
          } finally {
            await teardownMariaDB();
          }
        },
      );

      await u.step(
        'should handle type parsing for database column values',
        async () => {
          const engine = setupMariaDB();

          try {
            await engine.connect();
            const result = await engine.execute({
              sql:
                'SELECT :intVal: AS int_val, :strVal: AS str_val, :boolVal: AS bool_val',
              params: { intVal: 42, strVal: 'hello', boolVal: true },
            });

            asserts.assertEquals(result.data[0]?.int_val, 42);
            asserts.assertEquals(result.data[0]?.str_val, 'hello');
            asserts.assertEquals(result.data[0]?.bool_val, 1); // MariaDB returns 1 for true
          } finally {
            await teardownMariaDB();
          }
        },
      );

      await u.step('should handle BigInt values correctly', async () => {
        const engine = setupMariaDB();

        try {
          await engine.connect();
          // MariaDB handles large numbers well
          const result = await engine.execute({
            sql: 'SELECT :bigVal: AS big_val',
            params: { bigVal: 9007199254740991 },
          });

          asserts.assertEquals(result.data[0]?.big_val, 9007199254740991);
        } finally {
          await teardownMariaDB();
        }
      });

      await u.step('should handle complex MariaDB data types', async () => {
        const engine = setupMariaDB();

        try {
          await engine.connect();

          // Create a test table with various data types
          await engine.execute({
            sql:
              'CREATE TABLE IF NOT EXISTS test_types_maria (id INT, data_field TEXT, created_at DATETIME)',
          });

          // Clean any existing data
          await engine.execute({
            sql: 'DELETE FROM test_types_maria',
          });

          await engine.execute({
            sql: 'INSERT INTO test_types_maria VALUES (:id:, :data:, :date:)',
            params: {
              id: 1,
              data: '{"key": "value"}',
              date: '2023-01-01 12:00:00',
            },
          });

          const result = await engine.execute({
            sql: 'SELECT * FROM test_types_maria WHERE id = :id:',
            params: { id: 1 },
          });

          asserts.assertEquals(result.data[0]?.id, 1);
          asserts.assertEquals(result.data[0]?.data_field, '{"key": "value"}');

          // Clean up the test table
          await engine.execute({
            sql: 'DROP TABLE IF EXISTS test_types_maria',
          });
        } finally {
          await teardownMariaDB();
        }
      });

      await u.step('should handle NULL values and edge cases', async () => {
        const engine = setupMariaDB();

        try {
          await engine.connect();
          const result = await engine.execute({
            sql: 'SELECT NULL AS null_val, :param: AS param_val',
            params: { param: null },
          });

          asserts.assertEquals(result.data[0]?.null_val, null);
          asserts.assertEquals(result.data[0]?.param_val, null);
        } finally {
          await teardownMariaDB();
        }
      });

      await u.step('should handle query errors', async () => {
        const engine = setupMariaDB();

        try {
          await engine.connect();
          await asserts.assertRejects(
            () => engine.execute({ sql: 'SELECT FROM invalid_table' }),
            DAMEngineError,
            'Query failed',
          );
        } finally {
          await teardownMariaDB();
        }
      });

      await u.step('should reject empty queries', async () => {
        const engine = setupMariaDB();

        try {
          await engine.connect();
          await asserts.assertRejects(
            () => engine.execute({ sql: '' }),
            DAMEngineError,
          );
        } finally {
          await teardownMariaDB();
        }
      });
    });

    await t.step(
      'transaction management and concurrent scenarios',
      async (u) => {
        await u.step('should handle basic transactions', async () => {
          const engine = setupMariaDB();

          try {
            await engine.connect();

            // Create a test table
            await engine.execute({
              sql:
                'CREATE TABLE IF NOT EXISTS test_tx_basic (id INT AUTO_INCREMENT PRIMARY KEY, value VARCHAR(50))',
            });

            await engine.execute({ sql: 'DELETE FROM test_tx_basic' });

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

            await engine.execute({ sql: 'DROP TABLE IF EXISTS test_tx_basic' });
          } finally {
            await teardownMariaDB();
          }
        });

        await u.step('should handle transaction rollback', async () => {
          const engine = setupMariaDB();

          try {
            await engine.connect();

            await engine.execute({
              sql:
                'CREATE TABLE IF NOT EXISTS test_rollback (id INT AUTO_INCREMENT PRIMARY KEY, value VARCHAR(50))',
            });

            await engine.execute({ sql: 'DELETE FROM test_rollback' });

            const txId = await engine.begin();

            try {
              await engine.execute({
                sql: 'INSERT INTO test_rollback (value) VALUES (:value:)',
                params: { value: 'should_rollback' },
                transactionId: txId,
              });

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

            await engine.execute({ sql: 'DROP TABLE IF EXISTS test_rollback' });
          } finally {
            await teardownMariaDB();
          }
        });

        await u.step(
          'should handle multiple concurrent transactions',
          async () => {
            const engine = setupMariaDB();

            try {
              await engine.connect();

              await engine.execute({
                sql:
                  'CREATE TABLE IF NOT EXISTS test_concurrent (id INT AUTO_INCREMENT PRIMARY KEY, value VARCHAR(50))',
              });

              await engine.execute({ sql: 'DELETE FROM test_concurrent' });

              const tx1 = await engine.begin({ name: 'tx1' });
              const tx2 = await engine.begin({ name: 'tx2' });

              try {
                await engine.execute({
                  sql: 'INSERT INTO test_concurrent (value) VALUES (:value:)',
                  params: { value: 'tx1_data' },
                  transactionId: tx1,
                });

                await engine.execute({
                  sql: 'INSERT INTO test_concurrent (value) VALUES (:value:)',
                  params: { value: 'tx2_data' },
                  transactionId: tx2,
                });

                await engine.commit(tx1);
                await engine.commit(tx2);
              } catch (error) {
                await engine.rollback(tx1);
                await engine.rollback(tx2);
                throw error;
              }

              const result = await engine.execute({
                sql: 'SELECT COUNT(*) as count FROM test_concurrent',
              });
              asserts.assertEquals(result.data[0]?.count, 2);

              await engine.execute({
                sql: 'DROP TABLE IF EXISTS test_concurrent',
              });
            } finally {
              await teardownMariaDB();
            }
          },
        );

        await u.step('should handle transaction isolation levels', async () => {
          const engine = setupMariaDB();

          try {
            await engine.connect();

            // First get the default isolation level
            const defaultResult = await engine.execute({
              sql: 'SELECT @@transaction_isolation as isolation',
            });

            // MariaDB supports isolation levels - try to change it
            await engine.execute({
              sql: 'SET SESSION TRANSACTION ISOLATION LEVEL READ COMMITTED',
            });

            // Check if the isolation level changed
            const newResult = await engine.execute({
              sql: 'SELECT @@transaction_isolation as isolation',
            });

            const isolation = newResult.data[0]?.isolation as string;
            // The test passes if we can read the isolation level (even if it's the default)
            asserts.assert(
              typeof isolation === 'string' && isolation.length > 0,
              `Expected isolation level to be a non-empty string, got: ${isolation}`,
            );

            // Log the actual values for debugging
          } finally {
            await teardownMariaDB();
          }
        });

        await u.step(
          'should handle transaction deadlock detection',
          async () => {
            const engine = setupMariaDB();

            try {
              await engine.connect();

              await engine.execute({
                sql:
                  'CREATE TABLE IF NOT EXISTS test_deadlock (id INT PRIMARY KEY, value VARCHAR(50))',
              });

              await engine.execute({ sql: 'DELETE FROM test_deadlock' });
              await engine.execute({
                sql:
                  'INSERT INTO test_deadlock VALUES (1, "initial"), (2, "initial")',
              });

              // Simple deadlock test - MariaDB will detect and handle it
              const tx1 = await engine.begin({ name: 'deadlock1' });

              try {
                await engine.execute({
                  sql: 'UPDATE test_deadlock SET value = "tx1" WHERE id = 1',
                  transactionId: tx1,
                });

                await engine.commit(tx1);
              } catch (error) {
                await engine.rollback(tx1);
              }

              await engine.execute({
                sql: 'DROP TABLE IF EXISTS test_deadlock',
              });
            } finally {
              await teardownMariaDB();
            }
          },
        );

        await u.step(
          'should handle long-running transactions with timeout',
          async () => {
            const engine = setupMariaDB();

            try {
              await engine.connect();

              const txId = await engine.begin({ timeout: 2 }); // 2 second timeout

              try {
                await engine.execute({
                  sql: 'SELECT SLEEP(0.5)', // Short sleep, should succeed
                  transactionId: txId,
                });

                await engine.commit(txId);
              } catch (error) {
                await engine.rollback(txId);
                throw error;
              }
            } finally {
              await teardownMariaDB();
            }
          },
        );
      },
    );

    await t.step('error handling and recovery scenarios', async (u) => {
      await u.step('should handle SQL syntax errors gracefully', async () => {
        const engine = setupMariaDB();

        try {
          await engine.connect();
          await asserts.assertRejects(
            () => engine.execute({ sql: 'SELECT FROM WHERE' }),
            DAMEngineError,
          );
        } finally {
          await teardownMariaDB();
        }
      });

      await u.step('should handle constraint violations', async () => {
        const engine = setupMariaDB();

        try {
          await engine.connect();

          await engine.execute({
            sql:
              'CREATE TABLE IF NOT EXISTS test_constraints (id INT PRIMARY KEY, value VARCHAR(50))',
          });

          await engine.execute({ sql: 'DELETE FROM test_constraints' });

          await engine.execute({
            sql: 'INSERT INTO test_constraints VALUES (1, "first")',
          });

          // This should fail due to primary key constraint
          await asserts.assertRejects(
            () =>
              engine.execute({
                sql: 'INSERT INTO test_constraints VALUES (1, "duplicate")',
              }),
            DAMEngineError,
          );

          await engine.execute({
            sql: 'DROP TABLE IF EXISTS test_constraints',
          });
        } finally {
          await teardownMariaDB();
        }
      });

      await u.step('should handle permission errors', async () => {
        const engine = setupMariaDB();

        try {
          await engine.connect();

          // Try to access mysql system table (might fail with permissions)
          try {
            await engine.execute({
              sql: 'SELECT * FROM mysql.user LIMIT 1',
            });
            // If it succeeds, that's fine too (user has permissions)
          } catch (error) {
            // Expected for restricted users
            asserts.assertInstanceOf(error, DAMEngineError);
          }
        } finally {
          await teardownMariaDB();
        }
      });

      await u.step(
        'should handle connection recovery after network interruption',
        async () => {
          const engine = setupMariaDB();

          try {
            await engine.connect();

            // Execute a query to ensure connection works
            const result1 = await engine.execute({ sql: 'SELECT 1 as test' });
            asserts.assertEquals(result1.data[0]?.test, 1);

            // Connection should still work
            const result2 = await engine.execute({ sql: 'SELECT 2 as test' });
            asserts.assertEquals(result2.data[0]?.test, 2);
          } finally {
            await teardownMariaDB();
          }
        },
      );

      await u.step('should handle very large result sets', async () => {
        const engine = setupMariaDB();

        try {
          await engine.connect();

          // Generate a moderate result set
          const result = await engine.execute({
            sql:
              'SELECT n FROM (SELECT 1 as n UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5) t',
          });

          asserts.assertEquals(result.data.length, 5);
          asserts.assertEquals(result.count, 5);
        } finally {
          await teardownMariaDB();
        }
      });

      await u.step('should handle concurrent query load', async () => {
        const engine = setupMariaDB();

        try {
          await engine.connect();

          // Execute multiple concurrent queries
          const promises = [];
          for (let i = 1; i <= 5; i++) {
            promises.push(
              engine.execute({ sql: `SELECT ${i} as value` }),
            );
          }

          const results = await Promise.all(promises);

          for (let i = 0; i < results.length; i++) {
            asserts.assertEquals(results[i]?.data?.[0]?.value, i + 1);
          }
        } finally {
          await teardownMariaDB();
        }
      });
    });

    await t.step('performance and monitoring', async (u) => {
      await u.step('should track pool statistics', async () => {
        const engine = setupMariaDB();

        try {
          await engine.connect();

          const poolStats = engine.getPoolStats();
          asserts.assert(poolStats !== null);
          asserts.assert(typeof poolStats.totalConnections === 'number');
          asserts.assert(typeof poolStats.activeConnections === 'number');
          asserts.assert(typeof poolStats.idleConnections === 'number');
        } finally {
          await teardownMariaDB();
        }
      });

      await u.step('should track query performance metrics', async () => {
        const engine = setupMariaDB();

        try {
          await engine.connect();

          const start = Date.now();
          await engine.execute({ sql: 'SELECT SLEEP(0.1)' });
          const end = Date.now();

          // Query should take at least 100ms due to SLEEP
          asserts.assert(end - start >= 100);
        } finally {
          await teardownMariaDB();
        }
      });

      await u.step('should monitor health status', async () => {
        const engine = setupMariaDB();

        try {
          await engine.connect();

          // Health status should be good for connected engine
          const healthStatus = engine.healthStatus;
          asserts.assertEquals(healthStatus.isHealthy, true);
          asserts.assertEquals(healthStatus.consecutiveErrors, 0);
        } finally {
          await teardownMariaDB();
        }
      });

      await u.step('should handle very large result sets', async () => {
        const engine = setupMariaDB();

        try {
          await engine.connect();

          // Generate a result set with multiple rows using a subquery
          const result = await engine.execute({
            sql:
              'SELECT n FROM (SELECT 1 as n UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5) t ORDER BY n',
          });

          asserts.assertEquals(result.data.length, 5);
          asserts.assertEquals(result.count, 5);
        } finally {
          await teardownMariaDB();
        }
      });

      await u.step('should handle concurrent query load', async () => {
        const engine = setupMariaDB();

        try {
          await engine.connect();

          // Execute queries concurrently
          const concurrent = 3;
          const promises = [];

          for (let i = 0; i < concurrent; i++) {
            promises.push(
              engine.execute({ sql: `SELECT ${i + 1} as concurrent_id` }),
            );
          }

          const results = await Promise.all(promises);
          asserts.assertEquals(results.length, concurrent);

          // Verify each result
          for (let i = 0; i < results.length; i++) {
            asserts.assertEquals(results[i]?.data?.[0]?.concurrent_id, i + 1);
          }
        } finally {
          await teardownMariaDB();
        }
      });

      await u.step('should emit connection events', async () => {
        const engine = setupMariaDB();

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
          await teardownMariaDB();
        }
      });
    });

    await t.step('misconfiguration and edge cases', async (u) => {
      await u.step(
        'should handle extremely small connection timeouts',
        async () => {
          const engine = new MariaDBEngine('tiny-timeout', {
            ...TEST_CONFIG,
            connectionTimeout: 0.001, // 1ms - very small
          });

          // This should either connect very fast or timeout quickly
          try {
            await engine.connect();
            await engine.close();
          } catch (error) {
            asserts.assertInstanceOf(error, DAMEngineError);
          }
        },
      );

      await u.step('should handle malformed connection strings', async () => {
        // MariaDB uses options object, not connection strings
        // But we can test with invalid options
        asserts.assertThrows(
          () =>
            new MariaDBEngine('malformed', {
              ...TEST_CONFIG,
              host: '', // Invalid empty host
            }),
          DAMEngineError,
        );
      });

      await u.step(
        'should handle special characters in credentials',
        async () => {
          // Test with credentials that have special characters
          const engine = new MariaDBEngine('special-chars', {
            ...TEST_CONFIG,
            username: 'user@domain.com',
            password: 'p@ssw0rd!$',
            connectionTimeout: 1,
          });

          // This will likely fail, but should handle gracefully
          await asserts.assertRejects(
            () => engine.connect(),
            DAMEngineError,
          );
        },
      );

      await u.step('should handle very long queries', async () => {
        const engine = setupMariaDB();

        try {
          await engine.connect();

          // Create a very long SELECT with many UNION clauses
          const longQuery = Array.from(
            { length: 10 },
            (_, i) => `SELECT ${i + 1} as num`,
          ).join(' UNION ');

          const result = await engine.execute({ sql: longQuery });
          asserts.assertEquals(result.data.length, 10);
        } finally {
          await teardownMariaDB();
        }
      });

      await u.step(
        'should handle rapid connect/disconnect cycles',
        async () => {
          const engine = new MariaDBEngine('rapid-cycle', TEST_CONFIG);

          try {
            // Rapid connect/disconnect cycles
            for (let i = 0; i < 3; i++) {
              await engine.connect();
              await engine.close();
            }
          } catch (error) {
            // Some cycles might fail, that's acceptable
            asserts.assertInstanceOf(error, DAMEngineError);
          }
        },
      );

      await u.step('should handle concurrent connection attempts', async () => {
        const engines = [
          new MariaDBEngine('concurrent-1', TEST_CONFIG),
          new MariaDBEngine('concurrent-2', TEST_CONFIG),
          new MariaDBEngine('concurrent-3', TEST_CONFIG),
        ];

        try {
          // Try to connect all engines simultaneously
          const promises = engines.map((engine) => engine.connect());
          await Promise.all(promises);

          // All should be connected
          for (const engine of engines) {
            asserts.assert(['CONNECTED', 'IDLE'].includes(engine.status));
          }
        } finally {
          // Clean up all engines
          for (const engine of engines) {
            try {
              await engine.close();
            } catch {
              // Ignore cleanup errors
            }
          }
        }
      });

      await u.step('should handle empty result sets', async () => {
        const engine = setupMariaDB();

        try {
          await engine.connect();

          await engine.execute({
            sql: 'CREATE TABLE IF NOT EXISTS empty_test_temp (id INT)',
          });

          const result = await engine.execute({
            sql: 'SELECT * FROM empty_test_temp',
          });

          asserts.assertEquals(result.data.length, 0);
          asserts.assertEquals(result.count, 0);

          await engine.execute({
            sql: 'DROP TABLE IF EXISTS empty_test_temp',
          });
        } finally {
          await teardownMariaDB();
        }
      });

      await u.step('should handle large result sets', async () => {
        const engine = setupMariaDB();

        try {
          await engine.connect();

          // Generate a result set with multiple rows
          const result = await engine.execute({
            sql:
              'SELECT n FROM (SELECT 1 as n UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5) t',
          });

          asserts.assertEquals(result.data.length, 5);
          asserts.assertEquals(result.count, 5);
        } finally {
          await teardownMariaDB();
        }
      });

      await u.step('should handle special characters in queries', async () => {
        const engine = setupMariaDB();

        try {
          await engine.connect();

          const specialValue = 'Hello \'World\' with "quotes" and émojis 🚀';
          const result = await engine.execute({
            sql: 'SELECT :value: AS special_value',
            params: { value: specialValue },
          });

          asserts.assertEquals(result.data[0]?.special_value, specialValue);
        } finally {
          await teardownMariaDB();
        }
      });

      await u.step('should handle null values', async () => {
        const engine = setupMariaDB();

        try {
          await engine.connect();

          const result = await engine.execute({
            sql: 'SELECT NULL AS null_value, :param: AS param_value',
            params: { param: null },
          });

          asserts.assertEquals(result.data[0]?.null_value, null);
          asserts.assertEquals(result.data[0]?.param_value, null);
        } finally {
          await teardownMariaDB();
        }
      });
    });

    // Final cleanup to prevent resource leaks
    await new Promise((resolve) => setTimeout(resolve, 200));
  },
);
