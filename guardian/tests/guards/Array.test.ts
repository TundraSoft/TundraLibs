import { assertEquals, assertThrows } from '$asserts';
import { GuardianError } from '../../GuardianError.ts';
import {
  ArrayGuardian,
  NumberGuardian,
  StringGuardian,
} from '../../guards/mod.ts';

Deno.test('ArrayGuardian', async (t) => {
  await t.step('create', async (t) => {
    await t.step('passes through array values', () => {
      const guard = ArrayGuardian.create();
      const array = [1, 2, 3];
      assertEquals(guard(array), array);
      assertEquals(guard([]), []);
      assertEquals(guard(['hello', 'world']), ['hello', 'world']);
    });

    await t.step('throws for non-array values', () => {
      const guard = ArrayGuardian.create();
      assertThrows(
        () => guard('not an array'),
        GuardianError,
        'Expected array, got string',
      );
      assertThrows(
        () => guard(42),
        GuardianError,
        'Expected array, got number',
      );
      assertThrows(
        () => guard({}),
        GuardianError,
        'Expected array, got object',
      );
      assertThrows(
        () => guard(null),
        GuardianError,
        'Expected array, got null',
      );
      assertThrows(
        () => guard(undefined),
        GuardianError,
        'Expected array, got undefined',
      );
    });

    await t.step('uses custom error message when provided', () => {
      const guard = ArrayGuardian.create('Custom error message');
      assertThrows(
        () => guard(42),
        GuardianError,
        'Custom error message',
      );
    });
  });

  await t.step('of', async (t) => {
    await t.step('validates array element type using provided guardian', () => {
      const stringGuard = StringGuardian.create();
      const stringArrayGuard = ArrayGuardian.create().of(stringGuard);

      // Should pass for string arrays
      assertEquals(stringArrayGuard(['a', 'b', 'c']), ['a', 'b', 'c']);

      // Should fail for non-string elements
      assertThrows(
        () => stringArrayGuard([1, 2, 3]),
        GuardianError,
      );

      // Should fail for mixed arrays
      assertThrows(
        () => stringArrayGuard(['a', 1, 'b']),
        GuardianError,
      );
    });

    await t.step('includes array index in error path', () => {
      const stringGuard = StringGuardian.create();
      const stringArrayGuard = ArrayGuardian.create().of(stringGuard);

      try {
        stringArrayGuard(['a', 1, 'b']);
        throw new Error('Should have thrown');
      } catch (error) {
        assertEquals(error instanceof GuardianError, true);
        assertEquals(
          (error as GuardianError).context.path?.includes('[1]'),
          true,
        );
      }
    });

    await t.step('supports chaining multiple guardians', () => {
      const numberGuard = NumberGuardian.create().min(0).max(100);
      const positiveNumberArrayGuard = ArrayGuardian.create().of(numberGuard);

      assertEquals(positiveNumberArrayGuard([1, 50, 100]), [1, 50, 100]);

      assertThrows(
        () => positiveNumberArrayGuard([1, -5, 10]),
        GuardianError,
      );
    });
  });

  await t.step('length', async (t) => {
    await t.step('passes when array has exact length', () => {
      const guard = ArrayGuardian.create().length(3);
      assertEquals(guard([1, 2, 3]), [1, 2, 3]);
    });

    await t.step('throws when array has incorrect length', () => {
      const guard = ArrayGuardian.create().length(3);
      assertThrows(
        () => guard([1, 2]),
        GuardianError,
        'Expected array to have length 3',
      );
      assertThrows(
        () => guard([1, 2, 3, 4]),
        GuardianError,
        'Expected array to have length 3',
      );
    });

    await t.step('uses custom error message when provided', () => {
      const guard = ArrayGuardian.create().length(
        3,
        'Array must have exactly 3 elements',
      );
      assertThrows(
        () => guard([1, 2]),
        GuardianError,
        'Array must have exactly 3 elements',
      );
    });
  });

  await t.step('minLength', async (t) => {
    await t.step('passes when array meets minimum length', () => {
      const guard = ArrayGuardian.create().minLength(2);
      assertEquals(guard([1, 2]), [1, 2]);
      assertEquals(guard([1, 2, 3]), [1, 2, 3]);
    });

    await t.step('throws when array is too short', () => {
      const guard = ArrayGuardian.create().minLength(2);
      assertThrows(
        () => guard([1]),
        GuardianError,
        'Expected array to have at least 2 elements',
      );
      assertThrows(
        () => guard([]),
        GuardianError,
        'Expected array to have at least 2 elements',
      );
    });
  });

  await t.step('maxLength', async (t) => {
    await t.step('passes when array meets maximum length', () => {
      const guard = ArrayGuardian.create().maxLength(2);
      assertEquals(guard([1, 2]), [1, 2]);
      assertEquals(guard([1]), [1]);
      assertEquals(guard([]), []);
    });

    await t.step('throws when array is too long', () => {
      const guard = ArrayGuardian.create().maxLength(2);
      assertThrows(
        () => guard([1, 2, 3]),
        GuardianError,
        'Expected array to have at most 2 elements',
      );
    });
  });

  await t.step('empty', async (t) => {
    await t.step('passes when array is empty', () => {
      const guard = ArrayGuardian.create().empty();
      assertEquals(guard([]), []);
    });

    await t.step('throws when array is not empty', () => {
      const guard = ArrayGuardian.create().empty();
      assertThrows(
        () => guard([1]),
        GuardianError,
        'Expected empty array',
      );
    });
  });

  await t.step('notEmpty', async (t) => {
    await t.step('passes when array is not empty', () => {
      const guard = ArrayGuardian.create().notEmpty();
      assertEquals(guard([1]), [1]);
      assertEquals(guard([1, 2, 3]), [1, 2, 3]);
    });

    await t.step('throws when array is empty', () => {
      const guard = ArrayGuardian.create().notEmpty();
      assertThrows(
        () => guard([]),
        GuardianError,
        'Expected non-empty array',
      );
    });
  });

  await t.step('unique', async (t) => {
    await t.step('passes when array has unique elements', () => {
      const guard = ArrayGuardian.create().unique();
      assertEquals(guard([1, 2, 3]), [1, 2, 3]);
      assertEquals(guard(['a', 'b', 'c']), ['a', 'b', 'c']);
    });

    await t.step('throws when array has duplicate elements', () => {
      const guard = ArrayGuardian.create().unique();
      assertThrows(
        () => guard([1, 2, 1]),
        GuardianError,
        'Expected array with unique elements',
      );
    });
  });

  await t.step('includes', async (t) => {
    await t.step('passes when array includes specified value', () => {
      const guard = ArrayGuardian.create().includes(2);
      assertEquals(guard([1, 2, 3]), [1, 2, 3]);
    });

    await t.step('throws when array does not include specified value', () => {
      const guard = ArrayGuardian.create().includes(4);
      assertThrows(
        () => guard([1, 2, 3]),
        GuardianError,
        'Expected array to include 4',
      );
    });
  });

  await t.step('chaining validations', async (t) => {
    await t.step('can combine multiple validations', () => {
      const stringGuard = StringGuardian.create();
      const guard = ArrayGuardian.create()
        .of(stringGuard)
        .minLength(2)
        .maxLength(4)
        .notEmpty()
        .unique();

      assertEquals(guard(['a', 'b', 'c']), ['a', 'b', 'c']);

      assertThrows(() => guard(['a']), GuardianError); // Too short
      assertThrows(() => guard(['a', 'b', 'c', 'd', 'e']), GuardianError); // Too long
      assertThrows(() => guard(['a', 'a', 'b']), GuardianError); // Not unique
      assertThrows(() => guard([1, 2, 3]), GuardianError); // Wrong type
    });
  });
});
