import * as asserts from '$asserts';
import { PostgresEngine } from './Engine.ts';
import { DAMEngineError } from '../../engine/mod.ts';
import { envArgs } from '@tundralibs/utils';

const env = envArgs('./dam/engines/');
// Test configuration from environment variables with defaults
const TEST_CONFIG = {
  host: env.get('POSTGRES_HOST') || 'localhost',
  port: Number.parseInt(env.get('POSTGRES_PORT') || '5432'),
  database: env.get('POSTGRES_DATABASE') || 'postgres',
  username: env.get('POSTGRES_USERNAME') || 'postgres',
  password: env.get('POSTGRES_PASSWORD') || 'postgres',
};

// Check if PostgreSQL is available
async function isPostgresAvailable(): Promise<boolean> {
  try {
    const engine = new PostgresEngine('test-check', TEST_CONFIG);
    await engine.connect();
    await engine.disconnect();
    return true;
  } catch {
    return false;
  }
}

Deno.test({
  name: 'dam.engines.postgres',
  ignore: !(await isPostgresAvailable()),
  fn: async (t) => {
    await t.step('configuration', async (u) => {
      await u.step('should create engine with valid config', () => {
        const engine = new PostgresEngine('test-db', TEST_CONFIG);
        asserts.assertEquals(engine.Engine, 'POSTGRES');
        asserts.assertEquals(engine.Name, 'test-db');
        asserts.assertEquals(engine.Capabilities.transactions, true);
        asserts.assertEquals(engine.Capabilities.pooledConnections, true);
        asserts.assertEquals(engine.Capabilities.preparedStatements, true);
      });

      await u.step('should use default port', () => {
        const { port, ...config } = TEST_CONFIG;
        const engine = new PostgresEngine('test-db', config);
        asserts.assertEquals(engine.getOption('port'), 5432);
      });

      await u.step('should validate required fields', () => {
        asserts.assertThrows(
          () => new PostgresEngine('test-db', { host: '' } as any),
          DAMEngineError,
        );
      });

      await u.step('should reject invalid port', () => {
        asserts.assertThrows(
          () =>
            new PostgresEngine('test-db', {
              ...TEST_CONFIG,
              port: 'invalid' as any,
            }),
          DAMEngineError,
          'must be a positive integer',
        );
        asserts.assertThrows(
          () => new PostgresEngine('test-db', { ...TEST_CONFIG, port: -1 }),
          DAMEngineError,
          'must be a positive integer',
        );
        asserts.assertThrows(
          () => new PostgresEngine('test-db', { ...TEST_CONFIG, port: 99999 }),
          DAMEngineError,
          'must be a positive integer',
        );
      });

      await u.step('should reject empty host', () => {
        asserts.assertThrows(
          () =>
            new PostgresEngine('test-db', {
              ...TEST_CONFIG,
              host: '',
            }),
          DAMEngineError,
          'must be a non-empty string',
        );
        asserts.assertThrows(
          () =>
            new PostgresEngine('test-db', {
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
            new PostgresEngine('test-db', {
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
            new PostgresEngine('test-db', {
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
            new PostgresEngine('test-db', {
              ...TEST_CONFIG,
              pool: { max: -1 },
            }),
          DAMEngineError,
          'must be an object',
        );
        asserts.assertThrows(
          () =>
            new PostgresEngine('test-db', {
              ...TEST_CONFIG,
              pool: { min: 0 },
            }),
          DAMEngineError,
          'must be an object',
        );
      });

      await u.step('should accept ssl as boolean', () => {
        const engine = new PostgresEngine('test-db', {
          ...TEST_CONFIG,
          ssl: true,
        });
        asserts.assertEquals(engine.getOption('ssl'), true);
      });

      await u.step('should accept ssl as object', () => {
        const engine = new PostgresEngine('test-db', {
          ...TEST_CONFIG,
          ssl: { rejectUnauthorized: false },
        });
        const sslOption = engine.getOption('ssl');
        asserts.assertEquals(typeof sslOption, 'object');
      });

      await u.step('should reject invalid ssl options', () => {
        asserts.assertThrows(
          () =>
            new PostgresEngine('test-db', {
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
        const engine = new PostgresEngine('test-db', TEST_CONFIG);
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
        const engine = new PostgresEngine('test-db', {
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
        const engine = new PostgresEngine('test-db', TEST_CONFIG);
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

      await u.step('should execute query with parameters', async () => {
        const engine = new PostgresEngine('test-db', TEST_CONFIG);

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
          const engine = new PostgresEngine('test-db', TEST_CONFIG);

          const result = await engine.execute({
            sql: 'SELECT :a:::integer + :b:::integer as sum',
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
          const engine = new PostgresEngine('test-db', TEST_CONFIG);

          const result = await engine.execute({
            sql:
              'SELECT :name: as Name, :name: as UserName, :age:::integer as Age',
            params: { name: 'Test', age: 32 },
          });
          asserts.assertEquals(result.count, 1);
          asserts.assertEquals(result.data[0]?.name, 'Test');
          asserts.assertEquals(result.data[0]?.username, 'Test');
          asserts.assertEquals(result.data[0]?.age, 32);

          await engine.disconnect();
        },
      );

      await u.step('should fail with missing parameters', async () => {
        const engine = new PostgresEngine('test-db', TEST_CONFIG);

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
        const engine = new PostgresEngine('test-db', TEST_CONFIG);

        await engine.execute({ sql: 'SELECT 1' });
        await engine.execute({ sql: 'SELECT 2' });

        const stats = engine.queryStats;
        asserts.assertEquals(stats.totalQueries, 2);
        asserts.assertEquals(stats.successfulQueries, 2);
        asserts.assertEquals(stats.failedQueries, 0);

        await engine.disconnect();
      });

      await u.step('should handle query failure', async () => {
        const engine = new PostgresEngine('test-db', TEST_CONFIG);

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
        const engine = new PostgresEngine('test-db', TEST_CONFIG);
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
        const engine = new PostgresEngine('test-db', TEST_CONFIG);
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
          const engine = new PostgresEngine('test-db', TEST_CONFIG);

          // Create test table (regular table so all connections can see it)
          await engine.execute({
            sql:
              'CREATE TABLE IF NOT EXISTS concurrent_test (id INTEGER PRIMARY KEY, value TEXT)',
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
          const engine = new PostgresEngine('test-db', {
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
        const engine = new PostgresEngine('test-db', TEST_CONFIG);

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
        const engine = new PostgresEngine('test-db', TEST_CONFIG);

        try {
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
        } finally {
          await engine.disconnect();
        }
      });
    });

    await t.step('pool management', async (u) => {
      await u.step('should track pool statistics', async () => {
        const engine = new PostgresEngine('test-db', {
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
        const engine = new PostgresEngine('test-db', {
          ...TEST_CONFIG,
          pool: { max: 2, min: 1 },
        });

        await engine.connect();

        // Verify pool configuration
        let poolStats = engine.poolStats;
        asserts.assert(
          poolStats.total <= 2,
          `Pool size should be <= 2, got ${poolStats.total}`,
        );

        // Create transactions to exhaust pool (2 connections held)
        const tx1 = await engine.beginTransaction();
        const tx2 = await engine.beginTransaction();

        // Check pool stats - should have limited idle connections
        poolStats = engine.poolStats;
        asserts.assert(
          poolStats.active >= 2,
          `Should have at least 2 active connections, got ${poolStats.active}`,
        );

        // Release transactions
        await engine.commitTransaction(tx1);
        await engine.commitTransaction(tx2);

        await engine.disconnect();
      });
    });

    await t.step('event emissions', async (u) => {
      await u.step('should emit all query events', async () => {
        const engine = new PostgresEngine('test-db', TEST_CONFIG);
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
        const engine = new PostgresEngine('test-db', TEST_CONFIG);
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
        const engine = new PostgresEngine('test-db', TEST_CONFIG);
        await engine.connect();

        const result = await engine.ping();
        asserts.assertEquals(result, true);

        await engine.disconnect();
      });

      await u.step('should auto-connect on ping', async () => {
        const engine = new PostgresEngine('test-db', TEST_CONFIG);

        asserts.assertEquals(engine.status, 'CLOSED');
        const result = await engine.ping();
        asserts.assertEquals(result, true);
        asserts.assertEquals(engine.status, 'READY');

        await engine.disconnect();
      });

      await u.step('should return false on ping failure', async () => {
        class FailingPingPostgres extends PostgresEngine {
          protected override async _connect(): Promise<void> {
            // Force READY so ping attempts an execute
            // @ts-ignore
            this._status = 'READY';
          }
          protected override async _execute(): Promise<
            { data: any[]; count: number }
          > {
            throw new Error('forced');
          }
          protected override async _disconnect(): Promise<void> {
            // No actual connection to close
          }
        }
        const engine = new FailingPingPostgres(
          'fail-ping',
          { database: 'x', username: 'u' } as any,
        );
        const ok = await engine.ping();
        asserts.assertEquals(ok, false);
        await engine.disconnect();
      });
    });

    await t.step('error branches', async (u) => {
      await u.step('should release client on begin failure', async () => {
        const engine = new PostgresEngine(
          'fail-begin',
          { database: 'x', username: 'u' } as any,
        );
        // Inject mock pool with failing BEGIN
        // Force READY so beginTransaction uses existing mock pool
        // @ts-ignore
        (engine as any)._status = 'READY';
        (engine as any)._client = {
          connect: async () => ({
            queryArray: async () => {
              throw new Error('boom');
            },
            release: () => {},
          }),
          end: async () => {},
        };
        await asserts.assertRejects(() => engine.beginTransaction());
        // Transaction map should remain empty
        asserts.assertEquals((engine as any)._clientMap.size, 0);
        await engine.disconnect();
      });

      await u.step('should handle commit failure', async () => {
        const engine = new PostgresEngine(
          'fail-commit',
          { database: 'x', username: 'u' } as any,
        );
        // @ts-ignore
        (engine as any)._status = 'READY';
        const mockClient = {
          queryArray: async () => ({ rows: [] }),
          release: () => {},
        };
        (engine as any)._client = {
          connect: async () => mockClient,
          end: async () => {},
        };
        const txId = await engine.beginTransaction();
        // Make commit fail
        mockClient.queryArray = async () => {
          throw new Error('commit boom');
        };
        await asserts.assertRejects(() => engine.commitTransaction(txId));
        await engine.disconnect();
      });

      await u.step('should handle rollback failure', async () => {
        const engine = new PostgresEngine(
          'fail-rollback',
          { database: 'x', username: 'u' } as any,
        );
        // @ts-ignore
        (engine as any)._status = 'READY';
        const mockClient = {
          queryArray: async () => ({ rows: [] }),
          release: () => {},
        };
        (engine as any)._client = {
          connect: async () => mockClient,
          end: async () => {},
        };
        const txId = await engine.beginTransaction();
        // Make rollback fail
        mockClient.queryArray = async () => {
          throw new Error('rollback boom');
        };
        await asserts.assertRejects(() => engine.rollbackTransaction(txId));
        await engine.disconnect();
      });

      await u.step('should handle execute failure', async () => {
        const engine = new PostgresEngine(
          'fail-execute',
          { database: 'x', username: 'u' } as any,
        );
        // @ts-ignore
        (engine as any)._status = 'READY';
        (engine as any)._client = {
          connect: async () => ({
            queryArray: async () => {
              throw new Error('execute boom');
            },
            release: () => {},
          }),
          end: async () => {},
        };
        await asserts.assertRejects(() => engine.execute({ sql: 'SELECT 1' }));
        await engine.disconnect();
      });
    });
  },
});
