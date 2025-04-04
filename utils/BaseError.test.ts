import * as asserts from '$asserts';
import { BaseError, type BaseErrorJson } from './BaseError.ts';

Deno.test(
  { name: 'utils.BaseError', permissions: { read: true } },
  async (t) => {
    await t.step(
      'should create an instance of BaseError',
      () => {
        const error = new BaseError('Test error');
        asserts.assertInstanceOf(error, BaseError);
        asserts.assertStringIncludes(error.message, 'Test error');
        asserts.assertEquals(error.name, 'BaseError');
        asserts.assertInstanceOf(error.timeStamp, Date);
      },
    );

    await t.step(
      'should store provided context',
      () => {
        const context = { userId: 123 };
        const error = new BaseError('Test error', context);
        asserts.assertEquals(error.context, context);
        asserts.assertEquals(error.getContextValue('userId'), 123);
      },
    );

    await t.step(
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

    await t.step(
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

    await t.step('should handle cause error', () => {
      const cause = new Error('Original error');
      const error = new BaseError('Test error', {}, cause);
      asserts.assertEquals(error.cause, cause);
    });

    await t.step('should handle missing Error.captureStackTrace', () => {
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

    await t.step('should have a stack trace', () => {
      const error = new BaseError('Test error');
      asserts.assertEquals(typeof error.stack, 'string');
    });

    await t.step('context should default to empty object', () => {
      const error = new BaseError('Test error');
      asserts.assertEquals(error.context, {});
    });

    await t.step(`handle missing context in message`, () => {
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

    await t.step('get codeSnippet', () => {
      const error = new BaseError('Test error');
      const snippet = error.getCodeSnippet(5);
      asserts.assertEquals(typeof snippet, 'string');
      asserts.assertEquals(snippet.includes('Test error'), true);
      asserts.assertEquals(
        snippet.includes(`await t.step('get codeSnippet', () => {`),
        true,
      );
    });

    await t.step('get codeSnippet for nested', () => {
      const error = new BaseError(
        'Test error',
        {},
        new BaseError('Cause error'),
      );
      const snippet = error.getCodeSnippet(5);
      asserts.assertEquals(typeof snippet, 'string');
      asserts.assertEquals(snippet.includes('Cause error'), true);
      asserts.assertEquals(
        snippet.includes(`await t.step('get codeSnippet for nested', () => {`),
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

    await t.step('get root cause', () => {
      const error = new BaseError(
        'Test error',
        {},
        new BaseError('Cause error'),
      );
      const error2 = new BaseError('Hi there');
      const error3 = new BaseError('Hi there', {}, new Error('Normal Error'));
      asserts.assertStringIncludes(error.getRootCause().message, 'Cause error');
      asserts.assertStringIncludes(error2.getRootCause().message, 'Hi there');
      asserts.assertStringIncludes(
        error3.getRootCause().message,
        'Normal Error',
      );
    });

    await t.step('toJSON', () => {
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

    await t.step(
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
        // asserts.assertN(error.message, '['); // Should not have timestamp brackets

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
);

/**
 * Test the BaseError class with read permission denied
 */
Deno.test(
  { name: 'utils.BaseError(no permission)', permissions: { read: false } },
  async (t) => {
    await t.step('get codeSnippet for nested', () => {
      const error = new BaseError('Test error', {}, new Error('Cause error'));
      const snippet = error.getCodeSnippet();
      asserts.assertEquals(typeof snippet, 'string');
      asserts.assertEquals(
        snippet.startsWith('Could not fetch code snippet'),
        true,
      );
    });
  },
);

Deno.test(
  {
    name: 'utils.BaseError.EdgeCases',
    permissions: { read: true, write: true },
  },
  async (t) => {
    await t.step('should handle deep nesting of errors', () => {
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

    await t.step('should handle complex context objects', () => {
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

    await t.step('should handle different generic context types', () => {
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

    await t.step('should handle malformed stack traces', () => {
      const originalStackDescriptor = Object.getOwnPropertyDescriptor(
        Error.prototype,
        'stack',
      );
      const originalStackGetter = originalStackDescriptor?.get;
      const originalStackSetter = originalStackDescriptor?.set;

      try {
        // Create a mock error with malformed stack
        const mockError = new Error('Mock error');
        Object.defineProperty(mockError, 'stack', {
          get: () => 'Error: Mock error\nmalformed stack trace line',
          configurable: true,
        });

        const error = new BaseError('Test error', {}, mockError);
        const snippet = error.getCodeSnippet();
        asserts.assertEquals(snippet, 'Could not parse stack trace');

        // Create a mock error with no stack
        const noStackError = new Error('No stack');
        Object.defineProperty(noStackError, 'stack', {
          get: () => undefined,
          configurable: true,
        });

        const error2 = new BaseError('Test error', {}, noStackError);
        const snippet2 = error2.getCodeSnippet();
        asserts.assertEquals(snippet2, 'No stack trace available');
      } finally {
        // Restore original stack getter/setter
        if (originalStackGetter && originalStackSetter) {
          Object.defineProperty(Error.prototype, 'stack', {
            get: originalStackGetter,
            set: originalStackSetter,
            configurable: true,
          });
        }
      }
    });
  },
);

/**
 * Test for file system errors beyond permission errors
 */
Deno.test(
  { name: 'utils.BaseError.FileSystemErrors', permissions: { read: true } },
  async (t) => {
    await t.step('should handle non-existent files in stack trace', () => {
      const mockError = new Error('File not found error');
      Object.defineProperty(mockError, 'stack', {
        get: () =>
          'Error: File not found error\n    at Object.<anonymous> (/non/existent/file.ts:10:5)',
        configurable: true,
      });

      const error = new BaseError('Test error', {}, mockError);
      const snippet = error.getCodeSnippet();
      asserts.assertStringIncludes(snippet, 'Could not fetch code snippet');
    });
  },
);
