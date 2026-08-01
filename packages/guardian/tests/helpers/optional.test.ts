import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat';
import { optional } from '../../helpers/mod.ts';
import { GuardianError } from '../../errors/Base.ts';

/**
 * Comprehensive test suite for optional helper function.
 * Tests undefined value handling in validation chains.
 */
describe('guardian.helpers.optional', () => {
  describe('Basic undefined handling', () => {
    it('should pass undefined values without validation', () => {
      const validator = optional(() => {
        throw new Error('Should not be called for undefined');
      });
      asserts.assertEquals(validator(undefined), undefined);
    });

    it('should call wrapped validator for defined values', () => {
      const validator = optional((value: unknown) => {
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

    it('should not pass null through as undefined', () => {
      const validator = optional((value: unknown) => {
        if (value === null) {
          throw new GuardianError('Null not allowed', {
            got: value,
            expected: 'not null',
            comparison: 'equals',
            type: 'validation',
          });
        }
        return value;
      });

      // Null should be passed to the wrapped validator
      asserts.assertThrows(() => validator(null), GuardianError);
    });
  });

  describe('Type preservation', () => {
    it('should preserve return type of wrapped validator', () => {
      const stringValidator = optional((value: unknown) => {
        if (typeof value === 'string') return value.toUpperCase();
        throw new Error('Not a string');
      });
      const numberValidator = optional((value: unknown) => {
        if (typeof value === 'number') return value * 2;
        throw new Error('Not a number');
      });

      asserts.assertEquals(stringValidator('hello'), 'HELLO');
      asserts.assertEquals(stringValidator(undefined), undefined);

      asserts.assertEquals(numberValidator(5), 10);
      asserts.assertEquals(numberValidator(undefined), undefined);
    });

    it('should handle complex return types', () => {
      interface TestObj {
        name: string;
        age: number;
      }

      const objectValidator = optional((value: unknown) => {
        const obj = value as TestObj;
        return {
          ...obj,
          name: obj.name.toUpperCase(),
        };
      });

      const input = { name: 'john', age: 30 };
      const expected = { name: 'JOHN', age: 30 };

      asserts.assertEquals(objectValidator(input), expected);
      asserts.assertEquals(objectValidator(undefined), undefined);
    });
  });

  describe('Error propagation', () => {
    it('should propagate errors from wrapped validator', () => {
      const validator = optional((value: unknown) => {
        const str = value as string;
        if (str.length < 3) {
          throw new GuardianError('String too short', {
            got: str,
            expected: 'string with length >= 3',
            comparison: 'length',
            type: 'validation',
          });
        }
        return str;
      });

      asserts.assertEquals(validator('hello'), 'hello');
      asserts.assertEquals(validator(undefined), undefined);

      try {
        validator('hi');
        asserts.fail('Should have thrown an error');
      } catch (error) {
        if (error instanceof GuardianError) {
          asserts.assertEquals(error.message, 'String too short');
          asserts.assertEquals(error.context.got, 'hi');
        } else {
          asserts.fail('Should have thrown a GuardianError');
        }
      }
    });

    it('should propagate non-GuardianError exceptions', () => {
      const validator = optional((value: unknown) => {
        const str = value as string;
        if (str === 'throw') {
          throw new Error('Regular error');
        }
        return str;
      });

      asserts.assertEquals(validator('ok'), 'ok');
      asserts.assertEquals(validator(undefined), undefined);
      asserts.assertThrows(() => validator('throw'), Error, 'Regular error');
    });
  });

  describe('Promise handling', () => {
    it('should handle async validators', async () => {
      const asyncValidator = optional(async (value: unknown) => {
        await new Promise((resolve) => setTimeout(resolve, 1));
        return (value as string).toUpperCase();
      });

      asserts.assertEquals(await asyncValidator('hello'), 'HELLO');
      asserts.assertEquals(await asyncValidator(undefined), undefined);
    });

    it('should handle async validators with errors', async () => {
      const asyncValidator = optional(async (value: unknown) => {
        await new Promise((resolve) => setTimeout(resolve, 1));
        const str = value as string;
        if (str === 'error') {
          throw new GuardianError('Async error', {
            got: str,
            expected: 'not error',
            comparison: 'equals',
            type: 'validation',
          });
        }
        return str;
      });

      asserts.assertEquals(await asyncValidator('ok'), 'ok');
      asserts.assertEquals(await asyncValidator(undefined), undefined);

      try {
        await asyncValidator('error');
        asserts.fail('Should have thrown an error');
      } catch (error) {
        if (error instanceof GuardianError) {
          asserts.assertEquals(error.message, 'Async error');
        } else {
          asserts.fail('Should have thrown a GuardianError');
        }
      }
    });
  });

  describe('Chaining with other validators', () => {
    it('should work in validation chains', () => {
      // Simulate chaining with other validators
      const isString = (value: unknown): value is string => {
        if (typeof value !== 'string') {
          throw new GuardianError('Expected string', {
            got: typeof value,
            expected: 'string',
            comparison: 'type',
            type: 'validation',
          });
        }
        return true;
      };

      const minLength = (min: number) => (value: string) => {
        if (value.length < min) {
          throw new GuardianError(`String too short`, {
            got: value.length,
            expected: `>= ${min}`,
            comparison: 'length',
            type: 'validation',
          });
        }
        return value;
      };

      // Chain: optional -> string check -> min length
      const chainedValidator = (value: unknown) => {
        isString(value);
        return minLength(3)(value as string);
      };

      const wrappedValidator = optional(chainedValidator);

      asserts.assertEquals(wrappedValidator('hello'), 'hello');
      asserts.assertEquals(wrappedValidator(undefined), undefined);
      asserts.assertThrows(
        () => (wrappedValidator as any)('hi'),
        GuardianError,
      );
    });
  });

  describe('Edge cases and special values', () => {
    it('should only treat explicit undefined as undefined', () => {
      const validator = optional((value: any) => {
        return `processed: ${value}`;
      });

      // Only undefined should bypass validation
      asserts.assertEquals(validator(undefined), undefined);

      // Everything else should be processed
      asserts.assertEquals(validator(null), 'processed: null');
      asserts.assertEquals((validator as any)(0), 'processed: 0');
      asserts.assertEquals((validator as any)(false), 'processed: false');
      asserts.assertEquals((validator as any)(''), 'processed: ');
      asserts.assertEquals((validator as any)([]), 'processed: ');
      asserts.assertEquals(
        (validator as any)({}),
        'processed: [object Object]',
      );
    });

    it('should handle validator that returns undefined', () => {
      const validator = optional((value: unknown) => {
        const str = value as string;
        if (str === 'return-undefined') return undefined;
        return str;
      });

      // Input undefined should return undefined (bypass)
      asserts.assertEquals(validator(undefined), undefined);

      // Validator returning undefined should work
      asserts.assertEquals(validator('return-undefined'), undefined);

      // Normal processing should work
      asserts.assertEquals(validator('normal'), 'normal');
    });

    it('should handle validator that returns null', () => {
      const validator = optional((value: unknown) => {
        const str = value as string;
        if (str === 'return-null') return null;
        return str;
      });

      // Input undefined should return undefined (bypass)
      asserts.assertEquals(validator(undefined), undefined);

      // Validator returning null should work
      asserts.assertEquals(validator('return-null'), null);

      // Normal processing should work
      asserts.assertEquals(validator('normal'), 'normal');
    });
  });

  describe('Performance and optimization', () => {
    it(
      'should short-circuit for undefined without calling validator',
      () => {
        let called = false;
        const validator = optional(() => {
          called = true;
          return 'called';
        });

        asserts.assertEquals(validator(undefined), undefined);
        asserts.assertEquals(called, false);

        // Verify it does call for defined values
        asserts.assertEquals(validator(null as any), 'called');
        asserts.assertEquals(called, true);
      },
    );

    it('should handle repeated undefined checks efficiently', () => {
      let callCount = 0;
      const validator = optional(() => {
        callCount++;
        return 'called';
      });

      // Multiple undefined calls
      for (let i = 0; i < 100; i++) {
        asserts.assertEquals(validator(undefined), undefined);
      }
      asserts.assertEquals(callCount, 0);

      // One defined call
      validator(null as any);
      asserts.assertEquals(callCount, 1);
    });
  });

  describe('Logical consistency with nullable', () => {
    it('should handle different special values than nullable', () => {
      const optionalValidator = optional((value: unknown) => {
        if (value === null) {
          throw new GuardianError('Null not allowed', {
            got: value,
            expected: 'not null',
            comparison: 'equals',
            type: 'validation',
          });
        }
        return `processed: ${value}`;
      });

      // undefined should pass for optional
      asserts.assertEquals(optionalValidator(undefined), undefined);

      // null should be processed (and in this case, error)
      asserts.assertThrows(() => optionalValidator(null), GuardianError);

      // Other values should be processed
      asserts.assertEquals(optionalValidator('test'), 'processed: test');
    });
  });

  describe('Default value handling', () => {
    it('should use default value when undefined', () => {
      const validator = optional(
        (value: unknown) => (value as number) * 2,
        42,
      );

      asserts.assertEquals(validator(undefined), 42);
      asserts.assertEquals(validator(10), 20);
    });

    it('should use default function when undefined', () => {
      let callCount = 0;
      const defaultFn = () => {
        callCount++;
        return 'default-value';
      };

      const validator = optional(
        (value: unknown) => `processed: ${value}`,
        defaultFn,
      );

      asserts.assertEquals(validator(undefined), 'default-value');
      asserts.assertEquals(callCount, 1);

      asserts.assertEquals(validator('test'), 'processed: test');
      asserts.assertEquals(callCount, 1); // Should not call again

      asserts.assertEquals(validator(undefined), 'default-value');
      asserts.assertEquals(callCount, 2); // Should call again for second undefined
    });

    it('should handle different default types', () => {
      const stringValidator = optional(
        (value: unknown) => (value as string).toUpperCase(),
        'DEFAULT',
      );

      const numberValidator = optional(
        (value: unknown) => (value as number) * 2,
        0,
      );

      const objectValidator = optional(
        (value: unknown) => value,
        { default: true },
      );

      asserts.assertEquals(stringValidator(undefined), 'DEFAULT');
      asserts.assertEquals(numberValidator(undefined), 0);
      asserts.assertEquals(objectValidator(undefined), { default: true });
    });

    it(
      'should handle default function returning complex types',
      () => {
        const validator = optional(
          (value: unknown) => value,
          () => ({ timestamp: Date.now(), id: Math.random() }),
        );

        const result1 = validator(undefined);
        const result2 = validator(undefined);

        // Each call to default function should return a new object
        asserts.assertNotStrictEquals(result1, result2);
        asserts.assert(typeof result1 === 'object' && result1 !== null);
        asserts.assert('timestamp' in result1 && 'id' in result1);
      },
    );
  });
});
