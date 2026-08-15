/**
 * @fileoverview Tests for DriverError base class.
 * @module
 */

import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { DriverError } from './Base.ts';

// =============================================================================
// Test Data
// =============================================================================

const VALID_MESSAGE = 'Test error message';
const VALID_META = { key: 'value', code: 42 };
const CAUSE_ERROR = new Error('Underlying cause');

// =============================================================================
// Test Suites
// =============================================================================

describe('DriverError', () => {
  describe('Constructor', () => {
    it('should create error with message and metadata', () => {
      const error = new DriverError(VALID_MESSAGE, VALID_META);

      asserts.assertStrictEquals(error.message, VALID_MESSAGE);
      asserts.assertEquals(error.context, VALID_META);
      asserts.assertStrictEquals(error.name, 'DriverError');
      asserts.assert(error instanceof Error);
      asserts.assert(error instanceof DriverError);
    });

    it('should include cause when provided', () => {
      const error = new DriverError(VALID_MESSAGE, VALID_META, CAUSE_ERROR);

      asserts.assertStrictEquals(error.cause, CAUSE_ERROR);
    });

    it('should create error without cause', () => {
      const error = new DriverError(VALID_MESSAGE, VALID_META);

      asserts.assertStrictEquals(error.cause, undefined);
    });

    it('should accept empty metadata object', () => {
      const error = new DriverError(VALID_MESSAGE, {});

      asserts.assertStrictEquals(error.message, VALID_MESSAGE);
      asserts.assertEquals(error.context, {});
    });

    it('should preserve metadata properties', () => {
      const meta = { prop1: 'value1', prop2: 123, prop3: true };
      const error = new DriverError(VALID_MESSAGE, meta);

      asserts.assertEquals(error.context, meta);
      asserts.assertStrictEquals(error.context.prop1, 'value1');
      asserts.assertStrictEquals(error.context.prop2, 123);
      asserts.assertStrictEquals(error.context.prop3, true);
    });
  });

  describe('Inheritance', () => {
    it('should be instance of Error', () => {
      const error = new DriverError(VALID_MESSAGE, VALID_META);

      asserts.assert(error instanceof Error);
    });

    it('should be instance of DriverError', () => {
      const error = new DriverError(VALID_MESSAGE, VALID_META);

      asserts.assert(error instanceof DriverError);
    });

    it('should have Error in prototype chain', () => {
      const error = new DriverError(VALID_MESSAGE, VALID_META);

      asserts.assert(
        Object.prototype.isPrototypeOf.call(Error.prototype, error),
      );
    });
  });

  describe('Properties', () => {
    it('should have correct name property', () => {
      const error = new DriverError(VALID_MESSAGE, VALID_META);

      asserts.assertStrictEquals(error.name, 'DriverError');
    });

    it('should have stack trace', () => {
      const error = new DriverError(VALID_MESSAGE, VALID_META);

      asserts.assert(error.stack !== undefined);
      asserts.assert(typeof error.stack === 'string');
      asserts.assert(error.stack!.includes('DriverError'));
    });

    it('should have timestamp', () => {
      const before = new Date();
      const error = new DriverError(VALID_MESSAGE, VALID_META);
      const after = new Date();

      asserts.assert(error.timeStamp instanceof Date);
      asserts.assert(error.timeStamp >= before);
      asserts.assert(error.timeStamp <= after);
    });
  });

  describe('toJSON', () => {
    it('should serialize to JSON correctly', () => {
      const error = new DriverError(VALID_MESSAGE, VALID_META);
      const json = error.toJSON();

      asserts.assertStrictEquals(json.name, 'DriverError');
      asserts.assertStrictEquals(json.message, VALID_MESSAGE);
      asserts.assertEquals(json.context, VALID_META);
      asserts.assert(typeof json.timeStamp === 'string');
    });

    it('should include cause in JSON when present', () => {
      const error = new DriverError(VALID_MESSAGE, VALID_META, CAUSE_ERROR);
      const json = error.toJSON();

      asserts.assert(json.cause !== undefined);
      asserts.assertEquals(json.cause, `Error: ${CAUSE_ERROR.message}`);
    });

    it('should not include cause in JSON when absent', () => {
      const error = new DriverError(VALID_MESSAGE, VALID_META);
      const json = error.toJSON();

      asserts.assertStrictEquals(json.cause, undefined);
    });

    it('should include stack trace in JSON', () => {
      const error = new DriverError(VALID_MESSAGE, VALID_META);
      const json = error.toJSON();

      asserts.assert(json.stack !== undefined);
      asserts.assert(typeof json.stack === 'string');
    });
  });

  describe('Message Template', () => {
    it('should use simple message template', () => {
      const error = new DriverError(VALID_MESSAGE, VALID_META);

      asserts.assertStrictEquals(error.message, VALID_MESSAGE);
    });

    it('should handle special characters in message', () => {
      const message = 'Error with ${special} characters: ${}';
      const error = new DriverError(message, VALID_META);

      asserts.assertStrictEquals(error.message, message);
    });

    it('should handle multiline messages', () => {
      const message = 'Line 1\nLine 2\nLine 3';
      const error = new DriverError(message, VALID_META);

      asserts.assertStrictEquals(error.message, message);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty message', () => {
      const error = new DriverError('', VALID_META);

      asserts.assertStrictEquals(error.message, '');
    });

    it('should handle very long message', () => {
      const longMessage = 'x'.repeat(10000);
      const error = new DriverError(longMessage, VALID_META);

      asserts.assertStrictEquals(error.message, longMessage);
    });

    it('should handle metadata with nested objects', () => {
      const meta = {
        nested: { level1: { level2: { value: 'deep' } } },
      };
      const error = new DriverError(VALID_MESSAGE, meta);

      asserts.assertEquals(error.context, meta);
      asserts.assertStrictEquals(
        error.context.nested.level1.level2.value,
        'deep',
      );
    });

    it('should handle metadata with arrays', () => {
      const meta = { items: [1, 2, 3], names: ['a', 'b', 'c'] };
      const error = new DriverError(VALID_MESSAGE, meta);

      asserts.assertEquals(error.context, meta);
      asserts.assertEquals(error.context.items, [1, 2, 3]);
      asserts.assertEquals(error.context.names, ['a', 'b', 'c']);
    });

    it('should handle null values in metadata', () => {
      const meta = { nullValue: null, undefinedValue: undefined };
      const error = new DriverError(VALID_MESSAGE, meta);

      asserts.assertStrictEquals(error.context.nullValue, null);
      asserts.assertStrictEquals(error.context.undefinedValue, undefined);
    });
  });

  describe('Subclassing', () => {
    it('should support creating subclasses', () => {
      class CustomDriverError extends DriverError {
        protected override get _messageTemplate(): string {
          return 'Custom: ${message}';
        }
      }

      const error = new CustomDriverError('test', { key: 'value' });

      asserts.assert(error instanceof DriverError);
      asserts.assert(error instanceof CustomDriverError);
      asserts.assertStrictEquals(error.name, 'CustomDriverError');
    });
  });
});
