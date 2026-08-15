import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { test } from '../../helpers/mod.ts';
import { GuardianError } from '../../errors/Base.ts';

describe('guardian.helpers.test', () => {
  describe('basic functionality', () => {
    it('should pass when predicate returns true', () => {
      const validator = test((value: unknown): value is string =>
        typeof value === 'string'
      );
      asserts.assertEquals(validator('hello'), 'hello');
      asserts.assertEquals(validator(''), '');
      asserts.assertEquals(validator('test'), 'test');
    });

    it('should fail when predicate returns false', () => {
      const validator = test((value: unknown): value is string =>
        typeof value === 'string'
      );

      asserts.assertThrows(
        () => validator(123 as unknown as string),
        GuardianError,
        'Test validation failed',
      );

      asserts.assertThrows(
        () => validator(null as unknown as string),
        GuardianError,
        'Test validation failed',
      );

      asserts.assertThrows(
        () => validator(true as unknown as string),
        GuardianError,
        'Test validation failed',
      );
    });

    it('should work with different predicates', () => {
      const isNumber = test((value: unknown): value is number =>
        typeof value === 'number' && !Number.isNaN(value)
      );

      asserts.assertEquals(isNumber(123 as unknown as number), 123);
      asserts.assertEquals(isNumber(0 as unknown as number), 0);
      asserts.assertEquals(isNumber(-1 as unknown as number), -1);

      const isBoolean = test((value: unknown): value is boolean =>
        typeof value === 'boolean'
      );

      asserts.assertEquals(isBoolean(true as unknown as boolean), true);
      asserts.assertEquals(isBoolean(false as unknown as boolean), false);
    });
  });

  describe('predicate validation', () => {
    it('should handle complex predicates', () => {
      const isPositiveNumber = test((value: unknown): value is number =>
        typeof value === 'number' && value > 0
      );

      asserts.assertEquals(isPositiveNumber(5 as unknown as number), 5);
      asserts.assertEquals(isPositiveNumber(0.1 as unknown as number), 0.1);

      asserts.assertThrows(
        () => isPositiveNumber(0 as unknown as number),
        GuardianError,
        'Test validation failed',
      );

      asserts.assertThrows(
        () => isPositiveNumber(-1 as unknown as number),
        GuardianError,
        'Test validation failed',
      );
    });

    it('should handle object predicates', () => {
      interface User {
        name: string;
        age: number;
      }

      const isUser = test((value: unknown): value is User =>
        typeof value === 'object' &&
        value !== null &&
        'name' in value &&
        'age' in value &&
        typeof (value as any).name === 'string' &&
        typeof (value as any).age === 'number'
      );

      const validUser = { name: 'John', age: 30 };
      asserts.assertEquals(isUser(validUser as unknown as User), validUser);

      asserts.assertThrows(
        () => isUser({ name: 'John' } as unknown as User),
        GuardianError,
        'Test validation failed',
      );

      asserts.assertThrows(
        () => isUser({ age: 30 } as unknown as User),
        GuardianError,
        'Test validation failed',
      );
    });
  });

  describe('type handling', () => {
    it('should handle array predicates', () => {
      const isStringArray = test((value: unknown): value is string[] =>
        Array.isArray(value) && value.every((item) => typeof item === 'string')
      );

      asserts.assertEquals(
        isStringArray(['a', 'b', 'c'] as unknown as string[]),
        ['a', 'b', 'c'],
      );
      asserts.assertEquals(isStringArray([] as unknown as string[]), []);

      asserts.assertThrows(
        () => isStringArray(['a', 'b', 123] as unknown as string[]),
        GuardianError,
        'Test validation failed',
      );

      asserts.assertThrows(
        () => isStringArray('not array' as unknown as string[]),
        GuardianError,
        'Test validation failed',
      );
    });

    it('should handle union type predicates', () => {
      const isStringOrNumber = test((
        value: unknown,
      ): value is string | number =>
        typeof value === 'string' || typeof value === 'number'
      );

      asserts.assertEquals(
        isStringOrNumber('hello' as unknown as string | number),
        'hello',
      );
      asserts.assertEquals(
        isStringOrNumber(123 as unknown as string | number),
        123,
      );

      asserts.assertThrows(
        () => isStringOrNumber(true as unknown as string | number),
        GuardianError,
        'Test validation failed',
      );

      asserts.assertThrows(
        () => isStringOrNumber(null as unknown as string | number),
        GuardianError,
        'Test validation failed',
      );
    });
  });

  describe('custom error messages', () => {
    it('should use custom error message when provided', () => {
      const validator = test(
        (value: unknown): value is string => typeof value === 'string',
        'Value must be a string',
      );

      asserts.assertThrows(
        () => validator(123 as unknown as string),
        GuardianError,
        'Value must be a string',
      );
    });

    it('should use default error message when not provided', () => {
      const validator = test((value: unknown): value is string =>
        typeof value === 'string'
      );

      asserts.assertThrows(
        () => validator(123 as unknown as string),
        GuardianError,
        'Test validation failed',
      );
    });
  });

  describe('error context', () => {
    it('should provide correct error context', () => {
      const validator = test((value: unknown): value is string =>
        typeof value === 'string'
      );

      try {
        validator(123 as unknown as string);
        asserts.fail('Should have thrown an error');
      } catch (error) {
        asserts.assertInstanceOf(error, GuardianError);
        asserts.assertEquals(error.context.got, 123);
        asserts.assertEquals(
          error.context.expected,
          undefined,
        );
      }
    });
  });

  describe('edge cases', () => {
    it('should handle null and undefined', () => {
      const allowsNull = test((value: unknown): value is null =>
        value === null
      );
      const allowsUndefined = test((value: unknown): value is undefined =>
        value === undefined
      );

      asserts.assertEquals(allowsNull(null as unknown as null), null);
      asserts.assertEquals(
        allowsUndefined(undefined as unknown as undefined),
        undefined,
      );

      asserts.assertThrows(
        () => allowsNull(undefined as unknown as null),
        GuardianError,
        'Test validation failed',
      );

      asserts.assertThrows(
        () => allowsUndefined(null as unknown as undefined),
        GuardianError,
        'Test validation failed',
      );
    });

    it('should handle complex nested structures', () => {
      interface NestedData {
        user: {
          profile: {
            name: string;
            settings: {
              theme: 'light' | 'dark';
            };
          };
        };
      }

      const isNestedData = test((value: unknown): value is NestedData => {
        return typeof value === 'object' &&
          value !== null &&
          'user' in value &&
          typeof (value as any).user === 'object' &&
          (value as any).user !== null &&
          'profile' in (value as any).user &&
          typeof (value as any).user.profile === 'object' &&
          (value as any).user.profile !== null &&
          'name' in (value as any).user.profile &&
          typeof (value as any).user.profile.name === 'string' &&
          'settings' in (value as any).user.profile &&
          typeof (value as any).user.profile.settings === 'object' &&
          (value as any).user.profile.settings !== null &&
          'theme' in (value as any).user.profile.settings &&
          ((value as any).user.profile.settings.theme === 'light' ||
            (value as any).user.profile.settings.theme === 'dark');
      });

      const validData = {
        user: {
          profile: {
            name: 'John',
            settings: {
              theme: 'dark' as const,
            },
          },
        },
      };

      asserts.assertEquals(
        isNestedData(validData as unknown as NestedData),
        validData,
      );

      asserts.assertThrows(
        () =>
          isNestedData(
            { user: { profile: { name: 'John' } } } as unknown as NestedData,
          ),
        GuardianError,
        'Test validation failed',
      );
    });
  });

  describe('performance considerations', () => {
    it('should handle predicates efficiently', () => {
      const validator = test((value: unknown): value is number =>
        typeof value === 'number'
      );

      // Test with many values to ensure efficiency
      for (let i = 0; i < 1000; i++) {
        asserts.assertEquals(validator(i as unknown as number), i);
      }
    });

    it('should handle complex predicate logic', () => {
      const complexValidator = test((value: unknown): value is string => {
        if (typeof value !== 'string') return false;
        if (value.length < 2) return false;
        if (!/^[a-zA-Z]/.test(value)) return false;
        return value.split('').every((char) => /[a-zA-Z0-9]/.test(char));
      });

      asserts.assertEquals(
        complexValidator('test123' as unknown as string),
        'test123',
      );
      asserts.assertEquals(complexValidator('ABC' as unknown as string), 'ABC');

      asserts.assertThrows(
        () => complexValidator('1test' as unknown as string),
        GuardianError,
        'Test validation failed',
      );

      asserts.assertThrows(
        () => complexValidator('a' as unknown as string),
        GuardianError,
        'Test validation failed',
      );

      asserts.assertThrows(
        () => complexValidator('test-123' as unknown as string),
        GuardianError,
        'Test validation failed',
      );
    });
  });
});
