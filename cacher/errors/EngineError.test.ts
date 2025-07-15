import * as asserts from '$asserts';
import { CacherEngineError, type CacherErrorMeta } from './EngineError.ts';
import {
  type CacherEngineErrorCode,
  CacherEngineErrorCodes,
} from './EngineErrorCodes.ts';

/**
 * Test suite for CacherEngineError class.
 * Tests the engine-specific error functionality with error codes.
 */
Deno.test(
  'cacher.errors.CacherEngineError',
  async (t) => {
    await t.step('should create a CacherEngineError instance', () => {
      const meta: CacherErrorMeta = { name: 'testCache', engine: 'memory' };
      const error = new CacherEngineError('UNKNOWN_ERROR', meta);

      asserts.assertInstanceOf(error, CacherEngineError);
      asserts.assertInstanceOf(error, Error);
      asserts.assertEquals(error.name, 'CacherEngineError');
      asserts.assertEquals(error.code, 'UNKNOWN_ERROR');
      asserts.assertEquals(error.message, CacherEngineErrorCodes.UNKNOWN_ERROR);
      asserts.assertEquals(error.context, meta);
      asserts.assertInstanceOf(error.timeStamp, Date);
    });

    await t.step('should handle all predefined error codes', () => {
      const meta: CacherErrorMeta = { name: 'testCache', engine: 'redis' };

      // Test a few specific error codes to verify processing
      const error1 = new CacherEngineError('UNKNOWN_ERROR', meta);
      asserts.assertEquals(error1.code, 'UNKNOWN_ERROR');
      asserts.assertEquals(error1.message, 'Unknown error occurred');

      const error2 = new CacherEngineError('CONFIG_MALFORMED', meta);
      asserts.assertEquals(error2.code, 'CONFIG_MALFORMED');
      asserts.assertEquals(error2.message, 'Configuration is malformed');

      const error3 = new CacherEngineError('CONNECTION_FAILED', meta);
      asserts.assertEquals(error3.code, 'CONNECTION_FAILED');
      // The ${engine} variable is processed, but ${reason} is not (since it's not in meta)
      asserts.assertEquals(
        error3.message,
        'Failed to connect to redis: ${reason}',
      );

      const error4 = new CacherEngineError('CONNECTION_REFUSED', meta);
      asserts.assertEquals(error4.code, 'CONNECTION_REFUSED');
      asserts.assertEquals(error4.message, 'Connection to redis was refused');
    });

    await t.step('should handle CONFIG_MISSING with template variables', () => {
      const meta: CacherErrorMeta = {
        name: 'redisCache',
        engine: 'redis',
        configKey: 'host',
      };

      const error = new CacherEngineError('CONFIG_MISSING', meta);
      asserts.assertEquals(error.code, 'CONFIG_MISSING');
      asserts.assertEquals(error.message, 'Configuration key host is missing');
    });

    await t.step('should handle CONFIG_INVALID with template variables', () => {
      const meta: CacherErrorMeta = {
        name: 'redisCache',
        engine: 'redis',
        configKey: 'port',
        reason: 'must be a number between 1 and 65535',
      };

      const error = new CacherEngineError('CONFIG_INVALID', meta);
      asserts.assertEquals(error.code, 'CONFIG_INVALID');
      asserts.assertEquals(
        error.message,
        'Configuration value for port is invalid: must be a number between 1 and 65535',
      );
    });

    await t.step(
      'should handle CONNECTION_FAILED with template variables',
      () => {
        const meta: CacherErrorMeta = {
          name: 'redisCache',
          engine: 'redis',
          reason: 'connection timeout after 5000ms',
        };

        const error = new CacherEngineError('CONNECTION_FAILED', meta);
        asserts.assertEquals(error.code, 'CONNECTION_FAILED');
        asserts.assertEquals(
          error.message,
          'Failed to connect to redis: connection timeout after 5000ms',
        );
      },
    );

    await t.step(
      'should handle CONNECTION_TIMEOUT with template variables',
      () => {
        const meta: CacherErrorMeta = {
          name: 'redisCache',
          engine: 'redis',
          timeout: 10000,
        };

        const error = new CacherEngineError('CONNECTION_TIMEOUT', meta);
        asserts.assertEquals(error.code, 'CONNECTION_TIMEOUT');
        asserts.assertEquals(
          error.message,
          'Connection to redis timed out after 10000ms',
        );
      },
    );

    await t.step(
      'should handle OPERATION_NOT_SUPPORTED with template variables',
      () => {
        const meta: CacherErrorMeta = {
          name: 'simpleCache',
          engine: 'memory',
          operation: 'expire',
        };

        const error = new CacherEngineError('OPERATION_NOT_SUPPORTED', meta);
        asserts.assertEquals(error.code, 'OPERATION_NOT_SUPPORTED');
        asserts.assertEquals(
          error.message,
          'Operation expire is not supported in memory',
        );
      },
    );

    await t.step(
      'should handle OPERATION_INVALID_PARAMS with template variables',
      () => {
        const meta: CacherErrorMeta = {
          name: 'redisCache',
          engine: 'redis',
          operation: 'set',
          reason: 'TTL must be a positive number',
        };

        const error = new CacherEngineError('OPERATION_INVALID_PARAMS', meta);
        asserts.assertEquals(error.code, 'OPERATION_INVALID_PARAMS');
        asserts.assertEquals(
          error.message,
          'Invalid parameters for operation set: TTL must be a positive number',
        );
      },
    );

    await t.step('should handle cause errors', () => {
      const meta: CacherErrorMeta = { name: 'cache1', engine: 'redis' };
      const cause = new Error('Network connection failed');
      const error = new CacherEngineError('CONNECTION_FAILED', meta, cause);

      asserts.assertEquals(error.cause, cause);
      asserts.assertEquals(error.getRootCause(), cause);
      asserts.assertEquals(error.code, 'CONNECTION_FAILED');
    });

    await t.step('should handle nested CacherEngineError causes', () => {
      const meta1: CacherErrorMeta = { name: 'cache1', engine: 'redis' };
      const meta2: CacherErrorMeta = { name: 'cache2', engine: 'memory' };

      const rootError = new CacherEngineError('CONFIG_MISSING', meta1);
      const midError = new CacherEngineError(
        'CONNECTION_FAILED',
        meta2,
        rootError,
      );
      const topError = new CacherEngineError(
        'OPERATION_FAILED',
        meta1,
        midError,
      );

      asserts.assertEquals(topError.getRootCause(), rootError);
      asserts.assertEquals(topError.cause, midError);
      asserts.assertEquals(midError.cause, rootError);
      asserts.assertEquals(topError.code, 'OPERATION_FAILED');
      asserts.assertEquals(midError.code, 'CONNECTION_FAILED');
      asserts.assertEquals(rootError.code, 'CONFIG_MISSING');
    });

    await t.step('should serialize to JSON correctly', () => {
      const meta: CacherErrorMeta = {
        name: 'cache1',
        engine: 'redis',
        operation: 'get',
        key: 'user:123',
        reason: 'timeout occurred',
      };
      const error = new CacherEngineError('OPERATION_FAILED', meta);
      const json = error.toJSON();

      asserts.assertEquals(json.name, 'CacherEngineError');
      // The _baseMessage should be the template-processed version
      asserts.assertEquals(
        json.message,
        'Operation get failed: timeout occurred',
      );
      asserts.assertEquals(json.context, meta);
      asserts.assertEquals(typeof json.timeStamp, 'string');
      asserts.assertEquals(typeof json.stack, 'string');
      asserts.assertEquals(json.cause, undefined);
    });

    await t.step('should serialize with cause to JSON correctly', () => {
      const meta: CacherErrorMeta = {
        name: 'cache1',
        engine: 'redis',
      };
      const cause = new Error('Connection reset by peer');
      const error = new CacherEngineError('CONNECTION_LOST', meta, cause);
      const json = error.toJSON();

      asserts.assertEquals(json.name, 'CacherEngineError');
      // Template variables should be processed using meta values
      asserts.assertEquals(json.message, 'Connection to redis was lost');
      asserts.assertEquals(json.context, meta);
      asserts.assertEquals(json.cause, 'Error: Connection reset by peer');
    });

    await t.step(
      'should handle complex metadata with extended properties',
      () => {
        interface ExtendedMeta extends CacherErrorMeta {
          host: string;
          port: number;
          database: number;
          retryAttempts: number;
          lastAttempt: Date;
        }

        const meta: ExtendedMeta = {
          name: 'redisCache',
          engine: 'redis',
          host: 'redis.example.com',
          port: 6379,
          database: 1,
          retryAttempts: 3,
          lastAttempt: new Date('2023-01-01T10:00:00Z'),
        };

        const error = new CacherEngineError<ExtendedMeta>(
          'CONNECTION_FAILED',
          meta,
        );

        asserts.assertEquals(error.getContextValue('name'), 'redisCache');
        asserts.assertEquals(
          error.getContextValue('host'),
          'redis.example.com',
        );
        asserts.assertEquals(error.getContextValue('port'), 6379);
        asserts.assertEquals(error.getContextValue('database'), 1);
        asserts.assertEquals(error.getContextValue('retryAttempts'), 3);
        asserts.assertInstanceOf(error.getContextValue('lastAttempt'), Date);
      },
    );

    await t.step('should inherit from CacherError correctly', () => {
      const meta: CacherErrorMeta = { name: 'cache1', engine: 'memory' };
      const error = new CacherEngineError('UNKNOWN_ERROR', meta);

      // Should have BaseError and CacherError methods
      asserts.assertEquals(typeof error.getRootCause, 'function');
      asserts.assertEquals(typeof error.toJSON, 'function');
      asserts.assertEquals(typeof error.getContextValue, 'function');
      asserts.assertEquals(typeof error.getCodeSnippet, 'function');

      // Should have specific CacherEngineError properties
      asserts.assertEquals(typeof error.code, 'string');

      // Should have proper prototype chain
      asserts.assertEquals(error.constructor.name, 'CacherEngineError');
      asserts.assertEquals(error.name, 'CacherEngineError');
    });

    // Test error code handling
    await t.step('should handle invalid error codes gracefully', () => {
      const meta: CacherErrorMeta = { name: 'cache1', engine: 'memory' };

      // TypeScript will prevent this, but test runtime behavior
      const invalidCode = 'INVALID_CODE' as CacherEngineErrorCode;
      const error = new CacherEngineError(invalidCode, meta);

      // Should fallback to UNKNOWN_ERROR
      asserts.assertEquals(error.code, 'UNKNOWN_ERROR');
      asserts.assertEquals(error.message, CacherEngineErrorCodes.UNKNOWN_ERROR);
      asserts.assertEquals(
        error.getContextValue('originalCode'),
        'INVALID_CODE',
      );
    });

    await t.step(
      'should preserve original code in metadata for invalid codes',
      () => {
        const meta: CacherErrorMeta = { name: 'cache1', engine: 'memory' };

        // Force an invalid code for testing
        const invalidCode = 'NON_EXISTENT_CODE' as CacherEngineErrorCode;
        const error = new CacherEngineError(invalidCode, meta);

        asserts.assertEquals(error.code, 'UNKNOWN_ERROR');
        asserts.assertEquals(
          error.getContextValue('originalCode'),
          'NON_EXISTENT_CODE',
        );
        asserts.assertEquals(error.getContextValue('name'), 'cache1');
        asserts.assertEquals(error.getContextValue('engine'), 'memory');
      },
    );

    await t.step('should handle multiple invalid codes correctly', () => {
      const meta: CacherErrorMeta = { name: 'cache1', engine: 'memory' };

      const invalidCodes = [
        'NOT_A_CODE',
        'ANOTHER_INVALID_CODE',
        '',
        'CODE_THAT_DOES_NOT_EXIST',
      ] as unknown as CacherEngineErrorCode[];

      invalidCodes.forEach((code) => {
        const error = new CacherEngineError(code, meta);
        asserts.assertEquals(error.code, 'UNKNOWN_ERROR');
        asserts.assertEquals(
          error.message,
          CacherEngineErrorCodes.UNKNOWN_ERROR,
        );
        asserts.assertEquals(error.getContextValue('originalCode'), code);
      });
    });

    await t.step('should validate all error codes exist', () => {
      // Ensure all expected error codes are present
      const expectedCodes = [
        'UNKNOWN_ERROR',
        'CONFIG_MALFORMED',
        'CONFIG_MISSING',
        'CONFIG_INVALID',
        'CONNECTION_FAILED',
        'CONNECTION_TIMEOUT',
        'CONNECTION_REFUSED',
        'CONNECTION_LOST',
        'CONNECTION_INVALID_CREDENTIALS',
        'OPERATION_NOT_SUPPORTED',
        'OPERATION_FAILED',
        'OPERATION_INVALID_PARAMS',
        'OPERATION_PERMISSION_DENIED',
      ];

      expectedCodes.forEach((code) => {
        asserts.assert(
          code in CacherEngineErrorCodes,
          `Error code ${code} should exist in CacherEngineErrorCodes`,
        );
        asserts.assertEquals(
          typeof CacherEngineErrorCodes[code as CacherEngineErrorCode],
          'string',
          `Error code ${code} should have a string message`,
        );
      });
    });

    await t.step(
      'should handle error code template variables correctly',
      () => {
        const meta: CacherErrorMeta = {
          name: 'cache1',
          engine: 'redis',
          configKey: 'password',
          reason: 'cannot be empty',
          operation: 'authenticate',
          timeout: 5000,
        };

        // Test template variable substitution in different error messages
        const templateTests = [
          {
            code: 'CONFIG_MISSING' as CacherEngineErrorCode,
            expected: 'Configuration key password is missing',
          },
          {
            code: 'CONFIG_INVALID' as CacherEngineErrorCode,
            expected:
              'Configuration value for password is invalid: cannot be empty',
          },
          {
            code: 'CONNECTION_TIMEOUT' as CacherEngineErrorCode,
            expected: 'Connection to redis timed out after 5000ms',
          },
          {
            code: 'OPERATION_NOT_SUPPORTED' as CacherEngineErrorCode,
            expected: 'Operation authenticate is not supported in redis',
          },
        ];

        templateTests.forEach(({ code, expected }) => {
          const error = new CacherEngineError(code, meta);
          asserts.assertEquals(error.message, expected);
        });
      },
    );

    // Test edge cases and error scenarios
    await t.step('should handle missing template variables gracefully', () => {
      const meta: CacherErrorMeta = { name: 'cache1', engine: 'redis' };

      // Create error that expects template variables but doesn't have them
      const error = new CacherEngineError('CONFIG_MISSING', meta);

      // Should show template variable placeholder instead of crashing
      asserts.assertEquals(
        error.message,
        'Configuration key ${configKey} is missing',
      );
    });

    await t.step('should handle partial template variables', () => {
      const meta: CacherErrorMeta = {
        name: 'cache1',
        engine: 'redis',
        configKey: 'host',
        // Missing 'reason' for CONFIG_INVALID
      };

      const error = new CacherEngineError('CONFIG_INVALID', meta);

      // Should substitute available variables and leave missing ones as placeholders
      asserts.assertEquals(
        error.message,
        'Configuration value for host is invalid: ${reason}',
      );
    });

    await t.step('should handle empty metadata gracefully', () => {
      const meta = {} as CacherErrorMeta;
      const error = new CacherEngineError('UNKNOWN_ERROR', meta);

      asserts.assertInstanceOf(error, CacherEngineError);
      asserts.assertEquals(error.code, 'UNKNOWN_ERROR');
      asserts.assertEquals(error.context, meta);
    });

    await t.step('should preserve stack trace correctly', () => {
      function createEngineError() {
        const meta: CacherErrorMeta = { name: 'cache1', engine: 'memory' };
        return new CacherEngineError('OPERATION_FAILED', meta);
      }

      const error = createEngineError();
      asserts.assertEquals(typeof error.stack, 'string');
      if (error.stack) {
        asserts.assertStringIncludes(error.stack, 'createEngineError');
        asserts.assertStringIncludes(error.stack, 'CacherEngineError');
      }
    });

    await t.step(
      'should handle very long error messages from templates',
      () => {
        const meta: CacherErrorMeta = {
          name: 'cache1',
          engine: 'redis',
          reason: 'A'.repeat(5000), // Very long reason
        };

        const error = new CacherEngineError('CONNECTION_FAILED', meta);

        asserts.assertStringIncludes(
          error.message,
          'Failed to connect to redis: ',
        );
        asserts.assertStringIncludes(error.message, 'A'.repeat(5000));
        asserts.assert(error.message.length > 5000);
      },
    );

    await t.step(
      'should handle special characters in template variables',
      () => {
        const meta: CacherErrorMeta = {
          name: 'cache-test!@#',
          engine: 'redis',
          configKey: 'password_with_special_chars!@#$%^&*()',
          reason: 'contains invalid characters: !@#$%^&*() and unicode: 🚨',
          operation: 'set-with-special-key!@#',
        };

        const error = new CacherEngineError('CONFIG_INVALID', meta);

        asserts.assertStringIncludes(
          error.message,
          'password_with_special_chars!@#$%^&*()',
        );
        asserts.assertStringIncludes(
          error.message,
          'contains invalid characters: !@#$%^&*() and unicode: 🚨',
        );
      },
    );

    await t.step(
      'should maintain error code consistency across operations',
      () => {
        const meta: CacherErrorMeta = { name: 'cache1', engine: 'redis' };

        // Create multiple errors with same code
        const error1 = new CacherEngineError('CONNECTION_FAILED', meta);
        const error2 = new CacherEngineError('CONNECTION_FAILED', {
          ...meta,
          additional: 'data',
        });

        asserts.assertEquals(error1.code, error2.code);
        asserts.assertEquals(error1.code, 'CONNECTION_FAILED');
        asserts.assertEquals(error2.code, 'CONNECTION_FAILED');

        // Messages should be the same when no template variables are used
        const baseMeta: CacherErrorMeta = { name: 'cache1', engine: 'redis' };
        const baseError1 = new CacherEngineError('CONFIG_MALFORMED', baseMeta);
        const baseError2 = new CacherEngineError('CONFIG_MALFORMED', baseMeta);

        asserts.assertEquals(baseError1.message, baseError2.message);
      },
    );
  },
);
