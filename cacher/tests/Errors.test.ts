import * as asserts from '$asserts';
import {
  CacherConfigError,
  CacherError,
  CacherOperationError,
} from '../errors/mod.ts';

Deno.test('Cacher.Errors', async (t) => {
  await t.step('CacherError', async (t) => {
    await t.step('should create a basic error with metadata', () => {
      const metadata = {
        name: 'test-cacher',
        engine: 'MEMORY',
        extra: 'test-data',
      };

      const error = new CacherError('Test error message', metadata);

      asserts.assertEquals(error.message, 'Test error message');
      asserts.assertEquals(error.context, metadata);
      asserts.assertEquals(error.name, 'CacherError');
    });

    await t.step('should create an error with a cause', () => {
      const cause = new Error('Original error');
      const metadata = {
        name: 'test-cacher',
        engine: 'MEMORY',
      };

      const error = new CacherError('Error with cause', metadata, cause);

      asserts.assertEquals(error.message, 'Error with cause');
      asserts.assertEquals(error.cause, cause);
    });
  });

  await t.step('CacherConfigError', async (t) => {
    await t.step('should create a config error with metadata', () => {
      const metadata = {
        name: 'test-cacher',
        engine: 'MEMORY',
        configKey: 'defaultExpiry',
        configValue: -1,
      };

      const error = new CacherConfigError('Invalid config value', metadata);

      asserts.assertEquals(error.message, 'Invalid config value');
      asserts.assertEquals(error.context, metadata);
      asserts.assertEquals(error.context.configKey, 'defaultExpiry');
      asserts.assertEquals(error.context.configValue, -1);
      asserts.assertEquals(error.name, 'CacherConfigError');
    });

    await t.step('should extend CacherError', () => {
      const metadata = {
        name: 'test-cacher',
        engine: 'MEMORY',
        configKey: 'defaultExpiry',
        configValue: -1,
      };

      const error = new CacherConfigError('Invalid config value', metadata);

      asserts.assert(error instanceof CacherError);
    });
  });

  await t.step('CacherOperationError', async (t) => {
    await t.step('should create an operation error with metadata', () => {
      const metadata = {
        name: 'test-cacher',
        engine: 'MEMORY',
        operation: 'SET' as const,
        key: 'test-key',
        expiry: -1,
      };

      const error = new CacherOperationError('Invalid operation', metadata);

      asserts.assertEquals(error.message, 'Invalid operation');
      asserts.assertEquals(error.context, metadata);
      asserts.assertEquals(error.context.operation, 'SET');
      asserts.assertEquals(error.context.key, 'test-key');
      asserts.assertEquals(error.name, 'CacherOperationError');
    });

    await t.step('should extend CacherError', () => {
      const metadata = {
        name: 'test-cacher',
        engine: 'MEMORY',
        operation: 'GET' as const,
        key: 'test-key',
      };

      const error = new CacherOperationError('Operation failed', metadata);

      asserts.assert(error instanceof CacherError);
    });
  });

  await t.step('Implementation-specific errors', async (t) => {
    await t.step('should be structured similarly', () => {
      // We won't import the specific error classes here, but we'll test
      // that the basic structure follows the pattern of extending CacherError
      const error = new CacherError('Base error', {
        name: 'test-cacher',
        engine: 'MEMORY',
      });

      asserts.assert('message' in error);
      asserts.assert('context' in error);
      asserts.assert('stack' in error);
    });
  });
});
