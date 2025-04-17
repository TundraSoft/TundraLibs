import * as asserts from '$asserts';
import {
  RedisCacherConnectError,
  RedisCacherOperationError,
} from '../errors/mod.ts';

Deno.test('Redis Error Classes', async (t) => {
  await t.step('RedisCacherConnectError', async (d) => {
    await d.step(
      'should correctly format error message with host and port',
      () => {
        const error = new RedisCacherConnectError({
          name: 'test-redis',
          host: 'localhost',
          port: 6379,
        });

        asserts.assert(error.message.includes('localhost:6379'));
        asserts.assert(error.message.includes('REDIS Server'));
        asserts.assertEquals(error.name, 'RedisCacherConnectError');
      },
    );

    await d.step(
      'should include credentials info when username is provided',
      () => {
        const error = new RedisCacherConnectError({
          name: 'test-redis',
          host: 'localhost',
          port: 6379,
          username: 'user',
          password: 'pass',
        });

        // The message should be templated correctly
        asserts.assert(error.message.includes('localhost:6379'));

        // Metadata should be stored properly
        asserts.assertEquals(error.context.username, 'user');
        asserts.assertEquals(error.context.password, 'pass');
      },
    );

    await d.step('should include optional database when provided', () => {
      const error = new RedisCacherConnectError({
        name: 'test-redis',
        host: 'localhost',
        port: 6379,
        db: 5,
      });

      asserts.assertEquals(error.context.db, 5);
    });

    await d.step('should propagate cause when provided', () => {
      const cause = new Error('Original error');
      const error = new RedisCacherConnectError({
        name: 'test-redis',
        host: 'localhost',
        port: 6379,
      }, cause);

      asserts.assertEquals(error.cause, cause);
    });
  });

  await t.step('RedisCacherOperationError', async (d) => {
    await d.step(
      'should correctly format error message for different operations',
      () => {
        const operations: Array<
          'GET' | 'SET' | 'HAS' | 'DELETE' | 'CLEAR' | 'OTHER'
        > = ['GET', 'SET', 'HAS', 'DELETE', 'CLEAR', 'OTHER'];

        for (const op of operations) {
          const error = new RedisCacherOperationError({
            name: 'test-redis',
            operation: op,
          });

          asserts.assert(error.message.includes('Error performing'));
          asserts.assertEquals(error.context.operation, op);
          asserts.assertEquals(error.context.engine, 'REDIS');
        }
      },
    );

    await d.step('should include key in error metadata when provided', () => {
      const error = new RedisCacherOperationError({
        name: 'test-redis',
        operation: 'GET',
        key: 'test-key',
      });

      asserts.assertEquals(error.context.key, 'test-key');
    });

    await d.step('should propagate cause when provided', () => {
      const cause = new Error('Original error');
      const error = new RedisCacherOperationError({
        name: 'test-redis',
        operation: 'SET',
        key: 'test-key',
      }, cause);

      asserts.assertEquals(error.cause, cause);
    });
  });
});
