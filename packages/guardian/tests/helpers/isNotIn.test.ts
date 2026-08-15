import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { isNotIn } from '../../helpers/mod.ts';
import { GuardianError } from '../../errors/Base.ts';

/**
 * Comprehensive test suite for isNotIn helper function.
 * Tests validation that ensures values are not in a specified array.
 */
describe('guardian.helpers.isNotIn', () => {
  describe('basic functionality', () => {
    it('should pass when value is not in array', () => {
      const validator = isNotIn([1, 2, 3]);
      asserts.assertEquals(validator(4), 4);
      asserts.assertEquals(validator(0), 0);
      asserts.assertEquals(validator(-1), -1);
    });

    it('should fail when value is in array', () => {
      const validator = isNotIn([1, 2, 3]);

      asserts.assertThrows(
        () => validator(1),
        GuardianError,
        'Expected value to not be in (1, 2, 3), got 1',
      );

      asserts.assertThrows(
        () => validator(2),
        GuardianError,
      );

      asserts.assertThrows(
        () => validator(3),
        GuardianError,
      );
    });

    it('should work with string arrays', () => {
      const validator = isNotIn(['apple', 'banana', 'cherry']);

      asserts.assertEquals(validator('orange'), 'orange');
      asserts.assertEquals(validator('grape'), 'grape');

      asserts.assertThrows(
        () => validator('apple'),
        GuardianError,
        'Expected value to not be in (apple, banana, cherry), got apple',
      );
    });
  });

  describe('array validation', () => {
    it('should throw error for empty array', () => {
      asserts.assertThrows(
        () => isNotIn([]),
        Error,
        'Argument "expected" must be a non-empty array',
      );
    });

    it('should throw error for non-array input', () => {
      asserts.assertThrows(
        () => isNotIn('not an array' as any),
        Error,
        'Argument "expected" must be a non-empty array',
      );
    });

    it('should handle arrays with duplicates', () => {
      const validator = isNotIn([1, 2, 2, 3, 3, 3]);

      asserts.assertEquals(validator(4), 4);

      asserts.assertThrows(
        () => validator(2),
        GuardianError,
      );
    });
  });

  describe('type handling', () => {
    it('should work with mixed types', () => {
      const numberValidator = isNotIn([1, 2, 3]);
      const stringValidator = isNotIn(['hello', 'world']);
      const booleanValidator = isNotIn([true]);

      asserts.assertEquals(numberValidator(4), 4);
      asserts.assertEquals(stringValidator('test'), 'test');
      asserts.assertEquals(booleanValidator(false), false);

      asserts.assertThrows(
        () => numberValidator(1),
        GuardianError,
      );

      asserts.assertThrows(
        () => stringValidator('hello'),
        GuardianError,
      );

      asserts.assertThrows(
        () => booleanValidator(true),
        GuardianError,
      );
    });

    it('should handle reference equality for objects', () => {
      const obj1 = { a: 1 };
      const obj2 = { a: 1 }; // Same content but different reference

      const validator = isNotIn([obj1]);

      // Different object reference should pass
      asserts.assertEquals(validator(obj2 as any), obj2);

      // Same object reference should fail
      asserts.assertThrows(
        () => validator(obj1),
        GuardianError,
      );
    });
  });

  describe('custom error messages', () => {
    it('should use custom error message when provided', () => {
      const validator = isNotIn([1, 2, 3], 'Value must not be 1, 2, or 3');

      asserts.assertThrows(
        () => validator(2),
        GuardianError,
        'Value must not be 1, 2, or 3',
      );
    });

    it('should use default error message when not provided', () => {
      const validator = isNotIn(['a', 'b', 'c']);

      try {
        validator('b');
        asserts.fail('Expected GuardianError to be thrown');
      } catch (error) {
        asserts.assert(error instanceof GuardianError);
        asserts.assert(error.message.includes('Expected value to not be in'));
        asserts.assert(error.message.includes('a, b, c'));
      }
    });
  });

  describe('error context', () => {
    it('should provide correct error context', () => {
      const validator = isNotIn([10, 20, 30]);

      try {
        validator(20);
        asserts.fail('Expected GuardianError to be thrown');
      } catch (error) {
        asserts.assert(error instanceof GuardianError);
        asserts.assertEquals(error.context.got, 20);
        asserts.assertEquals(error.context.expected, 'not in (10, 20, 30)');
        asserts.assertEquals(error.context.comparison, 'notIn');
        asserts.assertEquals(error.context.type, 'validation');
      }
    });
  });

  describe('edge cases', () => {
    it('should handle special values', () => {
      const validator = isNotIn([Number.NaN, Infinity, -Infinity]);

      asserts.assertEquals(validator(0), 0);
      asserts.assertEquals(validator(100), 100);

      asserts.assertThrows(
        () => validator(Number.NaN),
        GuardianError,
      );

      asserts.assertThrows(
        () => validator(Infinity),
        GuardianError,
      );

      asserts.assertThrows(
        () => validator(-Infinity),
        GuardianError,
      );
    });

    it('should handle zero and negative numbers', () => {
      const validator = isNotIn([0, -0]);

      asserts.assertEquals(validator(1), 1);
      asserts.assertEquals(validator(-1), -1);

      asserts.assertThrows(
        () => validator(0),
        GuardianError,
      );
    });

    it('should handle empty strings and whitespace', () => {
      const validator = isNotIn(['', ' ', '\t', '\n']);

      asserts.assertEquals(validator('hello'), 'hello');
      asserts.assertEquals(validator('world'), 'world');

      asserts.assertThrows(
        () => validator(''),
        GuardianError,
      );

      asserts.assertThrows(
        () => validator(' '),
        GuardianError,
      );
    });
  });

  describe('performance considerations', () => {
    it('should handle large arrays efficiently', () => {
      const largeArray = Array.from({ length: 1000 }, (_, i) => i);
      const validator = isNotIn(largeArray);

      // Should pass for values not in array
      asserts.assertEquals(validator(1001), 1001);
      asserts.assertEquals(validator(-1), -1);

      // Should fail for values in array
      asserts.assertThrows(
        () => validator(500),
        GuardianError,
      );
    });

    it('should deduplicate array values', () => {
      const validator = isNotIn([1, 1, 1, 2, 2, 2, 3, 3, 3]);

      asserts.assertEquals(validator(4), 4);

      asserts.assertThrows(
        () => validator(1),
        GuardianError,
      );
    });
  });
});
