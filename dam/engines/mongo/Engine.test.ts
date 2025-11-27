import * as asserts from '$asserts';
import { MongoDBEngine, type MongoDBEngineOptions } from './mod.ts';
import { DAMError } from '../../errors/mod.ts';
import { envArgs } from '@tundralibs/utils';

const env = envArgs('./dam/engines/');

// Test configuration with shorter timeouts for faster testing
const TEST_CONFIG = {
  host: env.get('MONGODB_HOST') || 'localhost',
  port: parseInt(env.get('MONGODB_PORT') || '27017'),
  username: env.get('MONGODB_USERNAME'),
  password: env.get('MONGODB_PASSWORD'),
  database: env.get('MONGODB_DATABASE') || 'test_dam',
  authSource: 'admin', // Required for Docker MongoDB root user
  connectionTimeout: 1, // 1 second for faster tests
  queryTimeout: 1, // 1 second for faster tests
};

Deno.test('dam.engines.mongodb', async (t) => {
  // Setup function creates a new engine instance each time to ensure test isolation
  const setupMongoDB = () => {
    return new MongoDBEngine('mongo-test', {
      host: env.get('MONGODB_HOST') || 'localhost',
      port: parseInt(env.get('MONGODB_PORT') || '27017'),
      database: env.get('MONGODB_DATABASE') || 'test_dam',
      username: env.get('MONGODB_USERNAME'), // Required for Docker setup
      password: env.get('MONGODB_PASSWORD'), // Required for Docker setup
      authSource: 'admin', // Required for Docker MongoDB root user
    });
  };

  const teardownMongoDB = async (engine?: MongoDBEngine) => {
    if (engine) {
      try {
        // Clean up test collection
        if (engine.status === 'IDLE') {
          await engine.execute({
            sql: 'deleteMany',
            collection: 'test_users',
            data: {},
          }).catch(() => {}); // Ignore errors during cleanup
        }
        await engine.close();

        // Clear any remaining health monitoring intervals to prevent resource leaks
        // Access the private property using type assertion if needed
        const engineAny = engine as any;
        if (engineAny._healthCheckInterval) {
          clearInterval(engineAny._healthCheckInterval);
          engineAny._healthCheckInterval = undefined;
        }

        // Give more time for MongoDB driver to clean up internal timers and connections
        await new Promise((resolve) => setTimeout(resolve, 200));
      } catch {
        // Ignore errors during teardown
      }
    }
  };

  await t.step('Constructor and Basic Properties', async (t) => {
    await t.step('should create MongoDBEngine with valid configuration', () => {
      const engine = setupMongoDB();
      asserts.assertInstanceOf(engine, MongoDBEngine);
      asserts.assertEquals(engine.Engine, 'MongoDB');
      asserts.assertEquals(engine.name, 'mongo-test');
      asserts.assertEquals(
        engine.instanceId.includes('MongoDB::mongo-test::'),
        true,
      ); // Contains engine, name and instanceId
      asserts.assertEquals(engine.status, 'CLOSED');
    });

    await t.step('should reject invalid configuration - no host', () => {
      asserts.assertThrows(
        () => {
          new MongoDBEngine('test', {} as MongoDBEngineOptions);
        },
        Error,
        'MongoDB host and database are required',
      );
    });

    await t.step('should reject invalid configuration - no database', () => {
      asserts.assertThrows(
        () => {
          new MongoDBEngine('test', {
            host: 'localhost',
          } as MongoDBEngineOptions);
        },
        Error,
        'MongoDB host and database are required',
      );
    });

    await t.step('should handle engine name parsing', () => {
      const engine1 = new MongoDBEngine('simple-name', {
        host: 'localhost',
        database: 'test',
      });
      asserts.assertEquals(engine1.name, 'simple-name');

      const engine2 = new MongoDBEngine('complex::instance-id', {
        host: 'localhost',
        database: 'test',
      });
      asserts.assertEquals(engine2.name, 'complex');
      asserts.assertEquals(engine2.instanceId.includes('instance-id'), true);
    });
  });

  await t.step('Connection Management', async (t) => {
    await t.step('should successfully connect to MongoDB', async () => {
      const engine = setupMongoDB();

      asserts.assertEquals(engine.status, 'CLOSED');
      await engine.connect();
      asserts.assertEquals(engine.status, 'IDLE');

      await teardownMongoDB(engine);
    });

    await t.step(
      'should handle connection failure with invalid host',
      async () => {
        const engine = new MongoDBEngine('test-invalid', {
          host: 'invalid-host-12345',
          port: 99999,
          database: 'test',
        });

        await asserts.assertRejects(
          () => engine.connect(),
          Error, // DAMEngineError extends Error
        );

        await engine.close().catch(() => {}); // Clean up
      },
    );

    await t.step('should handle graceful disconnection', async () => {
      const engine = setupMongoDB();
      await engine.connect();
      asserts.assertEquals(engine.status, 'IDLE');

      await engine.close();
      asserts.assertEquals(engine.status, 'CLOSED');
    });

    await t.step('should handle multiple connection attempts', async () => {
      const engine = setupMongoDB();

      await engine.connect();
      asserts.assertEquals(engine.status, 'IDLE');

      // Second connect should throw ENGINE_ALREADY_CONNECTED
      await asserts.assertRejects(
        () => engine.connect(),
        Error, // DAMEngineError extends Error
        'Engine MongoDB::mongo-test is already connected',
      );

      await teardownMongoDB(engine);
    });

    await t.step('should handle multiple disconnection attempts', async () => {
      const engine = setupMongoDB();
      await engine.connect();

      await engine.close();
      asserts.assertEquals(engine.status, 'CLOSED');

      // Second close should be safe
      await engine.close();
      asserts.assertEquals(engine.status, 'CLOSED');
    });
  });

  await t.step('Status Management', async (t) => {
    await t.step('should report correct status when connected', async () => {
      const engine = setupMongoDB();
      asserts.assertEquals(engine.status, 'CLOSED');

      await engine.connect();
      asserts.assertEquals(engine.status, 'IDLE');

      await teardownMongoDB(engine);
      asserts.assertEquals(engine.status, 'CLOSED');
    });

    await t.step('should report healthy status when connected', async () => {
      const engine = setupMongoDB();
      await engine.connect();

      const health = engine.healthStatus;
      asserts.assertEquals(health.isHealthy, true);
      asserts.assertEquals(health.consecutiveErrors, 0);

      await teardownMongoDB(engine);
    });
  });

  await t.step('Document Operations', async (t) => {
    await t.step('should execute find operation', async () => {
      const engine = setupMongoDB();
      await engine.connect();

      // Clear any existing test data first
      await engine.execute({
        sql: 'deleteMany',
        collection: 'test_users',
        data: {},
      }).catch(() => {}); // Ignore errors if collection doesn't exist

      // Insert test data first
      await engine.execute({
        sql: 'insertMany',
        collection: 'test_users',
        data: [
          { name: 'John Doe', email: 'john@example.com', age: 30 },
          { name: 'Jane Smith', email: 'jane@example.com', age: 25 },
        ],
      });

      const result = await engine.execute({
        sql: 'find',
        collection: 'test_users',
        data: { age: { $gte: 25 } },
      });

      asserts.assertEquals(result.data.length, 2);
      asserts.assertEquals(result.count, 2);

      await teardownMongoDB(engine);
    });

    await t.step('should execute findOne operation', async () => {
      const engine = setupMongoDB();
      await engine.connect();

      await engine.execute({
        sql: 'insertOne',
        collection: 'test_users',
        data: { name: 'Single User', email: 'single@example.com' },
      });

      const result = await engine.execute({
        sql: 'findOne',
        collection: 'test_users',
        data: { name: 'Single User' },
      });

      asserts.assertEquals(result.data.length, 1);
      asserts.assertEquals(result.count, 1);
      asserts.assert(result.data[0]);
      asserts.assertEquals(result.data[0].name, 'Single User');

      await teardownMongoDB(engine);
    });

    await t.step('should execute insertOne operation', async () => {
      const engine = setupMongoDB();
      await engine.connect();

      const result = await engine.execute({
        sql: 'insertOne',
        collection: 'test_users',
        data: { name: 'New User', email: 'new@example.com' },
      });

      asserts.assertEquals(result.count, 1);

      // Verify insertion
      const findResult = await engine.execute({
        sql: 'findOne',
        collection: 'test_users',
        data: { name: 'New User' },
      });
      asserts.assert(findResult.data[0]);
      asserts.assertEquals(findResult.data[0].name, 'New User');

      await teardownMongoDB(engine);
    });

    await t.step('should execute insertMany operation', async () => {
      const engine = setupMongoDB();
      await engine.connect();

      // Clear any existing test data first
      await engine.execute({
        sql: 'deleteMany',
        collection: 'test_users',
        data: {},
      }).catch(() => {}); // Ignore errors if collection doesn't exist

      const result = await engine.execute({
        sql: 'insertMany',
        collection: 'test_users',
        data: [
          { name: 'User 1', email: 'user1@example.com' },
          { name: 'User 2', email: 'user2@example.com' },
          { name: 'User 3', email: 'user3@example.com' },
        ],
      });

      asserts.assertEquals(result.count, 3);

      // Verify insertion
      const findResult = await engine.execute({
        sql: 'find',
        collection: 'test_users',
        data: {},
      });
      asserts.assertEquals(findResult.count, 3);

      await teardownMongoDB(engine);
    });

    await t.step('should execute updateOne operation', async () => {
      const engine = setupMongoDB();
      await engine.connect();

      // Clear any existing test data first
      await engine.execute({
        sql: 'deleteMany',
        collection: 'test_users',
        data: {},
      }).catch(() => {}); // Ignore errors if collection doesn't exist

      // Insert test data
      await engine.execute({
        sql: 'insertOne',
        collection: 'test_users',
        data: { name: 'Old Name', email: 'old@example.com' },
      });

      const result = await engine.execute({
        sql: 'updateOne',
        collection: 'test_users',
        data: { $set: { name: 'New Name' } },
        options: { filter: { email: 'old@example.com' } },
      });

      asserts.assertEquals(result.count, 1);

      // Verify update
      const findResult = await engine.execute({
        sql: 'findOne',
        collection: 'test_users',
        data: { email: 'old@example.com' },
      });
      asserts.assert(findResult.data[0]);
      asserts.assertEquals(findResult.data[0].name, 'New Name');

      await teardownMongoDB(engine);
    });

    await t.step('should execute updateMany operation', async () => {
      const engine = setupMongoDB();
      await engine.connect();

      // Insert test data
      await engine.execute({
        sql: 'insertMany',
        collection: 'test_users',
        data: [
          { status: 'inactive', category: 'user' },
          { status: 'inactive', category: 'user' },
          { status: 'active', category: 'admin' },
        ],
      });

      const result = await engine.execute({
        sql: 'updateMany',
        collection: 'test_users',
        data: { $set: { status: 'active' } },
        options: { filter: { category: 'user' } },
      });

      asserts.assertEquals(result.count, 2);

      await teardownMongoDB(engine);
    });

    await t.step('should execute deleteOne operation', async () => {
      const engine = setupMongoDB();
      await engine.connect();

      // Clear any existing test data first
      await engine.execute({
        sql: 'deleteMany',
        collection: 'test_users',
        data: {},
      }).catch(() => {}); // Ignore errors if collection doesn't exist

      // Insert test data
      await engine.execute({
        sql: 'insertMany',
        collection: 'test_users',
        data: [
          { name: 'Delete Me', type: 'temp' },
          { name: 'Keep Me', type: 'permanent' },
        ],
      });

      const result = await engine.execute({
        sql: 'deleteOne',
        collection: 'test_users',
        data: { type: 'temp' },
      });

      asserts.assertEquals(result.count, 1);

      // Verify deletion
      const findResult = await engine.execute({
        sql: 'find',
        collection: 'test_users',
        data: {},
      });
      asserts.assertEquals(findResult.count, 1);
      asserts.assert(findResult.data[0]);
      asserts.assertEquals(findResult.data[0].type, 'permanent');

      await teardownMongoDB(engine);
    });

    await t.step('should execute deleteMany operation', async () => {
      const engine = setupMongoDB();
      await engine.connect();

      // Clear any existing test data first
      await engine.execute({
        sql: 'deleteMany',
        collection: 'test_users',
        data: {},
      }).catch(() => {}); // Ignore errors if collection doesn't exist

      // Insert test data
      await engine.execute({
        sql: 'insertMany',
        collection: 'test_users',
        data: [
          { status: 'deleted', name: 'User 1' },
          { status: 'deleted', name: 'User 2' },
          { status: 'active', name: 'User 3' },
        ],
      });

      const result = await engine.execute({
        sql: 'deleteMany',
        collection: 'test_users',
        data: { status: 'deleted' },
      });

      asserts.assertEquals(result.count, 2);

      // Verify deletion
      const findResult = await engine.execute({
        sql: 'find',
        collection: 'test_users',
        data: {},
      });
      asserts.assertEquals(findResult.count, 1);

      await teardownMongoDB(engine);
    });

    await t.step('should execute countDocuments operation', async () => {
      const engine = setupMongoDB();
      await engine.connect();

      // Clear any existing test data first
      await engine.execute({
        sql: 'deleteMany',
        collection: 'test_users',
        data: {},
      }).catch(() => {}); // Ignore errors if collection doesn't exist

      // Insert test data
      await engine.execute({
        sql: 'insertMany',
        collection: 'test_users',
        data: [
          { category: 'premium', active: true },
          { category: 'premium', active: false },
          { category: 'basic', active: true },
        ],
      });

      const result = await engine.execute({
        sql: 'countDocuments',
        collection: 'test_users',
        data: { category: 'premium' },
      });

      asserts.assertEquals(result.count, 1);
      asserts.assert(result.data[0]);
      asserts.assertEquals(result.data[0].count, 2);

      await teardownMongoDB(engine);
    });
  });

  await t.step('Error Handling', async (t) => {
    await t.step(
      'should auto-connect and execute query successfully',
      async () => {
        const engine = setupMongoDB();
        // Test auto-connect feature - engine should connect automatically when executing a query

        const result = await engine.execute({
          sql: 'find',
          collection: 'test_users',
          data: {},
        });

        asserts.assertExists(result);
        asserts.assertExists(result.data);
        asserts.assertEquals(Array.isArray(result.data), true);

        await teardownMongoDB(engine);
      },
    );

    await t.step('should handle unsupported operations', async () => {
      const engine = setupMongoDB();
      await engine.connect();

      await asserts.assertRejects(
        () =>
          engine.execute({
            sql: 'unsupported_operation' as any,
            collection: 'test',
            data: {},
          }),
        DAMError,
        'Unsupported MongoDB operation',
      );

      await teardownMongoDB(engine);
    });

    await t.step('should handle insert operation without data', async () => {
      const engine = setupMongoDB();
      await engine.connect();

      await asserts.assertRejects(
        () =>
          engine.execute({
            sql: 'insertOne',
            collection: 'test_users',
            data: undefined,
          }),
        DAMError,
        'Insert operation requires data',
      );

      await teardownMongoDB(engine);
    });

    await t.step('should handle update operation without data', async () => {
      const engine = setupMongoDB();
      await engine.connect();

      await asserts.assertRejects(
        () =>
          engine.execute({
            sql: 'updateOne',
            collection: 'test_users',
            data: undefined,
            options: { filter: { _id: 'test' } },
          }),
        DAMError,
        'Update operation requires data',
      );

      await teardownMongoDB(engine);
    });
  });

  await t.step('Transaction Support', async (t) => {
    await t.step(
      'should throw OPERATION_NOT_SUPPORTED for beginTransaction',
      async () => {
        const engine = setupMongoDB();
        await engine.connect();

        await asserts.assertRejects(
          () => engine.begin(),
          Error, // DAMEngineError extends Error
          'Operation transactions not supported',
        );

        await teardownMongoDB(engine);
      },
    );
  });
});
