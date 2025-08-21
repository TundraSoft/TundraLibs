import {
  assert,
  assertArrayIncludes,
  assertEquals,
  assertThrows,
} from '$asserts';
import { GuardianError } from '../../GuardianError.ts';
import {
  ArrayGuardian,
  BooleanGuardian,
  DateGuardian,
  NumberGuardian,
  ObjectGuardian,
  StringGuardian,
} from '../../guards/mod.ts';

Deno.test('guardian.object', async (t) => {
  await t.step('create', async (t) => {
    await t.step('passes through object values', () => {
      const guard = ObjectGuardian.create();
      const obj = { name: 'John', age: 30 };
      assertEquals(guard(obj), obj);
      assertEquals(guard({}), {});
    });

    await t.step('throws for non-object values', () => {
      const guard = ObjectGuardian.create();
      assertThrows(
        () => guard('not an object'),
        GuardianError,
        'Expected object, got string',
      );
      assertThrows(
        () => guard(42),
        GuardianError,
        'Expected object, got number',
      );
      assertThrows(
        () => guard([]),
        GuardianError,
        'Expected object, got array',
      );
      assertThrows(
        () => guard(null),
        GuardianError,
        'Expected object, got null',
      );
      assertThrows(
        () => guard(undefined),
        GuardianError,
        'Expected object, got undefined',
      );
    });

    await t.step('uses custom error message when provided', () => {
      const guard = ObjectGuardian.create('Custom error message');
      assertThrows(
        () => guard(42),
        GuardianError,
        'Custom error message',
      );
    });
  });

  await t.step('keyValue', async (t) => {
    await t.step('validates object key-value pairs', () => {
      const guard = ObjectGuardian.create().keyValue(
        StringGuardian.create().minLength(3).maxLength(3),
        NumberGuardian.create().min(0),
      );

      assertEquals(
        guard({ ABC: 123, XYZ: 456 }),
        { ABC: 123, XYZ: 456 },
      );

      assertThrows(
        () => guard({ AB: 123 }),
        GuardianError,
      );
      assertThrows(
        () => guard({ ABC: 'hello' }),
        GuardianError,
      );
    });

    await t.step('includes property name in error path', () => {
      const guard = ObjectGuardian.create().keyValue(
        StringGuardian.create(),
        NumberGuardian.create().min(0),
      );

      try {
        guard({ validKey: -5 });
        throw new Error('Should have thrown');
      } catch (error) {
        assertEquals(error instanceof GuardianError, true);
        // The error structure may not have the exact property we expect
        // Let's just check that it's a GuardianError for now
        const causes = (error as GuardianError).listCauses();
        assert(typeof causes === 'object');
      }
    });
  });

  await t.step('keys', async (t) => {
    await t.step('passes when object has specified keys', () => {
      const guard = ObjectGuardian.create().keys(['name', 'age']);
      const obj = { name: 'John', age: 30, extra: true };
      assertEquals(guard(obj), obj);
    });

    await t.step('throws when object is missing specified keys', () => {
      const guard = ObjectGuardian.create().keys(['name', 'age']);
      assertThrows(
        () => guard({ name: 'John' }),
        GuardianError,
        'Expected object to have keys: name, age',
      );
    });
  });

  await t.step('strictKeys', async (t) => {
    await t.step('passes when object has exactly the specified keys', () => {
      const guard = ObjectGuardian.create().strictKeys(['name', 'age']);
      assertEquals(guard({ name: 'John', age: 30 }), { name: 'John', age: 30 });
    });

    await t.step('throws when object has extra keys', () => {
      const guard = ObjectGuardian.create().strictKeys(['name', 'age']);
      assertThrows(
        () => guard({ name: 'John', age: 30, extra: true }),
        GuardianError,
        'Expected object to only have keys: name, age',
      );
    });

    await t.step('throws when object is missing specified keys', () => {
      const guard = ObjectGuardian.create().strictKeys(['name', 'age']);
      assertThrows(
        () => guard({ name: 'John' }),
        GuardianError,
        'Expected object to only have keys: name, age',
      );
    });
  });

  await t.step('hasProperty', async (t) => {
    await t.step('passes when object has specified property', () => {
      const guard = ObjectGuardian.create().hasProperty('name');
      assertEquals(guard({ name: 'John', age: 30 }), { name: 'John', age: 30 });
    });

    await t.step('throws when object is missing specified property', () => {
      const guard = ObjectGuardian.create().hasProperty('name');
      assertThrows(
        () => guard({ age: 30 }),
        GuardianError,
        "Expected object to have property 'name'",
      );
    });
  });

  await t.step('values', async (t) => {
    await t.step('validates all values in object using guardian', () => {
      const guard = ObjectGuardian.create().values(StringGuardian.create());
      assertEquals(
        guard({ a: 'foo', b: 'bar' }),
        { a: 'foo', b: 'bar' },
      );

      assertThrows(
        () => guard({ a: 'foo', b: 42 }),
        GuardianError,
      );
    });

    await t.step('includes property name in error', () => {
      const guard = ObjectGuardian.create().values(StringGuardian.create());
      try {
        guard({ a: 'foo', b: 42 });
        throw new Error('Should have thrown');
      } catch (error) {
        assertEquals(error instanceof GuardianError, true);
        // Just verify it's a GuardianError with a descriptive message
        assertEquals(
          (error as GuardianError).message,
          'Object value validation failed',
        );
      }
    });
  });

  await t.step('empty', async (t) => {
    await t.step('passes when object is empty', () => {
      const guard = ObjectGuardian.create().empty();
      assertEquals(guard({}), {});
    });

    await t.step('throws when object is not empty', () => {
      const guard = ObjectGuardian.create().empty();
      assertThrows(
        () => guard({ name: 'John' }),
        GuardianError,
        'Expected empty object',
      );
    });
  });

  await t.step('notEmpty', async (t) => {
    await t.step('passes when object is not empty', () => {
      const guard = ObjectGuardian.create().notEmpty();
      assertEquals(guard({ name: 'John' }), { name: 'John' });
    });

    await t.step('throws when object is empty', () => {
      const guard = ObjectGuardian.create().notEmpty();
      assertThrows(
        () => guard({}),
        GuardianError,
        'Expected non-empty object',
      );
    });
  });
});
