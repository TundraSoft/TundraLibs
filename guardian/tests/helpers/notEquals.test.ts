import * as asserts from '$asserts';
import { notEquals } from '../../helpers/mod.ts';
import { GuardianError } from '../../GuardianError.ts';

/**
 * Comprehensive test suite for notEquals helper function.
 * Tests inequality validation functionality.
 */
Deno.test('guardian.helpers.notEquals', async (t) => {
  await t.step('Basic inequality validation', async (t) => {
    await t.step('should pass when values are not equal', () => {
      const validator = notEquals('hello');
      asserts.assertEquals(validator('world'), 'world');

      const numberValidator = notEquals(42);
      asserts.assertEquals(numberValidator(43), 43);

      const booleanValidator = notEquals(true);
      asserts.assertEquals(booleanValidator(false), false);
    });

    await t.step('should fail when values are equal', () => {
      const validator = notEquals('hello');
      asserts.assertThrows(
        () => validator('hello'),
        GuardianError,
      );

      const numberValidator = notEquals(42);
      asserts.assertThrows(
        () => numberValidator(42),
        GuardianError,
      );
    });
  });

  await t.step('Custom error messages', async (t) => {
    await t.step('should use custom error message when provided', () => {
      const validator = notEquals('forbidden', 'Custom error message');
      asserts.assertThrows(
        () => validator('forbidden'),
        GuardianError,
        'Custom error message',
      );
    });

    await t.step('should use default error message when not provided', () => {
      const validator = notEquals('forbidden');
      asserts.assertThrows(
        () => validator('forbidden'),
        GuardianError,
      );
    });
  });

  await t.step('Type safety and special values', async (t) => {
    await t.step('should handle null values', () => {
      const validator = notEquals(null as any);
      asserts.assertEquals(validator('not-null' as any), 'not-null');

      asserts.assertThrows(
        () => validator(null as any),
        GuardianError,
      );
    });

    await t.step('should handle undefined values', () => {
      const validator = notEquals(undefined as any);
      asserts.assertEquals(validator('not-undefined' as any), 'not-undefined');

      asserts.assertThrows(
        () => validator(undefined as any),
        GuardianError,
      );
    });

    await t.step('should handle zero and false', () => {
      const zeroValidator = notEquals(0);
      asserts.assertEquals(zeroValidator(1), 1);
      asserts.assertEquals(zeroValidator(false as any), false as any);

      const falseValidator = notEquals(false);
      asserts.assertEquals(falseValidator(true), true);
      asserts.assertEquals(falseValidator(0 as any), 0 as any);
    });

    await t.step('should handle NaN correctly', () => {
      const nanValidator = notEquals(NaN);
      // NaN !== NaN, so NaN should pass the notEquals test
      asserts.assertEquals(nanValidator(NaN), NaN);
      asserts.assertEquals(nanValidator(42 as any), 42 as any);
    });
  });

  await t.step('Object and array inequality', async (t) => {
    await t.step('should use reference equality for objects', () => {
      const obj = { a: 1 };
      const validator = notEquals(obj);

      // Same object reference should fail
      asserts.assertThrows(
        () => validator(obj),
        GuardianError,
      );

      // Different object with same content should pass
      asserts.assertEquals(validator({ a: 1 } as any), { a: 1 });
    });

    await t.step('should use reference equality for arrays', () => {
      const arr = [1, 2, 3];
      const validator = notEquals(arr);

      // Same array reference should fail
      asserts.assertThrows(
        () => validator(arr),
        GuardianError,
      );

      // Different array with same content should pass
      asserts.assertEquals(validator([1, 2, 3] as any), [1, 2, 3]);
    });
  });

  await t.step('Error metadata', async (t) => {
    await t.step('should include correct metadata in error', () => {
      const validator = notEquals('forbidden');

      try {
        validator('forbidden');
        asserts.fail('Should have thrown an error');
      } catch (error) {
        if (error instanceof GuardianError) {
          asserts.assertEquals(error.context.expected, 'not forbidden');
          asserts.assertEquals(error.context.got, 'forbidden');
          asserts.assertEquals(error.context.comparison, 'notEquals');
          asserts.assertEquals(error.context.type, 'validation');
        } else {
          asserts.fail('Should have thrown a GuardianError');
        }
      }
    });
  });

  await t.step('Edge cases', async (t) => {
    await t.step('should work with complex objects', () => {
      const complexObj = { nested: { deep: [1, 2, 3] } };
      const validator = notEquals(complexObj);

      // Different complex object should pass
      asserts.assertEquals(
        validator({ nested: { deep: [1, 2, 3] } } as any),
        { nested: { deep: [1, 2, 3] } },
      );

      // Same reference should fail
      asserts.assertThrows(() => validator(complexObj), GuardianError);
    });

    await t.step('should work with functions', () => {
      const fn1 = () => 'test';
      const fn2 = () => 'test';
      const validator = notEquals(fn1);

      // Different function should pass (different reference)
      asserts.assertEquals(validator(fn2 as any), fn2);

      // Same function reference should fail
      asserts.assertThrows(() => validator(fn1), GuardianError);
    });
  });
});
