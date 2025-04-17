import * as asserts from '$asserts';
import {
  MemCacherConnectError,
  MemCacherOperationError,
} from '../errors/mod.ts';

Deno.test('Memcached Error Classes', async (t) => {
  await t.step('MemCacherConnectError', async (d) => {
    await d.step(
      'should correctly format error message with host and port',
      () => {
        const error = new MemCacherConnectError({
          name: 'test-memcached',
          host: 'localhost',
          port: 11211,
        });

        asserts.assert(error.message.includes('localhost:11211'));
        asserts.assert(error.message.includes('MEMCACHED Server'));
        asserts.assertEquals(error.name, 'MemCacherConnectError');
      },
    );

    await d.step(
      'should include credentials info when username is provided',
      () => {
        const error = new MemCacherConnectError({
          name: 'test-memcached',
          host: 'localhost',
          port: 11211,
          username: 'user',
          password: 'pass',
        });

        // The message should be templated correctly
        asserts.assert(error.message.includes('localhost:11211'));

        // Metadata should be stored properly
        asserts.assertEquals(error.context.username, 'user');
        asserts.assertEquals(error.context.password, 'pass');
      },
    );

    await d.step('should propagate cause when provided', () => {
      const cause = new Error('Original error');
      const error = new MemCacherConnectError({
        name: 'test-memcached',
        host: 'localhost',
        port: 11211,
      }, cause);

      asserts.assertEquals(error.cause, cause);
    });
  });

  await t.step('MemCacherOperationError', async (d) => {
    await d.step(
      'should correctly format error message for different operations',
      () => {
        const operations: Array<
          'GET' | 'SET' | 'HAS' | 'DELETE' | 'CLEAR' | 'OTHER'
        > = ['GET', 'SET', 'HAS', 'DELETE', 'CLEAR', 'OTHER'];

        for (const op of operations) {
          const error = new MemCacherOperationError({
            name: 'test-memcached',
            operation: op,
          });

          asserts.assert(error.message.includes('Error performing'));
          asserts.assertEquals(error.context.operation, op);
          asserts.assertEquals(error.context.engine, 'MEMCACHED');
        }
      },
    );

    await d.step('should include key in error metadata when provided', () => {
      const error = new MemCacherOperationError({
        name: 'test-memcached',
        operation: 'GET',
        key: 'test-key',
      });

      asserts.assertEquals(error.context.key, 'test-key');
    });

    await d.step('should propagate cause when provided', () => {
      const cause = new Error('Original error');
      const error = new MemCacherOperationError({
        name: 'test-memcached',
        operation: 'SET',
        key: 'test-key',
      }, cause);

      asserts.assertEquals(error.cause, cause);
    });
  });
});
