import * as asserts from '$asserts';
import { MongoEngine } from './Engine.ts';
import { DAMEngineError } from '../../engine/mod.ts';
import { envArgs } from '@tundralibs/utils';

const env = envArgs('./dam/engines/');
// Test configuration from environment variables with defaults
const TEST_CONFIG = {
  host: env.get('MONGODB_HOST') || 'localhost',
  port: Number.parseInt(env.get('MONGODB_PORT') || '27017'),
  database: env.get('MONGODB_DATABASE') || 'mongo',
  username: env.get('MONGODB_USERNAME') || 'mongo',
  password: env.get('MONGODB_PASSWORD') || 'mongo',
};

// Check if MongoDB is available
async function isMongoAvailable(): Promise<boolean> {
  try {
    const engine = new MongoEngine('test-check', TEST_CONFIG);
    await engine.connect();
    await engine.disconnect();
    return true;
  } catch (e) {
    console.log('MongoDB not available, skipping tests.', TEST_CONFIG);
    console.log(e);
    return false;
  }
}

Deno.test({
  name: 'dam.engines.mongo',
  ignore: !(await isMongoAvailable()),
  fn: async (t) => {
    // Clean up all test collections before running tests
    const cleanupEngine = new MongoEngine('cleanup', TEST_CONFIG);
    await cleanupEngine.connect();
    const testCollections = [
      'test_users',
      'test_sales',
      'test_batch',
      'test_pool',
      'test_events',
      'test_tx',
    ];
    for (const collection of testCollections) {
      try {
        await cleanupEngine.execute({
          sql: 'delete',
          collection: collection,
          filter: {},
          options: { multiple: true },
        });
      } catch {
        // Collection might not exist, ignore
      }
    }
    await cleanupEngine.disconnect();

    await t.step('configuration', async (u) => {
      await u.step('should create engine with valid config', () => {
        const engine = new MongoEngine('test-db', TEST_CONFIG);
        asserts.assertEquals(engine.Engine, 'MONGO');
        asserts.assertEquals(engine.Name, 'test-db');
        asserts.assertEquals(engine.Capabilities.transactions, false);
        asserts.assertEquals(engine.Capabilities.pooledConnections, true);
        asserts.assertEquals(
          engine.Capabilities.parameterReplacement,
          undefined,
        );
      });

      await u.step('should use default port', () => {
        const { port, ...config } = TEST_CONFIG;
        const engine = new MongoEngine('test-db', config);
        asserts.assertEquals(engine.getOption('port'), 27017);
      });

      await u.step('should validate required fields', () => {
        asserts.assertThrows(
          () => new MongoEngine('test-db', { ...TEST_CONFIG, host: '' }),
          DAMEngineError,
        );
        asserts.assertThrows(
          () => new MongoEngine('test-db', { ...TEST_CONFIG, database: '' }),
          DAMEngineError,
        );
      });

      await u.step('should reject invalid port', () => {
        asserts.assertThrows(
          () =>
            new MongoEngine('test-db', {
              ...TEST_CONFIG,
              port: 'invalid' as any,
            }),
          DAMEngineError,
          'must be a positive integer',
        );
        asserts.assertThrows(
          () => new MongoEngine('test-db', { ...TEST_CONFIG, port: -1 }),
          DAMEngineError,
          'must be a positive integer',
        );
        asserts.assertThrows(
          () => new MongoEngine('test-db', { ...TEST_CONFIG, port: 99999 }),
          DAMEngineError,
          'must be a positive integer',
        );
      });

      await u.step('should reject empty host', () => {
        asserts.assertThrows(
          () =>
            new MongoEngine('test-db', {
              ...TEST_CONFIG,
              host: '',
            }),
          DAMEngineError,
          'must be a non-empty string',
        );
        asserts.assertThrows(
          () =>
            new MongoEngine('test-db', {
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
            new MongoEngine('test-db', {
              ...TEST_CONFIG,
              database: '',
            }),
          DAMEngineError,
          'must be a non-empty string',
        );
      });

      await u.step('should reject empty username when provided', () => {
        asserts.assertThrows(
          () =>
            new MongoEngine('test-db', {
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
            new MongoEngine('test-db', {
              ...TEST_CONFIG,
              pool: { max: -1 },
            }),
          DAMEngineError,
          'must be an object',
        );
        asserts.assertThrows(
          () =>
            new MongoEngine('test-db', {
              ...TEST_CONFIG,
              pool: { min: 0 },
            }),
          DAMEngineError,
          'must be an object',
        );
      });

      await u.step('should accept ssl as boolean', () => {
        const engine = new MongoEngine('test-db', {
          ...TEST_CONFIG,
          ssl: true,
        });
        asserts.assertEquals(engine.getOption('ssl'), true);
      });

      await u.step('should accept ssl as object', () => {
        const engine = new MongoEngine('test-db', {
          ...TEST_CONFIG,
          ssl: { rejectUnauthorized: false },
        });
        const sslOption = engine.getOption('ssl');
        asserts.assertEquals(typeof sslOption, 'object');
      });

      await u.step('should reject invalid ssl options', () => {
        asserts.assertThrows(
          () =>
            new MongoEngine('test-db', {
              ...TEST_CONFIG,
              ssl: 'invalid' as any,
            }),
          DAMEngineError,
          'must be a boolean or an object',
        );
      });

      await u.step('should accept valid authSource', () => {
        const engine = new MongoEngine('test-db', {
          ...TEST_CONFIG,
          authSource: 'admin',
        });
        asserts.assertEquals(engine.getOption('authSource'), 'admin');
      });
    });

    await t.step('connection management', async (u) => {
      await u.step('should connect and disconnect', async () => {
        const engine = new MongoEngine('test-db', TEST_CONFIG);
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

      // NOTE: This test is disabled because the MongoDB driver's DNS lookup
      // operation cannot be cancelled once started, causing resource leaks
      // in Deno's leak detector when testing with invalid hostnames.
      // await u.step('should handle connection failure', async () => {
      //   const engine = new MongoEngine('test-db', {
      //     ...TEST_CONFIG,
      //     host: 'invalid-host-that-does-not-exist',
      //   });

      //   try {
      //     await asserts.assertRejects(
      //       () => engine.connect(),
      //       DAMEngineError,
      //     );
      //   } finally {
      //     // Ensure cleanup even if connection attempt fails
      //     await engine.disconnect().catch(() => {
      //       // Ignore errors during cleanup of failed connection
      //     });
      //   }
      // });
    });

    await t.step('query execution', async (u) => {
      await u.step('should execute insert action', async () => {
        const engine = new MongoEngine('test-db', TEST_CONFIG);
        let queryEmitted = false;

        engine.on('query', () => {
          queryEmitted = true;
        });

        // Insert a document
        const result = await engine.execute({
          sql: 'insert',
          collection: 'test_users',
          data: { name: 'Alice', age: 30, email: 'alice@example.com' },
        });

        asserts.assert(result.count > 0);
        asserts.assert(queryEmitted);

        // Clean up
        await engine.execute({
          sql: 'delete',
          collection: 'test_users',
          filter: { name: 'Alice' },
        });

        await engine.disconnect();
      });

      await u.step('should execute find action', async () => {
        const engine = new MongoEngine('test-db', TEST_CONFIG);

        // Insert test data
        await engine.execute({
          sql: 'insert',
          collection: 'test_users',
          data: { name: 'Bob', age: 25, email: 'bob@example.com' },
        });

        // Find the document
        const result = await engine.execute({
          sql: 'find',
          collection: 'test_users',
          filter: { name: 'Bob' },
        });

        asserts.assertEquals(result.count, 1);
        asserts.assertEquals(result.data[0]?.name, 'Bob');
        asserts.assertEquals(result.data[0]?.age, 25);

        // Clean up
        await engine.execute({
          sql: 'delete',
          collection: 'test_users',
          filter: { name: 'Bob' },
        });

        await engine.disconnect();
      });

      await u.step('should execute find with complex filter', async () => {
        const engine = new MongoEngine('test-db', TEST_CONFIG);

        // Clean up old data first
        await engine.execute({
          sql: 'delete',
          collection: 'test_users',
          filter: {},
          options: { multiple: true },
        });

        // Insert test data
        await engine.execute({
          sql: 'insert',
          collection: 'test_users',
          data: [
            { name: 'Charlie', age: 35, city: 'NYC' },
            { name: 'David', age: 22, city: 'LA' },
            { name: 'Eve', age: 40, city: 'NYC' },
          ],
        });

        // Find with complex filter
        const result = await engine.execute({
          sql: 'find',
          collection: 'test_users',
          filter: { age: { $gte: 30 }, city: 'NYC' },
        });

        asserts.assertEquals(result.count, 2);
        asserts.assert(
          result.data.every((d: any) => d.age >= 30 && d.city === 'NYC'),
        );

        // Clean up
        await engine.execute({
          sql: 'delete',
          collection: 'test_users',
          filter: { name: { $in: ['Charlie', 'David', 'Eve'] } },
        });

        await engine.disconnect();
      });

      await u.step('should execute update action', async () => {
        const engine = new MongoEngine('test-db', TEST_CONFIG);

        // Insert test data
        await engine.execute({
          sql: 'insert',
          collection: 'test_users',
          data: { name: 'Frank', age: 28, status: 'active' },
        });

        // Update the document
        const result = await engine.execute({
          sql: 'update',
          collection: 'test_users',
          filter: { name: 'Frank' },
          data: { $set: { age: 29, status: 'inactive' } },
        });

        asserts.assert(result.count > 0);

        // Verify update
        const verify = await engine.execute({
          sql: 'find',
          collection: 'test_users',
          filter: { name: 'Frank' },
        });
        asserts.assertEquals(verify.data[0]?.age, 29);
        asserts.assertEquals(verify.data[0]?.status, 'inactive');

        // Clean up
        await engine.execute({
          sql: 'delete',
          collection: 'test_users',
          filter: { name: 'Frank' },
        });

        await engine.disconnect();
      });

      await u.step('should execute delete action', async () => {
        const engine = new MongoEngine('test-db', TEST_CONFIG);

        // Insert test data
        await engine.execute({
          sql: 'insert',
          collection: 'test_users',
          data: { name: 'Grace', age: 33, temp: true },
        });

        // Delete the document
        const result = await engine.execute({
          sql: 'delete',
          collection: 'test_users',
          filter: { name: 'Grace' },
        });

        asserts.assert(result.count > 0);

        // Verify deletion
        const verify = await engine.execute({
          sql: 'find',
          collection: 'test_users',
          filter: { name: 'Grace' },
        });
        asserts.assertEquals(verify.count, 0);

        await engine.disconnect();
      });

      await u.step('should execute aggregate action', async () => {
        const engine = new MongoEngine('test-db', TEST_CONFIG);

        // Clean up old data first
        await engine.execute({
          sql: 'delete',
          collection: 'test_sales',
          filter: {},
          options: { multiple: true },
        });

        // Insert test data
        await engine.execute({
          sql: 'insert',
          collection: 'test_sales',
          data: [
            { product: 'A', amount: 100 },
            { product: 'B', amount: 200 },
            { product: 'A', amount: 150 },
          ],
        });

        // Aggregate
        const result = await engine.execute({
          sql: 'aggregate',
          collection: 'test_sales',
          pipeline: [
            { $group: { _id: '$product', total: { $sum: '$amount' } } },
            { $sort: { total: -1 } },
          ],
        });

        asserts.assertEquals(result.count, 2);
        asserts.assertEquals(result.data[0]?._id, 'A');
        asserts.assertEquals(result.data[0]?.total, 250);

        // Clean up
        await engine.execute({
          sql: 'delete',
          collection: 'test_sales',
          filter: {},
        });

        await engine.disconnect();
      });

      await u.step('should track query statistics', async () => {
        const engine = new MongoEngine('test-db', TEST_CONFIG);

        await engine.execute({
          sql: 'insert',
          collection: 'test_stats',
          data: { value: 1 },
        });
        await engine.execute({
          sql: 'find',
          collection: 'test_stats',
          filter: { value: 1 },
        });

        const stats = engine.queryStats;
        asserts.assertEquals(stats.totalQueries, 2);
        asserts.assertEquals(stats.successfulQueries, 2);
        asserts.assertEquals(stats.failedQueries, 0);

        // Clean up
        await engine.execute({
          sql: 'delete',
          collection: 'test_stats',
          filter: {},
        });

        await engine.disconnect();
      });

      await u.step(
        'should handle repeated field references in query',
        async () => {
          const engine = new MongoEngine('test-db', TEST_CONFIG);

          // Insert test data
          await engine.execute({
            sql: 'insert',
            collection: 'test_users',
            data: { name: 'TestUser', age: 32, status: 'active' },
          });

          // Find with filter that references same field multiple times
          const result = await engine.execute({
            sql: 'find',
            collection: 'test_users',
            filter: { name: 'TestUser', age: 32 },
          });

          asserts.assertEquals(result.count, 1);
          asserts.assertEquals(result.data[0]?.name, 'TestUser');
          asserts.assertEquals(result.data[0]?.age, 32);

          // Clean up
          await engine.execute({
            sql: 'delete',
            collection: 'test_users',
            filter: { name: 'TestUser' },
          });

          await engine.disconnect();
        },
      );

      await u.step('should handle query failure', async () => {
        const engine = new MongoEngine('test-db', TEST_CONFIG);

        await asserts.assertRejects(
          () =>
            engine.execute({
              sql: 'invalid_action',
              collection: 'test_users',
            }),
          DAMEngineError,
        );

        const stats = engine.queryStats;
        asserts.assertEquals(stats.failedQueries, 1);

        await engine.disconnect();
      });
    });

    await t.step('transaction management', async (u) => {
      await u.step(
        'should throw error when attempting transactions (disabled)',
        async () => {
          const engine = new MongoEngine('test-db', TEST_CONFIG);

          // Transactions are disabled in MongoDB engine
          await asserts.assertRejects(
            () => engine.beginTransaction(),
            DAMEngineError,
          );

          await engine.disconnect();
        },
      );

      await u.step(
        'should verify concurrent operations work without transactions',
        async () => {
          const engine = new MongoEngine('test-db', TEST_CONFIG);

          // Create test collection with initial data
          await engine.execute({
            sql: 'delete',
            collection: 'test_concurrent',
            filter: {},
            options: { multiple: true },
          });

          // Execute multiple operations concurrently
          await Promise.all([
            engine.execute({
              sql: 'insert',
              collection: 'test_concurrent',
              data: { id: 1, value: 'op1' },
            }),
            engine.execute({
              sql: 'insert',
              collection: 'test_concurrent',
              data: { id: 2, value: 'op2' },
            }),
            engine.execute({
              sql: 'insert',
              collection: 'test_concurrent',
              data: { id: 3, value: 'op3' },
            }),
          ]);

          // Verify all operations succeeded
          const result = await engine.execute({
            sql: 'find',
            collection: 'test_concurrent',
            filter: {},
          });
          asserts.assertEquals(result.count, 3);

          // Clean up
          await engine.execute({
            sql: 'delete',
            collection: 'test_concurrent',
            filter: {},
            options: { multiple: true },
          });

          await engine.disconnect();
        },
      );

      await u.step('should begin and commit transaction', async () => {
        // SKIPPED: Transactions disabled for MongoDB
        console.warn('Skipping test - MongoDB transactions disabled');
      });

      await u.step('should rollback transaction', async () => {
        // SKIPPED: Transactions disabled for MongoDB
        console.warn('Skipping test - MongoDB transactions disabled');
      });

      await u.step(
        'should handle multiple sequential transactions',
        async () => {
          // SKIPPED: Transactions disabled for MongoDB
          console.warn('Skipping test - MongoDB transactions disabled');
        },
      );

      await u.step('should auto-rollback on error', async () => {
        // SKIPPED: Transactions disabled for MongoDB
        console.warn('Skipping test - MongoDB transactions disabled');
      });
    });

    await t.step('batch execution', async (u) => {
      await u.step('should execute multiple queries', async () => {
        const engine = new MongoEngine('test-db', TEST_CONFIG);

        // Clean up old data first
        await engine.execute({
          sql: 'delete',
          collection: 'test_batch',
          filter: {},
          options: { multiple: true },
        });

        await engine.batchExecute([
          {
            sql: 'insert',
            collection: 'test_batch',
            data: { order: 1 },
          },
          {
            sql: 'insert',
            collection: 'test_batch',
            data: { order: 2 },
          },
          {
            sql: 'insert',
            collection: 'test_batch',
            data: { order: 3 },
          },
        ]);

        const stats = engine.queryStats;
        asserts.assertEquals(stats.successfulQueries, 4); // 1 delete + 3 inserts

        // Verify all inserts
        const result = await engine.execute({
          sql: 'find',
          collection: 'test_batch',
          filter: {},
        });
        asserts.assertEquals(result.count, 3);

        // Clean up
        await engine.execute({
          sql: 'delete',
          collection: 'test_batch',
          filter: {},
        });

        await engine.disconnect();
      });

      await u.step('should halt on first error', async () => {
        const engine = new MongoEngine('test-db', TEST_CONFIG);

        await asserts.assertRejects(
          () =>
            engine.batchExecute([
              {
                sql: 'insert',
                collection: 'test_batch',
                data: { order: 1 },
              },
              {
                sql: 'invalid_action',
                collection: 'test_batch',
              },
              {
                sql: 'insert',
                collection: 'test_batch',
                data: { order: 3 },
              },
            ]),
          DAMEngineError,
        );

        const stats = engine.queryStats;
        asserts.assertEquals(stats.successfulQueries, 1);
        asserts.assertEquals(stats.failedQueries, 1);

        // Clean up
        await engine.execute({
          sql: 'delete',
          collection: 'test_batch',
          filter: {},
        });

        await engine.disconnect();
      });
    });

    await t.step('pool management', async (u) => {
      await u.step('should provide pool statistics', async () => {
        const engine = new MongoEngine('test-db', TEST_CONFIG);
        await engine.connect();

        const stats = engine.poolStats;
        asserts.assert(stats.total >= 0);

        await engine.disconnect();
      });

      await u.step('should handle pool exhaustion gracefully', async () => {
        const engine = new MongoEngine('test-db', TEST_CONFIG);
        await engine.connect();

        // Execute multiple queries that should work within pool limits
        const promises = [];
        for (let i = 0; i < 5; i++) {
          promises.push(
            engine.execute({
              sql: 'find',
              collection: 'test_pool',
              filter: { id: i },
            }),
          );
        }

        await Promise.all(promises);
        const stats = engine.queryStats;
        asserts.assertEquals(stats.successfulQueries, 5);

        await engine.disconnect();
      });
    });

    await t.step('event emissions', async (u) => {
      await u.step('should emit all query events', async () => {
        const engine = new MongoEngine('test-db', TEST_CONFIG);
        const events: string[] = [];

        engine.on('connect', () => events.push('connect'));
        engine.on('query', () => events.push('query'));
        engine.on('disconnect', () => events.push('disconnect'));

        await engine.connect();
        await engine.execute({
          sql: 'insert',
          collection: 'test_events',
          data: { test: 1 },
        });
        await engine.disconnect();

        asserts.assert(events.includes('connect'));
        asserts.assert(events.includes('query'));
        asserts.assert(events.includes('disconnect'));
      });

      await u.step('should emit transaction events', async () => {
        // SKIPPED: Transactions disabled for MongoDB
        console.warn('Skipping test - MongoDB transactions disabled');
      });
    });

    await t.step('ping and health check', async (u) => {
      await u.step('should ping successfully when connected', async () => {
        const engine = new MongoEngine('test-db', TEST_CONFIG);
        await engine.connect();

        const result = await engine.ping();
        asserts.assertEquals(result, true);

        await engine.disconnect();
      });

      await u.step('should auto-connect on ping', async () => {
        const engine = new MongoEngine('test-db', TEST_CONFIG);

        asserts.assertEquals(engine.status, 'CLOSED');
        const result = await engine.ping();
        asserts.assertEquals(result, true);
        asserts.assertEquals(engine.status, 'READY');

        await engine.disconnect();
      });
    });

    // Additional internal branch coverage using mocked engine to avoid real DB dependency
    await t.step('internal branch coverage (mocked engine)', async (u) => {
      // Subclass to bypass real connection
      class BranchMongoEngine extends MongoEngine {
        protected override async _connect(): Promise<void> {
          // @ts-ignore access private
          this._db = mockDb as any;
          // @ts-ignore access private
          this._client = {} as any;
        }
      }
      // Minimal mock DB replicating behaviors needed for _execute routing
      class MockCollection<R> {
        constructor(private readonly docs: R[] = []) {}
        async insertOne(_doc: any) {
          return { insertedId: 'one', acknowledged: true };
        }
        async insertMany(arr: any[]) {
          return { insertedIds: { 0: 'a', 1: 'b' }, insertedCount: arr.length };
        }
        async findOne(_f: any) {
          return this.docs[0] ?? null;
        }
        find(filter: any) {
          return {
            async toArray() {
              return [...filter.__docs ?? []];
            },
          };
        }
        async updateOne() {
          return { modifiedCount: 1 };
        }
        async updateMany() {
          return { modifiedCount: 2 };
        }
        async deleteOne() {
          return { deletedCount: 1 };
        }
        async deleteMany() {
          return { deletedCount: 3 };
        }
        aggregate(_p: any) {
          return {
            async toArray() {
              return [{ agg: true }] as any;
            },
          };
        }
        async countDocuments() {
          return 42;
        }
        async distinct(field: string) {
          return field === 'value' ? ['x', 'y'] : [];
        }
      }
      const mockDb = {
        collection: <R>(_name: string) =>
          new MockCollection<R>([{ name: 'doc' } as any]) as any,
        admin() {
          return {
            async ping() {
              return { ok: 1 };
            },
          };
        },
      };

      const engine = new BranchMongoEngine('branch-test', { database: 'x' });

      await u.step('insert one vs many', async () => {
        const one = await engine.execute({
          sql: 'insert',
          collection: 'c',
          data: { a: 1 },
        });
        asserts.assertEquals(one.count, 1);
        const many = await engine.execute({
          sql: 'insert',
          collection: 'c',
          data: [{ a: 1 }, { b: 2 }],
        });
        asserts.assertEquals(many.count, 2);
      });
      await u.step('find one vs many', async () => {
        const f1 = await engine.execute({
          sql: 'find',
          collection: 'c',
          filter: {},
          options: { findOne: true },
        });
        asserts.assertEquals(f1.count, 1);
        const fm = await engine.execute({
          sql: 'find',
          collection: 'c',
          filter: {},
          options: {},
        });
        asserts.assertEquals(typeof fm.count, 'number');
      });
      await u.step('update one vs many (multiple & multi flags)', async () => {
        const u1 = await engine.execute({
          sql: 'update',
          collection: 'c',
          filter: {},
          data: { $set: { a: 2 } },
        });
        asserts.assertEquals(u1.count, 1);
        const um = await engine.execute({
          sql: 'update',
          collection: 'c',
          filter: {},
          data: { $set: { a: 3 } },
          options: { multiple: true },
        });
        asserts.assertEquals(um.count, 2);
        const um2 = await engine.execute({
          sql: 'update',
          collection: 'c',
          filter: {},
          data: { $set: { a: 4 } },
          options: { multi: true },
        });
        asserts.assertEquals(um2.count, 2);
      });
      await u.step('delete one vs many (multiple & multi flags)', async () => {
        const d1 = await engine.execute({
          sql: 'delete',
          collection: 'c',
          filter: {},
        });
        asserts.assertEquals(d1.count, 1);
        const dm = await engine.execute({
          sql: 'delete',
          collection: 'c',
          filter: {},
          options: { multiple: true },
        });
        asserts.assertEquals(dm.count, 3);
        const dm2 = await engine.execute({
          sql: 'delete',
          collection: 'c',
          filter: {},
          options: { multi: true },
        });
        asserts.assertEquals(dm2.count, 3);
      });
      await u.step('aggregate success and error', async () => {
        const ag = await engine.execute({
          sql: 'aggregate',
          collection: 'c',
          pipeline: [{ $match: {} }],
        });
        asserts.assertEquals(ag.count, 1);
        await asserts.assertRejects(
          () => engine.execute({ sql: 'aggregate', collection: 'c' }),
          DAMEngineError,
        );
      });
      await u.step('count & distinct success and errors', async () => {
        const cnt = await engine.execute({
          sql: 'count',
          collection: 'c',
          filter: {},
        });
        asserts.assertEquals(cnt.count, 42);
        const distinct = await engine.execute({
          sql: 'distinct',
          collection: 'c',
          field: 'value',
          filter: {},
        });
        asserts.assertEquals(distinct.count, 2);
        const distinctEmpty = await engine.execute({
          sql: 'distinct',
          collection: 'c',
          field: 'other',
          filter: {},
        });
        asserts.assertEquals(distinctEmpty.count, 0);
        await asserts.assertRejects(
          () => engine.execute({ sql: 'distinct', collection: 'c' }),
          DAMEngineError,
        );
      });
      await u.step('missing collection', async () => {
        await asserts.assertRejects(
          () => engine.execute({ sql: 'find' }),
          DAMEngineError,
        );
      });
      await u.step('unsupported action', async () => {
        await asserts.assertRejects(
          () => engine.execute({ sql: 'unsupported', collection: 'c' }),
          DAMEngineError,
        );
      });
      await u.step('transactions unsupported', () => {
        asserts.assertThrows(
          () => (engine as any)._beginTransaction('x'),
          DAMEngineError,
        );
        asserts.assertThrows(
          () => (engine as any)._commitTransaction('x'),
          DAMEngineError,
        );
        asserts.assertThrows(
          () => (engine as any)._rollbackTransaction('x'),
          DAMEngineError,
        );
      });
      await u.step('ping false and true branches', async () => {
        // @ts-ignore bypass private for test
        (engine as any)._db = null;
        asserts.assertEquals(await (engine as any)._ping(), false);
        // @ts-ignore restore
        (engine as any)._db = mockDb as any;
        asserts.assertEquals(await (engine as any)._ping(), true);
      });
      await u.step('_updatePoolStatus branches', () => {
        // @ts-ignore
        engine._status = 'CLOSED';
        (engine as any)._updatePoolStatus();
        asserts.assertEquals(engine.status, 'CLOSED');
        // @ts-ignore
        engine._status = 'CONNECTING';
        (engine as any)._updatePoolStatus();
        asserts.assertEquals(engine.status, 'CONNECTING');
        // @ts-ignore
        engine._client = {} as any;
        // @ts-ignore
        engine._status = 'OPEN';
        (engine as any)._updatePoolStatus();
        asserts.assertEquals(engine.status, 'READY');
      });
      await u.step('error propagation wraps underlying error', async () => {
        // @ts-ignore force failing collection with simple shape (no deep nesting)
        const failingCollection = {
          insertOne: () => {
            throw new Error('boom');
          },
        } as any;
        // @ts-ignore override _db
        const adminObj = { ping: async () => ({ ok: 1 }) } as any;
        (engine as any)._db = {
          collection: () => failingCollection,
          admin: () => adminObj,
        } as any;
        await asserts.assertRejects(
          () =>
            engine.execute({ sql: 'insert', collection: 'x', data: { a: 1 } }),
          DAMEngineError,
        );
      });
    });
  },
});
