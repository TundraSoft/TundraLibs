import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat';
import { nullable } from '../../helpers/mod.ts';
import { GuardianError } from '../../errors/Base.ts';

/**
 * Comprehensive test suite for nullable helper function.
 * Tests null value handling in validation chains.
 */
describe('guardian.helpers.nullable', () => {
  describe('Basic null handling', () => {
    it('should pass null values without validation', () => {
      const validator = nullable(() => {
        throw new Error('Should not be called for null');
      });
      asserts.assertEquals(validator(null), null);
    });

    it('should call wrapped validator for non-null values', () => {
      const validator = nullable((value: unknown) => {
        if (value === 'valid') return value as string;
        throw new GuardianError('Invalid value', {
          got: value,
          expected: 'valid',
          comparison: 'equals',
          type: 'validation',
        });
      });

      asserts.assertEquals(validator('valid'), 'valid');
      asserts.assertThrows(() => validator('invalid'), GuardianError);
    });

    it('should pass undefined through as null', () => {
      const validator = nullable((value: unknown) => {
        throw new Error('Should not be called for undefined');
      });

      // Undefined should be treated as null based on implementation
      asserts.assertEquals(validator(undefined), null);
    });
  });

  describe('Type preservation', () => {
    it('should preserve return type of wrapped validator', () => {
      const stringValidator = nullable((value: unknown) => {
        if (typeof value === 'string') return value.toUpperCase();
        throw new Error('Not a string');
      });
      const numberValidator = nullable((value: unknown) => {
        if (typeof value === 'number') return value * 2;
        throw new Error('Not a number');
      });

      asserts.assertEquals(stringValidator('hello'), 'HELLO');
      asserts.assertEquals(stringValidator(null), null);

      asserts.assertEquals(numberValidator(5), 10);
      asserts.assertEquals(numberValidator(null), null);
    });

    it('should handle complex return types', () => {
      interface TestObj {
        name: string;
        age: number;
      }

      const objectValidator = nullable((value: unknown) => {
        const obj = value as TestObj;
        return {
          ...obj,
          name: obj.name.toUpperCase(),
        };
      });

      const input = { name: 'john', age: 30 };
      const expected = { name: 'JOHN', age: 30 };

      asserts.assertEquals(objectValidator(input), expected);
      asserts.assertEquals(objectValidator(null), null);
    });
  });

  describe('Basic functionality tests', () => {
    it('should handle null and undefined correctly', () => {
      const validator = nullable((value: unknown) => {
        return `processed: ${value}`;
      });

      // null should return null (bypassed)
      asserts.assertEquals(validator(null), null);

      // undefined should return null (bypassed)
      asserts.assertEquals(validator(undefined), null);

      // Other values should be processed
      asserts.assertEquals(validator('test'), 'processed: test');
      asserts.assertEquals((validator as any)(0), 'processed: 0');
      asserts.assertEquals((validator as any)(false), 'processed: false');
    });

    it('should short-circuit for null/undefined', () => {
      let called = false;
      const validator = nullable(() => {
        called = true;
        return 'called';
      });

      validator(null);
      asserts.assertEquals(called, false);

      validator(undefined);
      asserts.assertEquals(called, false);

      // Should call for other values
      validator('test' as any);
      asserts.assertEquals(called, true);
    });
  });
});
