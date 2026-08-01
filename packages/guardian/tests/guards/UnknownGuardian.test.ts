import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat';
import { UnknownGuardian } from '../../guards/UnknownGuardian.ts';
import { GuardianError } from '../../errors/Base.ts';

describe('guardian.UnknownGuardian', () => {
  describe('basic functionality', () => {
    it('should accept non-null values', () => {
      const unknownGuard = new UnknownGuardian();

      // Test various types
      asserts.assertEquals(unknownGuard.parse('hello'), 'hello');
      asserts.assertEquals(unknownGuard.parse(42), 42);
      asserts.assertEquals(unknownGuard.parse(true), true);
      asserts.assertEquals(unknownGuard.parse(false), false);
      asserts.assertEquals(unknownGuard.parse([1, 2, 3]), [1, 2, 3]);
      asserts.assertEquals(unknownGuard.parse({ foo: 'bar' }), { foo: 'bar' });
    });

    it('rejects null values by default', () => {
      const unknownGuard = new UnknownGuardian();
      asserts.assertThrows(
        () => unknownGuard.parse(null),
        GuardianError,
        'Expected value but got null',
      );
    });

    it('rejects undefined values by default', () => {
      const unknownGuard = new UnknownGuardian();
      asserts.assertThrows(
        () => unknownGuard.parse(undefined),
        GuardianError,
        'Expected value but got undefined',
      );
    });

    it('allows null when nullable is used', () => {
      const unknownGuard = new UnknownGuardian().nullable();
      asserts.assertEquals(unknownGuard.parse(null), null);
    });

    it('allows undefined when optional is used', () => {
      const unknownGuard = new UnknownGuardian().optional();
      asserts.assertEquals(unknownGuard.parse(undefined), undefined);
    });

    it('should preserve value identity', () => {
      const unknownGuard = new UnknownGuardian();
      const obj = { test: 'value' };
      const arr = [1, 2, 3];

      asserts.assertStrictEquals(unknownGuard.parse(obj), obj);
      asserts.assertStrictEquals(unknownGuard.parse(arr), arr);
    });

    it('should work with special values', () => {
      const unknownGuard = new UnknownGuardian();

      asserts.assertEquals(unknownGuard.parse(0), 0);
      asserts.assertEquals(unknownGuard.parse(-0), -0);
      asserts.assertEquals(unknownGuard.parse(Infinity), Infinity);
      asserts.assertEquals(unknownGuard.parse(-Infinity), -Infinity);
      asserts.assertEquals(unknownGuard.parse(Number.NaN), Number.NaN);
      asserts.assertEquals(unknownGuard.parse(BigInt(123)), BigInt(123));

      // Symbol test - can't use assertEquals for symbols, check type instead
      const sym = Symbol('test');
      const result = unknownGuard.parse(sym);
      asserts.assert(typeof result === 'symbol');
      asserts.assertEquals(result.toString(), 'Symbol(test)');
    });
  });

  describe('type transformations', () => {
    it('should convert to string', () => {
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

    it('should handle toStringValue with special values', () => {
      const stringGuard = new UnknownGuardian().toStringValue();

      // Test with symbol and function which go through special toString handling
      const sym = Symbol('test');
      const fn = function testFunc() {
        return 42;
      };
      asserts.assert(stringGuard.parse(sym).includes('Symbol(test)'));
      asserts.assert(stringGuard.parse(fn).includes('testFunc'));
    });

    it(
      'should handle toStringValue errors with circular references',
      () => {
        const stringGuard = new UnknownGuardian().toStringValue();

        // Create a circular reference
        const obj: Record<string, unknown> = { name: 'test' };
        obj.self = obj;

        asserts.assertThrows(
          () => stringGuard.parse(obj),
          GuardianError,
          'Failed to convert value to string',
        );
      },
    );

    it('should pass null through when nullable', () => {
      const nullableStringGuard = new UnknownGuardian().process((
        value: unknown,
      ) => String(value)).nullable();

      // nullable() allows null to pass through without transformation
      asserts.assertEquals(nullableStringGuard.parse(null), null);
      // But non-null values are still transformed
      asserts.assertEquals(nullableStringGuard.parse(42), '42');
    });

    it('should convert undefined to string when optional', () => {
      const optionalStringGuard = new UnknownGuardian().process(
        String,
      ).optional('undefined');

      asserts.assertEquals(optionalStringGuard.parse(undefined), 'undefined');
    });

    it('should handle symbol to string conversion', () => {
      const stringGuard = new UnknownGuardian().toStringValue();
      const sym = Symbol('test');
      const result = stringGuard.parse(sym);
      asserts.assert(result.startsWith('Symbol(test)'));
    });

    it('should handle function to string conversion', () => {
      const stringGuard = new UnknownGuardian().toStringValue();
      const fn = () => 'hello';
      const result = stringGuard.parse(fn);
      asserts.assert(typeof result === 'string');
      asserts.assert(result.includes('hello') || result.includes('function'));
    });

    it('should convert to JSON', () => {
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

    it('should pass null through when nullable', () => {
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

    it('should handle JSON serialization errors', () => {
      const jsonGuard = new UnknownGuardian().toJSON();

      // Create an object that can't be serialized (BigInt)
      const unserializable = BigInt(123);

      asserts.assertThrows(
        () => jsonGuard.parse(unserializable),
        GuardianError,
      );
    });

    it('should use custom error message for JSON failures', () => {
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

  describe('type narrowing', () => {
    it('should narrow to string type', () => {
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

    it('should narrow to number type', () => {
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

    it('should use custom error message for narrowing', () => {
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

  describe('nullish validations', () => {
    it('should validate nullish values', () => {
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

    it('should validate non-nullish values', () => {
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

    it(
      'should use nullish() to validate only null or undefined',
      () => {
        const nullishGuard = new UnknownGuardian().nullish();

        // Should accept null and undefined
        asserts.assertEquals(nullishGuard.parse(null), null);
        asserts.assertEquals(nullishGuard.parse(undefined), undefined);

        // Should reject other values
        asserts.assertThrows(
          () => nullishGuard.parse('hello'),
          GuardianError,
          'Expected null or undefined',
        );
        asserts.assertThrows(
          () => nullishGuard.parse(42),
          GuardianError,
          'Expected null or undefined',
        );
        asserts.assertThrows(
          () => nullishGuard.parse(false),
          GuardianError,
          'Expected null or undefined',
        );
        asserts.assertThrows(
          () => nullishGuard.parse({ foo: 'bar' }),
          GuardianError,
          'Expected null or undefined',
        );
      },
    );
  });

  describe('type assertions', () => {
    it('should apply type guard assertion', () => {
      const isString = (value: unknown): value is string =>
        typeof value === 'string';
      const assertGuard = new UnknownGuardian().as(isString);

      asserts.assertEquals(assertGuard.parse('hello'), 'hello');
      asserts.assertThrows(
        () => assertGuard.parse(42),
        GuardianError,
      );
    });

    it('should apply custom transformation using mutate', () => {
      const transformGuard = new UnknownGuardian().process((value: unknown) => {
        return typeof value === 'string' ? value.toUpperCase() : String(value);
      });

      asserts.assertEquals(transformGuard.parse('hello'), 'HELLO');
      asserts.assertEquals(transformGuard.parse(42), '42');
    });

    it('should handle transformation errors', () => {
      const transformGuard = new UnknownGuardian().process(() => {
        throw new Error('Transformation failed');
      });

      asserts.assertThrows(
        () => transformGuard.parse('test'),
        GuardianError,
      );
    });
  });

  describe('safe parsing', () => {
    it('should return success for valid values', () => {
      const unknownGuard = new UnknownGuardian();

      const [error, data] = unknownGuard.safeParse('hello');
      asserts.assertEquals(error, null);
      asserts.assertEquals(data, 'hello');
    });

    it('should handle transformation failures in safeParse', () => {
      const failingGuard = new UnknownGuardian()
        .process(() => {
          throw new Error('Transformation failed');
        });

      const [error, data] = failingGuard.safeParse('test');
      asserts.assertInstanceOf(error, GuardianError);
      asserts.assertEquals(data, undefined);
    });
  });

  describe('chaining operations', () => {
    it('should chain multiple transformations', () => {
      const chainedGuard = new UnknownGuardian()
        .as((value: unknown): value is string => typeof value === 'string')
        .process((str: string) => str.toUpperCase())
        .process((str: string) => str + '!');

      asserts.assertEquals(chainedGuard.parse('hello'), 'HELLO!');
    });

    it('should chain narrowing and transformation', () => {
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

  describe('error handling', () => {
    it('should preserve error context in transformations', () => {
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

    it('should wrap non-Guardian errors', () => {
      const guard = new UnknownGuardian().process(() => {
        throw new TypeError('Regular error');
      });

      // The error should be wrapped or re-thrown as a GuardianError
      const [error] = guard.safeParse('test');
      asserts.assertInstanceOf(error, GuardianError);
    });
  });

  describe('async support', () => {
    it('should support async parsing', async () => {
      const guard = new UnknownGuardian();
      const result = await guard.parseAsync('hello');
      asserts.assertEquals(result, 'hello');
    });

    it('should handle async parsing errors', async () => {
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

  describe('nullable and optional chaining', () => {
    it(
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

    it(
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

    it('nullable().optional() preserves value identity', () => {
      const guard = new UnknownGuardian().nullable().optional();
      const obj = { test: 'value' };
      const arr = [1, 2, 3];

      asserts.assertStrictEquals(guard.parse(obj), obj);
      asserts.assertStrictEquals(guard.parse(arr), arr);
      asserts.assertEquals(guard.parse(null), null);
      asserts.assertEquals(guard.parse(undefined), undefined);
    });

    it('optional().nullable() preserves value identity', () => {
      const guard = new UnknownGuardian().optional().nullable();
      const obj = { test: 'value' };
      const arr = [1, 2, 3];

      asserts.assertStrictEquals(guard.parse(obj), obj);
      asserts.assertStrictEquals(guard.parse(arr), arr);
      asserts.assertEquals(guard.parse(undefined), undefined);
      asserts.assertEquals(guard.parse(null), null);
    });
  });

  // ============================================================================
  // COMPREHENSIVE EDGE CASE TESTS - Added for Production Readiness
  // ============================================================================

  describe('Special values handling', () => {
    it('should handle NaN', () => {
      const guard = new UnknownGuardian();
      const result = guard.parse(Number.NaN);
      asserts.assert(Number.isNaN(result));
    });

    it('should handle Infinity', () => {
      const guard = new UnknownGuardian();
      asserts.assertEquals(guard.parse(Infinity), Infinity);
      asserts.assertEquals(guard.parse(-Infinity), -Infinity);
    });

    it('should handle BigInt', () => {
      const guard = new UnknownGuardian();
      asserts.assertEquals(guard.parse(BigInt(123)), BigInt(123));
    });

    it('should handle Symbol', () => {
      const guard = new UnknownGuardian();
      const sym = Symbol('test');
      asserts.assertStrictEquals(guard.parse(sym), sym);
    });

    it('should handle Date', () => {
      const guard = new UnknownGuardian();
      const date = new Date();
      asserts.assertStrictEquals(guard.parse(date), date);
    });

    it('should handle RegExp', () => {
      const guard = new UnknownGuardian();
      const regex = /test/g;
      asserts.assertStrictEquals(guard.parse(regex), regex);
    });

    it('should handle Map', () => {
      const guard = new UnknownGuardian();
      const map = new Map([['key', 'value']]);
      asserts.assertStrictEquals(guard.parse(map), map);
    });

    it('should handle Set', () => {
      const guard = new UnknownGuardian();
      const set = new Set([1, 2, 3]);
      asserts.assertStrictEquals(guard.parse(set), set);
    });

    it('should handle WeakMap', () => {
      const guard = new UnknownGuardian();
      const weakMap = new WeakMap();
      asserts.assertStrictEquals(guard.parse(weakMap), weakMap);
    });

    it('should handle functions', () => {
      const guard = new UnknownGuardian();
      const fn = () => 'test';
      asserts.assertStrictEquals(guard.parse(fn), fn);
    });
  });

  describe('Metadata and describe', () => {
    it('should set metadata via describe', () => {
      const guard = new UnknownGuardian().describe({
        title: 'Generic Data',
        description: 'Any kind of data',
      });

      asserts.assertEquals(guard.metaData?.title, 'Generic Data');
      asserts.assertEquals(guard.metaData?.description, 'Any kind of data');
    });

    it('should not override protected flags with describe', () => {
      const guard = new UnknownGuardian()
        .nullable()
        .describe({
          title: 'Test',
          isNullable: false as any,
        });

      asserts.assertEquals(guard.parse(null), null);
    });

    it('should merge metadata across describe calls', () => {
      const guard = new UnknownGuardian();

      const withTitle = guard.describe({ title: 'Step 1' });
      const withDesc = withTitle.describe({ description: 'Any data' });

      asserts.assertEquals(withDesc.metaData?.title, 'Step 1');
      asserts.assertEquals(withDesc.metaData?.description, 'Any data');
    });
  });

  describe('Complex transformations', () => {
    it('should chain transformations with unknown types', () => {
      const guard = new UnknownGuardian()
        .process((val) => String(val))
        .process((val) => val.toUpperCase());

      asserts.assertEquals(guard.parse('hello'), 'HELLO');
      asserts.assertEquals(guard.parse(123), '123');
    });

    it('should handle async transformations', async () => {
      const guard = new UnknownGuardian().process(async (val) => {
        await new Promise((resolve) => setTimeout(resolve, 1));
        return String(val);
      });

      const result = await guard.parseAsync(123);
      asserts.assertEquals(result, '123');
    });

    it('should narrow type with validation', () => {
      const guard = new UnknownGuardian().process((val) => {
        if (typeof val !== 'number') {
          throw new GuardianError('Expected number', {
            expected: 'number',
            got: typeof val,
            comparison: 'type',
            type: 'validation',
          });
        }
        return val * 2;
      });

      asserts.assertEquals(guard.parse(5), 10);
      asserts.assertThrows(() => guard.parse('not a number'), GuardianError);
    });
  });

  describe('OpenAPI generation', () => {
    it('should generate correct OpenAPI schema', () => {
      const guard = new UnknownGuardian();
      const schema = guard.toOpenAPI();

      // Unknown type should allow anything
      asserts.assert(schema !== null);
    });

    it('should include metadata in OpenAPI schema', () => {
      const guard = new UnknownGuardian().describe({
        title: 'Any Data',
        description: 'Accepts anything',
      });

      const schema = guard.toOpenAPI();

      asserts.assertEquals(schema.title, 'Any Data');
      asserts.assertEquals(schema.description, 'Accepts anything');
    });

    it('should handle nullable in OpenAPI', () => {
      const guard = new UnknownGuardian().nullable();
      const schema = guard.toOpenAPI();

      // Verify nullable works at runtime
      asserts.assertEquals(guard.parse(null), null);
      asserts.assert(schema !== null);
    });
  });

  describe('Edge cases with nested structures', () => {
    it('should handle deeply nested objects', () => {
      const guard = new UnknownGuardian();
      const nested = {
        level1: {
          level2: {
            level3: {
              value: 'deep',
            },
          },
        },
      };

      asserts.assertStrictEquals(guard.parse(nested), nested);
    });

    it('should handle circular references', () => {
      const guard = new UnknownGuardian();
      const circular: any = { name: 'circular' };
      circular.self = circular;

      asserts.assertStrictEquals(guard.parse(circular), circular);
    });

    it('should handle arrays with mixed types', () => {
      const guard = new UnknownGuardian();
      const mixed = [1, 'two', true, null, { five: 5 }, [6]];

      asserts.assertStrictEquals(guard.parse(mixed), mixed);
    });
  });

  describe('SafeParse with unknown types', () => {
    it('should handle safeParse with any value', () => {
      const guard = new UnknownGuardian();

      const [error, data] = guard.safeParse('anything');
      asserts.assertEquals(error, null);
      asserts.assertEquals(data, 'anything');
    });

    it('should handle safeParse with null rejection', () => {
      const guard = new UnknownGuardian();

      const [error, data] = guard.safeParse(null);
      asserts.assertInstanceOf(error, GuardianError);
      asserts.assertEquals(data, undefined);
    });

    it('should handle safeParse with transformations', () => {
      const guard = new UnknownGuardian().process(String);

      const [error, data] = guard.safeParse(123);
      asserts.assertEquals(error, null);
      asserts.assertEquals(data, '123');
    });
  });
});
