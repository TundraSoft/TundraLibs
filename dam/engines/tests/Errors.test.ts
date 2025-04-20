import * as asserts from '$asserts';
import {
  DAMEngineConfigError,
  DAMEngineConnectError,
  DAMEngineError,
  DAMEngineQueryError,
} from '../errors/mod.ts';
import { Query } from '../../query/mod.ts';

// Mock Query for testing
class MockQuery implements Query {
  sql = 'SELECT * FROM test';
  parameters = [];
  constructor() {}
  toSQL() {
    return { sql: this.sql, parameters: this.parameters };
  }
}

Deno.test('DAM.Engines.Error', async (t) => {
  await t.step('DAMEngineError', () => {
    // Test basic construction
    const error = new DAMEngineError('Test error', {
      name: 'test-db',
      engine: 'POSTGRES',
    });

    asserts.assertEquals(error.message, 'Test error');
    asserts.assertEquals(error.context.name, 'test-db');
    asserts.assertEquals(error.context.engine, 'POSTGRES');

    // Test with cause
    const cause = new Error('Original error');
    const errorWithCause = new DAMEngineError('Test with cause', {
      name: 'test-db',
      engine: 'MARIA',
    }, cause);

    asserts.assertEquals(errorWithCause.message, 'Test with cause');
    asserts.assertEquals(errorWithCause.cause, cause);

    // Test additional metadata
    const errorWithExtraMeta = new DAMEngineError('Test with extra meta', {
      name: 'test-db',
      engine: 'SQLITE',
      customField: 'custom value',
    });

    asserts.assertEquals(
      errorWithExtraMeta.context.customField,
      'custom value',
    );
  });

  await t.step('DAMEngineConfigError', () => {
    // Test basic construction
    const error = new DAMEngineConfigError('Invalid config', {
      name: 'test-db',
      engine: 'POSTGRES',
      configKey: 'host',
      configValue: 'invalid-host',
    });

    asserts.assertEquals(error.message, 'Invalid config');
    asserts.assertEquals(error.context.configKey, 'host');
    asserts.assertEquals(error.context.configValue, 'invalid-host');

    // Test with missing configValue
    const errorNoValue = new DAMEngineConfigError('Missing config', {
      name: 'test-db',
      engine: 'MONGO',
      configKey: 'port',
    });

    asserts.assertEquals(errorNoValue.message, 'Missing config');
    asserts.assertEquals(errorNoValue.context.configKey, 'port');
    asserts.assertEquals(
      (errorNoValue.context as unknown as { configValue: unknown }).configValue,
      undefined,
    );

    // Test with cause
    const cause = new Error('Configuration error');
    const errorWithCause = new DAMEngineConfigError('Config error with cause', {
      name: 'test-db',
      engine: 'SQLITE',
      configKey: 'filename',
      configValue: '/invalid/path',
    }, cause);

    asserts.assertEquals(errorWithCause.cause, cause);
  });

  await t.step('DAMEngineConnectError', () => {
    // Test basic construction
    const error = new DAMEngineConnectError('Failed to connect', {
      name: 'test-db',
      engine: 'POSTGRES',
    });

    asserts.assertEquals(error.message, 'Failed to connect');
    asserts.assertEquals(error.context.name, 'test-db');
    asserts.assertEquals(error.context.engine, 'POSTGRES');

    // Test with additional metadata
    const errorWithMeta = new DAMEngineConnectError('Failed to connect', {
      name: 'test-db',
      engine: 'MARIA',
      host: 'localhost',
      port: 3306,
      timeout: 5000,
    });

    asserts.assertEquals(errorWithMeta.context.host, 'localhost');
    asserts.assertEquals(errorWithMeta.context.port, 3306);

    // Test with cause
    const cause = new Error('Connection refused');
    const errorWithCause = new DAMEngineConnectError(
      'Connection error with cause',
      {
        name: 'test-db',
        engine: 'MONGO',
      },
      cause,
    );

    asserts.assertEquals(errorWithCause.cause, cause);
  });

  await t.step('DAMEngineQueryError', () => {
    // Create a mock query for testing
    const mockQuery = new MockQuery();

    // Test basic construction
    const error = new DAMEngineQueryError('Query failed', {
      name: 'test-db',
      engine: 'POSTGRES',
      query: mockQuery,
    });

    asserts.assertEquals(error.message, 'Query failed');
    asserts.assertEquals(error.context.name, 'test-db');
    asserts.assertEquals(error.context.engine, 'POSTGRES');
    asserts.assertEquals(error.context.query, mockQuery);

    // Test with additional metadata
    const errorWithMeta = new DAMEngineQueryError('Query failed with details', {
      name: 'test-db',
      engine: 'MARIA',
      query: mockQuery,
      queryDuration: 1500,
      affectedRows: 0,
    });

    asserts.assertEquals(errorWithMeta.context.queryDuration, 1500);
    asserts.assertEquals(errorWithMeta.context.affectedRows, 0);

    // Test with cause
    const cause = new Error('Syntax error in SQL');
    const errorWithCause = new DAMEngineQueryError('Query error with cause', {
      name: 'test-db',
      engine: 'SQLITE',
      query: mockQuery,
    }, cause);

    asserts.assertEquals(errorWithCause.cause, cause);
  });
});
