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

    await t.step('should call onInit method', async () => {
      let onInitCalled = false;

      class TestError extends BaseError {
        public override async onInit(): Promise<void> {
          await 1;
          onInitCalled = true;
        }
      }

      new TestError('Test error');
      // Allow the event loop to process the async onInit call
      await new Promise((resolve) => setTimeout(resolve, 0));

      asserts.assertEquals(onInitCalled, true);
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
      asserts.assertEquals(snippet, 'Could not fetch code snippet');
    });
  },
);
