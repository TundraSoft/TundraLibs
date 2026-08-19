import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import {
  BooleanGuardian,
  GuardianError,
  NumberGuardian,
  ObjectGuardian,
  RecordGuardian,
  StringGuardian,
} from '../../mod.ts';

describe('guardian.RecordGuardian', () => {
  describe('Creation and basic functionality', () => {
    it('should create a RecordGuardian with string keys and number values', () => {
      const guard = new RecordGuardian(
        new StringGuardian(),
        new NumberGuardian(),
      );

      const result = guard.parse({ a: 1, b: 2, c: 3 });
      asserts.assertEquals(result.a, 1);
      asserts.assertEquals(result.b, 2);
      asserts.assertEquals(result.c, 3);
    });

    it('should validate empty records', () => {
      const guard = new RecordGuardian(
        new StringGuardian(),
        new NumberGuardian(),
      );

      const result = guard.parse({});
      asserts.assertEquals(result, {});
    });

    it('drops prototype-pollution keys from the output', () => {
      const guard = new RecordGuardian(
        new StringGuardian(),
        new NumberGuardian(),
      );
      // `JSON.parse` makes `__proto__` an own enumerable key.
      const input = JSON.parse(
        '{"a":1,"__proto__":2,"constructor":3,"prototype":4,"keep":5}',
      );
      const result = guard.parse(input) as Record<string, number>;
      asserts.assertEquals(Object.keys(result).sort(), ['a', 'keep']);
      asserts.assertEquals(
        Object.prototype.hasOwnProperty.call(result, '__proto__'),
        false,
      );
      asserts.assertEquals(({} as Record<string, unknown>).polluted, undefined);
    });

    it('should validate all keys against key validator', () => {
      const guard = new RecordGuardian(
        new StringGuardian().minLength(2),
        new NumberGuardian(),
      );

      const result = guard.parse({ ab: 1, cd: 2 });
      asserts.assertEquals(result.ab, 1);
      asserts.assertEquals(result.cd, 2);

      // Should reject keys that don't pass validation
      asserts.assertThrows(
        () => guard.parse({ a: 1 }),
        GuardianError,
      );
    });

    it('should validate all values against value validator', () => {
      const guard = new RecordGuardian(
        new StringGuardian(),
        new NumberGuardian().positive(),
      );

      const result = guard.parse({ a: 1, b: 2 });
      asserts.assertEquals(result.a, 1);
      asserts.assertEquals(result.b, 2);

      // Should reject values that don't pass validation
      asserts.assertThrows(
        () => guard.parse({ a: -1 }),
        GuardianError,
      );
    });
  });

  describe('Type validation', () => {
    it('should reject non-objects', () => {
      const guard = new RecordGuardian(
        new StringGuardian(),
        new NumberGuardian(),
      );

      asserts.assertThrows(() => guard.parse('not an object'), GuardianError);
      asserts.assertThrows(() => guard.parse(123), GuardianError);
      asserts.assertThrows(() => guard.parse(true), GuardianError);
      asserts.assertThrows(() => guard.parse(null), GuardianError);
      asserts.assertThrows(() => guard.parse([]), GuardianError);
      asserts.assertThrows(() => guard.parse(undefined), GuardianError);
    });
  });

  describe('Key pattern validation', () => {
    it('should validate keys with pattern', () => {
      const guard = new RecordGuardian(
        new StringGuardian().pattern(/^[A-Z_]+$/),
        new StringGuardian(),
      );

      const result = guard.parse({ API_KEY: 'abc', DB_HOST: 'localhost' });
      asserts.assertEquals(result.API_KEY, 'abc');
      asserts.assertEquals(result.DB_HOST, 'localhost');
    });

    it('should reject keys that do not match pattern', () => {
      const guard = new RecordGuardian(
        new StringGuardian().pattern(/^[A-Z_]+$/),
        new StringGuardian(),
      );

      asserts.assertThrows(
        () => guard.parse({ apiKey: 'abc' }),
        GuardianError,
      );
    });

    it('should validate keys with min/max length', () => {
      const guard = new RecordGuardian(
        new StringGuardian().minLength(2).maxLength(5),
        new NumberGuardian(),
      );

      const result = guard.parse({ abc: 1, defg: 2 });
      asserts.assertEquals(result.abc, 1);
      asserts.assertEquals(result.defg, 2);

      asserts.assertThrows(
        () => guard.parse({ a: 1 }),
        GuardianError,
      );

      asserts.assertThrows(
        () => guard.parse({ toolong: 1 }),
        GuardianError,
      );
    });
  });

  describe('Complex value validation', () => {
    it('should validate object values', () => {
      const guard = new RecordGuardian(
        new StringGuardian(),
        new ObjectGuardian({
          name: new StringGuardian(),
          age: new NumberGuardian(),
        }),
      );

      const result = guard.parse({
        user1: { name: 'Alice', age: 30 },
        user2: { name: 'Bob', age: 25 },
      });

      asserts.assertEquals(result.user1!.name, 'Alice'); // NOSONAR
      asserts.assertEquals(result.user1!.age, 30); // NOSONAR
      asserts.assertEquals(result.user2!.name, 'Bob'); // NOSONAR
      asserts.assertEquals(result.user2!.age, 25); // NOSONAR
    });

    it('should validate nested records', () => {
      const guard = new RecordGuardian(
        new StringGuardian(),
        new RecordGuardian(new StringGuardian(), new NumberGuardian()),
      );

      const result = guard.parse({
        group1: { a: 1, b: 2 },
        group2: { c: 3, d: 4 },
      });

      asserts.assertEquals(result.group1!.a, 1); // NOSONAR
      asserts.assertEquals(result.group1!.b, 2); // NOSONAR
      asserts.assertEquals(result.group2!.c, 3); // NOSONAR
      asserts.assertEquals(result.group2!.d, 4); // NOSONAR
    });
  });

  describe('Helper validation methods', () => {
    describe('notEmpty()', () => {
      it('should pass for non-empty records', () => {
        const guard = new RecordGuardian(
          new StringGuardian(),
          new NumberGuardian(),
        ).notEmpty();

        const result = guard.parse({ a: 1 });
        asserts.assertEquals(result.a, 1);
      });

      it('should reject empty records', () => {
        const guard = new RecordGuardian(
          new StringGuardian(),
          new NumberGuardian(),
        ).notEmpty();

        asserts.assertThrows(
          () => guard.parse({}),
          GuardianError,
          'Record must not be empty',
        );
      });

      it('should use custom error message', () => {
        const guard = new RecordGuardian(
          new StringGuardian(),
          new NumberGuardian(),
        ).notEmpty('Custom: At least one entry required');

        asserts.assertThrows(
          () => guard.parse({}),
          GuardianError,
          'Custom: At least one entry required',
        );
      });
    });

    describe('nonEmpty() (alias of notEmpty)', () => {
      it('should behave identically to notEmpty', () => {
        const guard = new RecordGuardian(
          new StringGuardian(),
          new NumberGuardian(),
        ).nonEmpty();

        asserts.assertEquals(guard.parse({ a: 1 }).a, 1);
        asserts.assertThrows(
          () => guard.parse({}),
          GuardianError,
          'Record must not be empty',
        );
      });
    });

    describe('minSize()', () => {
      it('should pass when record has minimum size', () => {
        const guard = new RecordGuardian(
          new StringGuardian(),
          new NumberGuardian(),
        ).minSize(2);

        const result = guard.parse({ a: 1, b: 2 });
        asserts.assertEquals(result.a, 1);
        asserts.assertEquals(result.b, 2);
      });

      it('should pass when record exceeds minimum size', () => {
        const guard = new RecordGuardian(
          new StringGuardian(),
          new NumberGuardian(),
        ).minSize(2);

        const result = guard.parse({ a: 1, b: 2, c: 3 });
        asserts.assertEquals(Object.keys(result).length, 3);
      });

      it('should reject records below minimum size', () => {
        const guard = new RecordGuardian(
          new StringGuardian(),
          new NumberGuardian(),
        ).minSize(3);

        asserts.assertThrows(
          () => guard.parse({ a: 1, b: 2 }),
          GuardianError,
          'Record must have at least 3 properties',
        );
      });

      it('should use custom error message', () => {
        const guard = new RecordGuardian(
          new StringGuardian(),
          new NumberGuardian(),
        ).minSize(2, 'Need at least 2 items');

        asserts.assertThrows(
          () => guard.parse({ a: 1 }),
          GuardianError,
          'Need at least 2 items',
        );
      });
    });

    describe('maxSize()', () => {
      it('should pass when record is at or below maximum size', () => {
        const guard = new RecordGuardian(
          new StringGuardian(),
          new NumberGuardian(),
        ).maxSize(3);

        const result1 = guard.parse({ a: 1, b: 2 });
        asserts.assertEquals(Object.keys(result1).length, 2);

        const result2 = guard.parse({ a: 1, b: 2, c: 3 });
        asserts.assertEquals(Object.keys(result2).length, 3);
      });

      it('should reject records above maximum size', () => {
        const guard = new RecordGuardian(
          new StringGuardian(),
          new NumberGuardian(),
        ).maxSize(2);

        asserts.assertThrows(
          () => guard.parse({ a: 1, b: 2, c: 3 }),
          GuardianError,
          'Record must have at most 2 properties',
        );
      });

      it('should use custom error message', () => {
        const guard = new RecordGuardian(
          new StringGuardian(),
          new NumberGuardian(),
        ).maxSize(2, 'Too many items');

        asserts.assertThrows(
          () => guard.parse({ a: 1, b: 2, c: 3 }),
          GuardianError,
          'Too many items',
        );
      });
    });

    describe('size()', () => {
      it('should pass when record has exact size', () => {
        const guard = new RecordGuardian(
          new StringGuardian(),
          new NumberGuardian(),
        ).size(3);

        const result = guard.parse({ a: 1, b: 2, c: 3 });
        asserts.assertEquals(Object.keys(result).length, 3);
      });

      it('should reject records with different size', () => {
        const guard = new RecordGuardian(
          new StringGuardian(),
          new NumberGuardian(),
        ).size(3);

        asserts.assertThrows(
          () => guard.parse({ a: 1, b: 2 }),
          GuardianError,
          'Record must have exactly 3 properties',
        );

        asserts.assertThrows(
          () => guard.parse({ a: 1, b: 2, c: 3, d: 4 }),
          GuardianError,
          'Record must have exactly 3 properties',
        );
      });

      it('should use custom error message', () => {
        const guard = new RecordGuardian(
          new StringGuardian(),
          new NumberGuardian(),
        ).size(3, 'Must have exactly 3 items');

        asserts.assertThrows(
          () => guard.parse({ a: 1, b: 2 }),
          GuardianError,
          'Must have exactly 3 items',
        );
      });
    });

    describe('hasKeys()', () => {
      it('should pass when all required keys are present', () => {
        const guard = new RecordGuardian(
          new StringGuardian(),
          new StringGuardian(),
        ).hasKeys(['API_KEY', 'DB_HOST']);

        const result = guard.parse({
          API_KEY: 'abc',
          DB_HOST: 'localhost',
          PORT: '5432',
        });

        asserts.assertEquals(result.API_KEY, 'abc');
        asserts.assertEquals(result.DB_HOST, 'localhost');
        asserts.assertEquals(result.PORT, '5432');
      });

      it('should reject when required keys are missing', () => {
        const guard = new RecordGuardian(
          new StringGuardian(),
          new StringGuardian(),
        ).hasKeys(['API_KEY', 'DB_HOST']);

        asserts.assertThrows(
          () => guard.parse({ API_KEY: 'abc' }),
          GuardianError,
          'Record must contain keys: API_KEY, DB_HOST',
        );
      });

      it('should use custom error message', () => {
        const guard = new RecordGuardian(
          new StringGuardian(),
          new StringGuardian(),
        ).hasKeys(['API_KEY'], 'API_KEY is required');

        asserts.assertThrows(
          () => guard.parse({}),
          GuardianError,
          'API_KEY is required',
        );
      });
    });

    describe('forbiddenKeys()', () => {
      it('should pass when forbidden keys are not present', () => {
        const guard = new RecordGuardian(
          new StringGuardian(),
          new StringGuardian(),
        ).forbiddenKeys(['password', 'secret']);

        const result = guard.parse({
          username: 'user',
          email: 'user@test.com',
        });
        asserts.assertEquals(result.username, 'user');
        asserts.assertEquals(result.email, 'user@test.com');
      });

      it('should reject when forbidden keys are present', () => {
        const guard = new RecordGuardian(
          new StringGuardian(),
          new StringGuardian(),
        ).forbiddenKeys(['password', 'secret']);

        asserts.assertThrows(
          () => guard.parse({ username: 'user', password: 'secret123' }),
          GuardianError,
          'Record must not contain forbidden keys: password, secret',
        );
      });

      it('should use custom error message', () => {
        const guard = new RecordGuardian(
          new StringGuardian(),
          new StringGuardian(),
        ).forbiddenKeys(['password'], 'Passwords not allowed');

        asserts.assertThrows(
          () => guard.parse({ password: 'secret' }),
          GuardianError,
          'Passwords not allowed',
        );
      });
    });

    describe('Chaining helper validations', () => {
      it('should chain multiple helper validations', () => {
        const guard = new RecordGuardian(
          new StringGuardian(),
          new NumberGuardian(),
        )
          .notEmpty()
          .minSize(2)
          .maxSize(5)
          .hasKeys(['required1', 'required2'])
          .forbiddenKeys(['forbidden']);

        const result = guard.parse({
          required1: 1,
          required2: 2,
          optional: 3,
        });

        asserts.assertEquals(result.required1, 1);
        asserts.assertEquals(result.required2, 2);
        asserts.assertEquals(result.optional, 3);

        // Test empty
        asserts.assertThrows(
          () => guard.parse({}),
          GuardianError,
        );

        // Test minSize
        asserts.assertThrows(
          () => guard.parse({ required1: 1 }),
          GuardianError,
        );

        // Test maxSize
        asserts.assertThrows(
          () => guard.parse({ a: 1, b: 2, c: 3, d: 4, e: 5, f: 6 }),
          GuardianError,
        );

        // Test hasKeys
        asserts.assertThrows(
          () => guard.parse({ required1: 1, other: 2 }),
          GuardianError,
        );

        // Test forbiddenKeys
        asserts.assertThrows(
          () => guard.parse({ required1: 1, required2: 2, forbidden: 3 }),
          GuardianError,
        );
      });
    });
  });

  describe('Refinement functionality', () => {
    it('should apply custom refinements', () => {
      const guard = new RecordGuardian(
        new StringGuardian(),
        new NumberGuardian(),
      ).refine(
        (data: Record<string, number>) => {
          const sum = Object.values(data).reduce(
            (acc: number, val: number) => acc + val,
            0,
          );
          return sum <= 100;
        },
        'Sum of all values must not exceed 100',
      );

      const result = guard.parse({ a: 30, b: 40, c: 20 });
      asserts.assertEquals(result.a, 30);
      asserts.assertEquals(result.b, 40);
      asserts.assertEquals(result.c, 20);

      asserts.assertThrows(
        () => guard.parse({ a: 60, b: 50 }),
        GuardianError,
        'Sum of all values must not exceed 100',
      );
    });

    it('should support multiple refinements', () => {
      const guard = new RecordGuardian(
        new StringGuardian(),
        new NumberGuardian(),
      )
        .refine(
          (data: Record<string, number>) => Object.keys(data).length > 0,
          'Must not be empty',
        )
        .refine(
          (data: Record<string, number>) => Object.keys(data).length <= 5,
          'Must have at most 5 keys',
        )
        .refine(
          (data: Record<string, number>) =>
            Object.values(data).every((v: number) => v > 0),
          'All values must be positive',
        );

      const result = guard.parse({ a: 1, b: 2 });
      asserts.assertEquals(result.a, 1);
      asserts.assertEquals(result.b, 2);

      asserts.assertThrows(
        () => guard.parse({}),
        GuardianError,
        'Must not be empty',
      );

      asserts.assertThrows(
        () => guard.parse({ a: 1, b: 2, c: 3, d: 4, e: 5, f: 6 }),
        GuardianError,
        'Must have at most 5 keys',
      );

      asserts.assertThrows(
        () => guard.parse({ a: 1, b: -2 }),
        GuardianError,
        'All values must be positive',
      );
    });

    it('should support superRefine', () => {
      const guard = new RecordGuardian(
        new StringGuardian(),
        new NumberGuardian(),
      ).superRefine([
        {
          validator: (data: Record<string, number>) =>
            Object.keys(data).length >= 2,
          message: 'At least 2 properties required',
        },
        {
          validator: (data: Record<string, number>) => {
            const values = Object.values(data);
            return values.every((v: number) => v >= 0 && v <= 100);
          },
          message: 'All values must be between 0 and 100',
        },
      ]);

      const result = guard.parse({ a: 50, b: 75 });
      asserts.assertEquals(result.a, 50);
      asserts.assertEquals(result.b, 75);

      asserts.assertThrows(
        () => guard.parse({ a: 1 }),
        GuardianError,
        'At least 2 properties required',
      );

      asserts.assertThrows(
        () => guard.parse({ a: 50, b: 150 }),
        GuardianError,
        'All values must be between 0 and 100',
      );
    });

    it('superRefine ACCUMULATES all failures (bug fix: old stub short-circuited)', () => {
      // Regression guard for the lift-to-BaseGuardian change. The old
      // RecordGuardian.superRefine reduced over `.refine()`, so N
      // sequential throw-on-first-failure steps short-circuited: an
      // input failing BOTH checks only surfaced the FIRST message. The
      // inherited universal implementation runs every check and reports
      // them together.
      const guard = new RecordGuardian(
        new StringGuardian(),
        new NumberGuardian(),
      ).superRefine([
        {
          validator: (data: Record<string, number>) =>
            Object.keys(data).length >= 3,
          message: 'need at least 3 keys',
          path: 'size',
        },
        {
          validator: (data: Record<string, number>) =>
            Object.values(data).every((v) => v >= 0),
          message: 'all values must be non-negative',
          path: 'values',
        },
      ]);

      // { a: -1 } fails BOTH: fewer than 3 keys AND a negative value.
      const [err] = guard.safeParse({ a: -1 });
      asserts.assertInstanceOf(err, GuardianError);
      // BOTH messages surface in the one aggregate error — the crux.
      asserts.assertStringIncludes(err.message, 'need at least 3 keys');
      asserts.assertStringIncludes(
        err.message,
        'all values must be non-negative',
      );
      asserts.assertEquals(
        err.message.startsWith('2 refinement error(s)'),
        true,
      );
      const leaves = [...err.leafErrors()];
      asserts.assertEquals(leaves.length, 2);
      const paths = leaves.map((l) => l.path?.join('.')).sort();
      asserts.assertEquals(paths, ['size', 'values']);

      // A record satisfying both passes through untouched.
      asserts.assertEquals(guard.parse({ a: 1, b: 2, c: 3 }), {
        a: 1,
        b: 2,
        c: 3,
      });
    });

    it('should handle async refinements', async () => {
      const guard = new RecordGuardian(
        new StringGuardian(),
        new NumberGuardian(),
      ).refine(
        async (data: Record<string, number>) => {
          await new Promise((resolve) => setTimeout(resolve, 1));
          return Object.keys(data).length <= 5;
        },
        'Async: Too many keys',
      );

      const result = await guard.parseAsync({ a: 1, b: 2 });
      asserts.assertEquals(result.a, 1);
      asserts.assertEquals(result.b, 2);

      let caught = false;
      try {
        await guard.parseAsync({ a: 1, b: 2, c: 3, d: 4, e: 5, f: 6 });
      } catch (error) {
        caught = true;
        asserts.assertInstanceOf(error, GuardianError);
        asserts.assert(error.message.includes('Async: Too many keys'));
      }
      asserts.assert(caught, 'Should have thrown error');
    });

    it('should reject async refinements in sync parsing', () => {
      const guard = new RecordGuardian(
        new StringGuardian(),
        new NumberGuardian(),
      ).refine(
        async (data: Record<string, number>) => Object.keys(data).length > 0,
        'Async validation',
      );

      asserts.assertThrows(
        () => guard.parse({ a: 1 }),
        GuardianError,
        'Cannot use parse() with async validation steps',
      );
    });
  });

  describe('Clone functionality', () => {
    it('should clone record guardian', () => {
      const original = new RecordGuardian(
        new StringGuardian(),
        new NumberGuardian(),
      );

      const cloned = original.clone();

      asserts.assertNotStrictEquals(original, cloned);

      const result1 = original.parse({ a: 1, b: 2 });
      const result2 = cloned.parse({ a: 1, b: 2 });

      asserts.assertEquals(result1.a, result2.a);
      asserts.assertEquals(result1.b, result2.b);
    });

    it('should clone with refinements', () => {
      const original = new RecordGuardian(
        new StringGuardian(),
        new NumberGuardian(),
      ).notEmpty();

      const cloned = original.clone();

      asserts.assertNotStrictEquals(original, cloned);

      // Both should enforce notEmpty
      asserts.assertThrows(
        () => original.parse({}),
        GuardianError,
      );

      asserts.assertThrows(
        () => cloned.parse({}),
        GuardianError,
      );
    });
  });

  describe('Chain immutability', () => {
    it('refinement methods return a fresh instance, never the source', () => {
      const guard = new RecordGuardian(
        new StringGuardian(),
        new NumberGuardian(),
      );

      const withRefinement = guard.notEmpty();

      asserts.assertNotStrictEquals(guard, withRefinement);

      // Original still accepts empty — refinement didn't leak back.
      const result = guard.parse({});
      asserts.assertEquals(result, {});

      // Refined rejects empty.
      asserts.assertThrows(
        () => withRefinement.parse({}),
        GuardianError,
      );
    });

    it('every refinement helper returns a distinct instance', () => {
      const base = new RecordGuardian(
        new StringGuardian(),
        new NumberGuardian(),
      );

      const notEmpty = base.notEmpty();
      const minSize = base.minSize(2);
      const maxSize = base.maxSize(5);
      const size = base.size(3);
      const hasKeys = base.hasKeys(['key1']);
      const forbiddenKeys = base.forbiddenKeys(['forbidden']);

      asserts.assertNotStrictEquals(base, notEmpty);
      asserts.assertNotStrictEquals(base, minSize);
      asserts.assertNotStrictEquals(base, maxSize);
      asserts.assertNotStrictEquals(base, size);
      asserts.assertNotStrictEquals(base, hasKeys);
      asserts.assertNotStrictEquals(base, forbiddenKeys);
    });
  });

  describe('SafeParse functionality', () => {
    it('should return success for valid data', () => {
      const guard = new RecordGuardian(
        new StringGuardian(),
        new NumberGuardian(),
      );

      const [error, data] = guard.safeParse({ a: 1, b: 2 });
      asserts.assertEquals(error, null);
      asserts.assertEquals(data?.a, 1);
      asserts.assertEquals(data?.b, 2);
    });

    it('should return error for invalid data', () => {
      const guard = new RecordGuardian(
        new StringGuardian(),
        new NumberGuardian(),
      );

      const [error, data] = guard.safeParse({ a: 'not a number' });
      asserts.assertInstanceOf(error, GuardianError);
      asserts.assertEquals(data, undefined);
    });

    it('should handle refinement errors in safeParse', () => {
      const guard = new RecordGuardian(
        new StringGuardian(),
        new NumberGuardian(),
      ).notEmpty();

      const [error, data] = guard.safeParse({});
      asserts.assertInstanceOf(error, GuardianError);
      asserts.assertEquals(data, undefined);
      asserts.assert(error.message.includes('Record must not be empty'));
    });
  });

  describe('Error handling edge cases', () => {
    it('should handle multiple validation errors', () => {
      const guard = new RecordGuardian(
        new StringGuardian().minLength(2),
        new NumberGuardian().positive(),
      );

      try {
        guard.parse({ a: -1, b: -2 });
        asserts.fail('Should have thrown an error');
      } catch (error) {
        asserts.assertInstanceOf(error, GuardianError);
        asserts.assert(error.message.includes('Record validation failed'));
      }
    });

    it('should provide clear error messages for key validation failures', () => {
      const guard = new RecordGuardian(
        new StringGuardian().pattern(/^[A-Z]+$/),
        new NumberGuardian(),
      );

      try {
        guard.parse({ lowercase: 1 });
        asserts.fail('Should have thrown an error');
      } catch (error) {
        asserts.assertInstanceOf(error, GuardianError);
      }
    });

    it('should provide clear error messages for value validation failures', () => {
      const guard = new RecordGuardian(
        new StringGuardian(),
        new NumberGuardian().min(0).max(100),
      );

      try {
        guard.parse({ score: 150 });
        asserts.fail('Should have thrown an error');
      } catch (error) {
        asserts.assertInstanceOf(error, GuardianError);
      }
    });
  });

  describe('Async parseAsync edge cases', () => {
    it('should handle parseAsync with no async refinements', async () => {
      const guard = new RecordGuardian(
        new StringGuardian(),
        new NumberGuardian(),
      ).notEmpty();

      const result = await guard.parseAsync({ a: 1 });
      asserts.assertEquals(result.a, 1);
    });

    it('should handle mixed sync and async refinements', async () => {
      const guard = new RecordGuardian(
        new StringGuardian(),
        new NumberGuardian(),
      )
        .notEmpty()
        .refine(
          async (data: Record<string, number>) => {
            await new Promise((resolve) => setTimeout(resolve, 1));
            return Object.keys(data).length <= 5;
          },
          'Too many keys',
        );

      const result = await guard.parseAsync({ a: 1, b: 2 });
      asserts.assertEquals(result.a, 1);
      asserts.assertEquals(result.b, 2);

      let caught = false;
      try {
        await guard.parseAsync({});
      } catch (error) {
        caught = true;
        asserts.assertInstanceOf(error, GuardianError);
      }
      asserts.assert(caught);
    });
  });

  describe('Special key scenarios', () => {
    it('should handle special characters in keys', () => {
      const guard = new RecordGuardian(
        new StringGuardian(),
        new NumberGuardian(),
      );

      const result = guard.parse({
        'key-with-dash': 1,
        'key.with.dot': 2,
        'key with space': 3,
        'key$with$dollar': 4,
      });

      asserts.assertEquals(result['key-with-dash'], 1);
      asserts.assertEquals(result['key.with.dot'], 2);
      asserts.assertEquals(result['key with space'], 3);
      asserts.assertEquals(result['key$with$dollar'], 4);
    });

    it('should handle numeric string keys', () => {
      const guard = new RecordGuardian(
        new StringGuardian(),
        new NumberGuardian(),
      );

      const result = guard.parse({ '0': 1, '1': 2, '100': 3 });
      asserts.assertEquals(result['0'], 1);
      asserts.assertEquals(result['1'], 2);
      asserts.assertEquals(result['100'], 3);
    });

    it('should handle unicode keys', () => {
      const guard = new RecordGuardian(
        new StringGuardian(),
        new StringGuardian(),
      );

      const result = guard.parse({
        '日本語': 'Japanese',
        '한국어': 'Korean',
        '中文': 'Chinese',
      });
      asserts.assertEquals(result['日本語'], 'Japanese');
      asserts.assertEquals(result['한국어'], 'Korean');
      asserts.assertEquals(result['中文'], 'Chinese');
    });
  });

  describe('Large records', () => {
    it('should handle records with many properties', () => {
      const guard = new RecordGuardian(
        new StringGuardian(),
        new NumberGuardian(),
      );

      const largeData: Record<string, number> = {};
      for (let i = 0; i < 1000; i++) {
        largeData[`key${i}`] = i;
      }

      const result = guard.parse(largeData);
      asserts.assertEquals(Object.keys(result).length, 1000);
      asserts.assertEquals(result.key500, 500);
    });

    it('should validate large records efficiently', () => {
      const guard = new RecordGuardian(
        new StringGuardian().minLength(3),
        new NumberGuardian().positive(),
      );

      const largeData: Record<string, number> = {};
      for (let i = 0; i < 100; i++) {
        largeData[`key${i}`] = i + 1;
      }

      const result = guard.parse(largeData);
      asserts.assertEquals(Object.keys(result).length, 100);
    });
  });

  describe('Helper methods with edge values', () => {
    it('minSize with 0 should accept empty records', () => {
      const guard = new RecordGuardian(
        new StringGuardian(),
        new NumberGuardian(),
      ).minSize(0);

      const result = guard.parse({});
      asserts.assertEquals(result, {});
    });

    it('maxSize with 0 should only accept empty records', () => {
      const guard = new RecordGuardian(
        new StringGuardian(),
        new NumberGuardian(),
      ).maxSize(0);

      const result = guard.parse({});
      asserts.assertEquals(result, {});

      asserts.assertThrows(
        () => guard.parse({ a: 1 }),
        GuardianError,
      );
    });

    it('size with 0 should only accept empty records', () => {
      const guard = new RecordGuardian(
        new StringGuardian(),
        new NumberGuardian(),
      ).size(0);

      const result = guard.parse({});
      asserts.assertEquals(result, {});

      asserts.assertThrows(
        () => guard.parse({ a: 1 }),
        GuardianError,
      );
    });

    it('hasKeys with empty array should always pass', () => {
      const guard = new RecordGuardian(
        new StringGuardian(),
        new NumberGuardian(),
      ).hasKeys([]);

      const result1 = guard.parse({});
      asserts.assertEquals(result1, {});

      const result2 = guard.parse({ a: 1 });
      asserts.assertEquals(result2.a, 1);
    });

    it('forbiddenKeys with empty array should always pass', () => {
      const guard = new RecordGuardian(
        new StringGuardian(),
        new NumberGuardian(),
      ).forbiddenKeys([]);

      const result1 = guard.parse({});
      asserts.assertEquals(result1, {});

      const result2 = guard.parse({ a: 1 });
      asserts.assertEquals(result2.a, 1);
    });
  });

  describe('OpenAPI generation', () => {
    it('should generate correct OpenAPI schema', () => {
      const guard = new RecordGuardian(
        new StringGuardian(),
        new NumberGuardian(),
      );

      const schema = guard.toOpenAPI();
      // Records map to OpenAPI's `type: 'object'` with the value
      // shape under `additionalProperties` (there's no `record` type
      // in the OpenAPI / JSON Schema vocabulary).
      asserts.assertEquals(schema.type, 'object');
      asserts.assert(schema.additionalProperties !== undefined);
    });

    it('should include key pattern in OpenAPI schema', () => {
      const guard = new RecordGuardian(
        new StringGuardian().pattern(/^[A-Z_]+$/),
        new StringGuardian(),
      );

      const schema = guard.toOpenAPI();
      asserts.assertEquals(schema.type, 'object');
      asserts.assert(schema.propertyNames !== undefined);
    });
  });
});
