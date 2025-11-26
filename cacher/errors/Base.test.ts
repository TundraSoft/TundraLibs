import * as asserts from '$asserts';
import { CacherError } from './Base.ts';

/**
 * Test suite for CacherError class.
 * Tests the base error functionality for manager-level errors.
 */
Deno.test(
  'cacher.errors.CacherError',
  async (t) => {
    await t.step('should create a CacherError instance', () => {
      const meta = { name: 'testCache', engine: 'memory' };
      const error = new CacherError('Test error', meta);

      asserts.assertInstanceOf(error, CacherError);
      asserts.assertInstanceOf(error, Error);
      asserts.assertEquals(error.name, 'CacherError');
      asserts.assertEquals(error.message, 'Test error');
      asserts.assertEquals(error.context, meta);
      asserts.assertInstanceOf(error.timeStamp, Date);
    });

    await t.step('should store provided metadata', () => {
      const meta = {
        name: 'userCache',
        engine: 'redis',
        additionalInfo: 'test data',
        port: 6379,
      };
      const error = new CacherError('Connection failed', meta);

      asserts.assertEquals(error.context, meta);
      asserts.assertEquals(error.getContextValue('name'), 'userCache');
      asserts.assertEquals(error.getContextValue('engine'), 'redis');
      asserts.assertEquals(
        error.getContextValue('additionalInfo'),
        'test data',
      );
      asserts.assertEquals(error.getContextValue('port'), 6379);
    });

    await t.step('should use simple message template', () => {
      const meta = { name: 'cache1', engine: 'memory' };
      const error = new CacherError('Test error message', meta);

      // CacherError uses a simple template that just shows the message
      asserts.assertEquals(error.message, 'Test error message');
    });

    await t.step('should handle message with template variables', () => {
      const meta = {
        name: 'cache1',
        engine: 'memory',
        operation: 'get',
        key: 'user:123',
      };
      const error = new CacherError(
        'Operation ${operation} failed for key ${key}',
        meta,
      );

      asserts.assertEquals(
        error.message,
        'Operation get failed for key user:123',
      );
    });

    await t.step('should handle cause errors', () => {
      const meta = { name: 'cache1', engine: 'memory' };
      const cause = new Error('Underlying error');
      const error = new CacherError('Manager error', meta, cause);

      asserts.assertEquals(error.cause, cause);
      asserts.assertEquals(error.getRootCause(), cause);
    });

    await t.step('should handle nested CacherError causes', () => {
      const meta1 = { name: 'cache1', engine: 'memory' };
      const meta2 = { name: 'cache2', engine: 'redis' };

      const rootError = new CacherError('Root error', meta1);
      const midError = new CacherError('Mid error', meta2, rootError);
      const topError = new CacherError('Top error', meta1, midError);

      asserts.assertEquals(topError.getRootCause(), rootError);
      asserts.assertEquals(topError.cause, midError);
      asserts.assertEquals(midError.cause, rootError);
    });

    await t.step('should serialize to JSON correctly', () => {
      const meta = {
        name: 'cache1',
        engine: 'memory',
        operation: 'set',
        ttl: 3600,
      };
      const error = new CacherError('Serialization test', meta);
      const json = error.toJSON();

      asserts.assertEquals(json.name, 'CacherError');
      asserts.assertEquals(json.message, 'Serialization test');
      asserts.assertEquals(json.context, meta);
      asserts.assertEquals(typeof json.timeStamp, 'string');
      asserts.assertEquals(typeof json.stack, 'string');
      asserts.assertEquals(json.cause, undefined);
    });

    await t.step('should serialize with cause to JSON correctly', () => {
      const meta = { name: 'cache1', engine: 'memory' };
      const cause = new Error('Network error');
      const error = new CacherError('Manager error', meta, cause);
      const json = error.toJSON();

      asserts.assertEquals(json.name, 'CacherError');
      asserts.assertEquals(json.message, 'Manager error');
      asserts.assertEquals(json.context, meta);
      asserts.assertEquals(json.cause, 'Error: Network error');
    });

    await t.step('should serialize with nested CacherError cause', () => {
      const meta1 = { name: 'cache1', engine: 'memory' };
      const meta2 = { name: 'cache2', engine: 'redis' };

      const causeError = new CacherError('Cause error', meta2);
      const mainError = new CacherError('Main error', meta1, causeError);
      const json = mainError.toJSON();

      asserts.assertEquals(json.name, 'CacherError');
      asserts.assertEquals(json.message, 'Main error');
      asserts.assertEquals(json.context, meta1);
      asserts.assertEquals(typeof json.cause, 'object');

      const causeJson = json.cause as Record<string, unknown>;
      asserts.assertEquals(causeJson.name, 'CacherError');
      asserts.assertEquals(causeJson.message, 'Cause error');
      asserts.assertEquals(causeJson.context, meta2);
    });

    await t.step('should handle complex metadata types', () => {
      interface ComplexMeta extends Record<string, unknown> {
        name: string;
        engine: string;
        config: {
          host: string;
          port: number;
          options: string[];
        };
        attempts: number;
        lastError?: string;
      }

      const meta: ComplexMeta = {
        name: 'complexCache',
        engine: 'redis',
        config: {
          host: 'localhost',
          port: 6379,
          options: ['compression', 'encryption'],
        },
        attempts: 3,
        lastError: 'Connection timeout',
      };

      const error = new CacherError<ComplexMeta>('Complex error', meta);

      asserts.assertEquals(error.getContextValue('name'), 'complexCache');
      asserts.assertEquals(error.getContextValue('config').host, 'localhost');
      asserts.assertEquals(error.getContextValue('config').options.length, 2);
      asserts.assertEquals(error.getContextValue('attempts'), 3);
      asserts.assertEquals(
        error.getContextValue('lastError'),
        'Connection timeout',
      );
    });

    await t.step('should handle minimum required metadata', () => {
      const meta = { name: 'minCache', engine: 'memory' };
      const error = new CacherError('Minimal error', meta);

      asserts.assertEquals(error.getContextValue('name'), 'minCache');
      asserts.assertEquals(error.getContextValue('engine'), 'memory');
      asserts.assertEquals(error.context, meta);
    });

    await t.step('should handle metadata with undefined values', () => {
      const meta = {
        name: 'cache1',
        engine: 'memory',
        optionalField: undefined,
        nullField: null as unknown as string,
      };
      const error = new CacherError('Test with undefined', meta);

      asserts.assertEquals(error.getContextValue('name'), 'cache1');
      asserts.assertEquals(error.getContextValue('optionalField'), undefined);
      asserts.assertEquals(error.getContextValue('nullField'), null);
    });

    await t.step('should inherit from BaseError correctly', () => {
      const meta = { name: 'cache1', engine: 'memory' };
      const error = new CacherError('Inheritance test', meta);

      // Should have BaseError methods
      asserts.assertEquals(typeof error.getRootCause, 'function');
      asserts.assertEquals(typeof error.toJSON, 'function');
      asserts.assertEquals(typeof error.getContextValue, 'function');
      asserts.assertEquals(typeof error.getCodeSnippet, 'function');

      // Should have proper prototype chain
      asserts.assertEquals(error.constructor.name, 'CacherError');
      asserts.assertEquals(error.name, 'CacherError');
    });

    await t.step('should handle message template variables correctly', () => {
      const meta = {
        name: 'userCache',
        engine: 'redis',
        host: 'redis.example.com',
        port: 6379,
        database: 1,
      };

      const error = new CacherError(
        'Failed to connect to ${engine} at ${host}:${port} database ${database} for cache ${name}',
        meta,
      );

      asserts.assertEquals(
        error.message,
        'Failed to connect to redis at redis.example.com:6379 database 1 for cache userCache',
      );
    });

    // Edge cases and error scenarios
    await t.step('should handle empty metadata gracefully', () => {
      const meta = {} as { name: string; engine: string };
      const error = new CacherError('Empty meta error', meta);

      asserts.assertInstanceOf(error, CacherError);
      asserts.assertEquals(error.context, meta);
      asserts.assertEquals(error.getContextValue('name'), undefined);
      asserts.assertEquals(error.getContextValue('engine'), undefined);
    });

    await t.step('should handle very long error messages', () => {
      const meta = { name: 'cache1', engine: 'memory' };
      const longMessage = 'A'.repeat(10000);
      const error = new CacherError(longMessage, meta);

      asserts.assertEquals(error.message, longMessage);
      asserts.assertEquals(error.message.length, 10000);
    });

    await t.step(
      'should handle special characters in messages and metadata',
      () => {
        const meta = {
          name: 'cache-with-special-chars!@#$%^&*()',
          engine: 'memory',
          path: '/path/to/cache/file.db',
          regex: '\\w+\\d+',
          unicode: '🚨 Error occurred 🚨',
        };

        const error = new CacherError(
          'Special chars: !@#$%^&*() and unicode: 🔥💯',
          meta,
        );

        asserts.assertStringIncludes(error.message, '!@#$%^&*()');
        asserts.assertStringIncludes(error.message, '🔥💯');
        asserts.assertEquals(
          error.getContextValue('unicode'),
          '🚨 Error occurred 🚨',
        );
      },
    );
    await t.step('should handle circular references in metadata safely', () => {
      const meta: any = { name: 'cache1', engine: 'memory' };
      meta.self = meta; // Create circular reference

      // Should throw when creating the error due to circular reference detection
      asserts.assertThrows(
        () => {
          return new CacherError('Circular ref test', meta);
        },
        Error,
        'Circular reference detected',
      );
    });

    await t.step('should preserve stack trace correctly', () => {
      function createError() {
        const meta = { name: 'cache1', engine: 'memory' };
        return new CacherError('Stack trace test', meta);
      }

      const error = createError();
      asserts.assertEquals(typeof error.stack, 'string');
      if (error.stack) {
        asserts.assertStringIncludes(error.stack, 'createError');
        asserts.assertStringIncludes(error.stack, 'CacherError');
      }
    });

    await t.step('should handle metadata with function values', () => {
      const meta = {
        name: 'cache1',
        engine: 'memory',
        callback: () => 'test function',
        toString: function () {
          return 'custom toString';
        },
      };

      const error = new CacherError('Function metadata test', meta);
      asserts.assertEquals(
        typeof error.getContextValue('callback'),
        'function',
      );
      asserts.assertEquals(
        error.getContextValue('callback')(),
        'test function',
      );
    });
  },
);
