import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import {
  makeTempDirSync,
  removeSync,
  writeTextFileSync,
} from '@tundralibs/compat';
import { BaseError, type BaseErrorJson } from './BaseError.ts';

describe(
  {
    name: 'utils.BaseError',
    permissions: { read: true },
    fn: () => {
      it(
        'should create an instance of BaseError',
        () => {
          const error = new BaseError('Test error');
          asserts.assertInstanceOf(error, BaseError);
          asserts.assertStringIncludes(error.message, 'Test error');
          asserts.assertEquals(error.name, 'BaseError');
          asserts.assertInstanceOf(error.timeStamp, Date);
        },
      );

      it(
        'should store provided context',
        () => {
          const context = { userId: 123 };
          const error = new BaseError('Test error', context);
          asserts.assertEquals(error.context, context);
          asserts.assertEquals(error.getContextValue('userId'), 123);
        },
      );

      it(
        'should replace placeholders in message with context values',
        () => {
          const context = { userId: 123, action: 'login' };
          const error = new BaseError(
            'Error for user ${userId} during ${action}',
            context,
          );
          asserts.assertStringIncludes(
            error.message,
            'Error for user 123 during login',
          );
        },
      );

      it(
        'getContextValue should return undefined for missing keys',
        () => {
          const context = { userId: 123 };
          const error = new BaseError('Test error', context);
          asserts.assertEquals(
            error.getContextValue('missingKey' as keyof typeof context),
            undefined,
          );
        },
      );

      it('should handle cause error', () => {
        const cause = new Error('Original error');
        const error = new BaseError('Test error', {}, cause);
        asserts.assertEquals(error.cause, cause);
      });

      // `Error.cause` is `unknown` in the standard lib; BaseError
      // redeclares it as `Error | undefined` because the constructor
      // accepts nothing else. These reads must compile with no cast —
      // if the declaration is dropped, this test stops type-checking
      // rather than merely failing an assertion.
      it('exposes `cause` as an Error, readable without a cast', () => {
        const cause = new Error('Original error');
        const error = new BaseError('Test error', {}, cause);

        asserts.assertEquals(error.cause?.message, 'Original error');
        asserts.assertEquals(error.cause?.name, 'Error');
        asserts.assert(error.cause?.stack !== undefined);

        // Absent cause stays `undefined`, so optional chaining is the
        // documented way to read it.
        const noCause = new BaseError('No cause');
        asserts.assertEquals(noCause.cause?.message, undefined);
      });

      it('getRootCause walks a mixed chain to the deepest error', () => {
        const root = new Error('Root failure');
        const middle = new BaseError('Middle', {}, root);
        const top = new BaseError('Top', {}, middle);

        asserts.assertEquals(top.getRootCause(), root);
        asserts.assertEquals(top.getRootCause().message, 'Root failure');
        asserts.assertEquals(middle.getRootCause(), root);
        // No cause at all — the error is its own root.
        const lone = new BaseError('Lone');
        asserts.assertEquals(lone.getRootCause(), lone);
      });

      it('should handle missing Error.captureStackTrace', () => {
        // Temporarily remove Error.captureStackTrace
        const originalCaptureStackTrace = Error.captureStackTrace;
        // deno-lint-ignore no-explicit-any
        (Error as any).captureStackTrace = undefined;

        const error = new BaseError('Test error');
        asserts.assertInstanceOf(error, BaseError);
        asserts.assertEquals(error.stack !== undefined, true);

        // Restore Error.captureStackTrace
        Error.captureStackTrace = originalCaptureStackTrace;
      });

      it('should have a stack trace', () => {
        const error = new BaseError('Test error');
        asserts.assertEquals(typeof error.stack, 'string');
      });

      it('context should default to empty object', () => {
        const error = new BaseError('Test error');
        asserts.assertEquals(error.context, {});
      });

      it(`handle missing context in message`, () => {
        const context = { userId: 123 };
        const error = new BaseError(
          'Error for user ${userId} during ${action}',
          context,
        );
        asserts.assertStringIncludes(
          error.message,
          'Error for user 123 during ${action}',
        );
      });

      it('get codeSnippet', () => {
        const error = new BaseError('Test error');
        const snippet = error.getCodeSnippet(5);
        asserts.assertEquals(typeof snippet, 'string');
        asserts.assertEquals(snippet.includes('Test error'), true);
        asserts.assertEquals(
          snippet.includes(`it('get codeSnippet', () => {`),
          true,
        );
      });

      it('get codeSnippet for nested', () => {
        const error = new BaseError(
          'Test error',
          {},
          new BaseError('Cause error'),
        );
        const snippet = error.getCodeSnippet(5);
        asserts.assertEquals(typeof snippet, 'string');
        asserts.assertEquals(snippet.includes('Cause error'), true);
        asserts.assertEquals(
          snippet.includes(`it('get codeSnippet for nested',`),
          true,
        );

        const error2 = new BaseError(
          'Test error',
          {},
          new Error('Cause error'),
        );
        const snippet2 = error2.getCodeSnippet(5);
        asserts.assertEquals(typeof snippet2, 'string');
        asserts.assertEquals(snippet2.includes('Cause error'), true);
        asserts.assertEquals(
          snippet2.includes(`const error2 = new BaseError`),
          true,
        );
      });

      it('get root cause', () => {
        const error = new BaseError(
          'Test error',
          {},
          new BaseError('Cause error'),
        );
        const error2 = new BaseError('Hi there');
        const error3 = new BaseError('Hi there', {}, new Error('Normal Error'));
        asserts.assertStringIncludes(
          error.getRootCause().message,
          'Cause error',
        );
        asserts.assertStringIncludes(error2.getRootCause().message, 'Hi there');
        asserts.assertStringIncludes(
          error3.getRootCause().message,
          'Normal Error',
        );
      });

      it('toJSON', () => {
        const error = new BaseError('Test error');
        const json = error.toJSON();
        asserts.assertEquals(json.name, 'BaseError');
        asserts.assertEquals(json.message, 'Test error');
        asserts.assertEquals(json.context, {});
        asserts.assertEquals(json.stack, error.stack);
        asserts.assertEquals(json.cause, undefined);
        asserts.assert(json.timeStamp);
        /* Nested */
        const error2 = new BaseError(
          'Test error',
          {},
          new BaseError('Cause error'),
        );
        const json2 = error2.toJSON();
        asserts.assertEquals(json2.name, 'BaseError');
        asserts.assertEquals(json2.message, 'Test error');
        asserts.assertEquals(json2.context, {});
        asserts.assertEquals(json2.stack, error2.stack);
        asserts.assertEquals((json2.cause as BaseErrorJson).name, 'BaseError');
        asserts.assertEquals(
          (json2.cause as BaseErrorJson).message,
          'Cause error',
        );
        asserts.assert(json2.timeStamp);
        /* Nested normal error */
        const error3 = new BaseError(
          'Test error',
          {},
          new Error('Normal Error'),
        );
        const json3 = error3.toJSON();
        asserts.assertEquals(json3.name, 'BaseError');
        asserts.assertEquals(json3.message, 'Test error');
        asserts.assertEquals(json3.context, {});
        asserts.assertEquals(json3.stack, error3.stack);
        asserts.assertEquals(json3.cause, 'Error: Normal Error');
        asserts.assert(json3.timeStamp);
      });

      it(
        'should allow derived classes to override message template',
        () => {
          class CustomError extends BaseError {
            protected override get _messageTemplate(): string {
              return 'CUSTOM: ${message}';
            }
          }

          const error = new CustomError('Test error');
          asserts.assertStringIncludes(error.message, 'CUSTOM: Test error');
          asserts.assertEquals(error.message, 'CUSTOM: Test error');
          asserts.assert(error.message, '['); // Should not have timestamp brackets

          class CustomErrorWithContext extends BaseError<{ code: number }> {
            protected override get _messageTemplate(): string {
              return 'ERROR ${code}: ${message}';
            }
          }

          const errorWithContext = new CustomErrorWithContext(
            'Permission denied',
            { code: 403 },
          );
          asserts.assertStringIncludes(
            errorWithContext.message,
            'ERROR 403: Permission denied',
          );
        },
      );
    },
  },
);

/**
 * Test the BaseError class with read permission denied
 */
describe(
  {
    name: 'utils.BaseError(no permission)',
    permissions: { read: false },
    deno: true,
    bun: false,
    node: false,
    fn: () => {
      it('get codeSnippet for nested', () => {
        const error = new BaseError('Test error', {}, new Error('Cause error'));
        const snippet = error.getCodeSnippet();
        asserts.assertEquals(typeof snippet, 'string');
        asserts.assertEquals(
          snippet.startsWith('Could not fetch code snippet'),
          true,
        );
      });
    },
  },
);

describe(
  {
    name: 'utils.BaseError.EdgeCases',
    permissions: { read: true, write: true },
    fn: () => {
      it('should handle deep nesting of errors', () => {
        const level3 = new BaseError('Level 3 error');
        const level2 = new BaseError('Level 2 error', {}, level3);
        const level1 = new BaseError('Level 1 error', {}, level2);

        asserts.assertEquals(level1.getRootCause(), level3);

        const json = level1.toJSON();
        asserts.assertEquals(json.message, 'Level 1 error');
        asserts.assertEquals(
          (json.cause as BaseErrorJson).message,
          'Level 2 error',
        );
        asserts.assertEquals(
          ((json.cause as BaseErrorJson).cause as BaseErrorJson).message,
          'Level 3 error',
        );
      });

      it('should handle complex context objects', () => {
        const complexContext = {
          user: { id: 123, name: 'Test', roles: ['admin', 'user'] },
          request: { path: '/api/data', method: 'GET' },
          timestamp: new Date(),
          nested: { deep: { property: 'value' } },
        };

        const error = new BaseError('Complex context test', complexContext);
        asserts.assertEquals(error.context, complexContext);
        asserts.assertEquals(error.getContextValue('user').id, 123);
        asserts.assertEquals(
          error.getContextValue('nested').deep.property,
          'value',
        );

        const json = error.toJSON();
        asserts.assertEquals(json.context, complexContext);
      });

      it('should handle different generic context types', () => {
        type UserContext = {
          userId: number;
          username: string;
        };

        class UserError extends BaseError<UserContext> {
          getUserId(): number {
            return this.getContextValue('userId');
          }
        }

        const userError = new UserError('User error', {
          userId: 123,
          username: 'testuser',
        });
        asserts.assertEquals(userError.getUserId(), 123);
        asserts.assertEquals(userError.getContextValue('username'), 'testuser');
      });

      it('should handle malformed stack traces', () => {
        // Create a mock error with malformed stack
        const mockError = new Error('Mock error');
        Object.defineProperty(mockError, 'stack', {
          value: 'Error: Mock error\nmalformed stack trace line',
          configurable: true,
          writable: true,
        });

        const error = new BaseError('Test error', {}, mockError);
        const snippet = error.getCodeSnippet();
        asserts.assertEquals(snippet, 'Could not parse stack trace');

        // Create a mock error with no stack
        const noStackError = new Error('No stack');
        Object.defineProperty(noStackError, 'stack', {
          value: undefined,
          configurable: true,
          writable: true,
        });

        const error2 = new BaseError('Test error', {}, noStackError);
        const snippet2 = error2.getCodeSnippet();
        asserts.assertEquals(snippet2, 'No stack trace available');

        // Test insufficient stack trace
        const insufficientStackError = new Error('Insufficient stack');
        Object.defineProperty(insufficientStackError, 'stack', {
          value: 'Error: Insufficient stack',
          configurable: true,
          writable: true,
        });

        const error3 = new BaseError('Test error', {}, insufficientStackError);
        const snippet3 = error3.getCodeSnippet();
        asserts.assertEquals(snippet3, 'Insufficient stack trace information');

        // Test invalid stack trace format (empty line)
        const invalidStackError = new Error('Invalid stack');
        Object.defineProperty(invalidStackError, 'stack', {
          value: 'Error: Invalid stack\n',
          configurable: true,
          writable: true,
        });

        const error4 = new BaseError('Test error', {}, invalidStackError);
        const snippet4 = error4.getCodeSnippet();
        asserts.assertEquals(snippet4, 'Invalid stack trace format');

        // Test stack trace with invalid line number (non-numeric)
        const invalidLineError = new Error('Invalid line');
        Object.defineProperty(invalidLineError, 'stack', {
          value:
            'Error: Invalid line\n    at Object.<anonymous> (/some/file.ts:abc:5)',
          configurable: true,
          writable: true,
        });

        const error5 = new BaseError('Test error', {}, invalidLineError);
        const snippet5 = error5.getCodeSnippet();
        asserts.assertEquals(snippet5, 'Could not parse stack trace');

        // Test stack trace with negative line number regex doesn't match
        const negativeLineError = new Error('Negative line');
        Object.defineProperty(negativeLineError, 'stack', {
          value:
            'Error: Negative line\n    at Object.<anonymous> (/some/file.ts:-1:5)',
          configurable: true,
          writable: true,
        });

        const error6 = new BaseError('Test error', {}, negativeLineError);
        const snippet6 = error6.getCodeSnippet();
        asserts.assertEquals(snippet6, 'Could not parse stack trace');
      });

      it('should handle line number validation edge cases', () => {
        // Create a temporary test file for this specific test
        //const tempFilePath = '/tmp/baseError_test_' + Date.now() + '.ts';
        const tempFilePath = makeTempDirSync() + '/baseError_test_' +
          Date.now() + '.ts';
        writeTextFileSync(
          tempFilePath,
          '// Test file\nconsole.log("test");',
        );

        try {
          // Create a stack trace that will match the regex but have line 0 (which becomes -1 after -1)
          const zeroLineError = new Error('Zero line');
          // Convert to file:// URL format which the regex in BaseError expects for paths with drive letters
          const fileUrl =
            new URL(`file:///${tempFilePath.replaceAll('\\', '/')}`).href;
          Object.defineProperty(zeroLineError, 'stack', {
            value:
              `Error: Zero line\n    at Object.<anonymous> (${fileUrl}:0:5)`,
            configurable: true,
            writable: true,
          });

          const error = new BaseError('Test error', {}, zeroLineError);
          const snippet = error.getCodeSnippet();
          asserts.assertEquals(snippet, 'Invalid line number in stack trace');
        } finally {
          // Clean up the temp file
          try {
            removeSync(tempFilePath);
          } catch {
            // Ignore cleanup errors
          }
        }
      });
    },
  },
);

/**
 * Test for file system errors beyond permission errors
 */
describe(
  {
    name: 'utils.BaseError.FileSystemErrors',
    permissions: { read: true },
    fn: () => {
      it('should handle non-existent files in stack trace', () => {
        const mockError = new Error('File not found error');
        Object.defineProperty(mockError, 'stack', {
          get: () =>
            'Error: File not found error\n    at Object.<anonymous> (file:///non/existent/file.ts:10:5)',
          configurable: true,
        });

        const error = new BaseError('Test error', {}, mockError);
        const snippet = error.getCodeSnippet();
        asserts.assertStringIncludes(snippet, 'Could not fetch code snippet');
      });
    },
  },
);
