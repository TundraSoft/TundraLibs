import { describe, it } from './test.ts';
import {
  CompatError,
  CompatTypeError,
  ConnectionTimeoutError,
  UnsupportedRuntimeError,
} from './Error.ts';
import { OS, RUNTIME } from './runtime.ts';
import * as asserts from '@std/asserts';

describe({
  name: 'compat.Error',
  fn: () => {
    describe('CompatError', () => {
      it('should create error with runtime and OS', () => {
        const error = new CompatError('Test error');

        asserts.assertEquals(error.name, 'CompatError');
        asserts.assertEquals(error.message, 'Test error');
        asserts.assertEquals(error.runtime, RUNTIME);
        asserts.assertEquals(error.os, OS);
        asserts.assert(error.stack !== undefined, 'Should have stack trace');
      });

      it('should create error with cause', () => {
        const cause = new Error('Underlying error');
        const error = new CompatError('Wrapper error', cause);

        asserts.assertEquals(error.message, 'Wrapper error');
        asserts.assertEquals(error.cause, cause);
      });

      it('should serialize to JSON', () => {
        const error = new CompatError('JSON test');
        const json = error.toJSON();

        asserts.assertEquals(json.name, 'CompatError');
        asserts.assertEquals(json.message, 'JSON test');
        asserts.assertEquals(json.runtime, RUNTIME);
        asserts.assertEquals(json.os, OS);
        asserts.assert(
          typeof json.stack === 'string',
          'Stack should be string',
        );
      });

      it('should serialize error with cause', () => {
        const cause = new Error('Root cause');
        const error = new CompatError('Has cause', cause);
        const json = error.toJSON();

        asserts.assertEquals(typeof json.cause, 'object');
        asserts.assertEquals((json.cause as Error).name, 'Error');
        asserts.assertEquals((json.cause as Error).message, 'Root cause');
      });

      it('should serialize non-Error cause as-is', () => {
        const error = new CompatError('Has string cause');
        // Directly assign a non-Error cause to test the else branch
        (error as unknown as { cause: unknown }).cause = 'string cause value';
        const json = error.toJSON();
        asserts.assertStrictEquals(json.cause, 'string cause value');
      });

      it('should serialize null cause as null', () => {
        const error = new CompatError('Has null cause');
        (error as unknown as { cause: unknown }).cause = null;
        const json = error.toJSON();
        asserts.assertStrictEquals(json.cause, null);
      });
    });

    describe('CompatTypeError', () => {
      it('should create TypeError with runtime and OS', () => {
        const error = new CompatTypeError('Type error test');

        asserts.assertEquals(error.name, 'CompatTypeError');
        asserts.assertEquals(error.message, 'Type error test');
        asserts.assertEquals(error.runtime, RUNTIME);
        asserts.assertEquals(error.os, OS);
        asserts.assert(error.stack !== undefined, 'Should have stack trace');
      });

      it('should create TypeError with cause', () => {
        const cause = new TypeError('Underlying type error');
        const error = new CompatTypeError('Wrapper type error', cause);

        asserts.assertEquals(error.message, 'Wrapper type error');
        asserts.assertEquals(error.cause, cause);
      });

      it('should serialize to JSON', () => {
        const error = new CompatTypeError('JSON type test');
        const json = error.toJSON();

        asserts.assertEquals(json.name, 'CompatTypeError');
        asserts.assertEquals(json.message, 'JSON type test');
        asserts.assertEquals(json.runtime, RUNTIME);
        asserts.assertEquals(json.os, OS);
      });

      it('should maintain prototype chain', () => {
        const error = new CompatTypeError('Prototype test');

        asserts.assert(
          error instanceof CompatTypeError,
          'Should be instance of CompatTypeError',
        );
        asserts.assert(
          error instanceof TypeError,
          'Should be instance of TypeError',
        );
        asserts.assert(error instanceof Error, 'Should be instance of Error');
      });
    });

    describe('UnsupportedRuntimeError', () => {
      it('should create error with operation and runtime', () => {
        const error = new UnsupportedRuntimeError('testOperation');

        asserts.assertEquals(error.name, 'UnsupportedRuntimeError');
        asserts.assertEquals(error.operation, 'testOperation');
        asserts.assertEquals(error.detectedRuntime, RUNTIME);
        asserts.assert(
          error.message.includes('testOperation'),
          'Message should include operation',
        );
        asserts.assert(
          error.message.includes(RUNTIME),
          'Message should include runtime',
        );
      });

      it('should create error with custom runtime', () => {
        const error = new UnsupportedRuntimeError('customOp', 'UNKNOWN');

        asserts.assertEquals(error.detectedRuntime, 'UNKNOWN');
        asserts.assert(
          error.message.includes('UNKNOWN'),
          'Message should include UNKNOWN runtime',
        );
      });

      it('should create error with additional details', () => {
        const error = new UnsupportedRuntimeError(
          'advancedOp',
          RUNTIME,
          'This feature requires Node.js v20+',
        );

        asserts.assert(
          error.message.includes('This feature requires Node.js v20+'),
          'Message should include additional details',
        );
      });

      it('should serialize to JSON with operation and runtime', () => {
        const error = new UnsupportedRuntimeError('jsonOp', 'DENO');
        const json = error.toJSON();

        asserts.assertEquals(json.name, 'UnsupportedRuntimeError');
        asserts.assertEquals(json.operation, 'jsonOp');
        asserts.assertEquals(json.detectedRuntime, 'DENO');
        asserts.assertEquals(json.runtime, RUNTIME); // Current runtime
        asserts.assertEquals(json.os, OS);
      });

      it('should maintain prototype chain', () => {
        const error = new UnsupportedRuntimeError('chainTest');

        asserts.assert(
          error instanceof UnsupportedRuntimeError,
          'Should be instance of UnsupportedRuntimeError',
        );
        asserts.assert(
          error instanceof CompatError,
          'Should be instance of CompatError',
        );
        asserts.assert(error instanceof Error, 'Should be instance of Error');
      });

      it('should work with cause', () => {
        const cause = new Error('Module not found');
        const error = new UnsupportedRuntimeError(
          'import',
          RUNTIME,
          undefined,
          cause,
        );

        asserts.assertEquals(error.cause, cause);

        const json = error.toJSON();
        asserts.assertEquals(typeof json.cause, 'object');
        asserts.assertEquals((json.cause as Error).message, 'Module not found');
      });
    });

    describe('ConnectionTimeoutError', () => {
      it('should create error with hostname and port', () => {
        const error = new ConnectionTimeoutError('example.com', 8080);
        asserts.assertStrictEquals(error.name, 'ConnectionTimeoutError');
        asserts.assertStrictEquals(error.hostname, 'example.com');
        asserts.assertStrictEquals(error.port, 8080);
        asserts.assert(error.message.includes('example.com'));
        asserts.assert(error.message.includes('8080'));
      });

      it('should create error with path', () => {
        const error = new ConnectionTimeoutError(
          undefined,
          undefined,
          '/var/run/app.sock',
        );
        asserts.assertStrictEquals(error.path, '/var/run/app.sock');
        asserts.assert(error.message.includes('/var/run/app.sock'));
      });

      it('should create error with timeout', () => {
        const error = new ConnectionTimeoutError(
          'host.com',
          443,
          undefined,
          5000,
        );
        asserts.assertStrictEquals(error.timeoutMs, 5000);
        asserts.assert(error.message.includes('5000'));
      });

      it('should serialize to JSON with all connection fields', () => {
        const error = new ConnectionTimeoutError(
          'db.local',
          5432,
          undefined,
          3000,
        );
        const json = error.toJSON();
        asserts.assertStrictEquals(json.hostname, 'db.local');
        asserts.assertStrictEquals(json.port, 5432);
        asserts.assertStrictEquals(json.timeoutMs, 3000);
        asserts.assertStrictEquals(json.path, undefined);
        asserts.assertStrictEquals(json.name, 'ConnectionTimeoutError');
      });

      it('should serialize to JSON with path field', () => {
        const error = new ConnectionTimeoutError(
          undefined,
          undefined,
          '/tmp/sock',
          10000,
        );
        const json = error.toJSON();
        asserts.assertStrictEquals(json.path, '/tmp/sock');
        asserts.assertStrictEquals(json.timeoutMs, 10000);
      });

      it('should extend CompatError', () => {
        const error = new ConnectionTimeoutError('host', 80);
        asserts.assertInstanceOf(error, ConnectionTimeoutError);
        asserts.assertInstanceOf(error, CompatError);
        asserts.assertInstanceOf(error, Error);
      });
    });

    describe('Error inheritance and usage', () => {
      it('should allow custom error classes extending CompatError', () => {
        class CustomError extends CompatError {
          public readonly code: number;

          constructor(message: string, code: number) {
            super(message);
            this.code = code;
          }

          override toJSON(): Record<string, unknown> {
            return {
              ...super.toJSON(),
              code: this.code,
            };
          }
        }

        const error = new CustomError('Custom error', 404);
        asserts.assertEquals(error.code, 404);
        asserts.assertEquals(error.runtime, RUNTIME);

        const json = error.toJSON();
        asserts.assertEquals(json.code, 404);
      });

      it('should be catchable as Error', () => {
        try {
          throw new CompatError('Catchable');
        } catch (err) {
          asserts.assert(err instanceof Error, 'Should be caught as Error');
          asserts.assert(err instanceof CompatError, 'Should be CompatError');
        }
      });

      it('should be catchable as TypeError', () => {
        try {
          throw new CompatTypeError('Type catchable');
        } catch (err) {
          asserts.assert(err instanceof Error, 'Should be caught as Error');
          asserts.assert(
            err instanceof TypeError,
            'Should be caught as TypeError',
          );
          asserts.assert(
            err instanceof CompatTypeError,
            'Should be CompatTypeError',
          );
        }
      });
    });
  },
});
