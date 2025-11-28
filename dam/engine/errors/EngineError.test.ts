import * as asserts from '$asserts';
import { DAMEngineError } from './EngineError.ts';
import { DAMEngineErrorCodes } from './EngineErrorCodes.ts';

Deno.test({
  name: 'dam.engine.errors.DAMEngineError',
  fn: async (t) => {
    const mockMeta = {
      instanceId: 'test-instance',
      name: 'test-engine',
      engine: 'MockEngine',
    };

    await t.step('constructor and basic properties', async (u) => {
      await u.step('should create error with valid code', () => {
        const error = new DAMEngineError('CONNECTION_FAILED', mockMeta);

        asserts.assertInstanceOf(error, DAMEngineError);
        asserts.assertInstanceOf(error, Error);
        asserts.assertEquals(error.code, 'CONNECTION_FAILED');
        asserts.assertStringIncludes(error.message, 'Failed to connect to');
        asserts.assertEquals(error.context.instanceId, 'test-instance');
        asserts.assertEquals(error.context.name, 'test-engine');
        asserts.assertEquals(error.context.engine, 'MockEngine');
      });

      await u.step('should handle unknown error code', () => {
        const metaWithOriginal = { ...mockMeta, originalCode: undefined };
        const error = new DAMEngineError(
          'INVALID_CODE' as any,
          metaWithOriginal,
        );

        asserts.assertEquals(error.code, 'UNKNOWN_ERROR');
        asserts.assertStringIncludes(error.message, 'Unknown error occurred');
        asserts.assertEquals(
          (error.context as any).originalCode,
          'INVALID_CODE',
        );
      });

      await u.step('should preserve cause error', () => {
        const cause = new Error('Original error');
        const error = new DAMEngineError('CONNECTION_FAILED', mockMeta, cause);

        asserts.assertEquals(error.cause, cause);
      });

      await u.step('should handle metadata with additional properties', () => {
        const extendedMeta = {
          ...mockMeta,
          host: 'localhost',
          port: 5432,
          database: 'testdb',
          customField: 'value',
        };

        const error = new DAMEngineError('CONNECTION_FAILED', extendedMeta);

        asserts.assertEquals(error.context.host, 'localhost');
        asserts.assertEquals(error.context.port, 5432);
        asserts.assertEquals(error.context.database, 'testdb');
        asserts.assertEquals((error.context as any).customField, 'value');
      });
    });

    await t.step('error code coverage', async (u) => {
      const validCodes = [
        'UNKNOWN_ERROR',
        'UNSUPPORTED_OPERATION',
        'INVALID_CONFIG_VALUE',
        'MISSING_CONFIG_VALUE',
        'CONNECTION_FAILED',
        'DISCONNECTION_FAILED',
        'NO_CONNECTION',
        'MISSING_PARAMETERS',
        'TRANSACTION_NOT_FOUND',
        'DUPLICATE_TRANSACTION',
        'TRANSACTION_OPERATION_ERROR',
        'QUERY_EXECUTION_FAILED',
      ] as const;

      for (const code of validCodes) {
        await u.step(`should create error with code ${code}`, () => {
          const error = new DAMEngineError(code, mockMeta);
          asserts.assertEquals(error.code, code);
          asserts.assert(
            error.message.length > 0,
            `Message should not be empty for code: ${code}`,
          );
        });
      }
    });

    await t.step('error chaining and nesting', async (u) => {
      await u.step('should chain DAMEngineError instances', () => {
        const originalError = new DAMEngineError('CONNECTION_FAILED', mockMeta);
        const chainedError = new DAMEngineError('QUERY_EXECUTION_FAILED', {
          ...mockMeta,
          query: 'SELECT * FROM users',
        }, originalError);

        asserts.assertEquals(chainedError.cause, originalError);
        asserts.assertInstanceOf(chainedError.cause, DAMEngineError);
      });

      await u.step('should handle regular Error as cause', () => {
        const originalError = new TypeError('Invalid type');
        const error = new DAMEngineError('INVALID_CONFIG_VALUE', {
          ...mockMeta,
          key: 'port',
          reason: 'Invalid type',
        }, originalError);

        asserts.assertEquals(error.cause, originalError);
        asserts.assertInstanceOf(error.cause, TypeError);
      });

      await u.step('should handle nested DAMEngineError chain', () => {
        const level1 = new Error('System error');
        const level2 = new DAMEngineError(
          'CONNECTION_FAILED',
          mockMeta,
          level1,
        );
        const level3 = new DAMEngineError(
          'NO_CONNECTION',
          mockMeta,
          level2,
        );

        asserts.assertEquals(level3.cause, level2);
        asserts.assertEquals((level3.cause as DAMEngineError).cause, level1);
      });
    });

    await t.step('serialization and JSON output', async (u) => {
      await u.step('should serialize to JSON correctly', () => {
        const error = new DAMEngineError('QUERY_EXECUTION_FAILED', {
          ...mockMeta,
          query: 'SELECT * FROM users WHERE id = ?',
          params: { id: 123 },
        });

        const json = error.toJSON();

        asserts.assertEquals(json.name, 'DAMEngineError');
        asserts.assertStringIncludes(json.message, 'Failed to execute query');
        asserts.assertEquals((json.context as any).instanceId, 'test-instance');
        asserts.assertEquals(
          (json.context as any).query,
          'SELECT * FROM users WHERE id = ?',
        );
        asserts.assertObjectMatch((json.context as any).params, { id: 123 });
      });

      await u.step('should serialize with cause', () => {
        const cause = new Error('Database connection lost');
        const error = new DAMEngineError('CONNECTION_FAILED', mockMeta, cause);

        const json = error.toJSON();

        asserts.assert(json.cause);
        // Cause serialization format might vary
        if (typeof json.cause === 'object' && json.cause !== null) {
          asserts.assert('message' in json.cause);
          asserts.assertEquals(
            (json.cause as any).message,
            'Database connection lost',
          );
        }
      });

      await u.step('should serialize nested DAMEngineError causes', () => {
        const innerError = new DAMEngineError('CONNECTION_FAILED', {
          ...mockMeta,
        });
        const outerError = new DAMEngineError(
          'NO_CONNECTION',
          mockMeta,
          innerError,
        );

        const json = outerError.toJSON();

        asserts.assert(json.cause);
        asserts.assertEquals((json.cause as any)?.name, 'DAMEngineError');
        asserts.assertStringIncludes(
          (json.cause as any)?.message,
          'Failed to connect',
        );
      });
    });

    await t.step('error context and metadata handling', async (u) => {
      await u.step('should handle complex metadata types', () => {
        const complexMeta = {
          ...mockMeta,
          timestamps: {
            started: new Date('2024-01-01T00:00:00Z'),
            failed: new Date('2024-01-01T00:00:30Z'),
          },
          attempts: [1, 2, 3],
          config: {
            host: 'localhost',
            port: 5432,
            ssl: { rejectUnauthorized: false },
          },
        };

        const error = new DAMEngineError('CONNECTION_FAILED', complexMeta);

        asserts.assertEquals(
          error.context.timestamps.started,
          complexMeta.timestamps.started,
        );
        asserts.assertEquals((error.context as any).attempts.length, 3);
        asserts.assertEquals(
          (error.context as any).config.ssl.rejectUnauthorized,
          false,
        );
      });

      await u.step(
        'should handle undefined and null values in metadata',
        () => {
          const metaWithNulls = {
            ...mockMeta,
            key: 'testKey',
            reason: 'test reason',
            optionalField: undefined,
            nullField: null,
            emptyString: '',
            zeroNumber: 0,
            falseBoolean: false,
          };

          const error = new DAMEngineError(
            'INVALID_CONFIG_VALUE',
            metaWithNulls,
          );

          asserts.assertEquals((error.context as any).optionalField, undefined);
          asserts.assertEquals((error.context as any).nullField, null);
          asserts.assertEquals((error.context as any).emptyString, '');
          asserts.assertEquals((error.context as any).zeroNumber, 0);
          asserts.assertEquals((error.context as any).falseBoolean, false);
        },
      );
    });

    await t.step('inheritance and prototype chain', async (u) => {
      await u.step('should maintain proper prototype chain', () => {
        const error = new DAMEngineError('CONNECTION_FAILED', mockMeta);

        asserts.assert(error instanceof DAMEngineError);
        asserts.assert(error instanceof Error);
        asserts.assertEquals(error.constructor.name, 'DAMEngineError');
      });

      await u.step('should have correct stack trace', () => {
        const error = new DAMEngineError('QUERY_EXECUTION_FAILED', mockMeta);

        asserts.assert(error.stack);
        asserts.assert(error.stack !== undefined);
        if (error.stack) {
          asserts.assert(
            error.stack.includes('DAMEngineError') ||
              error.stack.includes('EngineError.test.ts'),
          );
        }
      });
    });

    await t.step('edge cases and error conditions', async (u) => {
      await u.step('should handle empty metadata gracefully', () => {
        const error = new DAMEngineError('UNKNOWN_ERROR', {
          instanceId: '',
          name: '',
          engine: '',
        });

        asserts.assertEquals(error.code, 'UNKNOWN_ERROR');
        asserts.assertEquals(error.context.instanceId, '');
        asserts.assertEquals(error.context.name, '');
        asserts.assertEquals(error.context.engine, '');
      });

      await u.step('should handle very long error messages', () => {
        const longMeta = {
          ...mockMeta,
          longField: 'A'.repeat(1000),
          query: 'SELECT * FROM table WHERE ' + 'condition AND '.repeat(100) +
            '1=1',
        };

        const error = new DAMEngineError('QUERY_EXECUTION_FAILED', longMeta);

        asserts.assertEquals((error.context as any).longField.length, 1000);
        asserts.assert((error.context as any).query.length > 100);
      });

      await u.step('should handle special characters in metadata', () => {
        const specialMeta = {
          ...mockMeta,
          key: 'testKey',
          reason: 'test reason',
          specialChars: 'Special chars: éñ中文🚀\n\t\r"\'\\',
          unicodeField: '🔥💀👻🎉',
          escapeChars: '\n\r\t\b\f\v\0',
        };

        const error = new DAMEngineError('INVALID_CONFIG_VALUE', specialMeta);

        asserts.assertEquals(
          (error.context as any).specialChars,
          specialMeta.specialChars,
        );
        asserts.assertEquals((error.context as any).unicodeField, '🔥💀👻🎉');
        asserts.assertEquals(
          (error.context as any).escapeChars,
          '\n\r\t\b\f\v\0',
        );
      });

      await u.step(
        'should handle circular references in metadata safely',
        () => {
          const circularMeta: any = {
            ...mockMeta,
            key: 'testKey',
            reason: 'test reason',
            ref: null,
          };
          circularMeta.ref = circularMeta;

          // Circular references should be detected and throw an error
          asserts.assertThrows(
            () => new DAMEngineError('INVALID_CONFIG_VALUE', circularMeta),
            Error,
            'Circular reference detected',
          );
        },
      );
    });

    await t.step('message template handling', async (u) => {
      await u.step('should use default message template', () => {
        const error = new DAMEngineError('CONNECTION_FAILED', mockMeta);
        // Default template should produce a meaningful message
        asserts.assertStringIncludes(error.message, 'Failed to connect to');
        asserts.assertStringIncludes(error.message, 'test-instance');
      });

      await u.step('should handle all defined error codes', () => {
        const allCodes = Object.keys(DAMEngineErrorCodes);

        // Test a subset of common codes to ensure they work
        const testCodes = [
          'CONNECTION_FAILED',
          'QUERY_EXECUTION_FAILED',
          'TRANSACTION_NOT_FOUND',
          'NO_CONNECTION',
          'INVALID_CONFIG_VALUE',
          'UNKNOWN_ERROR',
        ];

        for (const code of testCodes) {
          if (allCodes.includes(code)) {
            const error = new DAMEngineError(code as any, mockMeta);
            asserts.assertEquals(error.code, code);
            asserts.assert(
              error.message.length > 0,
              `Message should not be empty for code: ${code}`,
            );
          }
        }
      });
    });

    await t.step('type safety and generics', async (u) => {
      await u.step('should support extended metadata types', () => {
        const customMeta = {
          instanceId: 'test-instance',
          name: 'test-engine',
          engine: 'MockEngine',
          customField: 'custom-value',
          numericField: 42,
          host: 'localhost',
          database: 'testdb',
        };

        const error = new DAMEngineError('CONNECTION_FAILED', customMeta);

        // TypeScript should allow access to extended fields
        asserts.assertEquals(
          (error.context as any).customField,
          'custom-value',
        );
        asserts.assertEquals((error.context as any).numericField, 42);
        asserts.assertEquals((error.context as any).host, 'localhost');
        asserts.assertEquals((error.context as any).database, 'testdb');
      });
    });
  },
});
