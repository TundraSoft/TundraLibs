import * as asserts from '$asserts';
import { UnknownGuardian } from '../../guards/UnknownGuardian.ts';
import { GuardianError } from '../../GuardianError.ts';

Deno.test('guardian.UnknownGuardian', async (t) => {
  await t.step('basic functionality', async (u) => {
    await u.step('should accept non-null values', () => {
      const unknownGuard = new UnknownGuardian();

      // Test various types
      asserts.assertEquals(unknownGuard.parse('hello'), 'hello');
      asserts.assertEquals(unknownGuard.parse(42), 42);
      asserts.assertEquals(unknownGuard.parse(true), true);
      asserts.assertEquals(unknownGuard.parse(false), false);
      asserts.assertEquals(unknownGuard.parse([1, 2, 3]), [1, 2, 3]);
      asserts.assertEquals(unknownGuard.parse({ foo: 'bar' }), { foo: 'bar' });
    });

    await u.step('rejects null values by default', () => {
      const unknownGuard = new UnknownGuardian();
      asserts.assertThrows(
        () => unknownGuard.parse(null),
        GuardianError,
        'Expected value but got null',
      );
    });

    await u.step('rejects undefined values by default', () => {
      const unknownGuard = new UnknownGuardian();
      asserts.assertThrows(
        () => unknownGuard.parse(undefined),
        GuardianError,
        'Expected value but got undefined',
      );
    });

    await u.step('allows null when nullable is used', () => {
      const unknownGuard = new UnknownGuardian().nullable();
      asserts.assertEquals(unknownGuard.parse(null), null);
    });

    await u.step('allows undefined when optional is used', () => {
      const unknownGuard = new UnknownGuardian().optional();
      asserts.assertEquals(unknownGuard.parse(undefined), undefined);
    });

    await u.step('should preserve value identity', () => {
      const unknownGuard = new UnknownGuardian();
      const obj = { test: 'value' };
      const arr = [1, 2, 3];

      asserts.assertStrictEquals(unknownGuard.parse(obj), obj);
      asserts.assertStrictEquals(unknownGuard.parse(arr), arr);
    });

    await u.step('should work with special values', () => {
      const unknownGuard = new UnknownGuardian();

      asserts.assertEquals(unknownGuard.parse(0), 0);
      asserts.assertEquals(unknownGuard.parse(-0), -0);
      asserts.assertEquals(unknownGuard.parse(Infinity), Infinity);
      asserts.assertEquals(unknownGuard.parse(-Infinity), -Infinity);
      asserts.assertEquals(unknownGuard.parse(NaN), NaN);
      asserts.assertEquals(unknownGuard.parse(BigInt(123)), BigInt(123));

      // Symbol test - can't use assertEquals for symbols, check type instead
      const sym = Symbol('test');
      const result = unknownGuard.parse(sym);
      asserts.assert(typeof result === 'symbol');
      asserts.assertEquals(result.toString(), 'Symbol(test)');
    });
  });

  await t.step('type transformations', async (u) => {
    await u.step('should convert to string', () => {
      const stringGuard = new UnknownGuardian().toStringValue();

      asserts.assertEquals(stringGuard.parse('hello'), 'hello');
      asserts.assertEquals(stringGuard.parse(42), '42');
      asserts.assertEquals(stringGuard.parse(true), 'true');
      asserts.assertEquals(stringGuard.parse(false), 'false');
      asserts.assertEquals(stringGuard.parse(BigInt(123)), '123');
      asserts.assertEquals(stringGuard.parse([1, 2, 3]), '[1,2,3]');
      asserts.assertEquals(
        stringGuard.parse({ name: 'John' }),
        '{"name":"John"}',
      );
    });

    await u.step('should pass null through when nullable', () => {
      const nullableStringGuard = new UnknownGuardian().process((
        value: unknown,
      ) => String(value)).nullable();

      // nullable() allows null to pass through without transformation
      asserts.assertEquals(nullableStringGuard.parse(null), null);
      // But non-null values are still transformed
      asserts.assertEquals(nullableStringGuard.parse(42), '42');
    });

    await u.step('should convert undefined to string when optional', () => {
      const optionalStringGuard = new UnknownGuardian().process((
        value: unknown,
      ) => String(value)).optional('undefined');

      asserts.assertEquals(optionalStringGuard.parse(undefined), 'undefined');
    });

    await u.step('should handle symbol to string conversion', () => {
      const stringGuard = new UnknownGuardian().toStringValue();
      const sym = Symbol('test');
      const result = stringGuard.parse(sym);
      asserts.assert(result.startsWith('Symbol(test)'));
    });

    await u.step('should handle function to string conversion', () => {
      const stringGuard = new UnknownGuardian().toStringValue();
      const fn = () => 'hello';
      const result = stringGuard.parse(fn);
      asserts.assert(typeof result === 'string');
      asserts.assert(result.includes('hello') || result.includes('function'));
    });

    await u.step('should convert to JSON', () => {
      const jsonGuard = new UnknownGuardian().toJSON();

      asserts.assertEquals(jsonGuard.parse('hello'), '"hello"');
      asserts.assertEquals(jsonGuard.parse(42), '42');
      asserts.assertEquals(jsonGuard.parse(true), 'true');
      asserts.assertEquals(jsonGuard.parse([1, 2, 3]), '[1,2,3]');
      asserts.assertEquals(
        jsonGuard.parse({ name: 'John' }),
        '{"name":"John"}',
      );
    });

    await u.step('should pass null through when nullable', () => {
      const nullableJsonGuard = new UnknownGuardian().process((
        value: unknown,
      ) => JSON.stringify(value)).nullable();

      // nullable() allows null to pass through without transformation
      asserts.assertEquals(nullableJsonGuard.parse(null), null);
      // But non-null values are still transformed
      asserts.assertEquals(
        nullableJsonGuard.parse({ name: 'John' }),
        '{"name":"John"}',
      );
    });

    await u.step('should handle JSON serialization errors', () => {
      const jsonGuard = new UnknownGuardian().toJSON();

      // Create an object that can't be serialized (BigInt)
      const unserializable = BigInt(123);

      asserts.assertThrows(
        () => jsonGuard.parse(unserializable),
        GuardianError,
      );
    });

    await u.step('should use custom error message for JSON failures', () => {
      const jsonGuard = new UnknownGuardian().toJSON('Custom JSON error');

      // Use BigInt which can't be JSON serialized
      const unserializable = BigInt(456);

      asserts.assertThrows(
        () => jsonGuard.parse(unserializable),
        GuardianError,
        'Custom JSON error',
      );
    });
  });

  await t.step('type narrowing', async (u) => {
    await u.step('should narrow to string type', () => {
      const isString = (value: unknown): value is string =>
        typeof value === 'string';
      const stringGuard = new UnknownGuardian().narrow(isString);

      asserts.assertEquals(stringGuard.parse('hello'), 'hello');
      asserts.assertThrows(
        () => stringGuard.parse(42),
        Error,
        'Value failed type guard validation',
      );
    });

    await u.step('should narrow to number type', () => {
      const isNumber = (value: unknown): value is number =>
        typeof value === 'number';
      const numberGuard = new UnknownGuardian().narrow(isNumber);

      asserts.assertEquals(numberGuard.parse(42), 42);
      asserts.assertThrows(
        () => numberGuard.parse('hello'),
        Error,
        'Value failed type guard validation',
      );
    });

    await u.step('should use custom error message for narrowing', () => {
      const isString = (value: unknown): value is string =>
        typeof value === 'string';
      const stringGuard = new UnknownGuardian().narrow(
        isString,
        'Expected a string value',
      );

      asserts.assertEquals(stringGuard.parse('hello'), 'hello');
      asserts.assertThrows(
        () => stringGuard.parse(42),
        Error,
        'Expected a string value',
      );
    });
  });

  await t.step('nullish validations', async (u) => {
    await u.step('should validate nullish values', () => {
      const nullGuard = new UnknownGuardian().nullable();
      const undefinedGuard = new UnknownGuardian().optional();

      // Test null handling
      asserts.assertEquals(nullGuard.parse(null), null);

      // Test undefined handling
      asserts.assertEquals(undefinedGuard.parse(undefined), undefined);

      // Both should accept regular values since UnknownGuardian accepts anything
      asserts.assertEquals(nullGuard.parse('hello'), 'hello');
      asserts.assertEquals(undefinedGuard.parse('hello'), 'hello');
    });

    await u.step('should validate non-nullish values', () => {
      const nonNullishGuard = new UnknownGuardian().nonNullish();

      asserts.assertEquals(nonNullishGuard.parse('hello'), 'hello');
      asserts.assertEquals(nonNullishGuard.parse(42), 42);
      asserts.assertEquals(nonNullishGuard.parse(false), false);

      asserts.assertThrows(
        () => nonNullishGuard.parse(null),
        GuardianError,
      );
      asserts.assertThrows(
        () => nonNullishGuard.parse(undefined),
        GuardianError,
      );
    });
  });

  await t.step('type assertions', async (u) => {
    await u.step('should apply type guard assertion', () => {
      const isString = (value: unknown): value is string =>
        typeof value === 'string';
      const assertGuard = new UnknownGuardian().as(isString);

      asserts.assertEquals(assertGuard.parse('hello'), 'hello');
      asserts.assertThrows(
        () => assertGuard.parse(42),
        GuardianError,
      );
    });

    await u.step('should apply custom transformation using mutate', () => {
      const transformGuard = new UnknownGuardian().process((value: unknown) => {
        return typeof value === 'string' ? value.toUpperCase() : String(value);
      });

      asserts.assertEquals(transformGuard.parse('hello'), 'HELLO');
      asserts.assertEquals(transformGuard.parse(42), '42');
    });

    await u.step('should handle transformation errors', () => {
      const transformGuard = new UnknownGuardian().process(() => {
        throw new Error('Transformation failed');
      });

      asserts.assertThrows(
        () => transformGuard.parse('test'),
        GuardianError,
      );
    });
  });

  await t.step('safe parsing', async (u) => {
    await u.step('should return success for valid values', () => {
      const unknownGuard = new UnknownGuardian();

      const [error, data] = unknownGuard.safeParse('hello');
      asserts.assertEquals(error, null);
      asserts.assertEquals(data, 'hello');
    });

    await u.step('should handle transformation failures in safeParse', () => {
      const failingGuard = new UnknownGuardian()
        .process(() => {
          throw new Error('Transformation failed');
        });

      const [error, data] = failingGuard.safeParse('test');
      asserts.assertInstanceOf(error, GuardianError);
      asserts.assertEquals(data, undefined);
    });
  });

  await t.step('chaining operations', async (u) => {
    await u.step('should chain multiple transformations', () => {
      const chainedGuard = new UnknownGuardian()
        .as((value: unknown): value is string => typeof value === 'string')
        .process((str: string) => str.toUpperCase())
        .process((str: string) => str + '!');

      asserts.assertEquals(chainedGuard.parse('hello'), 'HELLO!');
    });

    await u.step('should chain narrowing and transformation', () => {
      const isNumber = (value: unknown): value is number =>
        typeof value === 'number';

      const chainedGuard = new UnknownGuardian()
        .narrow(isNumber)
        .process((num: number) => num * 2)
        .process((num: number) => `Result: ${num}`);

      asserts.assertEquals(chainedGuard.parse(21), 'Result: 42');

      asserts.assertThrows(
        () => chainedGuard.parse('hello'),
        GuardianError,
      );
    });
  });

  await t.step('error handling', async (u) => {
    await u.step('should preserve error context in transformations', () => {
      const guard = new UnknownGuardian().process(() => {
        throw new GuardianError(
          'Custom validation error',
          {
            type: 'custom',
            expected: 'valid value',
            got: 'invalid value',
            comparison: 'custom',
          },
        );
      });

      asserts.assertThrows(
        () => guard.parse('test'),
        GuardianError,
        'Custom validation error',
      );
    });

    await u.step('should wrap non-Guardian errors', () => {
      const guard = new UnknownGuardian().process(() => {
        throw new TypeError('Regular error');
      });

      // The error should be wrapped or re-thrown as a GuardianError
      const [error] = guard.safeParse('test');
      asserts.assertInstanceOf(error, GuardianError);
    });
  });

  await t.step('async support', async (u) => {
    await u.step('should support async parsing', async () => {
      const guard = new UnknownGuardian();
      const result = await guard.parseAsync('hello');
      asserts.assertEquals(result, 'hello');
    });

    await u.step('should handle async parsing errors', async () => {
      const guard = new UnknownGuardian().process(() => {
        throw new GuardianError('Sync transformation error', {
          expected: 'valid value',
          got: 'invalid',
          comparison: 'transform',
          type: 'transformation',
        });
      });

      await asserts.assertRejects(
        () => guard.parseAsync('input'),
        GuardianError,
        'Sync transformation error',
      );
    });
  });

  await t.step('nullable and optional chaining', async (u) => {
    await u.step(
      'nullable().optional() allows null, undefined, and any value',
      () => {
        const guard = new UnknownGuardian().nullable().optional();

        asserts.assertEquals(guard.parse(null), null);
        asserts.assertEquals(guard.parse(undefined), undefined);
        asserts.assertEquals(guard.parse('hello'), 'hello');
        asserts.assertEquals(guard.parse(42), 42);
        asserts.assertEquals(guard.parse(true), true);
        asserts.assertEquals(guard.parse([1, 2, 3]), [1, 2, 3]);
        asserts.assertEquals(guard.parse({ foo: 'bar' }), { foo: 'bar' });
      },
    );

    await u.step(
      'optional().nullable() allows undefined, null, and any value',
      () => {
        const guard = new UnknownGuardian().optional().nullable();

        asserts.assertEquals(guard.parse(undefined), undefined);
        asserts.assertEquals(guard.parse(null), null);
        asserts.assertEquals(guard.parse('hello'), 'hello');
        asserts.assertEquals(guard.parse(42), 42);
        asserts.assertEquals(guard.parse(false), false);
        asserts.assertEquals(guard.parse([1, 2, 3]), [1, 2, 3]);
        asserts.assertEquals(guard.parse({ foo: 'bar' }), { foo: 'bar' });
      },
    );

    await u.step('nullable().optional() preserves value identity', () => {
      const guard = new UnknownGuardian().nullable().optional();
      const obj = { test: 'value' };
      const arr = [1, 2, 3];

      asserts.assertStrictEquals(guard.parse(obj), obj);
      asserts.assertStrictEquals(guard.parse(arr), arr);
      asserts.assertEquals(guard.parse(null), null);
      asserts.assertEquals(guard.parse(undefined), undefined);
    });

    await u.step('optional().nullable() preserves value identity', () => {
      const guard = new UnknownGuardian().optional().nullable();
      const obj = { test: 'value' };
      const arr = [1, 2, 3];

      asserts.assertStrictEquals(guard.parse(obj), obj);
      asserts.assertStrictEquals(guard.parse(arr), arr);
      asserts.assertEquals(guard.parse(undefined), undefined);
      asserts.assertEquals(guard.parse(null), null);
    });
  });
});
