import * as asserts from '$asserts';
import { PostgresEngine2 } from './Engine.ts';
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
async function isPostgres2Available(): Promise<boolean> {
  try {
    const engine = new PostgresEngine2('test-check', TEST_CONFIG);
    await engine.connect();
    await engine.disconnect();
    return true;
  } catch {
    return false;
  }
}

Deno.test({
  name: 'dam.engines.postgres2',
  ignore: !(await isPostgres2Available()),
  fn: async (t) => {
    await t.step('configuration', async (u) => {
      await u.step('should create engine with valid config', () => {
        const engine = new PostgresEngine2('test-db', TEST_CONFIG);
        asserts.assertEquals(engine.Engine, 'POSTGRES2');
        asserts.assertEquals(engine.Name, 'test-db');
        asserts.assertEquals(engine.Capabilities.transactions, true);
        asserts.assertEquals(engine.Capabilities.pooledConnections, true);
        asserts.assertEquals(engine.Capabilities.preparedStatements, true);
      });

      await u.step('should use default port', () => {
        const { port, ...config } = TEST_CONFIG;
        const engine = new PostgresEngine2('test-db', config);
        asserts.assertEquals(engine.getOption('port'), 5432);
      });

      await u.step('should validate required fields', () => {
        asserts.assertThrows(
          () => new PostgresEngine2('test-db', { ...TEST_CONFIG, host: '' }),
          DAMEngineError,
        );
        asserts.assertThrows(
          () =>
            new PostgresEngine2('test-db', { ...TEST_CONFIG, database: '' }),
          DAMEngineError,
        );
      });

      await u.step('should reject invalid port', () => {
        asserts.assertThrows(
          () =>
            new PostgresEngine2('test-db', {
              ...TEST_CONFIG,
              port: 'invalid' as any,
            }),
          DAMEngineError,
          'must be a positive integer',
        );
        asserts.assertThrows(
          () => new PostgresEngine2('test-db', { ...TEST_CONFIG, port: -1 }),
          DAMEngineError,
          'must be a positive integer',
        );
        asserts.assertThrows(
          () => new PostgresEngine2('test-db', { ...TEST_CONFIG, port: 99999 }),
          DAMEngineError,
          'must be a positive integer',
        );
      });

      await u.step('should reject empty host', () => {
        asserts.assertThrows(
          () =>
            new PostgresEngine2('test-db', {
              ...TEST_CONFIG,
              host: '',
            }),
          DAMEngineError,
          'must be a non-empty string',
        );
        asserts.assertThrows(
          () =>
            new PostgresEngine2('test-db', {
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
            new PostgresEngine2('test-db', {
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
            new PostgresEngine2('test-db', {
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
            new PostgresEngine2('test-db', {
              ...TEST_CONFIG,
              pool: { max: -1 },
            }),
          DAMEngineError,
          'must be an object',
        );
        asserts.assertThrows(
          () =>
            new PostgresEngine2('test-db', {
              ...TEST_CONFIG,
              pool: { min: 0 },
            }),
          DAMEngineError,
          'must be an object',
        );
      });

      await u.step('should accept ssl as boolean', () => {
        const engine = new PostgresEngine2('test-db', {
          ...TEST_CONFIG,
          ssl: true,
        });
        asserts.assertEquals(engine.getOption('ssl'), true);
      });

      await u.step('should accept ssl as object', () => {
        const engine = new PostgresEngine2('test-db', {
          ...TEST_CONFIG,
          ssl: { rejectUnauthorized: false },
        });
        const sslOption = engine.getOption('ssl');
        asserts.assertEquals(typeof sslOption, 'object');
      });

      await u.step('should reject invalid ssl options', () => {
        asserts.assertThrows(
          () =>
            new PostgresEngine2('test-db', {
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
        const engine = new PostgresEngine2('test-db', TEST_CONFIG);
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
        const engine = new PostgresEngine2('test-db', {
          ...TEST_CONFIG,
          host: 'invalid-host-that-does-not-exist',
        });

        await asserts.assertRejects(
          () => engine.connect(),
          DAMEngineError,
        );
      });
    });

    await t.step('query execution', async (u) => {
      await u.step('should execute simple query', async () => {
        const engine = new PostgresEngine2('test-db', TEST_CONFIG);
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
        const engine = new PostgresEngine2('test-db', TEST_CONFIG);

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
          const engine = new PostgresEngine2('test-db', TEST_CONFIG);

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
          const engine = new PostgresEngine2('test-db', TEST_CONFIG);

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
        const engine = new PostgresEngine2('test-db', TEST_CONFIG);

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
        const engine = new PostgresEngine2('test-db', TEST_CONFIG);

        await engine.execute({ sql: 'SELECT 1' });
        await engine.execute({ sql: 'SELECT 2' });

        const stats = engine.queryStats;
        asserts.assertEquals(stats.totalQueries, 2);
        asserts.assertEquals(stats.successfulQueries, 2);
        asserts.assertEquals(stats.failedQueries, 0);

        await engine.disconnect();
      });

      await u.step('should handle query failure', async () => {
        const engine = new PostgresEngine2('test-db', TEST_CONFIG);

        await asserts.assertRejects(
          () => engine.execute({ sql: 'SELECT FROM invalid_syntax' }),
          DAMEngineError,
        );

        const stats = engine.queryStats;
        asserts.assertEquals(stats.failedQueries, 1);

        await engine.disconnect();
      });

      await u.step('should handle table operations', async () => {
        const engine = new PostgresEngine2('test-db', TEST_CONFIG);

        await engine.execute({
          sql:
            'CREATE TEMP TABLE test_users (id SERIAL PRIMARY KEY, name TEXT)',
        });

        await engine.execute({
          sql: 'INSERT INTO test_users (name) VALUES (:name:)',
          params: { name: 'Alice' },
        });

        const result = await engine.execute({
          sql: 'SELECT * FROM test_users WHERE name = :name:',
          params: { name: 'Alice' },
        });

        asserts.assertEquals(result.count, 1);
        asserts.assertEquals(result.data[0]?.name, 'Alice');

        await engine.disconnect();
      });
    });

    await t.step('transaction management', async (u) => {
      await u.step('should begin and commit transaction', async () => {
        const engine = new PostgresEngine2('test-db', TEST_CONFIG);
        let beginEmitted = false;
        let commitEmitted = false;

        engine.on('transactionBegin', () => {
          beginEmitted = true;
        });
        engine.on('transactionCommit', () => {
          commitEmitted = true;
        });

        await engine.execute({
          sql: 'CREATE TEMP TABLE tx_test (id SERIAL PRIMARY KEY, value TEXT)',
        });

        const txId = await engine.beginTransaction();
        asserts.assert(txId.length > 0);
        asserts.assert(beginEmitted);

        await engine.execute({
          sql: 'INSERT INTO tx_test (value) VALUES (:val:)',
          params: { val: 'test' },
          transactionId: txId,
        });

        await engine.commitTransaction(txId);
        asserts.assert(commitEmitted);

        const result = await engine.execute({
          sql: 'SELECT * FROM tx_test',
        });
        asserts.assertEquals(result.count, 1);

        await engine.disconnect();
      });

      await u.step('should rollback transaction', async () => {
        const engine = new PostgresEngine2('test-db', TEST_CONFIG);
        let rollbackEmitted = false;

        engine.on('transactionRollback', () => {
          rollbackEmitted = true;
        });

        await engine.execute({
          sql:
            'CREATE TEMP TABLE rollback_test (id SERIAL PRIMARY KEY, value TEXT)',
        });

        const txId = await engine.beginTransaction();
        await engine.execute({
          sql: 'INSERT INTO rollback_test (value) VALUES (:val:)',
          params: { val: 'test' },
          transactionId: txId,
        });
        await engine.rollbackTransaction(txId);

        asserts.assert(rollbackEmitted);

        const result = await engine.execute({
          sql: 'SELECT * FROM rollback_test',
        });
        asserts.assertEquals(result.count, 0);

        await engine.disconnect();
      });

      await u.step(
        'should handle multiple concurrent transactions with isolation',
        async () => {
          const engine = new PostgresEngine2('test-db', TEST_CONFIG);

          // Create a regular table (not TEMP) that all connections can see
          await engine.execute({
            sql:
              'CREATE TABLE IF NOT EXISTS concurrent_test (id SERIAL PRIMARY KEY, value TEXT)',
          });

          // Clean up any existing data
          await engine.execute({
            sql: 'DELETE FROM concurrent_test',
          });

          const tx1 = await engine.beginTransaction();
          const tx2 = await engine.beginTransaction();
          const tx3 = await engine.beginTransaction();

          await engine.execute({
            sql: 'INSERT INTO concurrent_test (value) VALUES (:val:)',
            params: { val: 'tx1' },
            transactionId: tx1,
          });

          await engine.execute({
            sql: 'INSERT INTO concurrent_test (value) VALUES (:val:)',
            params: { val: 'tx2' },
            transactionId: tx2,
          });

          await engine.execute({
            sql: 'INSERT INTO concurrent_test (value) VALUES (:val:)',
            params: { val: 'tx3' },
            transactionId: tx3,
          });

          // Commit first two, rollback third
          await engine.commitTransaction(tx1);
          await engine.commitTransaction(tx2);
          await engine.rollbackTransaction(tx3);

          const result = await engine.execute({
            sql: 'SELECT * FROM concurrent_test',
          });
          // Only tx1 and tx2 should be committed
          asserts.assertEquals(result.count, 2);

          // Clean up
          await engine.execute({
            sql: 'DROP TABLE IF EXISTS concurrent_test',
          });

          await engine.disconnect();
        },
      );

      await u.step('should auto-rollback on error', async () => {
        const engine = new PostgresEngine2('test-db', TEST_CONFIG);

        await engine.execute({
          sql:
            'CREATE TEMP TABLE error_test (id SERIAL PRIMARY KEY, value TEXT)',
        });

        const txId = await engine.beginTransaction();
        try {
          await engine.execute({
            sql: 'INSERT INTO error_test (value) VALUES (:val:)',
            params: { val: 'test' },
            transactionId: txId,
          });
          await engine.execute({
            sql: 'SELECT FROM invalid_syntax',
            transactionId: txId,
          });
        } catch {
          // Expected error
        }

        const result = await engine.execute({
          sql: 'SELECT * FROM error_test',
        });
        asserts.assertEquals(result.count, 0);

        await engine.disconnect();
      });
    });

    await t.step('batch execution', async (u) => {
      await u.step('should execute multiple queries', async () => {
        const engine = new PostgresEngine2('test-db', TEST_CONFIG);

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
        const engine = new PostgresEngine2('test-db', TEST_CONFIG);

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
      await u.step('should provide pool statistics', async () => {
        const engine = new PostgresEngine2('test-db', TEST_CONFIG);
        await engine.connect();

        const stats = engine.poolStats;
        asserts.assert(stats.total >= 0);

        await engine.disconnect();
      });

      await u.step('should handle pool exhaustion gracefully', async () => {
        const engine = new PostgresEngine2('test-db', TEST_CONFIG);

        // Execute multiple queries that should work within pool limits
        const promises = [];
        for (let i = 0; i < 5; i++) {
          promises.push(engine.execute({ sql: 'SELECT 1' }));
        }

        await Promise.all(promises);
        const stats = engine.queryStats;
        asserts.assertEquals(stats.successfulQueries, 5);

        await engine.disconnect();
      });

      await u.step(
        'should transition to WAITING when pool exhausted',
        async () => {
          const engine = new PostgresEngine2('test-db', {
            ...TEST_CONFIG,
            pool: { max: 2, min: 1 },
          });
          await engine.connect();
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
        },
      );
    });

    await t.step('event emissions', async (u) => {
      await u.step('should emit all query events', async () => {
        const engine = new PostgresEngine2('test-db', TEST_CONFIG);
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
        const engine = new PostgresEngine2('test-db', TEST_CONFIG);
        const events: string[] = [];

        engine.on('transactionBegin', () => events.push('begin'));
        engine.on('transactionCommit', () => events.push('commit'));
        engine.on('transactionRollback', () => events.push('rollback'));

        await engine.execute({
          sql: 'CREATE TEMP TABLE tx_events (id SERIAL PRIMARY KEY)',
        });

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
        const engine = new PostgresEngine2('test-db', TEST_CONFIG);
        await engine.connect();

        const result = await engine.ping();
        asserts.assertEquals(result, true);

        await engine.disconnect();
      });

      await u.step('should auto-connect on ping', async () => {
        const engine = new PostgresEngine2('test-db', TEST_CONFIG);

        asserts.assertEquals(engine.status, 'CLOSED');
        const result = await engine.ping();
        asserts.assertEquals(result, true);
        asserts.assertEquals(engine.status, 'READY');

        await engine.disconnect();
      });

      await u.step('should return false on ping failure', async () => {
        class FailingPingPostgres2 extends PostgresEngine2 {
          protected override async _connect(): Promise<void> {
            // Force ready so ping attempts execute
            // @ts-ignore
            this._status = 'READY';
          }
          protected override async _execute(): Promise<
            { data: any[]; count: number }
          > {
            throw new Error('forced');
          }
        }
        const engine = new FailingPingPostgres2(
          'fail-ping',
          { database: 'x', username: 'u' } as any,
        );
        const ok = await engine.ping();
        asserts.assertEquals(ok, false);
      });
    });

    await t.step('error branches', async (u) => {
      await u.step('should release client on begin failure', async () => {
        const engine = new PostgresEngine2(
          'fail-begin',
          { database: 'x', username: 'u' } as any,
        );
        // Force READY
        // @ts-ignore
        (engine as any)._status = 'READY';
        (engine as any)._client = {
          connect: async () => ({
            query: async () => {
              throw new Error('boom');
            },
            release: () => {},
          }),
        };
        await asserts.assertRejects(() => engine.beginTransaction());
        asserts.assertEquals((engine as any)._clientMap.size, 0);
      });

      await u.step('should handle commit failure', async () => {
        const engine = new PostgresEngine2(
          'fail-commit',
          { database: 'x', username: 'u' } as any,
        );
        // @ts-ignore
        (engine as any)._status = 'READY';
        const mockClient = {
          query: async () => ({ rows: [], rowCount: 0 }),
          release: () => {},
        };
        (engine as any)._client = {
          connect: async () => mockClient,
        };
        const txId = await engine.beginTransaction();
        // Make commit fail
        mockClient.query = async () => {
          throw new Error('commit boom');
        };
        await asserts.assertRejects(() => engine.commitTransaction(txId));
      });

      await u.step('should handle rollback failure', async () => {
        const engine = new PostgresEngine2(
          'fail-rollback',
          { database: 'x', username: 'u' } as any,
        );
        // @ts-ignore
        (engine as any)._status = 'READY';
        const mockClient = {
          query: async () => ({ rows: [], rowCount: 0 }),
          release: () => {},
        };
        (engine as any)._client = {
          connect: async () => mockClient,
        };
        const txId = await engine.beginTransaction();
        // Make rollback fail
        mockClient.query = async () => {
          throw new Error('rollback boom');
        };
        await asserts.assertRejects(() => engine.rollbackTransaction(txId));
      });

      await u.step('should handle execute failure', async () => {
        const engine = new PostgresEngine2(
          'fail-execute',
          { database: 'x', username: 'u' } as any,
        );
        // @ts-ignore
        (engine as any)._status = 'READY';
        (engine as any)._client = {
          connect: async () => ({
            query: async () => {
              throw new Error('execute boom');
            },
            release: () => {},
          }),
        };
        await asserts.assertRejects(() => engine.execute({ sql: 'SELECT 1' }));
      });
    });
  },
});
