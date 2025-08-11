import { assertEquals, assertThrows } from '$asserts';
import { GuardianError } from '../../GuardianError.ts';
import { UnknownGuardian } from '../../guards/mod.ts';

Deno.test('guardian.unknown', async (t) => {
  await t.step('create', async (t) => {
    await t.step('passes through any value without validation', () => {
      const guard = UnknownGuardian.create();

      // Primitives
      assertEquals(guard('hello'), 'hello');
      assertEquals(guard(42), 42);
      assertEquals(guard(true), true);
      assertEquals(guard(false), false);
      assertEquals(guard(null), null);
      assertEquals(guard(undefined), undefined);
      assertEquals(guard(123n), 123n);

      // Objects
      const obj = { foo: 'bar' };
      assertEquals(guard(obj), obj);

      // Arrays
      const arr = [1, 2, 3];
      assertEquals(guard(arr), arr);

      // Functions
      const fn = () => 'test';
      assertEquals(guard(fn), fn);

      // Dates
      const date = new Date();
      assertEquals(guard(date), date);

      // Symbols
      const sym = Symbol('test');
      assertEquals(guard(sym), sym);
    });

    await t.step('accepts all JavaScript types', () => {
      const guard = UnknownGuardian.create();

      // Should not throw for any type
      guard(0);
      guard(-0);
      guard(NaN);
      guard(Infinity);
      guard(-Infinity);
      guard('');
      guard(' ');
      guard([]);
      guard({});
      guard(new Map());
      guard(new Set());
      guard(new RegExp('test'));
      guard(new Error('test'));
    });
  });

  await t.step('notNull', async (t) => {
    await t.step('passes for all non-null values', () => {
      const guard = UnknownGuardian.create().notNull();

      assertEquals(guard('hello'), 'hello');
      assertEquals(guard(0), 0);
      assertEquals(guard(false), false);
      assertEquals(guard(undefined), undefined);
      assertEquals(guard(''), '');
      assertEquals(guard([]), []);
      assertEquals(guard({}), {});
      assertEquals(guard(NaN), NaN);
    });

    await t.step('throws for null values', () => {
      const guard = UnknownGuardian.create().notNull();
      assertThrows(
        () => guard(null),
        GuardianError,
        'Expected value to not be null',
      );
    });

    await t.step('uses custom error message when provided', () => {
      const guard = UnknownGuardian.create().notNull('Custom null error');
      assertThrows(
        () => guard(null),
        GuardianError,
        'Custom null error',
      );
    });
  });

  await t.step('notUndefined', async (t) => {
    await t.step('passes for all non-undefined values', () => {
      const guard = UnknownGuardian.create().notUndefined();

      assertEquals(guard('hello'), 'hello');
      assertEquals(guard(0), 0);
      assertEquals(guard(false), false);
      assertEquals(guard(null), null);
      assertEquals(guard(''), '');
      assertEquals(guard([]), []);
      assertEquals(guard({}), {});
      assertEquals(guard(NaN), NaN);
    });

    await t.step('throws for undefined values', () => {
      const guard = UnknownGuardian.create().notUndefined();
      assertThrows(
        () => guard(undefined),
        GuardianError,
        'Expected value to not be undefined',
      );
    });

    await t.step('uses custom error message when provided', () => {
      const guard = UnknownGuardian.create().notUndefined(
        'Custom undefined error',
      );
      assertThrows(
        () => guard(undefined),
        GuardianError,
        'Custom undefined error',
      );
    });
  });

  await t.step('notNullish', async (t) => {
    await t.step('passes for all non-nullish values', () => {
      const guard = UnknownGuardian.create().notNullish();

      assertEquals(guard('hello'), 'hello');
      assertEquals(guard(0), 0);
      assertEquals(guard(false), false);
      assertEquals(guard(''), '');
      assertEquals(guard([]), []);
      assertEquals(guard({}), {});
      assertEquals(guard(NaN), NaN);
    });

    await t.step('throws for null values', () => {
      const guard = UnknownGuardian.create().notNullish();
      assertThrows(
        () => guard(null),
        GuardianError,
        'Expected value to not be null or undefined',
      );
    });

    await t.step('throws for undefined values', () => {
      const guard = UnknownGuardian.create().notNullish();
      assertThrows(
        () => guard(undefined),
        GuardianError,
        'Expected value to not be null or undefined',
      );
    });

    await t.step('uses custom error message when provided', () => {
      const guard = UnknownGuardian.create().notNullish('Custom nullish error');
      assertThrows(
        () => guard(null),
        GuardianError,
        'Custom nullish error',
      );
      assertThrows(
        () => guard(undefined),
        GuardianError,
        'Custom nullish error',
      );
    });
  });

  await t.step('truthy', async (t) => {
    await t.step('passes for truthy values', () => {
      const guard = UnknownGuardian.create().truthy();

      assertEquals(guard('hello'), 'hello');
      assertEquals(guard(1), 1);
      assertEquals(guard(-1), -1);
      assertEquals(guard(true), true);
      assertEquals(guard([]), []);
      assertEquals(guard({}), {});
      assertEquals(guard('0'), '0'); // String '0' is truthy
      assertEquals(guard(Infinity), Infinity);
      assertEquals(guard(-Infinity), -Infinity);
    });

    await t.step('throws for falsy values', () => {
      const guard = UnknownGuardian.create().truthy();

      assertThrows(
        () => guard(false),
        GuardianError,
        'Expected truthy value',
      );
      assertThrows(
        () => guard(0),
        GuardianError,
        'Expected truthy value',
      );
      assertThrows(
        () => guard(''),
        GuardianError,
        'Expected truthy value',
      );
      assertThrows(
        () => guard(null),
        GuardianError,
        'Expected truthy value',
      );
      assertThrows(
        () => guard(undefined),
        GuardianError,
        'Expected truthy value',
      );
      assertThrows(
        () => guard(NaN),
        GuardianError,
        'Expected truthy value',
      );
    });

    await t.step('uses custom error message when provided', () => {
      const guard = UnknownGuardian.create().truthy('Must be truthy');
      assertThrows(
        () => guard(false),
        GuardianError,
        'Must be truthy',
      );
    });
  });

  await t.step('instanceOf', async (t) => {
    await t.step('passes for correct instances', () => {
      const dateGuard = UnknownGuardian.create().instanceOf(Date);
      const arrayGuard = UnknownGuardian.create().instanceOf(Array);
      const errorGuard = UnknownGuardian.create().instanceOf(Error);
      const regexpGuard = UnknownGuardian.create().instanceOf(RegExp);

      const date = new Date();
      const array = [1, 2, 3];
      const error = new Error('test');
      const regexp = /test/;

      assertEquals(dateGuard(date), date);
      assertEquals(arrayGuard(array), array);
      assertEquals(errorGuard(error), error);
      assertEquals(regexpGuard(regexp), regexp);
    });

    await t.step('throws for incorrect instances', () => {
      const dateGuard = UnknownGuardian.create().instanceOf(Date);

      assertThrows(
        () => dateGuard('2023-01-01'),
        GuardianError,
        'Expected instance of Date',
      );
      assertThrows(
        () => dateGuard({}),
        GuardianError,
        'Expected instance of Date',
      );
      assertThrows(
        () => dateGuard(null),
        GuardianError,
        'Expected instance of Date',
      );
    });

    await t.step('works with custom classes', () => {
      class CustomClass {
        constructor(public value: string) {}
      }

      const guard = UnknownGuardian.create().instanceOf(CustomClass);
      const instance = new CustomClass('test');

      assertEquals(guard(instance), instance);
      assertThrows(
        () => guard({}),
        GuardianError,
        'Expected instance of CustomClass',
      );
    });

    await t.step('uses custom error message when provided', () => {
      const guard = UnknownGuardian.create().instanceOf(
        Date,
        'Must be a Date instance',
      );
      assertThrows(
        () => guard('2023-01-01'),
        GuardianError,
        'Must be a Date instance',
      );
    });
  });

  await t.step('chaining validations', async (t) => {
    await t.step('can combine multiple validations', () => {
      const guard = UnknownGuardian.create()
        .notNull()
        .notUndefined()
        .truthy()
        .instanceOf(String);

      // Test with String objects (not primitive strings)
      const stringObj = new String('hello');
      assertEquals(guard(stringObj), stringObj);

      // Should fail at different validation points
      assertThrows(() => guard(null), GuardianError); // notNull
      assertThrows(() => guard(undefined), GuardianError); // notUndefined
      assertThrows(() => guard(''), GuardianError); // truthy (empty string is falsy)
      assertThrows(() => guard('primitive string'), GuardianError); // instanceOf String
    });

    await t.step('validates in order', () => {
      // Test that validations happen in the correct order
      const guard = UnknownGuardian.create()
        .notNull()
        .instanceOf(Date)
        .truthy();

      // Should fail on notNull first, before checking instance
      try {
        guard(null);
        throw new Error('Should have thrown');
      } catch (error) {
        assertEquals(
          (error as GuardianError).message,
          'Expected value to not be null',
        );
      }

      // Should fail on instanceOf before truthy check
      try {
        guard('not a date');
        throw new Error('Should have thrown');
      } catch (error) {
        assertEquals(
          (error as GuardianError).message,
          'Expected instance of Date',
        );
      }
    });

    await t.step('complex chaining with instanceof checks', () => {
      const guard = UnknownGuardian.create()
        .notNullish()
        .instanceOf(Date);

      const date = new Date();
      assertEquals(guard(date), date);

      assertThrows(() => guard(null), GuardianError); // notNullish
      assertThrows(() => guard('string'), GuardianError); // instanceOf Date
      assertThrows(() => guard({}), GuardianError); // instanceOf Date
    });
  });

  await t.step('edge cases', async (t) => {
    await t.step('handles special number values correctly', () => {
      const guard = UnknownGuardian.create();

      assertEquals(guard(NaN), NaN);
      assertEquals(guard(Infinity), Infinity);
      assertEquals(guard(-Infinity), -Infinity);
      assertEquals(guard(0), 0);
      assertEquals(guard(-0), -0);
    });

    await t.step('handles symbols correctly', () => {
      const guard = UnknownGuardian.create().test(
        (value: unknown) => typeof value === 'symbol',
        'Expected symbol type',
      );
      const sym = Symbol('test');

      // Symbols are primitives, so we test for the type instead
      assertEquals(guard(sym), sym);
      assertThrows(() => guard('symbol'), GuardianError);
    });

    await t.step('handles bigint correctly', () => {
      const guard = UnknownGuardian.create();
      const bigint = 123n;

      assertEquals(guard(bigint), bigint);
      assertEquals(guard(123), 123);
    });

    await t.step('works with prototype chain', () => {
      class Parent {}
      class Child extends Parent {}

      const parentGuard = UnknownGuardian.create().instanceOf(Parent);
      const childGuard = UnknownGuardian.create().instanceOf(Child);

      const child = new Child();

      // Child instance should pass both Parent and Child checks
      assertEquals(parentGuard(child), child);
      assertEquals(childGuard(child), child);

      const parent = new Parent();

      // Parent instance should only pass Parent check
      assertEquals(parentGuard(parent), parent);
      assertThrows(() => childGuard(parent), GuardianError);
    });

    await t.step('handles function types correctly', () => {
      const functionGuard = UnknownGuardian.create().instanceOf(Function);

      const regularFunction = function () {};
      const arrowFunction = () => {};
      const asyncFunction = async () => {};
      const generatorFunction = function* () {};
      const asyncGeneratorFunction = async function* () {};

      assertEquals(functionGuard(regularFunction), regularFunction);
      assertEquals(functionGuard(arrowFunction), arrowFunction);
      assertEquals(functionGuard(asyncFunction), asyncFunction);
      assertEquals(functionGuard(generatorFunction), generatorFunction);
      assertEquals(
        functionGuard(asyncGeneratorFunction),
        asyncGeneratorFunction,
      );
    });
  });

  await t.step(
    'validation with transformations from BaseGuardian',
    async (t) => {
      await t.step('works with equals validation', () => {
        const guard = UnknownGuardian.create().equals('test');

        assertEquals(guard('test'), 'test');
        assertThrows(() => guard('other'), GuardianError);
      });

      await t.step('works with in validation', () => {
        const guard = UnknownGuardian.create().in(['a', 'b', 'c']);

        assertEquals(guard('a'), 'a');
        assertEquals(guard('b'), 'b');
        assertThrows(() => guard('d'), GuardianError);
      });

      await t.step('works with optional', () => {
        const guard = UnknownGuardian.create().notNull().optional();

        assertEquals(guard('test'), 'test');
        assertEquals(guard(undefined), undefined);
        // null should be passed to the guardian and rejected by notNull
        assertThrows(() => guard(null), GuardianError);
      });

      await t.step('works with transform', () => {
        const guard = UnknownGuardian.create()
          .instanceOf(String)
          .transform((value: unknown) =>
            (value as String).toString().toUpperCase()
          );

        assertEquals(guard(new String('hello')), 'HELLO');
        assertThrows(() => guard('primitive string'), GuardianError);
      });
    },
  );

  await t.step('new null and undefined handling features', async (t) => {
    await t.step('nullable method works correctly', () => {
      const guard = UnknownGuardian.create().nullable();

      assertEquals(guard('test'), 'test');
      assertEquals(guard(0), 0);
      assertEquals(guard(false), false);
      assertEquals(guard(undefined), undefined);
      assertEquals(guard(null), null); // null passes through
    });

    await t.step('optional method works correctly', () => {
      const guard = UnknownGuardian.create().optional('default');

      assertEquals(guard('test'), 'test');
      assertEquals(guard(undefined), 'default'); // undefined uses default
      // Note: null would go through to the underlying guardian
    });

    await t.step('combining optional with notNull validation', () => {
      const guard = UnknownGuardian.create()
        .notNull() // Will reject null
        .optional('default');

      assertEquals(guard('test'), 'test');
      assertEquals(guard(undefined), 'default'); // undefined uses default
      assertThrows(() => guard(null), GuardianError); // null passes through and gets rejected by notNull()
    });

    await t.step('combining nullable with optional', () => {
      const guard = UnknownGuardian.create()
        .nullable()
        .optional('default');

      assertEquals(guard('test'), 'test');
      assertEquals(guard(undefined), 'default'); // undefined uses default
      assertEquals(guard(null), null); // null passes through nullable
    });

    await t.step('combining notNull with optional', () => {
      const guard = UnknownGuardian.create()
        .notNull()
        .optional('default');

      assertEquals(guard('test'), 'test');
      assertEquals(guard(undefined), 'default');
      assertThrows(() => guard(null), GuardianError); // null rejected by notNull
    });

    await t.step('practical example: API field validation', () => {
      // Simulate an API where null is allowed but undefined gets a default
      const apiFieldGuard = UnknownGuardian.create()
        .nullable() // Allow null values to pass through
        .optional('fallback_value') // Provide default for undefined
        .test(
          (value: unknown) => value === null || typeof value === 'string',
          'Must be string or null',
        );

      assertEquals(apiFieldGuard(undefined), 'fallback_value'); // undefined -> default
      assertEquals(apiFieldGuard('actual_value'), 'actual_value'); // string passes
      assertEquals(apiFieldGuard(null), null); // null is explicitly allowed
    });
  });

  await t.step('real-world usage scenarios', async (t) => {
    await t.step('validating API responses with unknown structure', () => {
      // Simulate validating an unknown API response
      const responseGuard = UnknownGuardian.create()
        .notNullish()
        .instanceOf(Object)
        .test((value: unknown) => {
          const obj = value as Record<string, unknown>;
          return typeof obj.status === 'string' &&
            typeof obj.data !== 'undefined';
        }, 'Invalid API response structure');

      const validResponse = { status: 'success', data: { id: 1 } };
      const invalidResponse1 = null;
      const invalidResponse2 = { status: 200 }; // status should be string
      const invalidResponse3 = { status: 'success' }; // missing data

      assertEquals(responseGuard(validResponse), validResponse);
      assertThrows(() => responseGuard(invalidResponse1), GuardianError);
      assertThrows(() => responseGuard(invalidResponse2), GuardianError);
      assertThrows(() => responseGuard(invalidResponse3), GuardianError);
    });

    await t.step('type narrowing from unknown to specific types', () => {
      // Start with unknown, then narrow down to specific types
      const stringOrNumberGuard = UnknownGuardian.create()
        .notNullish()
        .test((value: unknown) => {
          return typeof value === 'string' || typeof value === 'number';
        }, 'Must be string or number');

      assertEquals(stringOrNumberGuard('hello'), 'hello');
      assertEquals(stringOrNumberGuard(42), 42);
      assertThrows(() => stringOrNumberGuard(true), GuardianError);
      assertThrows(() => stringOrNumberGuard({}), GuardianError);
    });

    await t.step('environment variable validation', () => {
      // Validate environment variables (which come as unknown)
      const envGuard = UnknownGuardian.create()
        .notNullish()
        .test((value: unknown) => typeof value === 'string', 'Must be string')
        .truthy(); // Must not be empty string

      // Simulate environment variable validation
      const validEnv = 'production';
      const invalidEnv1 = null;
      const invalidEnv2 = '';
      const invalidEnv3 = 123;

      assertEquals(envGuard(validEnv), validEnv);
      assertThrows(() => envGuard(invalidEnv1), GuardianError);
      assertThrows(() => envGuard(invalidEnv2), GuardianError);
      assertThrows(() => envGuard(invalidEnv3), GuardianError);
    });
  });
});
