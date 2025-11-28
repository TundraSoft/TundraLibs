import * as asserts from '$asserts';
import { SQLiteEngine } from './Engine.ts';
import { DAMEngineError } from '../../engine/mod.ts';

Deno.test({
  name: 'dam.engines.sqlite',
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async (t) => {
    // Create temporary directory for test databases
    const tempDir = await Deno.makeTempDir({ prefix: 'dam_sqlite_test_' });
    const TEST_DB_PATH = `${tempDir}/test.db`;

    // Cleanup function
    const cleanup = () => {
      try {
        Deno.removeSync(tempDir, { recursive: true });
      } catch {
        // Ignore cleanup errors
      }
    };

    await t.step('configuration', async (u) => {
      await u.step('should create engine with valid config', () => {
        const engine = new SQLiteEngine('test-db', {
          database: TEST_DB_PATH,
        });
        asserts.assertEquals(engine.Engine, 'SQLITE');
        asserts.assertEquals(engine.Name, 'test-db');
        asserts.assertEquals(engine.Capabilities.transactions, true);
        asserts.assertEquals(engine.Capabilities.pooledConnections, false);
        asserts.assertEquals(engine.Capabilities.preparedStatements, true);
      });

      await u.step('should create in-memory database', () => {
        const engine = new SQLiteEngine('test-db', {
          database: ':memory:',
        });
        asserts.assertEquals(engine.getOption('database'), ':memory:');
      });

      await u.step('should use default cache size', () => {
        const engine = new SQLiteEngine('test-db', {
          database: TEST_DB_PATH,
        });
        asserts.assertEquals(engine.getOption('cacheSize'), -64000);
      });

      await u.step('should validate required fields', () => {
        asserts.assertThrows(
          () => new SQLiteEngine('test-db', { database: '' }),
          DAMEngineError,
        );
      });
    });

    await t.step('connection management', async (u) => {
      await u.step('should connect and disconnect', async () => {
        const engine = new SQLiteEngine('test-db', {
          database: TEST_DB_PATH,
        });
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

      await u.step('should create database file', async () => {
        const engine = new SQLiteEngine('test-db', {
          database: TEST_DB_PATH,
        });

        await engine.connect();
        // Verify file exists by attempting to stat it
        const stat = await Deno.stat(TEST_DB_PATH);
        asserts.assert(stat.isFile);
        await engine.disconnect();
      });
    });

    await t.step('query execution', async (u) => {
      await u.step('should execute simple query', async () => {
        const engine = new SQLiteEngine('test-db', {
          database: TEST_DB_PATH,
        });
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
        const engine = new SQLiteEngine('test-db', {
          database: TEST_DB_PATH,
        });

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
          const engine = new SQLiteEngine('test-db', {
            database: TEST_DB_PATH,
          });

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
          const engine = new SQLiteEngine('test-db', {
            database: TEST_DB_PATH,
          });

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
        const engine = new SQLiteEngine('test-db', {
          database: TEST_DB_PATH,
        });

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
        const engine = new SQLiteEngine('test-db', {
          database: TEST_DB_PATH,
        });

        await engine.execute({ sql: 'SELECT 1' });
        await engine.execute({ sql: 'SELECT 2' });

        const stats = engine.queryStats;
        asserts.assertEquals(stats.totalQueries, 2);
        asserts.assertEquals(stats.successfulQueries, 2);
        asserts.assertEquals(stats.failedQueries, 0);

        await engine.disconnect();
      });

      await u.step('should handle query failure', async () => {
        const engine = new SQLiteEngine('test-db', {
          database: TEST_DB_PATH,
        });

        await asserts.assertRejects(
          () => engine.execute({ sql: 'SELECT FROM invalid_syntax' }),
          DAMEngineError,
        );

        const stats = engine.queryStats;
        asserts.assertEquals(stats.failedQueries, 1);

        await engine.disconnect();
      });

      await u.step('should handle table operations', async () => {
        const engine = new SQLiteEngine('test-db', {
          database: TEST_DB_PATH,
        });

        await engine.execute({
          sql: 'CREATE TABLE test_users (id INTEGER PRIMARY KEY, name TEXT)',
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
        const engine = new SQLiteEngine('test-db', {
          database: TEST_DB_PATH,
        });
        let beginEmitted = false;
        let commitEmitted = false;

        engine.on('transactionBegin', () => {
          beginEmitted = true;
        });
        engine.on('transactionCommit', () => {
          commitEmitted = true;
        });

        await engine.execute({
          sql: 'CREATE TABLE tx_test (id INTEGER PRIMARY KEY, value TEXT)',
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
        const engine = new SQLiteEngine('test-db', {
          database: TEST_DB_PATH,
        });
        let rollbackEmitted = false;

        engine.on('transactionRollback', () => {
          rollbackEmitted = true;
        });

        await engine.execute({
          sql:
            'CREATE TABLE rollback_test (id INTEGER PRIMARY KEY, value TEXT)',
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

      await u.step('should handle sequential transactions', async () => {
        const engine = new SQLiteEngine('test-db', {
          database: TEST_DB_PATH,
        });

        await engine.execute({
          sql: 'CREATE TABLE seq_test (id INTEGER PRIMARY KEY, value TEXT)',
        });

        const tx1 = await engine.beginTransaction();
        await engine.execute({
          sql: 'INSERT INTO seq_test (value) VALUES (:val:)',
          params: { val: 'first' },
          transactionId: tx1,
        });
        await engine.commitTransaction(tx1);

        const tx2 = await engine.beginTransaction();
        await engine.execute({
          sql: 'INSERT INTO seq_test (value) VALUES (:val:)',
          params: { val: 'second' },
          transactionId: tx2,
        });
        await engine.commitTransaction(tx2);

        const result = await engine.execute({
          sql: 'SELECT * FROM seq_test',
        });
        asserts.assertEquals(result.count, 2);

        await engine.disconnect();
      });

      await u.step(
        'should handle multiple sequential transactions with isolation',
        async () => {
          const engine = new SQLiteEngine('test-db', {
            database: TEST_DB_PATH,
          });

          // Create test table
          await engine.execute({
            sql:
              'CREATE TABLE IF NOT EXISTS concurrent_test (id INTEGER PRIMARY KEY, value TEXT)',
          });

          // Clean up any existing data
          await engine.execute({
            sql: 'DELETE FROM concurrent_test',
          });

          // SQLite doesn't support concurrent transactions, so test them sequentially
          const tx1 = await engine.beginTransaction();
          await engine.execute({
            sql: 'INSERT INTO concurrent_test (id, value) VALUES (1, :val:)',
            params: { val: 'tx1' },
            transactionId: tx1,
          });
          await engine.commitTransaction(tx1);

          const tx2 = await engine.beginTransaction();
          await engine.execute({
            sql: 'INSERT INTO concurrent_test (id, value) VALUES (2, :val:)',
            params: { val: 'tx2' },
            transactionId: tx2,
          });
          await engine.commitTransaction(tx2);

          const tx3 = await engine.beginTransaction();
          await engine.execute({
            sql: 'INSERT INTO concurrent_test (id, value) VALUES (3, :val:)',
            params: { val: 'tx3' },
            transactionId: tx3,
          });
          await engine.rollbackTransaction(tx3); // This one gets rolled back

          // Verify only tx1 and tx2 data persisted (tx3 was rolled back)
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

      await u.step('should auto-rollback on error', async () => {
        const engine = new SQLiteEngine('test-db', {
          database: TEST_DB_PATH,
        });

        await engine.execute({
          sql:
            'CREATE TABLE auto_rollback_test (id INTEGER PRIMARY KEY, value TEXT)',
        });

        const txId = await engine.beginTransaction();
        await engine.execute({
          sql: 'INSERT INTO auto_rollback_test (value) VALUES (:val:)',
          params: { val: 'test' },
          transactionId: txId,
        });

        await asserts.assertRejects(
          () =>
            engine.execute({
              sql: 'SELECT FROM invalid_syntax',
              transactionId: txId,
            }),
          DAMEngineError,
        );

        const result = await engine.execute({
          sql: 'SELECT * FROM auto_rollback_test',
        });
        asserts.assertEquals(result.count, 0);

        await engine.disconnect();
      });
    });

    await t.step('batch execution', async (u) => {
      await u.step('should execute multiple queries', async () => {
        const engine = new SQLiteEngine('test-db', {
          database: TEST_DB_PATH,
        });

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
        const engine = new SQLiteEngine('test-db', {
          database: TEST_DB_PATH,
        });

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

    await t.step('event emissions', async (u) => {
      await u.step('should emit all query events', async () => {
        const engine = new SQLiteEngine('test-db', {
          database: TEST_DB_PATH,
        });
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
        const engine = new SQLiteEngine('test-db', {
          database: TEST_DB_PATH,
        });
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
        const engine = new SQLiteEngine('test-db', {
          database: TEST_DB_PATH,
        });
        await engine.connect();

        const result = await engine.ping();
        asserts.assertEquals(result, true);

        await engine.disconnect();
      });

      await u.step('should auto-connect on ping', async () => {
        const engine = new SQLiteEngine('test-db', {
          database: TEST_DB_PATH,
        });

        asserts.assertEquals(engine.status, 'CLOSED');
        const result = await engine.ping();
        asserts.assertEquals(result, true);
        asserts.assertEquals(engine.status, 'READY');

        await engine.disconnect();
      });
    });

    // Final cleanup
    cleanup();
  },
});
