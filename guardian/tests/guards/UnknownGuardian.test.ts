import * as asserts from '$asserts';
import { UnknownGuardian } from '../../guards/UnknownGuardian.ts';
import { GuardianError } from '../../GuardianError.ts';

Deno.test('guardian.UnknownGuardian', async (t) => {
  await t.step('basic functionality', async (t) => {
    await t.step('should accept any value', () => {
      const unknownGuard = new UnknownGuardian();

      // Test various types
      asserts.assertEquals(unknownGuard.parse('hello'), 'hello');
      asserts.assertEquals(unknownGuard.parse(42), 42);
      asserts.assertEquals(unknownGuard.parse(true), true);
      asserts.assertEquals(unknownGuard.parse(false), false);
      asserts.assertEquals(unknownGuard.parse(null), null);
      asserts.assertEquals(unknownGuard.parse(undefined), undefined);
      asserts.assertEquals(unknownGuard.parse([1, 2, 3]), [1, 2, 3]);
      asserts.assertEquals(unknownGuard.parse({ foo: 'bar' }), { foo: 'bar' });
    });

    await t.step('should preserve value identity', () => {
      const unknownGuard = new UnknownGuardian();
      const obj = { test: 'value' };
      const arr = [1, 2, 3];

      asserts.assertStrictEquals(unknownGuard.parse(obj), obj);
      asserts.assertStrictEquals(unknownGuard.parse(arr), arr);
    });

    await t.step('should work with special values', () => {
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

  await t.step('type transformations', async (t) => {
    await t.step('should convert to string', () => {
      const stringGuard = new UnknownGuardian().toStringValue();

      asserts.assertEquals(stringGuard.parse('hello'), 'hello');
      asserts.assertEquals(stringGuard.parse(42), '42');
      asserts.assertEquals(stringGuard.parse(true), 'true');
      asserts.assertEquals(stringGuard.parse(false), 'false');
      asserts.assertEquals(stringGuard.parse(null), 'null');
      asserts.assertEquals(stringGuard.parse(undefined), 'undefined');
      asserts.assertEquals(stringGuard.parse(BigInt(123)), '123');
      asserts.assertEquals(stringGuard.parse([1, 2, 3]), '[1,2,3]');
      asserts.assertEquals(
        stringGuard.parse({ name: 'John' }),
        '{"name":"John"}',
      );
    });

    await t.step('should handle symbol to string conversion', () => {
      const stringGuard = new UnknownGuardian().toStringValue();
      const sym = Symbol('test');
      const result = stringGuard.parse(sym);
      asserts.assert(result.startsWith('Symbol(test)'));
    });

    await t.step('should handle function to string conversion', () => {
      const stringGuard = new UnknownGuardian().toStringValue();
      const fn = () => 'hello';
      const result = stringGuard.parse(fn);
      asserts.assert(typeof result === 'string');
      asserts.assert(result.includes('hello') || result.includes('function'));
    });

    await t.step('should convert to JSON', () => {
      const jsonGuard = new UnknownGuardian().toJSON();

      asserts.assertEquals(jsonGuard.parse('hello'), '"hello"');
      asserts.assertEquals(jsonGuard.parse(42), '42');
      asserts.assertEquals(jsonGuard.parse(true), 'true');
      asserts.assertEquals(jsonGuard.parse(null), 'null');
      asserts.assertEquals(jsonGuard.parse([1, 2, 3]), '[1,2,3]');
      asserts.assertEquals(
        jsonGuard.parse({ name: 'John' }),
        '{"name":"John"}',
      );
    });

    await t.step('should handle JSON serialization errors', () => {
      const jsonGuard = new UnknownGuardian().toJSON();

      // Create an object that can't be serialized (BigInt)
      const unserializable = BigInt(123);

      asserts.assertThrows(
        () => jsonGuard.parse(unserializable),
        GuardianError,
      );
    });

    await t.step('should use custom error message for JSON failures', () => {
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

  await t.step('type narrowing', async (t) => {
    await t.step('should narrow to string type', () => {
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

    await t.step('should narrow to number type', () => {
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

    await t.step('should use custom error message for narrowing', () => {
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

  await t.step('nullish validations', async (t) => {
    await t.step('should validate nullish values', () => {
      const nullishGuard = new UnknownGuardian().nullish();

      asserts.assertEquals(nullishGuard.parse(null), null);
      asserts.assertEquals(nullishGuard.parse(undefined), undefined);

      asserts.assertThrows(
        () => nullishGuard.parse('hello'),
        GuardianError,
      );
      asserts.assertThrows(
        () => nullishGuard.parse(42),
        GuardianError,
      );
    });

    await t.step('should validate non-nullish values', () => {
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

  await t.step('type assertions', async (t) => {
    await t.step('should apply type guard assertion', () => {
      const isString = (value: unknown): value is string =>
        typeof value === 'string';
      const assertGuard = new UnknownGuardian().as(isString);

      asserts.assertEquals(assertGuard.parse('hello'), 'hello');
      asserts.assertThrows(
        () => assertGuard.parse(42),
        GuardianError,
      );
    });

    await t.step('should apply custom transformation using mutate', () => {
      const transformGuard = new UnknownGuardian().mutate((value: unknown) => {
        return typeof value === 'string' ? value.toUpperCase() : String(value);
      });

      asserts.assertEquals(transformGuard.parse('hello'), 'HELLO');
      asserts.assertEquals(transformGuard.parse(42), '42');
    });

    await t.step('should handle transformation errors', () => {
      const transformGuard = new UnknownGuardian().mutate(() => {
        throw new Error('Transformation failed');
      });

      asserts.assertThrows(
        () => transformGuard.parse('test'),
        GuardianError,
      );
    });
  });

  await t.step('safe parsing', async (t) => {
    await t.step('should return success for valid values', () => {
      const unknownGuard = new UnknownGuardian();

      const [error, data] = unknownGuard.safeParse('hello');
      asserts.assertEquals(error, null);
      asserts.assertEquals(data, 'hello');
    });

    await t.step('should handle transformation failures in safeParse', () => {
      const failingGuard = new UnknownGuardian()
        .mutate(() => {
          throw new Error('Transformation failed');
        });

      const [error, data] = failingGuard.safeParse('test');
      asserts.assertInstanceOf(error, GuardianError);
      asserts.assertEquals(data, undefined);
    });
  });

  await t.step('chaining operations', async (t) => {
    await t.step('should chain multiple transformations', () => {
      const chainedGuard = new UnknownGuardian()
        .as((value: unknown): value is string => typeof value === 'string')
        .mutate((str: string) => str.toUpperCase())
        .mutate((str: string) => str + '!');

      asserts.assertEquals(chainedGuard.parse('hello'), 'HELLO!');
    });

    await t.step('should chain narrowing and transformation', () => {
      const isNumber = (value: unknown): value is number =>
        typeof value === 'number';

      const chainedGuard = new UnknownGuardian()
        .narrow(isNumber)
        .mutate((num: number) => num * 2)
        .mutate((num: number) => `Result: ${num}`);

      asserts.assertEquals(chainedGuard.parse(21), 'Result: 42');

      asserts.assertThrows(
        () => chainedGuard.parse('hello'),
        GuardianError,
      );
    });
  });

  await t.step('error handling', async (t) => {
    await t.step('should preserve error context in transformations', () => {
      const guard = new UnknownGuardian().mutate(() => {
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

    await t.step('should wrap non-Guardian errors', () => {
      const guard = new UnknownGuardian().mutate(() => {
        throw new TypeError('Regular error');
      });

      // The error should be wrapped or re-thrown as a GuardianError
      const [error] = guard.safeParse('test');
      asserts.assertInstanceOf(error, GuardianError);
    });
  });

  await t.step('async support', async (t) => {
    await t.step('should support async parsing', async () => {
      const guard = new UnknownGuardian();
      const result = await guard.parseAsync('hello');
      asserts.assertEquals(result, 'hello');
    });

    await t.step('should handle async parsing errors', async () => {
      const guard = new UnknownGuardian().mutate(() => {
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
});
