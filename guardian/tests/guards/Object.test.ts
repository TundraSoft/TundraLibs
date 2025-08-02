import {
  assert,
  assertArrayIncludes,
  assertEquals,
  assertThrows,
} from '$asserts';
import { GuardianError } from '../../GuardianError.ts';
import {
  BooleanGuardian,
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

  await t.step('schema', async (t) => {
    await t.step('validates object against schema', () => {
      const schema = {
        name: StringGuardian.create(),
        age: NumberGuardian.create().min(0),
      };
      const guard = ObjectGuardian.create().schema(schema);

      const validObj = { name: 'John', age: 30 };
      assertEquals(guard(validObj), validObj);

      assertThrows(
        () => guard({ name: 'John', age: -5 }),
        GuardianError,
      );
      assertThrows(
        () => guard({ name: 123, age: 30 }),
        GuardianError,
      );
    });

    await t.step('includes property name in error path', () => {
      const schema = {
        name: StringGuardian.create(),
        age: NumberGuardian.create().min(0),
      };
      const guard = ObjectGuardian.create().schema(schema);

      try {
        guard({ name: 'John', age: -5 });
        throw new Error('Should have thrown');
      } catch (error) {
        assertEquals(error instanceof GuardianError, true);
        assertEquals(
          (error as GuardianError).listCauses().age,
          'Expected value (-5) to be greater than or equal to 0',
        );
      }
    });

    await t.step('allows additional properties by default', () => {
      const schema = {
        name: StringGuardian.create(),
      };
      const guard = ObjectGuardian.create().schema(schema);

      const objWithExtra = { name: 'John', extra: true };
      assertEquals(guard(objWithExtra), objWithExtra);
    });

    await t.step('rejects additional properties in strict mode', () => {
      const schema = {
        name: StringGuardian.create(),
      };
      const guard = ObjectGuardian.create().schema(schema, { strict: true });

      assertThrows(
        () => guard({ name: 'John', extra: true }),
        GuardianError,
        'Schema validation failed',
      );
    });

    await t.step(
      'rejects additional properties when additionalProperties is false',
      () => {
        const schema = {
          name: StringGuardian.create(),
        };
        const guard = ObjectGuardian.create().schema(schema, {
          strict: false,
          additionalProperties: false,
        });

        // Should pass and ignore extra properties (not copy them)
        assertEquals(guard({ name: 'John', extra: true }), { name: 'John' });
      },
    );

    await t.step('additionalProperties=true vs strict=false behavior', () => {
      const schema = {
        name: StringGuardian.create(),
      };

      // additionalProperties=true (default): allows and copies extra properties
      const flexibleGuard = ObjectGuardian.create().schema(schema, {
        additionalProperties: true,
      });
      assertEquals(
        flexibleGuard({ name: 'John', extra: true }),
        // @ts-ignore
        { name: 'John', extra: true },
      );

      // additionalProperties=false: ignores extra properties (doesn't copy them)
      const ignoreExtraGuard = ObjectGuardian.create().schema(schema, {
        additionalProperties: false,
      });
      assertEquals(
        ignoreExtraGuard({ name: 'John', extra: true }),
        { name: 'John' }, // extra property not copied
      );

      // strict=true: throws on any extra properties
      const strictGuard = ObjectGuardian.create().schema(schema, {
        strict: true,
      });
      assertThrows(
        () => strictGuard({ name: 'John', extra: true }),
        GuardianError,
      );
    });
  });

  await t.step('keyValue', async (t) => {
    await t.step('validates object key-value pairs', () => {
      const guard = ObjectGuardian.create().keyValue(
        StringGuardian.create(),
        NumberGuardian.create().min(0),
      );

      const validObj = { key1: 1, key2: 42 };
      assertEquals(guard(validObj), validObj);

      assertThrows(
        () => guard({ key1: 'value1', key2: -5 }),
        GuardianError,
      );
      assertThrows(
        () => guard({ key1: 'sdf', key2: 42 }),
        GuardianError,
      );
    });

    await t.step('includes property name in error path', () => {
      const guard = ObjectGuardian.create().keyValue(
        StringGuardian.create().minLength(3),
        NumberGuardian.create().min(0),
      );

      try {
        guard({ 12: 123, 'key2': -5 });
        throw new Error('Should have thrown');
      } catch (error) {
        assertEquals(error instanceof GuardianError, true);
        assertEquals((error as GuardianError).listCauses(), {
          'key:12': 'Expected value must be at least 3 characters long',
          'value:key2': 'Expected value (-5) to be greater than or equal to 0',
        });
      }
    });
  });
  await t.step('keys', async (t) => {
    await t.step('passes when object has specified keys', () => {
      const guard = ObjectGuardian.create().keys(['name', 'age']);
      assertEquals(
        guard({ name: 'John', age: 30 }),
        { name: 'John', age: 30 },
      );
      assertEquals(
        guard({ name: 'John', age: 30, extra: true }),
        { name: 'John', age: 30, extra: true },
      );
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
      assertEquals(
        guard({ name: 'John', age: 30 }),
        { name: 'John', age: 30 },
      );
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
      assertEquals(
        guard({ name: 'John' }),
        { name: 'John' },
      );
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
        assertEquals((error as GuardianError).listCauses(), {
          b: 'Expected value to be a string, got number',
        });
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
      assertEquals(
        guard({ name: 'John' }),
        { name: 'John' },
      );
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

  await t.step('properties', async (t) => {
    await t.step('validates specified properties', () => {
      const guard = ObjectGuardian.create().properties({
        name: StringGuardian.create(),
        age: NumberGuardian.create().min(0),
      });

      assertEquals(
        guard({ name: 'John', age: 30 }),
        { name: 'John', age: 30 },
      );
      assertEquals(
        guard({ name: 'John', age: 30, extra: true }),
        { name: 'John', age: 30, extra: true },
      );

      assertThrows(
        () => guard({ name: 123, age: 30 }),
        GuardianError,
      );
    });

    await t.step('validates only existing properties', () => {
      const guard = ObjectGuardian.create().properties({
        name: StringGuardian.create(),
        age: NumberGuardian.create().min(0),
      });

      // Should not throw even though 'age' is missing
      assertEquals(
        guard({ name: 'John' }),
        { name: 'John' },
      );
    });
  });

  await t.step('pick', async (t) => {
    await t.step('creates new object with only specified properties', () => {
      const guard = ObjectGuardian.create().pick(['name', 'age']);
      assertEquals(
        guard({ name: 'John', age: 30, extra: true }),
        { name: 'John', age: 30 },
      );
    });

    await t.step('creates object with undefined for missing properties', () => {
      const guard = ObjectGuardian.create().pick(['name', 'age', 'missing']);
      assertEquals(
        guard({ name: 'John', age: 30 }),
        { name: 'John', age: 30 } as any,
      );
    });
  });

  await t.step('omit', async (t) => {
    await t.step('creates new object without specified properties', () => {
      const guard = ObjectGuardian.create().omit(['extra']);
      assertEquals(
        guard({ name: 'John', age: 30, extra: true }),
        { name: 'John', age: 30 },
      );
    });

    await t.step('returns original object if no properties match', () => {
      const guard = ObjectGuardian.create().omit(['missing']);
      const obj = { name: 'John', age: 30 };
      assertEquals(guard(obj), obj);
    });
  });

  await t.step('chaining validations', async (t) => {
    await t.step('can combine multiple validations', () => {
      const guard = ObjectGuardian.create()
        .notEmpty()
        .keys(['name', 'age'])
        .properties({
          name: StringGuardian.create(),
          age: NumberGuardian.create().min(0),
        });

      assertEquals(
        guard({ name: 'John', age: 30 }),
        { name: 'John', age: 30 },
      );

      assertThrows(() => guard({}), GuardianError); // Empty
      assertThrows(() => guard({ name: 'John' }), GuardianError); // Missing key
      assertThrows(() => guard({ name: 123, age: 30 }), GuardianError); // Invalid type
    });

    await t.step(
      'complex validation chain with schema and transformation',
      () => {
        const userSchema = {
          name: StringGuardian.create(),
          age: NumberGuardian.create().min(0),
          email: StringGuardian.create(),
        };

        const guard = ObjectGuardian.create()
          .schema(userSchema, { additionalProperties: false })
          .pick(['name', 'email']);

        assertEquals(
          guard({ name: 'John', age: 30, email: 'john@example.com' }),
          { name: 'John', email: 'john@example.com' },
        );

        assertEquals(
          guard({
            name: 'John',
            age: 30,
            email: 'john@example.com',
            extra: true,
          }),
          { name: 'John', email: 'john@example.com' },
        );
      },
    );

    await t.step('complex guardian with nested object error handling', () => {
      const guard = ObjectGuardian.create().schema({
        name: StringGuardian.create().minLength(10),
        details: ObjectGuardian.create().properties({
          age: NumberGuardian.create().min(0),
          address: StringGuardian.create(),
        }),
      });
      try {
        guard({ name: 'John', details: { age: -5, address: '123 St' } });
      } catch (error) {
        const errorList = (error as GuardianError).listCauses();
        assertEquals(errorList, {
          name: 'Expected value must be at least 10 characters long',
          'details.age': 'Expected value (-5) to be greater than or equal to 0',
        });
      }
    });
  });
});
