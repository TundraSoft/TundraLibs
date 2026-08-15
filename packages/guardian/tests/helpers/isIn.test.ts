import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { isIn } from '../../helpers/mod.ts';
import { GuardianError } from '../../errors/Base.ts';

/**
 * Comprehensive test suite for isIn helper function.
 * Tests value inclusion validation functionality.
 */
describe('guardian.helpers.isIn', () => {
  describe('basic functionality', () => {
    it('should pass when value is in array', () => {
      const validator = isIn([1, 2, 3]);
      asserts.assertEquals(validator(1), 1);
      asserts.assertEquals(validator(2), 2);
      asserts.assertEquals(validator(3), 3);
    });

    it('should fail when value is not in array', () => {
      const validator = isIn([1, 2, 3]);

      asserts.assertThrows(
        () => validator(4 as any),
        GuardianError,
        'Expected value to be in (1, 2, 3), got 4',
      );

      asserts.assertThrows(
        () => validator(0 as any),
        GuardianError,
        'Expected value to be in (1, 2, 3), got 0',
      );
    });

    it('should work with string arrays', () => {
      const validator = isIn(['apple', 'banana', 'cherry']);

      asserts.assertEquals(validator('apple'), 'apple');
      asserts.assertEquals(validator('banana'), 'banana');

      asserts.assertThrows(
        () => validator('orange' as any),
        GuardianError,
        'Expected value to be in (apple, banana, cherry), got orange',
      );
    });
  });

  describe('array validation', () => {
    it('should throw error for empty array', () => {
      asserts.assertThrows(
        () => isIn([]),
        Error,
        'Argument "expected" must be a non-empty array',
      );
    });

    it('should throw error for non-array input', () => {
      asserts.assertThrows(
        () => isIn('not-array' as any),
        Error,
        'Argument "expected" must be a non-empty array',
      );

      asserts.assertThrows(
        () => isIn(123 as any),
        Error,
        'Argument "expected" must be a non-empty array',
      );

      asserts.assertThrows(
        () => isIn(null as any),
        Error,
        'Argument "expected" must be a non-empty array',
      );
    });

    it('should handle arrays with duplicates', () => {
      const validator = isIn([1, 2, 2, 3, 3, 3]);
      asserts.assertEquals(validator(1), 1);
      asserts.assertEquals(validator(2), 2);
      asserts.assertEquals(validator(3), 3);

      asserts.assertThrows(
        () => validator(4 as any),
        GuardianError,
        'Expected value to be in (1, 2, 3), got 4',
      );
    });
  });

  describe('type handling', () => {
    it('should work with mixed types', () => {
      const validator = isIn([1, 'two', true, null]);

      asserts.assertEquals(validator(1), 1);
      asserts.assertEquals(validator('two'), 'two');
      asserts.assertEquals(validator(true), true);
      asserts.assertEquals(validator(null), null);

      asserts.assertThrows(
        () => validator('one' as any),
        GuardianError,
        'Expected value to be in (1, two, true, ), got one',
      );
    });

    it('should handle reference equality for objects', () => {
      const obj1 = { id: 1 };
      const obj2 = { id: 2 };
      const validator = isIn([obj1, obj2]);

      asserts.assertEquals(validator(obj1), obj1);
      asserts.assertEquals(validator(obj2), obj2);

      // Different object with same content should not match
      asserts.assertThrows(
        () => validator({ id: 1 } as any),
        GuardianError,
      );
    });
  });

  describe('custom error messages', () => {
    it('should use custom error message when provided', () => {
      const validator = isIn([1, 2, 3], 'Must be a valid option');

      asserts.assertThrows(
        () => validator(4 as any),
        GuardianError,
        'Must be a valid option',
      );
    });

    it('should use default error message when not provided', () => {
      const validator = isIn([1, 2, 3]);

      asserts.assertThrows(
        () => validator(4 as any),
        GuardianError,
        'Expected value to be in (1, 2, 3), got 4',
      );
    });
  });

  describe('error context', () => {
    it('should provide correct error context', () => {
      const validator = isIn([1, 2, 3]);

      try {
        validator(4 as any);
        asserts.fail('Should have thrown an error');
      } catch (error) {
        asserts.assertInstanceOf(error, GuardianError);
        asserts.assertEquals(error.context.got, 4);
        asserts.assertEquals(error.context.expected, [
          1,
          2,
          3,
        ]);
      }
    });
  });

  describe('edge cases', () => {
    it('should handle special values', () => {
      const validator = isIn([0, '', false, null, undefined]);

      asserts.assertEquals(validator(0), 0);
      asserts.assertEquals(validator(''), '');
      asserts.assertEquals(validator(false), false);
      asserts.assertEquals(validator(null), null);
      asserts.assertEquals(validator(undefined), undefined);

      asserts.assertThrows(
        () => validator(1 as any),
        GuardianError,
        'Expected value to be in (0, , false, , ), got 1',
      );
    });

    it('should handle zero and negative numbers', () => {
      const validator = isIn([-1, 0, 1]);

      asserts.assertEquals(validator(-1), -1);
      asserts.assertEquals(validator(0), 0);
      asserts.assertEquals(validator(1), 1);

      asserts.assertThrows(
        () => validator(2 as any),
        GuardianError,
        'Expected value to be in (-1, 0, 1), got 2',
      );
    });

    it('should handle empty strings and whitespace', () => {
      const validator = isIn(['', ' ', '  ', '\n', '\t']);

      asserts.assertEquals(validator(''), '');
      asserts.assertEquals(validator(' '), ' ');
      asserts.assertEquals(validator('  '), '  ');
      asserts.assertEquals(validator('\n'), '\n');
      asserts.assertEquals(validator('\t'), '\t');

      asserts.assertThrows(
        () => validator('text' as any),
        GuardianError,
        'Expected value to be in (,  ,   , \n, \t), got text',
      );
    });
  });

  describe('performance considerations', () => {
    it('should handle large arrays efficiently', () => {
      const largeArray = Array.from({ length: 1000 }, (_, i) => i);
      const validator = isIn(largeArray);

      // Should work for values in the array
      asserts.assertEquals(validator(500), 500);
      asserts.assertEquals(validator(999), 999);

      // Should fail for values not in the array
      asserts.assertThrows(
        () => validator(1000 as any),
        GuardianError,
      );
    });

    it('should deduplicate array values', () => {
      const validator = isIn([1, 1, 2, 2, 3, 3]);

      try {
        validator(4 as any);
        asserts.fail('Should have thrown an error');
      } catch (error) {
        asserts.assertInstanceOf(error, GuardianError);
        // Should show deduplicated values in error
        asserts.assert(error.message.includes('(1, 2, 3)'));
      }
    });
  });
});
