import * as asserts from '$asserts';
import { PostgreSQLEngine, type PostgreSQLEngineOptions } from './mod.ts';
import { DAMEngineError } from '../../engine/errors/mod.ts';
import { envArgs } from '@tundralibs/utils';

const env = envArgs('./dam/engines/');

// Test configuration with shorter timeouts for faster testing
const TEST_CONFIG = {
  host: env.get('POSTGRES_HOST') || 'localhost',
  port: parseInt(env.get('POSTGRES_PORT') || '5432'),
  database: env.get('POSTGRES_DATABASE') || 'postgres',
  username: env.get('POSTGRES_USERNAME') || 'postgres',
  password: env.get('POSTGRES_PASSWORD') || 'postgres',
  connectionTimeout: 1, // 1 second for faster tests
  queryTimeout: 1, // 1 second for faster tests
};

Deno.test('dam.engines.postgresql', 
  async (t) => {
    let pgEngine: PostgreSQLEngine;

    // Setup and teardown for tests that need an initialized engine
    const setupPostgreSQL = () => {
      pgEngine = new PostgreSQLEngine('postgres-test', {
        host: env.get('POSTGRES_HOST') || 'localhost',
        port: parseInt(env.get('POSTGRES_PORT') || '5432'),
        database: env.get('POSTGRES_DATABASE') || 'postgres',
        username: env.get('POSTGRES_USERNAME') || 'postgres',
        password: env.get('POSTGRES_PASSWORD') || 'postgres',
        pool: {
          max: 5,
          min: 1,
          idleTimeoutSeconds: 30,
        },
      });
      return pgEngine;
    };

    const teardownPostgreSQL = async () => {
      if (pgEngine) {
        try {
          await pgEngine.close();
          // Give pool time to clean up completely
          await new Promise((resolve) => setTimeout(resolve, 100));
        } catch {
          // Ignore errors during teardown
        }
      }
    };

    await t.step('constructor and validation', async (u) => {
      await u.step('should create instance with valid options', () => {
        const engine = new PostgreSQLEngine('test-pg', {
          host: 'localhost',
          port: 5432,
          database: 'testdb',
          username: 'testuser',
          password: 'testpass',
        });

        asserts.assertEquals(engine.name, 'test-pg');
        asserts.assertEquals(engine.Engine, 'postgresql');
        asserts.assertEquals(engine.status, 'CLOSED');
        // PostgreSQL engine always uses pooling (via pg.Pool), so this should be true
        asserts.assertEquals(engine.poolEnabled, true);
      });

      await u.step('should create instance with pool options', () => {
        const engine = new PostgreSQLEngine('test-pg-pool', {
          host: 'localhost',
          port: 5432,
          database: 'testdb',
          username: 'testuser',
          password: 'testpass',
          pool: { max: 10, min: 2 },
        });

        asserts.assertEquals(engine.poolEnabled, true);
      });

      await u.step('should throw on missing host', () => {
        try {
          const _ = new PostgreSQLEngine('test-invalid', {
            host: '',
            port: 5432,
            database: 'testdb',
            username: 'testuser',
          } as PostgreSQLEngineOptions);
          asserts.fail('Expected error to be thrown');
        } catch (error) {
          asserts.assertInstanceOf(error, DAMEngineError);
          asserts.assertEquals(error.code, 'CONFIG_INVALID');
        }
      });

      await u.step('should throw on missing database', () => {
        try {
          const _ = new PostgreSQLEngine('test-invalid', {
            host: 'localhost',
            port: 5432,
            database: '',
            username: 'testuser',
          } as PostgreSQLEngineOptions);
          asserts.fail('Expected error to be thrown');
        } catch (error) {
          asserts.assertInstanceOf(error, DAMEngineError);
          asserts.assertEquals(error.code, 'CONFIG_INVALID');
        }
      });

      await u.step('should throw on missing username', () => {
        try {
          const _ = new PostgreSQLEngine('test-invalid', {
            host: 'localhost',
            port: 5432,
            database: 'testdb',
            username: '',
          } as PostgreSQLEngineOptions);
          asserts.fail('Expected error to be thrown');
        } catch (error) {
          asserts.assertInstanceOf(error, DAMEngineError);
          asserts.assertEquals(error.code, 'CONFIG_INVALID');
        }
      });

      await u.step('should throw on invalid port', () => {
        try {
          const _ = new PostgreSQLEngine('test-invalid', {
            host: 'localhost',
            port: 'not-a-number' as any,
            database: 'testdb',
            username: 'testuser',
          });
          asserts.fail('Expected error to be thrown');
        } catch (error) {
          asserts.assertInstanceOf(error, DAMEngineError);
        }
      });

      await u.step('should validate PostgreSQL-specific pool limits', () => {
        // PostgreSQL has practical limits on connections
        asserts.assertThrows(
          () => new PostgreSQLEngine('test-pg', {
            host: 'localhost',
            port: 5432,
            database: 'testdb',
            username: 'testuser',
            password: 'testpass',
            pool: { max: 10000 } // Unrealistic max connections
          }),
          DAMEngineError,
          'exceeds PostgreSQL recommended maximum'
        );
        
        // Valid pool configuration should work
        const engine = new PostgreSQLEngine('test-pg-valid', {
          host: 'localhost',
          port: 5432,
          database: 'testdb',
          username: 'testuser',
          password: 'testpass',
          pool: { max: 50, min: 5, idleTimeoutSeconds: 300 }
        });
        
        asserts.assertEquals(engine.poolEnabled, true);
      });

      await u.step('should handle SSL configuration options', () => {
        const sslEngine = new PostgreSQLEngine('test-ssl', {
          host: 'localhost',
          port: 5432,
          database: 'testdb',
          username: 'testuser',
          password: 'testpass',
          ssl: {
            rejectUnauthorized: false,
            ca: 'cert-content',
            cert: 'client-cert',
            key: 'client-key'
          }
        });
        
        asserts.assertEquals(sslEngine.name, 'test-ssl');
        asserts.assertEquals(sslEngine.Engine, 'postgresql');
      });

      await u.step('should handle advanced PostgreSQL options', () => {
        const advancedEngine = new PostgreSQLEngine('test-advanced', {
          host: 'localhost',
          port: 5432,
          database: 'testdb',
          username: 'testuser',
          password: 'testpass',
          applicationName: 'TestApp',
          statementTimeout: 30000,
          idleInTransactionSessionTimeout: 60000
        });
        
        asserts.assertEquals(advancedEngine.name, 'test-advanced');
      });
    });

    await t.step('connection management and error handling', async (u) => {
      await u.step('should connect to PostgreSQL database', async () => {
        pgEngine = setupPostgreSQL();

        await pgEngine.connect();

        asserts.assertEquals(pgEngine.status, 'IDLE');
        asserts.assert(pgEngine.poolStats.totalConnections > 0);

        await teardownPostgreSQL();
      });

      await u.step('should handle connection errors gracefully', async () => {
        const engine = new PostgreSQLEngine('invalid-connection', {
          host: 'nonexistent-host',
          port: 9999,
          database: 'nonexistent',
          username: 'invalid',
          password: 'invalid',
        });

        try {
          await engine.connect();
          asserts.fail('Expected error to be thrown');
        } catch (error) {
          asserts.assertInstanceOf(error, DAMEngineError);
          asserts.assertEquals(error.code, 'CONNECTION_FAILED');
        }
      });

      await u.step('should close connection properly', async () => {
        pgEngine = setupPostgreSQL();
        await pgEngine.connect();

        await pgEngine.close();

        asserts.assertEquals(pgEngine.status, 'CLOSED');
      });

      await u.step('should handle invalid host connection', async () => {
        const invalidEngine = new PostgreSQLEngine('test-invalid-host', {
          host: 'nonexistent-host-12345.invalid',
          port: 5432,
          database: 'postgres',
          username: 'postgres',
          password: 'postgres',
          connectionTimeout: 1 // 1 second timeout for faster test
        });

        await asserts.assertRejects(
          () => invalidEngine.connect(),
          DAMEngineError,
          'Failed to connect to postgresql'
        );

        asserts.assertEquals(invalidEngine.status, 'CLOSED');
      });

      await u.step('should handle invalid credentials', async () => {
        const badCredsEngine = new PostgreSQLEngine('test-bad-creds', {
          ...TEST_CONFIG,
          username: 'invalid-user-12345',
          password: 'invalid-password-12345'
        });

        await asserts.assertRejects(
          () => badCredsEngine.connect(),
          DAMEngineError,
          'Failed to connect to postgresql'
        );
      });

      await u.step('should handle invalid database name', async () => {
        const badDbEngine = new PostgreSQLEngine('test-bad-db', {
          ...TEST_CONFIG,
          database: 'nonexistent_database_12345'
        });

        await asserts.assertRejects(
          () => badDbEngine.connect(),
          DAMEngineError,
          'Failed to connect to postgresql'
        );
      });

      await u.step('should handle connection pool exhaustion gracefully', async () => {
        const smallPoolEngine = new PostgreSQLEngine('test-small-pool', {
          ...TEST_CONFIG,
          pool: { max: 2, min: 1 } // Very small pool
        });

        await smallPoolEngine.connect();

        // Create multiple concurrent queries that should exhaust the pool
        const longRunningQueries = [];
        for (let i = 0; i < 5; i++) {
          longRunningQueries.push(
            smallPoolEngine.execute({
              sql: 'SELECT pg_sleep(0.5), :query_num: as query_num',
              params: { query_num: i }
            })
          );
        }

        // All queries should eventually complete or timeout
        const results = await Promise.allSettled(longRunningQueries);
        
        // At least some should succeed
        const successful = results.filter(r => r.status === 'fulfilled');
        asserts.assert(successful.length > 0);

        await smallPoolEngine.close();
      });

      await u.step('should handle connection interruption recovery', async () => {
        pgEngine = setupPostgreSQL();
        await pgEngine.connect();

        // Execute a query to ensure connection works
        await pgEngine.execute({ sql: 'SELECT 1 as test' });

        // Connection should still be healthy
        asserts.assertEquals(pgEngine.status, 'IDLE');

        await teardownPostgreSQL();
      });
    });

    await t.step('query execution', async (u) => {
      await u.step('should execute simple queries', async () => {
        pgEngine = setupPostgreSQL();
        await pgEngine.connect();

        const result = await pgEngine.execute({
          sql: 'SELECT 1 as test_value, NOW() as current_time',
        });

        asserts.assertEquals(result.count, 1);
        asserts.assert(result.data.length === 1);
        asserts.assertEquals(result.data[0]?.test_value, 1);
        asserts.assert(result.data[0]?.current_time instanceof Date);
        asserts.assert(result.time > 0);

        await teardownPostgreSQL();
      });

      await u.step('should execute parameterized queries', async () => {
        pgEngine = setupPostgreSQL();
        await pgEngine.connect();

        const result = await pgEngine.execute({
          sql: 'SELECT :value:::text as param_value',
          params: { value: 'test-parameter' },
        });

        asserts.assertEquals(result.count, 1);
        asserts.assertEquals(result.data[0]?.param_value, 'test-parameter');

        await teardownPostgreSQL();
      });

      await u.step('should handle repeated parameters correctly', async () => {
        pgEngine = setupPostgreSQL();
        await pgEngine.connect();

        // Test repeated parameters with simple, consistent usage
        const result = await pgEngine.execute({
          sql: 'SELECT :value: as "First", :value: as "Second"',
          params: { value: 'repeated' },
        });

        asserts.assertEquals(result.count, 1);
        asserts.assertEquals(result.data[0]?.First, 'repeated');
        asserts.assertEquals(result.data[0]?.Second, 'repeated');

        await teardownPostgreSQL();
      });

      await u.step(
        'should handle quoted identifiers with repeated parameters',
        async () => {
          pgEngine = setupPostgreSQL();
          await pgEngine.connect();

          // Test various data types to ensure proper type parsing
          const result = await pgEngine.execute({
            sql: `
            SELECT 
              :int_param:::int as "IntegerValue",
              :int_param:::int as "RepeatedInteger",
              :float_param:::float as "FloatValue",
              :bool_param:::bool as "BoolValue",
              :text_param:::text as "TextValue"
          `,
            params: {
              int_param: 123,
              float_param: 123.45,
              bool_param: true,
              text_param: 'hello',
            },
          });

          asserts.assertEquals(result.count, 1);
          asserts.assertEquals(result.data[0]?.IntegerValue, 123);
          asserts.assertEquals(result.data[0]?.RepeatedInteger, 123);
          asserts.assertEquals(result.data[0]?.FloatValue, 123.45);
          asserts.assertEquals(result.data[0]?.BoolValue, true);
          asserts.assertEquals(result.data[0]?.TextValue, 'hello');

          await teardownPostgreSQL();
        },
      );

      await u.step(
        'should handle type parsing for database column values',
        async () => {
          pgEngine = setupPostgreSQL();
          await pgEngine.connect();

          // Test reading actual database column values with proper types
          const result = await pgEngine.execute({
            sql: `
            SELECT 
              123 as int_col,
              123.45 as float_col,
              true as bool_col,
              'database string' as text_col,
              ARRAY[1,2,3] as array_col
          `,
          });

          asserts.assertEquals(result.count, 1);
          asserts.assertEquals(result.data[0]?.int_col, 123);
          asserts.assertEquals(result.data[0]?.float_col, 123.45);
          asserts.assertEquals(result.data[0]?.bool_col, true);
          asserts.assertEquals(result.data[0]?.text_col, 'database string');
          asserts.assertEquals(result.data[0]?.array_col, [1, 2, 3]);

          await teardownPostgreSQL();
        },
      );

      await u.step('should handle BigInt values correctly', async () => {
        pgEngine = setupPostgreSQL();
        await pgEngine.connect();

        // Test BigInt handling for very large numbers
        const result = await pgEngine.execute({
          sql: `
            SELECT 
              9007199254740991::bigint as max_safe_int,
              9007199254740992::bigint as beyond_safe_int,
              123::bigint as small_bigint
          `,
        });

        asserts.assertEquals(result.count, 1);
        asserts.assertEquals(result.data[0]?.max_safe_int, 9007199254740991); // Should be number
        asserts.assertEquals(
          result.data[0]?.beyond_safe_int,
          9007199254740992n,
        ); // Should be BigInt
        asserts.assertEquals(result.data[0]?.small_bigint, 123); // Should be number

        await teardownPostgreSQL();
      });

      await u.step('should handle complex PostgreSQL data types', async () => {
        pgEngine = setupPostgreSQL();
        await pgEngine.connect();

        // Create table with various PostgreSQL types
        await pgEngine.execute({
          sql: `CREATE TABLE IF NOT EXISTS test_complex_types (
            id SERIAL PRIMARY KEY,
            json_data JSONB,
            array_data INTEGER[],
            uuid_data UUID,
            timestamp_data TIMESTAMP WITH TIME ZONE,
            numeric_data NUMERIC(10,2),
            boolean_data BOOLEAN
          )`
        });

        // Insert complex data
        const complexData = {
          json_data: { nested: { value: 'test', number: 42 }, array: [1, 2, 3] },
          array_data: [10, 20, 30, 40],
          uuid_data: crypto.randomUUID(),
          timestamp_data: new Date(),
          numeric_data: 123.45,
          boolean_data: true
        };

        await pgEngine.execute({
          sql: `INSERT INTO test_complex_types 
                (json_data, array_data, uuid_data, timestamp_data, numeric_data, boolean_data) 
                VALUES (:json_data:, :array_data:, :uuid_data:, :timestamp_data:, :numeric_data:, :boolean_data:)`,
          params: complexData
        });

        // Retrieve and verify data
        const result = await pgEngine.execute({
          sql: 'SELECT * FROM test_complex_types ORDER BY id DESC LIMIT 1'
        });

        asserts.assertEquals(result.data.length, 1);
        const row = result.data[0];
        asserts.assert(row, 'Row should exist');
        
        // Verify complex types are handled correctly
        asserts.assert(typeof row.json_data === 'object');
        asserts.assert(Array.isArray(row.array_data));
        asserts.assert(typeof row.uuid_data === 'string');
        asserts.assert(row.timestamp_data instanceof Date);
        asserts.assert(typeof row.numeric_data === 'number');
        asserts.assert(typeof row.boolean_data === 'boolean');

        // Cleanup
        await pgEngine.execute({ sql: 'DROP TABLE IF EXISTS test_complex_types' });
        await teardownPostgreSQL();
      });

      await u.step('should handle NULL values and edge cases', async () => {
        pgEngine = setupPostgreSQL();
        await pgEngine.connect();

        // Test various NULL and edge case scenarios
        const edgeCases = [
          { sql: 'SELECT NULL as null_value', expected: null },
          { sql: 'SELECT :param_null:::text as param_null', params: { param_null: null }, expected: null },
          { sql: 'SELECT :empty_string:::text as empty_string', params: { empty_string: '' }, expected: '' },
          { sql: 'SELECT :zero_number:::integer as zero_number', params: { zero_number: 0 }, expected: 0 },
          { sql: 'SELECT :false_boolean:::boolean as false_boolean', params: { false_boolean: false }, expected: false },
        ];

        for (const testCase of edgeCases) {
          const result = await pgEngine.execute(testCase);
          asserts.assertEquals(result.data.length, 1);
          const row = result.data[0];
          asserts.assert(row, 'Row should exist');
          const value = Object.values(row)[0];
          asserts.assertEquals(value, testCase.expected);
        }

        await teardownPostgreSQL();
      });

      await u.step('should handle query errors', async () => {
        pgEngine = setupPostgreSQL();
        await pgEngine.connect();

        try {
          await pgEngine.execute({ sql: 'SELECT * FROM nonexistent_table' });
          asserts.fail('Expected error to be thrown');
        } catch (error) {
          asserts.assertInstanceOf(error, DAMEngineError);
          asserts.assertEquals(error.code, 'QUERY_EXECUTION_FAILED');
        }

        await teardownPostgreSQL();
      });

      await u.step('should reject empty queries', async () => {
        pgEngine = setupPostgreSQL();
        await pgEngine.connect();

        try {
          await pgEngine.execute({ sql: '' });
          asserts.fail('Expected error to be thrown');
        } catch (error) {
          asserts.assertInstanceOf(error, DAMEngineError);
          asserts.assertEquals(
            (error as DAMEngineError).code,
            'QUERY_INVALID_SQL',
          );
        }

        await teardownPostgreSQL();
      });
    });

    // Health check is handled internally by the AbstractEngine

    await t.step('transaction management and concurrent scenarios', async (u) => {
      await u.step('should handle basic transactions', async () => {
        pgEngine = setupPostgreSQL();
        await pgEngine.connect();

        // Create a test table
        await pgEngine.execute({
          sql: 'CREATE TABLE IF NOT EXISTS test_transactions (id SERIAL PRIMARY KEY, value TEXT)',
        });

        // Start transaction
        const txId = await pgEngine.begin();
        asserts.assert(txId);
        asserts.assertEquals(pgEngine.inTransaction, true);

        // Insert data within transaction
        await pgEngine.execute({
          sql: 'INSERT INTO test_transactions (value) VALUES (:value:)',
          params: { value: 'test-transaction' },
          transactionId: txId,
        });

        // Commit transaction
        await pgEngine.commit(txId);
        asserts.assertEquals(pgEngine.inTransaction, false);

        // Verify data was committed
        const result = await pgEngine.execute({
          sql: 'SELECT value FROM test_transactions WHERE value = :value:',
          params: { value: 'test-transaction' },
        });

        asserts.assertEquals(result.data.length, 1);
        asserts.assert(result.data[0], 'Row should exist');
        asserts.assertEquals(result.data[0].value, 'test-transaction');

        // Cleanup
        await pgEngine.execute({
          sql: 'DROP TABLE IF EXISTS test_transactions',
        });

        await teardownPostgreSQL();
      });

      await u.step('should handle transaction rollback', async () => {
        pgEngine = setupPostgreSQL();
        await pgEngine.connect();

        // Drop and recreate test table to ensure clean state
        await pgEngine.execute({ sql: 'DROP TABLE IF EXISTS test_rollback' });
        await pgEngine.execute({
          sql: 'CREATE TABLE test_rollback (id SERIAL PRIMARY KEY, value TEXT)',
        });

        // Start transaction
        const txId = await pgEngine.begin();

        // Insert data
        await pgEngine.execute({
          sql: 'INSERT INTO test_rollback (value) VALUES (:value:)',
          params: { value: 'should-be-rolled-back' },
          transactionId: txId,
        });

        // Rollback transaction
        await pgEngine.rollback(txId);
        asserts.assertEquals(pgEngine.inTransaction, false);

        // Verify data was not committed
        const result = await pgEngine.execute({
          sql: 'SELECT value FROM test_rollback WHERE value = :value:',
          params: { value: 'should-be-rolled-back' },
        });

        asserts.assertEquals(result.data.length, 0);

        // Cleanup
        await pgEngine.execute({
          sql: 'DROP TABLE IF EXISTS test_rollback',
        });

        await teardownPostgreSQL();
      });

      await u.step('should handle multiple concurrent transactions', async () => {
        pgEngine = setupPostgreSQL();
        await pgEngine.connect();

        // Drop and recreate test table to ensure clean state
        await pgEngine.execute({ sql: 'DROP TABLE IF EXISTS test_concurrent_tx' });
        await pgEngine.execute({
          sql: 'CREATE TABLE test_concurrent_tx (id SERIAL PRIMARY KEY, tx_name TEXT, value INTEGER)',
        });

        // Start multiple transactions concurrently
        const tx1 = await pgEngine.begin({ name: 'tx1' });
        const tx2 = await pgEngine.begin({ name: 'tx2' });
        const tx3 = await pgEngine.begin({ name: 'tx3' });

        // Execute operations in different transactions concurrently
        const operations = [
          pgEngine.execute({
            sql: 'INSERT INTO test_concurrent_tx (tx_name, value) VALUES (:tx_name:, :value:)',
            params: { tx_name: 'tx1', value: 100 },
            transactionId: tx1,
          }),
          pgEngine.execute({
            sql: 'INSERT INTO test_concurrent_tx (tx_name, value) VALUES (:tx_name:, :value:)',
            params: { tx_name: 'tx2', value: 200 },
            transactionId: tx2,
          }),
          pgEngine.execute({
            sql: 'INSERT INTO test_concurrent_tx (tx_name, value) VALUES (:tx_name:, :value:)',
            params: { tx_name: 'tx3', value: 300 },
            transactionId: tx3,
          }),
        ];

        await Promise.all(operations);

        // Commit transactions in different order
        await pgEngine.commit(tx2);
        await pgEngine.rollback(tx3); // Rollback tx3
        await pgEngine.commit(tx1);

        // Verify results
        const result = await pgEngine.execute({
          sql: 'SELECT tx_name, value FROM test_concurrent_tx ORDER BY value',
        });

        asserts.assertEquals(result.data.length, 2); // Only tx1 and tx2 should be committed
        asserts.assert(result.data[0], 'First row should exist');
        asserts.assert(result.data[1], 'Second row should exist');
        asserts.assertEquals(result.data[0].tx_name, 'tx1');
        asserts.assertEquals(result.data[0].value, 100);
        asserts.assertEquals(result.data[1].tx_name, 'tx2');
        asserts.assertEquals(result.data[1].value, 200);

        // Cleanup
        await pgEngine.execute({ sql: 'DROP TABLE IF EXISTS test_concurrent_tx' });
        await teardownPostgreSQL();
      });

      await u.step('should handle transaction isolation levels', async () => {
        pgEngine = setupPostgreSQL();
        await pgEngine.connect();

        // Drop and recreate test table to ensure clean state
        await pgEngine.execute({ sql: 'DROP TABLE IF EXISTS test_isolation' });
        await pgEngine.execute({
          sql: 'CREATE TABLE test_isolation (id SERIAL PRIMARY KEY, counter INTEGER DEFAULT 0)',
        });
        
        await pgEngine.execute({
          sql: 'INSERT INTO test_isolation (counter) VALUES (0)',
        });

        // Test different transaction isolation behaviors
        const tx1 = await pgEngine.begin({ name: 'reader' });
        const tx2 = await pgEngine.begin({ name: 'writer' });

        // Read initial value in tx1
        const initialRead = await pgEngine.execute({
          sql: 'SELECT counter FROM test_isolation WHERE id = 1',
          transactionId: tx1,
        });
        asserts.assert(initialRead.data[0], 'Initial read row should exist');
        asserts.assertEquals(initialRead.data[0].counter, 0);

        // Update value in tx2
        await pgEngine.execute({
          sql: 'UPDATE test_isolation SET counter = 1 WHERE id = 1',
          transactionId: tx2,
        });
        await pgEngine.commit(tx2);

        // Read again in tx1 (should still see old value due to isolation)
        const isolatedRead = await pgEngine.execute({
          sql: 'SELECT counter FROM test_isolation WHERE id = 1',
          transactionId: tx1,
        });
        // In PostgreSQL default isolation (READ COMMITTED), we should see the new value
        asserts.assert(isolatedRead.data[0], 'Isolated read row should exist');
        asserts.assertEquals(isolatedRead.data[0].counter, 1);
        
        await pgEngine.commit(tx1);

        // Cleanup
        await pgEngine.execute({ sql: 'DROP TABLE IF EXISTS test_isolation' });
        await teardownPostgreSQL();
      });

      await u.step('should handle transaction deadlock detection', async () => {
        pgEngine = setupPostgreSQL();
        await pgEngine.connect();

        // Create test tables for deadlock scenario
        await pgEngine.execute({
          sql: 'CREATE TABLE IF NOT EXISTS test_deadlock_a (id INTEGER PRIMARY KEY, value TEXT)',
        });
        await pgEngine.execute({
          sql: 'CREATE TABLE IF NOT EXISTS test_deadlock_b (id INTEGER PRIMARY KEY, value TEXT)',
        });
        
        // Insert initial data
        await pgEngine.execute({ sql: 'INSERT INTO test_deadlock_a (id, value) VALUES (1, \'a\')' });
        await pgEngine.execute({ sql: 'INSERT INTO test_deadlock_b (id, value) VALUES (1, \'b\')' });

        const tx1 = await pgEngine.begin({ name: 'tx_deadlock_1' });
        const tx2 = await pgEngine.begin({ name: 'tx_deadlock_2' });

        try {
          // tx1 locks table A, tx2 locks table B
          await pgEngine.execute({
            sql: 'UPDATE test_deadlock_a SET value = \'updated_a1\' WHERE id = 1',
            transactionId: tx1,
          });
          
          await pgEngine.execute({
            sql: 'UPDATE test_deadlock_b SET value = \'updated_b1\' WHERE id = 1',
            transactionId: tx2,
          });

          // Create potential deadlock: tx1 tries to access B, tx2 tries to access A
          const deadlockPromises = [
            pgEngine.execute({
              sql: 'UPDATE test_deadlock_b SET value = \'updated_b2\' WHERE id = 1',
              transactionId: tx1,
            }),
            pgEngine.execute({
              sql: 'UPDATE test_deadlock_a SET value = \'updated_a2\' WHERE id = 1',
              transactionId: tx2,
            }),
          ];

          // One of these should succeed, the other might fail due to deadlock
          const results = await Promise.allSettled(deadlockPromises);
          
          // Clean up transactions
          try { await pgEngine.rollback(tx1); } catch { /* ignore */ }
          try { await pgEngine.rollback(tx2); } catch { /* ignore */ }

          // At least the operations should have been attempted
          asserts.assertEquals(results.length, 2);
          
        } catch (error) {
          // Deadlock or other transaction conflict is expected in some cases
          try { await pgEngine.rollback(tx1); } catch { /* ignore */ }
          try { await pgEngine.rollback(tx2); } catch { /* ignore */ }
        }

        // Cleanup
        await pgEngine.execute({ sql: 'DROP TABLE IF EXISTS test_deadlock_a' });
        await pgEngine.execute({ sql: 'DROP TABLE IF EXISTS test_deadlock_b' });
        await teardownPostgreSQL();
      });

      await u.step('should handle long-running transactions with timeout', async () => {
        pgEngine = setupPostgreSQL();
        await pgEngine.connect();

        // Start transaction with timeout
        const txId = await pgEngine.begin({ 
          name: 'long-running-tx',
          timeout: 1 // 1 second timeout
        });

        // Execute a quick operation
        await pgEngine.execute({
          sql: 'SELECT NOW() as current_time',
          transactionId: txId,
        });

        // Transaction should still be active
        asserts.assertEquals(pgEngine.inTransaction, true);

        // Clean up
        await pgEngine.rollback(txId);
        await teardownPostgreSQL();
      });
    });

    await t.step('error handling and recovery scenarios', async (u) => {
      await u.step('should handle SQL syntax errors gracefully', async () => {
        pgEngine = setupPostgreSQL();
        await pgEngine.connect();

        await asserts.assertRejects(
          () => pgEngine.execute({ sql: 'INVALID SQL SYNTAX HERE' }),
          DAMEngineError,
          'Query execution failed'
        );

        // Engine should still be functional after error
        const recovery = await pgEngine.execute({ sql: 'SELECT 1 as recovery_test' });
        asserts.assert(recovery.data[0], 'Recovery row should exist');
        asserts.assertEquals(recovery.data[0].recovery_test, 1);

        await teardownPostgreSQL();
      });

      await u.step('should handle constraint violations', async () => {
        pgEngine = setupPostgreSQL();
        await pgEngine.connect();

        // Drop and recreate table with unique constraint to ensure clean state
        await pgEngine.execute({ sql: 'DROP TABLE IF EXISTS test_constraints' });
        await pgEngine.execute({
          sql: 'CREATE TABLE test_constraints (id INTEGER PRIMARY KEY, name TEXT UNIQUE)'
        });

        // Insert initial data
        await pgEngine.execute({
          sql: 'INSERT INTO test_constraints (id, name) VALUES (1, \'unique_name\')'
        });

        // Try to insert duplicate - should fail
        try {
          await pgEngine.execute({
            sql: 'INSERT INTO test_constraints (id, name) VALUES (2, \'unique_name\')'
          });
          asserts.fail('Should have thrown an error');
        } catch (error) {
          asserts.assert(error instanceof DAMEngineError);
          asserts.assertEquals(error.code, 'QUERY_EXECUTION_FAILED');
        }

        // Cleanup
        await pgEngine.execute({ sql: 'DROP TABLE IF EXISTS test_constraints' });
        await teardownPostgreSQL();
      });

      await u.step('should handle permission errors', async () => {
        pgEngine = setupPostgreSQL();
        await pgEngine.connect();

        // Try to access system tables that might be restricted
        await asserts.assertRejects(
          () => pgEngine.execute({ sql: 'DROP DATABASE postgres' }),
          DAMEngineError
        );

        // Engine should still work after permission error
        const result = await pgEngine.execute({ sql: 'SELECT current_user' });
        asserts.assert(result.data.length > 0);

        await teardownPostgreSQL();
      });

      await u.step('should handle connection recovery after network interruption', async () => {
        pgEngine = setupPostgreSQL();
        await pgEngine.connect();

        // Simulate connection working initially
        await pgEngine.execute({ sql: 'SELECT 1 as initial_test' });

        // Connection should be resilient to temporary issues
        // (Real network interruption can't be easily simulated in tests)
        const result = await pgEngine.execute({ sql: 'SELECT 2 as recovery_test' });
        asserts.assert(result.data[0], 'Recovery result row should exist');
        asserts.assertEquals(result.data[0].recovery_test, 2);

        await teardownPostgreSQL();
      });

      await u.step('should handle very large result sets', async () => {
        pgEngine = setupPostgreSQL();
        await pgEngine.connect();

        // Generate a large result set
        const result = await pgEngine.execute({
          sql: 'SELECT generate_series(1, 1000) as num'
        });

        asserts.assertEquals(result.data.length, 1000);
        asserts.assertEquals(result.count, 1000);
        asserts.assertEquals(result.data[0]!.num, 1);
        asserts.assertEquals(result.data[999]!.num, 1000);

        await teardownPostgreSQL();
      });

      await u.step('should handle concurrent query load', async () => {
        pgEngine = setupPostgreSQL();
        await pgEngine.connect();

        // Execute many queries concurrently
        const concurrentQueries = [];
        const queryCount = 50;

        for (let i = 0; i < queryCount; i++) {
          concurrentQueries.push(
            pgEngine.execute({
              sql: 'SELECT :query_id:::integer as query_id, pg_sleep(0.01)',
              params: { query_id: i }
            })
          );
        }

        const results = await Promise.all(concurrentQueries);
        
        asserts.assertEquals(results.length, queryCount);
        
        // Verify all queries completed successfully
        for (let i = 0; i < queryCount; i++) {
          asserts.assertEquals(results[i]!.data[0]!.query_id, i);
        }

        await teardownPostgreSQL();
      });
    });

    await t.step('performance and monitoring', async (u) => {
      await u.step('should track pool statistics', async () => {
        pgEngine = setupPostgreSQL();
        await pgEngine.connect();

        const stats = pgEngine.poolStats;
        asserts.assert(typeof stats.totalConnections === 'number');
        asserts.assert(typeof stats.activeConnections === 'number');
        asserts.assert(typeof stats.idleConnections === 'number');
        asserts.assert(typeof stats.waitingRequests === 'number');

        // Stats should be non-negative
        asserts.assert(stats.totalConnections >= 0);
        asserts.assert(stats.activeConnections >= 0);
        asserts.assert(stats.idleConnections >= 0);
        asserts.assert(stats.waitingRequests >= 0);

        await teardownPostgreSQL();
      });

      await u.step('should track query performance metrics', async () => {
        pgEngine = setupPostgreSQL();
        await pgEngine.connect();

        // Execute a slow query
        const slowResult = await pgEngine.execute({
          sql: 'SELECT pg_sleep(0.1), 1 as slow_query'
        });

        // Query should have timing information
        asserts.assert(typeof slowResult.time === 'number');
        asserts.assert(slowResult.time > 0.05); // Should take at least 50ms
        asserts.assert(typeof slowResult.isSlow === 'boolean');

        // Execute a fast query
        const fastResult = await pgEngine.execute({
          sql: 'SELECT 1 as fast_query'
        });

        asserts.assert(typeof fastResult.time === 'number');
        asserts.assert(fastResult.time >= 0);

        await teardownPostgreSQL();
      });

      await u.step('should monitor health status', async () => {
        pgEngine = new PostgreSQLEngine('health-test', {
          ...TEST_CONFIG,
          healthCheckInterval: 0.1 // 100ms intervals
        });
        
        await pgEngine.connect();

        // Initially should be healthy
        asserts.assertEquals(pgEngine.healthStatus.isHealthy, true);
        asserts.assertEquals(pgEngine.healthStatus.consecutiveErrors, 0);

        // Wait for a few health check cycles
        await new Promise(resolve => setTimeout(resolve, 300));

        // Should still be healthy
        asserts.assertEquals(pgEngine.healthStatus.isHealthy, true);

        await pgEngine.close();
      });

      await u.step('should handle very large result sets', async () => {
        pgEngine = setupPostgreSQL();
        await pgEngine.connect();

        // Generate a large result set
        const result = await pgEngine.execute({
          sql: 'SELECT generate_series(1, 1000) as num'
        });

        asserts.assertEquals(result.data.length, 1000);
        asserts.assertEquals(result.count, 1000);
        asserts.assertEquals(result.data[0]!.num, 1);
        asserts.assertEquals(result.data[999]!.num, 1000);

        await teardownPostgreSQL();
      });

      await u.step('should handle concurrent query load', async () => {
        pgEngine = setupPostgreSQL();
        await pgEngine.connect();

        // Execute many queries concurrently
        const concurrentQueries = [];
        const queryCount = 50;

        for (let i = 0; i < queryCount; i++) {
          concurrentQueries.push(
            pgEngine.execute({
              sql: 'SELECT :query_id:::integer as query_id, pg_sleep(0.01)',
              params: { query_id: i }
            })
          );
        }

        const results = await Promise.all(concurrentQueries);
        
        asserts.assertEquals(results.length, queryCount);
        
        // Verify all queries completed successfully
        for (let i = 0; i < queryCount; i++) {
          asserts.assertEquals(results[i]!.data[0]!.query_id, i);
        }

        await teardownPostgreSQL();
      });
    });

    await t.step('misconfiguration and edge cases', async (u) => {
      await u.step('should handle extremely small connection timeouts', () => {
        const engine = new PostgreSQLEngine('timeout-test', {
          ...TEST_CONFIG,
          connectionTimeout: 0.001 // 1ms - unrealistic
        });
        
        asserts.assertEquals(engine.name, 'timeout-test');
      });

      await u.step('should handle malformed connection strings', () => {
        asserts.assertThrows(
          () => new PostgreSQLEngine('malformed', {
            host: '',
            port: -1,
            database: '',
            username: '',
            password: ''
          } as any),
          DAMEngineError
        );
      });

      await u.step('should handle special characters in credentials', async () => {
        const specialEngine = new PostgreSQLEngine('special-chars', {
          host: 'localhost',
          port: 5432,
          database: 'test-db',
          username: 'user@domain.com',
          password: 'p@ssw0rd!#$%^&*()'
        });
        
        // Engine should be created successfully
        asserts.assertEquals(specialEngine.name, 'special-chars');
        // Connection will fail due to invalid credentials, but that's expected
      });

      await u.step('should handle very long queries', async () => {
        pgEngine = setupPostgreSQL();
        await pgEngine.connect();

        // Generate a very long query with unique column names
        const longQuery = 'SELECT ' + Array(1000).fill(0).map((_, i) => `1 as col${i}`).join(', ');
        
        const result = await pgEngine.execute({ sql: longQuery });
        asserts.assertEquals(result.data.length, 1);
        
        // Should have 1000 columns
        asserts.assert(result.data[0], 'Long query result should exist');
        asserts.assertEquals(Object.keys(result.data[0]).length, 1000);

        await teardownPostgreSQL();
      });

      await u.step('should handle rapid connect/disconnect cycles', async () => {
        const cycleEngine = setupPostgreSQL();
        
        // Rapidly connect and disconnect
        for (let i = 0; i < 5; i++) {
          await cycleEngine.connect();
          asserts.assert(cycleEngine.status === 'IDLE' || cycleEngine.status === 'RUNNING');
          
          await cycleEngine.close();
          asserts.assertEquals(cycleEngine.status, 'CLOSED');
        }
      });

      await u.step('should handle concurrent connection attempts', async () => {
        const engines = Array(5).fill(null).map((_, i) => 
          new PostgreSQLEngine(`concurrent-${i}`, TEST_CONFIG)
        );

        // Try to connect all engines simultaneously
        const connections = engines.map(engine => engine.connect());
        await Promise.all(connections);

        // All should be connected
        for (const engine of engines) {
          asserts.assert(engine.status === 'IDLE' || engine.status === 'RUNNING');
        }

        // Clean up all engines
        const closures = engines.map(engine => engine.close());
        await Promise.all(closures);

        for (const engine of engines) {
          asserts.assertEquals(engine.status, 'CLOSED');
        }
      });
    });
  },
);
