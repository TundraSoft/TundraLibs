import * as asserts from '$asserts';
import { MariaEngine } from './Engine.ts';
import { DAMEngineError } from '../../engine/mod.ts';
import { envArgs } from '@tundralibs/utils';

const env = envArgs('./dam/engines/');

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

// Test configuration from environment variables with defaults
const TEST_CONFIG = {
  host: env.get('MARIADB_HOST') || 'localhost',
  port: Number.parseInt(env.get('MARIADB_PORT') || '3306'),
  database: env.get('MARIADB_DATABASE') || 'mysql',
  username: env.get('MARIADB_USERNAME') || 'maria',
  password: env.get('MARIADB_PASSWORD') || 'mariapw',
};

// Check if MariaDB is available
async function isMariaAvailable(): Promise<boolean> {
  try {
    const engine = new MariaEngine('test-check', TEST_CONFIG);
    await engine.connect();
    await engine.disconnect();
    return true;
  } catch {
    return false;
  }
}

Deno.test({
  name: 'dam.engines.maria',
  ignore: !(await isMariaAvailable()),
  sanitizeResources: false, // Maria client may leave handles briefly after disconnect
  fn: async (t) => {
    await t.step('configuration', async (u) => {
      await u.step('should create engine with valid config', () => {
        const engine = new MariaEngine('test-db', TEST_CONFIG);
        asserts.assertEquals(engine.Engine, 'MARIA');
        asserts.assertEquals(engine.Name, 'test-db');
        asserts.assertEquals(engine.Capabilities.transactions, true);
        asserts.assertEquals(engine.Capabilities.pooledConnections, true);
        asserts.assertEquals(engine.Capabilities.preparedStatements, true);
      });

      await u.step('should use default port', () => {
        const { port, ...config } = TEST_CONFIG;
        const engine = new MariaEngine('test-db', config);
        asserts.assertEquals(engine.getOption('port'), 3306);
      });

      await u.step('should validate required fields', () => {
        asserts.assertThrows(
          () => new MariaEngine('test-db', { host: '' } as any),
          DAMEngineError,
        );
      });

      await u.step('should reject invalid port', () => {
        asserts.assertThrows(
          () =>
            new MariaEngine('test-db', {
              ...TEST_CONFIG,
              port: 'invalid' as any,
            }),
          DAMEngineError,
          'must be a positive integer',
        );
        asserts.assertThrows(
          () => new MariaEngine('test-db', { ...TEST_CONFIG, port: -1 }),
          DAMEngineError,
          'must be a positive integer',
        );
        asserts.assertThrows(
          () => new MariaEngine('test-db', { ...TEST_CONFIG, port: 99999 }),
          DAMEngineError,
          'must be a positive integer',
        );
      });

      await u.step('should reject empty host', () => {
        asserts.assertThrows(
          () =>
            new MariaEngine('test-db', {
              ...TEST_CONFIG,
              host: '',
            }),
          DAMEngineError,
          'must be a non-empty string',
        );
        asserts.assertThrows(
          () =>
            new MariaEngine('test-db', {
              ...TEST_CONFIG,
              host: '   ',
            }),
          DAMEngineError,
          'must be a non-empty string',
        );
      });

      await u.step('should reject empty database', () => {
        asserts.assertThrows(
          () =>
            new MariaEngine('test-db', {
              ...TEST_CONFIG,
              database: '',
            }),
          DAMEngineError,
          'must be a non-empty string',
        );
      });

      await u.step('should reject empty username', () => {
        asserts.assertThrows(
          () =>
            new MariaEngine('test-db', {
              ...TEST_CONFIG,
              username: '',
            }),
          DAMEngineError,
          'must be a non-empty string',
        );
      });

      await u.step('should reject invalid pool options', () => {
        asserts.assertThrows(
          () =>
            new MariaEngine('test-db', {
              ...TEST_CONFIG,
              pool: { max: -1 },
            }),
          DAMEngineError,
          'must be an object',
        );
        asserts.assertThrows(
          () =>
            new MariaEngine('test-db', {
              ...TEST_CONFIG,
              pool: { min: 0 },
            }),
          DAMEngineError,
          'must be an object',
        );
      });

      await u.step('should accept ssl as boolean', () => {
        const engine = new MariaEngine('test-db', {
          ...TEST_CONFIG,
          ssl: true,
        });
        asserts.assertEquals(engine.getOption('ssl'), true);
      });

      await u.step('should accept ssl as object', () => {
        const engine = new MariaEngine('test-db', {
          ...TEST_CONFIG,
          ssl: { rejectUnauthorized: false },
        });
        const sslOption = engine.getOption('ssl');
        asserts.assertEquals(typeof sslOption, 'object');
      });

      await u.step('should reject invalid ssl options', () => {
        asserts.assertThrows(
          () =>
            new MariaEngine('test-db', {
              ...TEST_CONFIG,
              ssl: 'invalid' as any,
            }),
          DAMEngineError,
          'must be a boolean or an object',
        );
      });
    });

    await t.step('connection management', async (u) => {
      await u.step('should connect and disconnect', async () => {
        const engine = new MariaEngine('test-db', TEST_CONFIG);
        let connectEmitted = false;
        let disconnectEmitted = false;

        engine.on('connect', () => {
          connectEmitted = true;
        });
        engine.on('disconnect', () => {
          disconnectEmitted = true;
        });

        await engine.connect();
        asserts.assertEquals(engine.status, 'READY');
        asserts.assert(connectEmitted);

        await engine.disconnect();
        asserts.assertEquals(engine.status, 'CLOSED');
        asserts.assert(disconnectEmitted);
      });

      await u.step('should handle connection failure', async () => {
        const engine = new MariaEngine('test-db', {
          ...TEST_CONFIG,
          host: 'invalid-host-12345',
        });
        let errorEmitted = false;

        engine.on('connectionFailed', () => {
          errorEmitted = true;
        });

        await asserts.assertRejects(
          () => engine.connect(),
          DAMEngineError,
        );
        asserts.assert(errorEmitted);
      });
    });

    await t.step('query execution', async (u) => {
      await u.step('should execute simple query', async () => {
        const engine = new MariaEngine('test-db', TEST_CONFIG);
        let queryEmitted = false;

        engine.on('query', () => {
          queryEmitted = true;
        });

        const result = await engine.execute({ sql: 'SELECT 1 as num' });
        asserts.assertEquals(result.count, 1);
        asserts.assertEquals(result.data[0]?.num, 1);
        asserts.assert(queryEmitted);

        await engine.disconnect();
      });

      await u.step('should execute query with named parameters', async () => {
        const engine = new MariaEngine('test-db', TEST_CONFIG);

        const result = await engine.execute({
          sql: 'SELECT :value: as result',
          params: { value: 'test' },
        });
        asserts.assertEquals(result.count, 1);
        asserts.assertEquals(result.data[0]?.result, 'test');

        await engine.disconnect();
      });

      await u.step(
        'should execute query with multiple parameters',
        async () => {
          const engine = new MariaEngine('test-db', TEST_CONFIG);

          const result = await engine.execute({
            sql: 'SELECT :a: + :b: as sum',
            params: { a: 5, b: 3 },
          });
          asserts.assertEquals(result.count, 1);
          asserts.assertEquals(result.data[0]?.sum, 8);

          await engine.disconnect();
        },
      );

      await u.step(
        'should handle repeated parameters in query',
        async () => {
          const engine = new MariaEngine('test-db', TEST_CONFIG);

          const result = await engine.execute({
            sql: 'SELECT :name: as Name, :name: as UserName, :age: as Age',
            params: { name: 'Test', age: 32 },
          });
          asserts.assertEquals(result.count, 1);
          asserts.assertEquals(result.data[0]?.Name, 'Test');
          asserts.assertEquals(result.data[0]?.UserName, 'Test');
          asserts.assertEquals(result.data[0]?.Age, 32);

          await engine.disconnect();
        },
      );

      await u.step('should fail with missing parameters', async () => {
        const engine = new MariaEngine('test-db', TEST_CONFIG);

        await asserts.assertRejects(
          () =>
            engine.execute({
              sql: 'SELECT :value: as result',
              params: {},
            }),
          DAMEngineError,
        );

        await engine.disconnect();
      });

      await u.step('should track query statistics', async () => {
        const engine = new MariaEngine('test-db', TEST_CONFIG);

        await engine.execute({ sql: 'SELECT 1' });
        await engine.execute({ sql: 'SELECT 2' });

        const stats = engine.queryStats;
        asserts.assertEquals(stats.totalQueries, 2);
        asserts.assertEquals(stats.successfulQueries, 2);
        asserts.assertEquals(stats.failedQueries, 0);

        await engine.disconnect();
      });

      await u.step('should handle query failure', async () => {
        const engine = new MariaEngine('test-db', TEST_CONFIG);

        await asserts.assertRejects(
          () => engine.execute({ sql: 'SELECT FROM invalid_syntax' }),
          DAMEngineError,
        );

        const stats = engine.queryStats;
        asserts.assertEquals(stats.failedQueries, 1);

        await engine.disconnect();
      });
    });

    await t.step('transaction management', async (u) => {
      await u.step('should begin and commit transaction', async () => {
        const engine = new MariaEngine('test-db', TEST_CONFIG);
        let beginEmitted = false;
        let commitEmitted = false;

        engine.on('transactionBegin', () => {
          beginEmitted = true;
        });
        engine.on('transactionCommit', () => {
          commitEmitted = true;
        });

        const txId = await engine.beginTransaction();
        asserts.assert(txId.length > 0);
        asserts.assert(beginEmitted);

        await engine.execute({
          sql: 'SELECT 1',
          transactionId: txId,
        });

        await engine.commitTransaction(txId);
        asserts.assert(commitEmitted);

        await engine.disconnect();
      });

      await u.step('should rollback transaction', async () => {
        const engine = new MariaEngine('test-db', TEST_CONFIG);
        let rollbackEmitted = false;

        engine.on('transactionRollback', () => {
          rollbackEmitted = true;
        });

        const txId = await engine.beginTransaction();
        await engine.execute({
          sql: 'SELECT 1',
          transactionId: txId,
        });
        await engine.rollbackTransaction(txId);

        asserts.assert(rollbackEmitted);

        await engine.disconnect();
      });

      await u.step(
        'should handle multiple concurrent transactions with isolation',
        async () => {
          const engine = new MariaEngine('test-db', TEST_CONFIG);

          // Create test table (regular table, not temporary, so all connections can see it)
          await engine.execute({
            sql:
              'CREATE TABLE IF NOT EXISTS concurrent_test (id INT PRIMARY KEY, value VARCHAR(50))',
          });

          // Clean up any existing data
          await engine.execute({
            sql: 'DELETE FROM concurrent_test',
          });

          const tx1 = await engine.beginTransaction();
          const tx2 = await engine.beginTransaction();
          const tx3 = await engine.beginTransaction();

          // Execute queries in different transactions
          await engine.execute({
            sql: "INSERT INTO concurrent_test (id, value) VALUES (1, 'tx1')",
            transactionId: tx1,
          });
          await engine.execute({
            sql: "INSERT INTO concurrent_test (id, value) VALUES (2, 'tx2')",
            transactionId: tx2,
          });
          await engine.execute({
            sql: "INSERT INTO concurrent_test (id, value) VALUES (3, 'tx3')",
            transactionId: tx3,
          });

          // Commit first two, rollback third
          await engine.commitTransaction(tx1);
          await engine.commitTransaction(tx2);
          await engine.rollbackTransaction(tx3);

          // Verify only tx1 and tx2 data persisted
          const result = await engine.execute({
            sql: 'SELECT * FROM concurrent_test ORDER BY id',
          });
          asserts.assertEquals(result.count, 2);
          asserts.assertEquals(result.data[0]?.value, 'tx1');
          asserts.assertEquals(result.data[1]?.value, 'tx2');

          // Clean up
          await engine.execute({
            sql: 'DROP TABLE IF EXISTS concurrent_test',
          });

          await engine.disconnect();
        },
      );

      await u.step(
        'should auto-rollback on error when configured',
        async () => {
          const engine = new MariaEngine('test-db', {
            ...TEST_CONFIG,
            autoRollbackOnFailure: true,
          });

          const txId = await engine.beginTransaction();

          try {
            await engine.execute({
              sql: 'SELECT FROM invalid',
              transactionId: txId,
            });
          } catch {
            // Expected to fail
          }

          // Transaction should be auto-rolled back
          await asserts.assertRejects(
            () =>
              engine.execute({
                sql: 'SELECT 1',
                transactionId: txId,
              }),
            DAMEngineError,
          );

          await engine.disconnect();
        },
      );
    });

    await t.step('batch execution', async (u) => {
      await u.step('should execute multiple queries', async () => {
        const engine = new MariaEngine('test-db', TEST_CONFIG);

        await engine.batchExecute([
          { sql: 'SELECT 1' },
          { sql: 'SELECT 2' },
          { sql: 'SELECT 3' },
        ]);

        const stats = engine.queryStats;
        asserts.assertEquals(stats.totalQueries, 3);

        await engine.disconnect();
      });

      await u.step('should halt on first error', async () => {
        const engine = new MariaEngine('test-db', TEST_CONFIG);

        await asserts.assertRejects(
          () =>
            engine.batchExecute([
              { sql: 'SELECT 1' },
              { sql: 'SELECT FROM invalid' },
              { sql: 'SELECT 3' },
            ]),
          DAMEngineError,
        );

        const stats = engine.queryStats;
        asserts.assertEquals(stats.successfulQueries, 1);
        asserts.assertEquals(stats.failedQueries, 1);

        await engine.disconnect();
      });
    });

    await t.step('pool management', async (u) => {
      await u.step('should track pool statistics', async () => {
        const engine = new MariaEngine('test-db', {
          ...TEST_CONFIG,
          pool: { max: 5, min: 1 },
        });

        await engine.connect();
        const stats = engine.poolStats;

        asserts.assert('total' in stats);
        asserts.assert('idle' in stats);
        asserts.assert('active' in stats);

        await engine.disconnect();
      });

      await u.step('should handle pool exhaustion', async () => {
        const engine = new MariaEngine('test-db', {
          ...TEST_CONFIG,
          pool: { max: 2, min: 1 },
        });

        await engine.connect();

        // Create transactions to exhaust pool
        const tx1 = await engine.beginTransaction();
        const tx2 = await engine.beginTransaction();

        // Pool should be exhausted (idle = 0)
        const stats = engine.stats;
        asserts.assertEquals(stats.pool.idle, 0);

        await engine.commitTransaction(tx1);
        await engine.commitTransaction(tx2);
        // After releasing transactions, idle connections should be available
        const statsAfter = engine.stats;
        asserts.assert(statsAfter.pool.idle > 0);
        await engine.disconnect();
      });
      // SSL variations skipped in CI environment due to certificate mismatch; retained for manual runs
    });

    await t.step('event emissions', async (u) => {
      await u.step('should emit all query events', async () => {
        const engine = new MariaEngine('test-db', TEST_CONFIG);
        const events: string[] = [];

        engine.on('connect', () => events.push('connect'));
        engine.on('query', () => events.push('query'));
        engine.on('disconnect', () => events.push('disconnect'));

        await engine.connect();
        await engine.execute({ sql: 'SELECT 1' });
        await engine.disconnect();

        asserts.assert(events.includes('connect'));
        asserts.assert(events.includes('query'));
        asserts.assert(events.includes('disconnect'));
      });

      await u.step('should emit transaction events', async () => {
        const engine = new MariaEngine('test-db', TEST_CONFIG);
        const events: string[] = [];

        engine.on('transactionBegin', () => events.push('begin'));
        engine.on('transactionCommit', () => events.push('commit'));
        engine.on('transactionRollback', () => events.push('rollback'));

        const tx1 = await engine.beginTransaction();
        await engine.commitTransaction(tx1);

        const tx2 = await engine.beginTransaction();
        await engine.rollbackTransaction(tx2);

        asserts.assert(events.includes('begin'));
        asserts.assert(events.includes('commit'));
        asserts.assert(events.includes('rollback'));

        await engine.disconnect();
      });
    });

    await t.step('ping and health check', async (u) => {
      await u.step('should ping successfully when connected', async () => {
        const engine = new MariaEngine('test-db', TEST_CONFIG);
        await engine.connect();

        const result = await engine.ping();
        asserts.assertEquals(result, true);

        await engine.disconnect();
      });

      await u.step('should auto-connect on ping', async () => {
        const engine = new MariaEngine('test-db', TEST_CONFIG);

        asserts.assertEquals(engine.status, 'CLOSED');
        const result = await engine.ping();
        asserts.assertEquals(result, true);
        asserts.assertEquals(engine.status, 'READY');

        await engine.disconnect();
      });
      await u.step('should return false on ping failure', async () => {
        // Subclass to force failure in _ping by throwing
        class FailingPingMaria extends MariaEngine {
          protected override async _connect(): Promise<void> {
            // do nothing to avoid real connection
            // still set status OPEN so ping attempts a query
            // @ts-ignore
            this._status = 'READY';
          }
          protected override async _execute(): Promise<
            { data: any[]; count: number }
          > {
            throw new Error('forced');
          }
        }
        const engine = new FailingPingMaria(
          'fail-ping',
          { database: 'x', username: 'y' } as any,
        );
        const ok = await engine.ping();
        asserts.assertEquals(ok, false);
      });

      await u.step(
        'transaction begin failure releases connection',
        async () => {
          // Subclass to simulate beginTransaction throwing
          class FailingBeginMaria extends MariaEngine {
            protected override async _connect(): Promise<void> {
              const failingConn = {
                beginTransaction: async () => {
                  throw new Error('boom');
                },
                release: () => {},
              } as any;
              // @ts-ignore
              this._client = { getConnection: async () => failingConn } as any;
              // @ts-ignore
              this._status = 'READY';
            }
          }
          const engine = new FailingBeginMaria(
            'fail-begin',
            { database: 'x', username: 'u' } as any,
          );
          await asserts.assertRejects(() => engine.beginTransaction());
        },
      );

      await u.step(
        'should handle query execution failure in transaction',
        async () => {
          const engine = new MariaEngine('test-db', {
            ...TEST_CONFIG,
            autoRollbackOnFailure: true,
          });
          const txId = await engine.beginTransaction();
          try {
            await engine.execute({
              sql: 'SELECT * FROM non_existent_table_xyz',
              transactionId: txId,
            });
          } catch {
            // Expected
          }
          // Auto-rollback should have cleaned up
          await engine.disconnect();
        },
      );
    });
  },
});
