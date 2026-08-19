import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { Guardian } from '../../Guardian.ts';
import { GuardianError } from '../../errors/Base.ts';

describe('guardian.ArrayGuardian', () => {
  describe('basic functionality', () => {
    it('should validate array type', () => {
      const arrayGuard = Guardian.array();
      const result = arrayGuard.parse([1, 2, 3]);
      asserts.assertEquals(result, [1, 2, 3]);
    });

    it('should reject non-array values', () => {
      const arrayGuard = Guardian.array();
      asserts.assertThrows(
        () => arrayGuard.parse('not array'),
        GuardianError,
        'Expected array but got string',
      );
    });

    it('should accept empty arrays by default', () => {
      const arrayGuard = Guardian.array();
      const result = arrayGuard.parse([]);
      asserts.assertEquals(result, []);
    });

    it('should preserve mixed types without element guardian', () => {
      const arrayGuard = Guardian.array();
      const input = [1, 'hello', true, null];
      const result = arrayGuard.parse(input);
      asserts.assertEquals(result, input);
    });
  });

  describe('element validation with constructor', () => {
    it('should validate string elements', () => {
      const stringArrayGuard = Guardian.array(Guardian.string());
      const result = stringArrayGuard.parse(['hello', 'world']);
      asserts.assertEquals(result, ['hello', 'world']);
    });

    it('should reject invalid element types', () => {
      const stringArrayGuard = Guardian.array(Guardian.string());
      // Coerce-by-default: 42 → '42' is accepted by StringGuardian; the array
      // value is normalised in-place.
      asserts.assertEquals(stringArrayGuard.parse(['hello', 42]), [
        'hello',
        '42',
      ]);

      // Non-coercible elements still fail with a path-prefixed message.
      asserts.assertThrows(
        () => stringArrayGuard.parse(['hello', {}]),
        GuardianError,
        'Array element at index 1',
      );
    });

    it('should validate number elements with constraints', () => {
      const positiveNumberArray = Guardian.array(
        Guardian.number().positive(),
      );
      const result = positiveNumberArray.parse([1, 2, 3]);
      asserts.assertEquals(result, [1, 2, 3]);
    });

    it('should reject elements that fail constraints', () => {
      const positiveNumberArray = Guardian.array(
        Guardian.number().positive(),
      );
      asserts.assertThrows(
        () => positiveNumberArray.parse([1, -2, 3]),
        GuardianError,
        'Array element at index 1',
      );
    });

    it('should handle empty arrays with element validation', () => {
      const stringArrayGuard = Guardian.array(Guardian.string());
      const result = stringArrayGuard.parse([]);
      asserts.assertEquals(result, []);
    });
  });

  describe('length validations', () => {
    it('should validate exact length', () => {
      const exactLengthGuard = Guardian.array().length(3);
      const result = exactLengthGuard.parse([1, 2, 3]);
      asserts.assertEquals(result, [1, 2, 3]);
    });

    it('should reject incorrect exact length', () => {
      const exactLengthGuard = Guardian.array().length(3);
      asserts.assertThrows(
        () => exactLengthGuard.parse([1, 2]),
        GuardianError,
        'Expected array length 3, got 2',
      );
    });

    it('should validate minimum length', () => {
      const minLengthGuard = Guardian.array().minLength(2);
      const result = minLengthGuard.parse([1, 2, 3]);
      asserts.assertEquals(result, [1, 2, 3]);
    });

    it('should reject arrays shorter than minimum', () => {
      const minLengthGuard = Guardian.array().minLength(2);
      asserts.assertThrows(
        () => minLengthGuard.parse([1]),
        GuardianError,
        'Array length must be at least 2, got 1',
      );
    });

    it('should validate maximum length', () => {
      const maxLengthGuard = Guardian.array().maxLength(3);
      const result = maxLengthGuard.parse([1, 2]);
      asserts.assertEquals(result, [1, 2]);
    });

    it('should reject arrays longer than maximum', () => {
      const maxLengthGuard = Guardian.array().maxLength(3);
      asserts.assertThrows(
        () => maxLengthGuard.parse([1, 2, 3, 4]),
        GuardianError,
        'Array length must be at most 3, got 4',
      );
    });

    it('should combine min and max length validations', () => {
      const rangeGuard = Guardian.array().minLength(2).maxLength(4);
      const result = rangeGuard.parse([1, 2, 3]);
      asserts.assertEquals(result, [1, 2, 3]);
    });

    it('should validate non-empty arrays', () => {
      const nonEmptyGuard = Guardian.array().nonEmpty();
      const result = nonEmptyGuard.parse([1]);
      asserts.assertEquals(result, [1]);
    });

    it('should reject empty arrays when non-empty required', () => {
      const nonEmptyGuard = Guardian.array().nonEmpty();
      asserts.assertThrows(
        () => nonEmptyGuard.parse([]),
        GuardianError,
        'Array must not be empty',
      );
    });

    it('notEmpty is the canonical name and behaves identically', () => {
      const notEmptyGuard = Guardian.array().notEmpty();
      asserts.assertEquals(notEmptyGuard.parse([1]), [1]);
      asserts.assertThrows(
        () => notEmptyGuard.parse([]),
        GuardianError,
        'Array must not be empty',
      );
    });
  });

  describe('array validations', () => {
    it('should validate unique elements', () => {
      const uniqueGuard = Guardian.array(Guardian.string()).unique();
      const result = uniqueGuard.parse(['a', 'b', 'c']);
      asserts.assertEquals(result, ['a', 'b', 'c']);
    });

    it('should reject duplicate elements', () => {
      const uniqueGuard = Guardian.array(Guardian.string()).unique();
      asserts.assertThrows(
        () => uniqueGuard.parse(['a', 'b', 'a']),
        GuardianError,
        'Array must contain unique elements, found duplicates:',
      );
    });

    it('should validate element inclusion', () => {
      const includesGuard = Guardian.array(Guardian.string()).includes(
        'hello',
      );
      const result = includesGuard.parse(['hello', 'world']);
      asserts.assertEquals(result, ['hello', 'world']);
    });

    it('should reject arrays missing required element', () => {
      const includesGuard = Guardian.array(Guardian.string()).includes(
        'hello',
      );
      asserts.assertThrows(
        () => includesGuard.parse(['world', 'test']),
        GuardianError,
        'Array must include hello',
      );
    });

    it('should validate element exclusion', () => {
      const excludesGuard = Guardian.array(Guardian.string()).excludes(
        'forbidden',
      );
      const result = excludesGuard.parse(['hello', 'world']);
      asserts.assertEquals(result, ['hello', 'world']);
    });

    it('should reject arrays containing forbidden element', () => {
      const excludesGuard = Guardian.array(Guardian.string()).excludes(
        'forbidden',
      );
      asserts.assertThrows(
        () => excludesGuard.parse(['hello', 'forbidden', 'world']),
        GuardianError,
        'Array must not include forbidden',
      );
    });
  });

  describe('transformations', () => {
    it('should map array elements', () => {
      const mappedGuard = Guardian.array(Guardian.number())
        .map((x) => x * 2);
      const result = mappedGuard.parse([1, 2, 3]);
      asserts.assertEquals(result, [2, 4, 6]);
    });

    it('should map with index', () => {
      const mappedWithIndexGuard = Guardian.array(Guardian.string())
        .map((x, i) => `${i}: ${x}`);
      const result = mappedWithIndexGuard.parse(['a', 'b', 'c']);
      asserts.assertEquals(result, ['0: a', '1: b', '2: c']);
    });

    it('should filter array elements', () => {
      const filteredGuard = Guardian.array(Guardian.number())
        .filter((x) => x > 2);
      const result = filteredGuard.parse([1, 2, 3, 4, 5]);
      asserts.assertEquals(result, [3, 4, 5]);
    });

    it('should sort array elements', () => {
      const sortedGuard = Guardian.array(Guardian.number())
        .sort();
      const result = sortedGuard.parse([3, 1, 4, 1, 5]);
      asserts.assertEquals(result, [1, 1, 3, 4, 5]);
    });

    it('should sort with custom compare function', () => {
      const sortedGuard = Guardian.array(Guardian.number())
        .sort((a, b) => b - a); // descending
      const result = sortedGuard.parse([3, 1, 4, 1, 5]);
      asserts.assertEquals(result, [5, 4, 3, 1, 1]);
    });

    it('should reverse array elements', () => {
      const reversedGuard = Guardian.array(Guardian.string())
        .reverse();
      const result = reversedGuard.parse(['a', 'b', 'c']);
      asserts.assertEquals(result, ['c', 'b', 'a']);
    });

    it('should not mutate original array in transformations', () => {
      const originalArray = [3, 1, 4];
      const sortedGuard = Guardian.array(Guardian.number())
        .sort();
      const result = sortedGuard.parse(originalArray);
      asserts.assertEquals(result, [1, 3, 4]);
      asserts.assertEquals(originalArray, [3, 1, 4]); // Original unchanged
    });
  });

  describe('chained validations', () => {
    it('should chain multiple array validations', () => {
      const complexGuard = Guardian.array(Guardian.string().minLength(2))
        .minLength(2)
        .maxLength(5)
        .unique();
      const result = complexGuard.parse(['hello', 'world']);
      asserts.assertEquals(result, ['hello', 'world']);
    });

    it('should chain validations and transformations', () => {
      const chainedGuard = Guardian.array(Guardian.number().positive())
        .minLength(1)
        .map((x) => x * 2)
        .filter((x) => x > 4)
        .sort((a, b) => a - b);
      const result = chainedGuard.parse([1, 2, 3, 4, 5]);
      asserts.assertEquals(result, [6, 8, 10]);
    });

    it('should maintain type safety through chaining', () => {
      const typedGuard = Guardian.array(Guardian.string())
        .map((s) => s.length)
        .filter((n) => n > 3);
      const result = typedGuard.parse(['hello', 'hi', 'world']);
      asserts.assertEquals(result, [5, 5]);
    });
  });

  describe('safe parsing', () => {
    it('should return success result for valid input', () => {
      const arrayGuard = Guardian.array(Guardian.string());
      const [error, data] = arrayGuard.safeParse(['hello', 'world']);
      asserts.assertEquals(error, null);
      asserts.assertEquals(data, ['hello', 'world']);
    });

    it('should return error result for invalid input', () => {
      const arrayGuard = Guardian.array(Guardian.string());
      // Coerce-by-default: 42 → '42' succeeds.
      const [okErr] = arrayGuard.safeParse(['hello', 42]);
      asserts.assertEquals(okErr, null);

      // Non-coercible element still errors.
      const [error, data] = arrayGuard.safeParse(['hello', {}]);
      asserts.assertInstanceOf(error, GuardianError);
      asserts.assertEquals(data, undefined);
      asserts.assertStringIncludes(error.message, 'Array element at index 1');
    });

    it('should return error result for invalid array type', () => {
      const arrayGuard = Guardian.array();
      const [error, data] = arrayGuard.safeParse('not array');
      asserts.assertInstanceOf(error, GuardianError);
      asserts.assertEquals(data, undefined);
      asserts.assertStringIncludes(
        error.message,
        'Expected array but got string',
      );
    });
  });

  describe('error handling', () => {
    it('should provide detailed error messages', () => {
      const stringArrayGuard = Guardian.array(
        Guardian.string().minLength(5),
      );
      asserts.assertThrows(
        () => stringArrayGuard.parse(['hello', 'hi']),
        GuardianError,
        'Array element at index 1',
      );
    });

    it('should support custom error messages', () => {
      const customGuard = Guardian.array().length(
        3,
        'Array must have exactly 3 items',
      );
      asserts.assertThrows(
        () => customGuard.parse([1, 2]),
        GuardianError,
        'Array must have exactly 3 items',
      );
    });

    it('should preserve error context', () => {
      const arrayGuard = Guardian.array(Guardian.number().min(10));
      try {
        arrayGuard.parse([15, 5, 20]);
        asserts.fail('Should have thrown an error');
      } catch (error) {
        asserts.assertInstanceOf(error, GuardianError);
        asserts.assertEquals(error.context?.type, 'array_element');
      }
    });
  });

  describe('complex scenarios', () => {
    it('should handle nested arrays', () => {
      const nestedArrayGuard = Guardian.array(
        Guardian.array(Guardian.number()),
      );
      const result = nestedArrayGuard.parse([[1, 2], [3, 4], [5]]);
      asserts.assertEquals(result, [[1, 2], [3, 4], [5]]);
    });

    it('should validate array of emails', () => {
      const emailArrayGuard = Guardian.array(
        Guardian.string().pattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/),
      )
        .minLength(1)
        .unique();

      const result = emailArrayGuard.parse([
        'user1@example.com',
        'user2@test.org',
      ]);
      asserts.assertEquals(result, ['user1@example.com', 'user2@test.org']);
    });

    it('should handle complex transformation pipeline', () => {
      const pipelineGuard = Guardian.array(Guardian.string().minLength(1))
        .nonEmpty()
        .map((s) => s.trim().toLowerCase())
        .filter((s) => s.length > 2)
        .sort();

      // This will include duplicate 'hello' since unique() isn't applied
      const result = pipelineGuard.parse([
        ' Hello ',
        'WORLD',
        'hi',
        'Hello',
        'test',
      ]);
      asserts.assertEquals(result, ['hello', 'hello', 'test', 'world']);
    });
  });

  describe('metadata handling', () => {
    it('should store and retrieve metadata', () => {
      const metaData = {
        description: 'Array of user IDs',
        title: 'User IDs',
        examples: [[1, 2, 3]],
      };
      const arrayGuard = Guardian.array(undefined, metaData);
      asserts.assertEquals(arrayGuard.metaData, metaData);
    });

    it('should allow setting metadata properties via describe()', () => {
      const arrayGuard = Guardian.array().describe({
        description: 'List of names',
        title: 'Names',
        examples: [['Alice', 'Bob']],
      });

      asserts.assertEquals(arrayGuard.metaData?.description, 'List of names');
      asserts.assertEquals(arrayGuard.metaData?.title, 'Names');
      asserts.assertEquals(arrayGuard.metaData?.examples, [['Alice', 'Bob']]);
    });
  });

  describe('real world usage', () => {
    it('should validate shopping cart items', () => {
      // Simulating product IDs as positive integers
      const cartGuard = Guardian.array(Guardian.number().positive().integer())
        .minLength(1)
        .maxLength(50)
        .unique();

      const result = cartGuard.parse([101, 202, 303]);
      asserts.assertEquals(result, [101, 202, 303]);
    });

    it('should validate tag system', () => {
      const tagGuard = Guardian.array(
        Guardian.string().minLength(1).maxLength(20),
      )
        .minLength(1)
        .maxLength(10)
        .unique()
        .map((tag) => tag.toLowerCase().trim());

      const result = tagGuard.parse(['JavaScript', 'TypeScript', 'Web']);
      asserts.assertEquals(result, ['javascript', 'typescript', 'web']);
    });
  });

  describe('new validation and transformation methods', () => {
    it('noNulls validation', () => {
      const noNullsGuard = Guardian.array().noNulls();

      // Should pass arrays without nulls
      asserts.assertEquals(noNullsGuard.parse([1, 2, 3]), [1, 2, 3]);
      asserts.assertEquals(noNullsGuard.parse(['a', 'b', 'c']), [
        'a',
        'b',
        'c',
      ]);
      asserts.assertEquals(noNullsGuard.parse([]), []);
      asserts.assertEquals(noNullsGuard.parse([0, false, '']), [0, false, '']);

      // Should reject arrays with null or undefined
      asserts.assertThrows(
        () => noNullsGuard.parse([1, null, 3]),
        GuardianError,
        'Array must not contain null or undefined values, found at index 1',
      );

      asserts.assertThrows(
        () => noNullsGuard.parse([1, undefined, 3]),
        GuardianError,
        'Array must not contain null or undefined values, found at index 1',
      );

      asserts.assertThrows(
        () => noNullsGuard.parse([null]),
        GuardianError,
        'Array must not contain null or undefined values, found at index 0',
      );

      // Should support custom error message
      const customMessageGuard = Guardian.array().noNulls('Custom null error');
      asserts.assertThrows(
        () => customMessageGuard.parse([1, null, 3]),
        GuardianError,
        'Custom null error',
      );
    });

    it('flatten transformation', () => {
      const flattenGuard = Guardian.array().flatten();

      // Basic flattening with default joiner
      asserts.assertEquals(flattenGuard.parse([1, [2, 3], 4]), '1,2,3,4');
      asserts.assertEquals(
        flattenGuard.parse(['a', ['b', 'c'], 'd']),
        'a,b,c,d',
      );
      asserts.assertEquals(flattenGuard.parse([]), '');
      asserts.assertEquals(flattenGuard.parse([1]), '1');

      // Custom joiner
      const customJoinerGuard = Guardian.array().flatten(' | ');
      asserts.assertEquals(
        customJoinerGuard.parse([1, [2, 3], 4]),
        '1 | 2 | 3 | 4',
      );
      asserts.assertEquals(
        customJoinerGuard.parse(['hello', ['world']]),
        'hello | world',
      );

      // Custom depth
      const shallowGuard = Guardian.array().flatten(',', 1);
      asserts.assertEquals(
        shallowGuard.parse([1, [2, [3, 4]], 5]),
        '1,2,3,4,5',
      );

      const deepGuard = Guardian.array().flatten(',', 2);
      asserts.assertEquals(
        deepGuard.parse([1, [2, [3, [4, 5]]], 6]),
        '1,2,3,4,5,6',
      );

      // No flattening (depth 0)
      const noFlattenGuard = Guardian.array().flatten(',', 0);
      const nestedArray = [1, [2, 3], 4];
      asserts.assertEquals(noFlattenGuard.parse(nestedArray), '1,2,3,4');

      // Mixed types
      asserts.assertEquals(
        flattenGuard.parse([1, [true, 'text'], null]),
        '1,true,text,',
      );
    });

    it('compact transformation', () => {
      const compactGuard = Guardian.array().compact();

      // Remove all falsy values
      asserts.assertEquals(
        compactGuard.parse([
          1,
          null,
          2,
          undefined,
          3,
          false,
          4,
          0,
          5,
          '',
          6,
          Number.NaN,
        ]),
        [1, 2, 3, 4, 5, 6],
      );

      // Array with no falsy values
      asserts.assertEquals(compactGuard.parse([1, 2, 3]), [1, 2, 3]);
      asserts.assertEquals(compactGuard.parse(['a', 'b', 'c']), [
        'a',
        'b',
        'c',
      ]);

      // Array with only falsy values
      asserts.assertEquals(
        compactGuard.parse([null, undefined, false, 0, '', Number.NaN]),
        [],
      );

      // Empty array
      asserts.assertEquals(compactGuard.parse([]), []);

      // Mixed types with truthy values
      asserts.assertEquals(
        compactGuard.parse([1, 'hello', true, [], {}, -1, ' ']),
        [1, 'hello', true, [], {}, -1, ' '],
      );

      // Keep legitimate zero-like values that are truthy
      asserts.assertEquals(compactGuard.parse(['0', [0]]), ['0', [0]]);
    });

    it('onlyUnique transformation', () => {
      const uniqueGuard = Guardian.array().onlyUnique();

      // Remove duplicates from numbers
      asserts.assertEquals(uniqueGuard.parse([1, 2, 2, 3, 1, 4]), [1, 2, 3, 4]);

      // Remove duplicates from strings
      asserts.assertEquals(uniqueGuard.parse(['a', 'b', 'a', 'c', 'b']), [
        'a',
        'b',
        'c',
      ]);

      // Array with no duplicates
      asserts.assertEquals(uniqueGuard.parse([1, 2, 3]), [1, 2, 3]);

      // Empty array
      asserts.assertEquals(uniqueGuard.parse([]), []);

      // Single element
      asserts.assertEquals(uniqueGuard.parse([1]), [1]);

      // All same elements
      asserts.assertEquals(uniqueGuard.parse([1, 1, 1, 1]), [1]);

      // Mixed types (maintains insertion order)
      asserts.assertEquals(
        uniqueGuard.parse([1, '1', 1, true, '1', false, true]),
        [1, '1', true, false],
      );

      // With null and undefined
      asserts.assertEquals(
        uniqueGuard.parse([null, undefined, null, 1, undefined, 1]),
        [null, undefined, 1],
      );

      // Objects (reference equality)
      const obj1 = { id: 1 };
      const obj2 = { id: 2 };
      const obj3 = { id: 1 }; // Different reference than obj1
      asserts.assertEquals(
        uniqueGuard.parse([obj1, obj2, obj1, obj3]),
        [obj1, obj2, obj3],
      );
    });

    it('chaining new methods', () => {
      // Chain multiple new methods
      const chainedGuard = Guardian.array()
        .noNulls()
        .compact()
        .onlyUnique();

      asserts.assertEquals(
        chainedGuard.parse([1, 2, 2, 3, false, 4, 0, 1, '']),
        [1, 2, 3, 4],
      );

      // Chain with existing methods (using untyped array to allow mixed types before filtering)
      const complexChain = Guardian.array()
        .compact()
        .onlyUnique()
        .sort();

      asserts.assertEquals(
        complexChain.parse([3, 0, 1, false, 4, 1, 5, 0]),
        [1, 3, 4, 5],
      );

      // Flatten with other transformations
      const flattenChain = Guardian.array()
        .compact()
        .flatten(' - ');

      asserts.assertEquals(
        flattenChain.parse([1, [2, 3], [4]]),
        '1 - 2 - 3 - 4',
      );
    });

    it('edge cases and error handling', () => {
      // noNulls with custom error message
      const customErrorGuard = Guardian.array().noNulls('No nulls allowed!');
      asserts.assertThrows(
        () => customErrorGuard.parse([1, null]),
        GuardianError,
        'No nulls allowed!',
      );

      // Flatten with deeply nested arrays
      const deepNested = [1, [2, [3, [4, [5]]]]];
      asserts.assertEquals(
        Guardian.array().flatten(',', Infinity).parse(deepNested),
        '1,2,3,4,5',
      );

      // Compact with various falsy types
      const falsyTypes = [
        0,
        -0,
        0n,
        false,
        null,
        undefined,
        '',
        Number.NaN,
        1,
        '0',
        [],
        {},
        ' ',
        true,
        -1,
      ];
      const compactResult = Guardian.array().compact().parse(falsyTypes);
      asserts.assertEquals(compactResult, [1, '0', [], {}, ' ', true, -1]);

      // onlyUnique preserves order
      const orderTest = [3, 1, 4, 1, 5, 9, 2, 6, 5, 3];
      const uniqueResult = Guardian.array().onlyUnique().parse(orderTest);
      asserts.assertEquals(uniqueResult, [3, 1, 4, 5, 9, 2, 6]);
    });

    it('type safety with generics', () => {
      // Test with typed arrays
      const numberArrayGuard = Guardian.array(Guardian.number())
        .compact()
        .onlyUnique();

      // This should work with numbers (avoid boolean to prevent element validation error)
      const numberResult = numberArrayGuard.parse([1, 0, 2, 1, 3, 0]);
      asserts.assertEquals(numberResult, [1, 2, 3]);

      // String array operations
      const stringArrayGuard = Guardian.array(Guardian.string())
        .noNulls()
        .onlyUnique();

      asserts.assertEquals(
        stringArrayGuard.parse(['a', 'b', 'a', 'c']),
        ['a', 'b', 'c'],
      );

      // Should reject null in string array
      asserts.assertThrows(
        () => stringArrayGuard.parse(['a', null, 'b']),
        GuardianError,
      );
    });
  });

  describe('nullable and optional', () => {
    it('should handle nullable arrays', () => {
      const schema = Guardian.array().nullable();
      asserts.assertEquals(schema.parse([1, 2, 3]), [1, 2, 3]);
      asserts.assertEquals(schema.parse(null), null);
      asserts.assertThrows(() => schema.parse('not array'), GuardianError);
    });

    it('should handle optional arrays', () => {
      const schema = Guardian.array().optional(['default']);
      asserts.assertEquals(schema.parse([1, 2, 3]), [1, 2, 3]);
      asserts.assertEquals(schema.parse(undefined), ['default']);
      asserts.assertThrows(() => schema.parse('not array'), GuardianError);
    });

    it('should handle nullable().optional() chaining', () => {
      const schema = Guardian.array().nullable().optional(['default']);
      asserts.assertEquals(schema.parse([1, 2, 3]), [1, 2, 3]);
      asserts.assertEquals(schema.parse(null), null);
      asserts.assertEquals(schema.parse(undefined), ['default']);
    });

    it('should handle optional().nullable() chaining', () => {
      const schema = Guardian.array().optional(['default']).nullable();
      asserts.assertEquals(schema.parse([1, 2, 3]), [1, 2, 3]);
      asserts.assertEquals(schema.parse(null), null);
      asserts.assertEquals(schema.parse(undefined), ['default']);
    });
  });

  // ============================================================================
  // COMPREHENSIVE EDGE CASE TESTS - Added for Production Readiness
  // ============================================================================

  describe('Metadata and describe', () => {
    it('should set metadata via describe', () => {
      const guard = Guardian.array().describe({
        title: 'Tags',
        description: 'User tags',
      });

      asserts.assertEquals(guard.metaData?.title, 'Tags');
      asserts.assertEquals(guard.metaData?.description, 'User tags');
    });

    it('should not override protected flags with describe', () => {
      const guard = Guardian.array()
        .nullable()
        .describe({
          title: 'Test',
          isNullable: false as any,
        });

      asserts.assertEquals(guard.parse(null), null);
    });

    it('should merge metadata across describe calls', () => {
      const guard = Guardian.array();

      const withTitle = guard.describe({ title: 'Step 1' });
      const withDesc = withTitle.describe({ description: 'Array field' });

      asserts.assertEquals(withDesc.metaData?.title, 'Step 1');
      asserts.assertEquals(withDesc.metaData?.description, 'Array field');
    });
  });

  describe('Empty and sparse arrays', () => {
    it('should handle empty arrays', () => {
      const guard = Guardian.array();
      asserts.assertEquals(guard.parse([]), []);
    });

    it('should handle sparse arrays', () => {
      const guard = Guardian.array();
      const sparse: unknown[] = [];
      sparse[0] = 'a';
      sparse[5] = 'b';

      const result = guard.parse(sparse);
      asserts.assertEquals(result[0], 'a');
      asserts.assertEquals(result[5], 'b');
      asserts.assertEquals(result.length, 6);
    });

    it('should handle arrays with undefined elements', () => {
      const guard = Guardian.array();
      asserts.assertEquals(guard.parse([1, undefined, 3]), [1, undefined, 3]);
    });

    it('should reject empty arrays when minLength is set', () => {
      const guard = Guardian.array().minLength(1);
      asserts.assertThrows(() => guard.parse([]), GuardianError);
    });

    it('should allow empty arrays with minLength 0', () => {
      const guard = Guardian.array().minLength(0);
      asserts.assertEquals(guard.parse([]), []);
    });
  });

  describe('Large arrays', () => {
    it('should handle very large arrays', () => {
      const guard = Guardian.array();
      const large = Array.from({ length: 10000 }, (_, i) => i);

      const result = guard.parse(large);
      asserts.assertEquals(result.length, 10000);
      asserts.assertEquals(result[9999], 9999);
    });

    it('should validate each element in large arrays with element guard', () => {
      const guard = Guardian.array(Guardian.number().positive());
      const large = Array.from({ length: 1000 }, (_, i) => i + 1);

      const result = guard.parse(large);
      asserts.assertEquals(result.length, 1000);
    });

    it('should handle max constraint with large arrays', () => {
      const guard = Guardian.array().maxLength(100);
      const large = Array.from({ length: 1000 }, (_, i) => i);

      asserts.assertThrows(() => guard.parse(large), GuardianError);
    });
  });

  describe('Complex transformations', () => {
    it('should filter array elements', () => {
      const guard = Guardian.array().process((val) =>
        val.filter((item: unknown) => typeof item === 'number')
      );

      asserts.assertEquals(guard.parse([1, 'a', 2, 'b', 3]), [1, 2, 3]);
    });

    it('should map array elements', () => {
      const guard = Guardian.array().process((val) =>
        val.map((item: unknown) => String(item))
      );

      asserts.assertEquals(guard.parse([1, 2, 3]), ['1', '2', '3']);
    });

    it('should chain multiple transformations', () => {
      const guard = Guardian.array()
        .process((val) =>
          val.filter((item: unknown) => typeof item === 'number')
        )
        .process((val) => val.map((item: unknown) => (item as number) * 2));

      asserts.assertEquals(guard.parse([1, 'a', 2, 'b', 3]), [2, 4, 6]);
    });

    it('should handle async transformations', async () => {
      const guard = Guardian.array().process(async (val) => {
        await new Promise((resolve) => setTimeout(resolve, 1));
        return val.reverse();
      });

      const result = await guard.parseAsync([1, 2, 3]);
      asserts.assertEquals(result, [3, 2, 1]);
    });
  });

  describe('SafeParse comprehensive', () => {
    it('should handle safeParse with valid arrays', () => {
      const guard = Guardian.array();

      const [error, data] = guard.safeParse([1, 2, 3]);
      asserts.assertEquals(error, null);
      asserts.assertEquals(data, [1, 2, 3]);
    });

    it('should handle safeParse with invalid arrays', () => {
      const guard = Guardian.array();

      const [error, data] = guard.safeParse('not an array');
      asserts.assertInstanceOf(error, GuardianError);
      asserts.assertEquals(data, undefined);
    });

    it('should handle safeParse with constraints', () => {
      const guard = Guardian.array().minLength(2);

      const [error1, data1] = guard.safeParse([1, 2, 3]);
      asserts.assertEquals(error1, null);
      asserts.assertEquals(data1, [1, 2, 3]);

      const [error2, data2] = guard.safeParse([1]);
      asserts.assertInstanceOf(error2, GuardianError);
      asserts.assertEquals(data2, undefined);
    });

    it('should handle safeParse with element validation', () => {
      const guard = Guardian.array(Guardian.number());

      const [error1, data1] = guard.safeParse([1, 2, 3]);
      asserts.assertEquals(error1, null);
      asserts.assertEquals(data1, [1, 2, 3]);

      const [error2, data2] = guard.safeParse([1, 'a', 3]);
      asserts.assertInstanceOf(error2, GuardianError);
      asserts.assertEquals(data2, undefined);
    });
  });

  describe('Error scenarios comprehensive', () => {
    it('should reject non-array types', () => {
      const guard = Guardian.array();

      asserts.assertThrows(() => guard.parse('array'), GuardianError);
      asserts.assertThrows(() => guard.parse(123), GuardianError);
      asserts.assertThrows(() => guard.parse(true), GuardianError);
      asserts.assertThrows(() => guard.parse({}), GuardianError);
      asserts.assertThrows(() => guard.parse(null), GuardianError);
    });

    it('should provide clear error messages for type errors', () => {
      const guard = Guardian.array();

      try {
        guard.parse('not an array');
        asserts.fail('Should have thrown');
      } catch (error) {
        asserts.assertInstanceOf(error, GuardianError);
        asserts.assert(
          error.message.includes('array') || error.message.includes('Array'),
        );
      }
    });

    it('should provide clear error messages for length violations', () => {
      const guard = Guardian.array().minLength(5);

      try {
        guard.parse([1, 2]);
        asserts.fail('Should have thrown');
      } catch (error) {
        asserts.assertInstanceOf(error, GuardianError);
        asserts.assert(
          error.message.includes('5') || error.message.includes('min'),
        );
      }
    });

    it('should provide clear error messages for element validation failures', () => {
      const guard = Guardian.array(Guardian.number());

      try {
        guard.parse([1, 'not a number', 3]);
        asserts.fail('Should have thrown');
      } catch (error) {
        asserts.assertInstanceOf(error, GuardianError);
        asserts.assert(
          error.message.includes('1') || error.message.includes('index'),
        );
      }
    });
  });

  describe('Async parseAsync comprehensive', () => {
    it('should handle parseAsync with sync operations', async () => {
      const guard = Guardian.array();

      const result = await guard.parseAsync([1, 2, 3]);
      asserts.assertEquals(result, [1, 2, 3]);
    });

    it('should handle parseAsync with async transformations', async () => {
      const guard = Guardian.array().process(async (val) => {
        await new Promise((resolve) => setTimeout(resolve, 1));
        return val.map((item: unknown) => (item as number) * 2);
      });

      const result = await guard.parseAsync([1, 2, 3]);
      asserts.assertEquals(result, [2, 4, 6]);
    });

    it('should handle parseAsync errors', async () => {
      const guard = Guardian.array().minLength(5);

      let caught = false;
      try {
        await guard.parseAsync([1, 2]);
      } catch (error) {
        caught = true;
        asserts.assertInstanceOf(error, GuardianError);
      }
      asserts.assert(caught);
    });
  });

  describe('OpenAPI generation', () => {
    it('should generate correct OpenAPI schema', () => {
      const guard = Guardian.array();
      const schema = guard.toOpenAPI();

      asserts.assertEquals(schema.type, 'array');
    });

    it('should include element schema in OpenAPI', () => {
      const guard = Guardian.array(Guardian.number());
      const schema = guard.toOpenAPI();

      asserts.assertEquals(schema.type, 'array');
      asserts.assert(schema.items);
      asserts.assertEquals((schema.items as any).type, 'number');
    });

    it('should include min/max in OpenAPI', () => {
      const guard = Guardian.array().minLength(2).maxLength(10);
      const schema = guard.toOpenAPI();

      asserts.assertEquals(schema.minItems, 2);
      asserts.assertEquals(schema.maxItems, 10);
    });

    it('should include metadata in OpenAPI schema', () => {
      const guard = Guardian.array().describe({
        title: 'Item List',
        description: 'List of items',
      });

      const schema = guard.toOpenAPI();

      asserts.assertEquals(schema.title, 'Item List');
      asserts.assertEquals(schema.description, 'List of items');
    });

    it('should handle nullable in OpenAPI', () => {
      const guard = Guardian.array().nullable();
      const schema = guard.toOpenAPI();

      asserts.assertEquals(schema.nullable, true);
    });

    it('should handle unique items in OpenAPI', () => {
      const guard = Guardian.array().unique();
      const schema = guard.toOpenAPI();

      asserts.assertEquals(schema.uniqueItems, true);
    });
  });

  describe('Nested arrays', () => {
    it('should handle arrays of arrays', () => {
      const guard = Guardian.array(Guardian.array(Guardian.number()));

      const nested = [[1, 2], [3, 4], [5, 6]];
      asserts.assertEquals(guard.parse(nested), nested);
    });

    it('should validate deeply nested arrays', () => {
      const guard = Guardian.array(
        Guardian.array(
          Guardian.array(Guardian.string()),
        ),
      );

      const deepNested = [[['a', 'b']], [['c', 'd']]];
      asserts.assertEquals(guard.parse(deepNested), deepNested);
    });

    it('should reject invalid elements in nested arrays', () => {
      const guard = Guardian.array(Guardian.array(Guardian.number()));

      asserts.assertThrows(
        () => guard.parse([[1, 2], ['invalid', 4]]),
        GuardianError,
      );
    });
  });

  describe('sorted / distinctBy / pairs / tail / chunk', () => {
    it('sorted accepts a pre-sorted ascending array', () => {
      const guard = Guardian.array(Guardian.number()).sorted();
      asserts.assertEquals(guard.parse([1, 2, 3]), [1, 2, 3]);
      asserts.assertThrows(() => guard.parse([3, 2, 1]), GuardianError);
    });

    it('sorted accepts a pre-sorted descending array', () => {
      const guard = Guardian.array(Guardian.number()).sorted({ order: 'desc' });
      asserts.assertEquals(guard.parse([3, 2, 1]), [3, 2, 1]);
      asserts.assertThrows(() => guard.parse([1, 2, 3]), GuardianError);
    });

    it('sorted with custom comparator', () => {
      const guard = Guardian.array(Guardian.object({ n: Guardian.number() }))
        .sorted({ by: (a, b) => a.n - b.n });
      asserts.assertEquals(
        guard.parse([{ n: 1 }, { n: 2 }, { n: 3 }]),
        [{ n: 1 }, { n: 2 }, { n: 3 }],
      );
      asserts.assertThrows(
        () => guard.parse([{ n: 2 }, { n: 1 }]),
        GuardianError,
      );
    });

    it('distinctBy enforces projection uniqueness', () => {
      const guard = Guardian.array(
        Guardian.object({ email: Guardian.string() }),
      )
        .distinctBy((u) => u.email);
      asserts.assertEquals(
        guard.parse([{ email: 'a@b' }, { email: 'c@d' }]),
        [{ email: 'a@b' }, { email: 'c@d' }],
      );
      asserts.assertThrows(
        () => guard.parse([{ email: 'a@b' }, { email: 'a@b' }]),
        GuardianError,
      );
    });

    it('pairs produces consecutive [T, T] tuples', () => {
      const guard = Guardian.array(Guardian.number()).pairs();
      asserts.assertEquals(
        guard.parse([1, 2, 3, 4]),
        [[1, 2], [2, 3], [3, 4]],
      );
      asserts.assertEquals(guard.parse([1]), []);
    });

    it('tail keeps the last N elements', () => {
      const guard = Guardian.array(Guardian.number()).tail(2);
      asserts.assertEquals(guard.parse([1, 2, 3, 4, 5]), [4, 5]);
      asserts.assertEquals(guard.parse([1]), [1]);
    });

    it('chunk splits into fixed-size groups', () => {
      const guard = Guardian.array(Guardian.number()).chunk(2);
      asserts.assertEquals(
        guard.parse([1, 2, 3, 4, 5]),
        [[1, 2], [3, 4], [5]],
      );
    });

    it('chunk rejects non-positive sizes', () => {
      asserts.assertThrows(() => Guardian.array(Guardian.number()).chunk(0));
      asserts.assertThrows(() => Guardian.array(Guardian.number()).chunk(-1));
    });
  });

  describe('sum / average / min / max / reduce', () => {
    it('sum reduces a number array', () => {
      const guard = Guardian.array(Guardian.number()).sum();
      asserts.assertEquals(guard.parse([1, 2, 3]), 6);
      asserts.assertEquals(guard.parse([]), 0);
    });

    it('average returns the arithmetic mean', () => {
      const guard = Guardian.array(Guardian.number()).average();
      asserts.assertEquals(guard.parse([10, 20, 30]), 20);
    });

    it('average on empty array → NaN → rejected by NumberGuardian', () => {
      // The default NumberGuardian rejects NaN, so empty arrays
      // surface as a validation error rather than a silent NaN.
      const guard = Guardian.array(Guardian.number()).average();
      asserts.assertThrows(() => guard.parse([]), GuardianError);
    });

    it('min / max', () => {
      const minG = Guardian.array(Guardian.number()).min();
      const maxG = Guardian.array(Guardian.number()).max();
      asserts.assertEquals(minG.parse([5, 1, 3]), 1);
      asserts.assertEquals(maxG.parse([5, 1, 3]), 5);
    });

    it('reduce: arbitrary accumulator', () => {
      const guard = Guardian.array(Guardian.string()).reduce<string>(
        (acc, s) => acc + s,
        '',
      );
      asserts.assertEquals(guard.parse(['a', 'b', 'c']), 'abc');
    });

    it('toSet converts the array into a de-duplicated Set', () => {
      const guard = Guardian.array(Guardian.number()).toSet();
      const result = guard.parse([1, 2, 2, 3]);
      asserts.assertInstanceOf(result, Set);
      asserts.assertEquals([...result], [1, 2, 3]);
      asserts.assertEquals(result.size, 3);
    });

    it('toSet on an empty array yields an empty Set', () => {
      const guard = Guardian.array(Guardian.string()).toSet();
      const result = guard.parse([]);
      asserts.assertInstanceOf(result, Set);
      asserts.assertEquals(result.size, 0);
    });
  });

  describe('superRefine (universal, inherited from BaseGuardian)', () => {
    it('accumulates ALL failing array-level refinements into one error', () => {
      const guard = Guardian.array(Guardian.number()).superRefine([
        {
          validator: (arr) => arr.length >= 3,
          message: 'need at least 3 items',
          path: 'length',
        },
        {
          validator: (arr) => arr.every((n) => n > 0),
          message: 'all items must be positive',
          path: 'items',
        },
      ]);

      asserts.assertEquals(guard.parse([1, 2, 3]), [1, 2, 3]);

      // [-1] fails BOTH checks (too short AND holds a non-positive item),
      // so both messages surface in one aggregate error.
      const [err] = guard.safeParse([-1]);
      asserts.assertInstanceOf(err, GuardianError);
      asserts.assertStringIncludes(err.message, 'need at least 3 items');
      asserts.assertStringIncludes(err.message, 'all items must be positive');
      const leaves = [...err.leafErrors()];
      asserts.assertEquals(leaves.length, 2);
      const paths = leaves.map((l) => l.path?.join('.')).sort();
      asserts.assertEquals(paths, ['items', 'length']);
    });

    it('supports async array refinements via parseAsync', async () => {
      const guard = Guardian.array(Guardian.number()).superRefine([
        {
          validator: async (arr) => {
            await Promise.resolve();
            return arr.length > 0;
          },
          message: 'must not be empty',
        },
      ]);

      // The async refinement flips the whole step async off the base.
      asserts.assertEquals(guard.metaData?.isAsync, true);
      asserts.assertThrows(() => guard.parse([1]), GuardianError, 'parseAsync');

      asserts.assertEquals(await guard.parseAsync([1, 2]), [1, 2]);

      const [err] = await guard.safeParseAsync([]);
      asserts.assertInstanceOf(err, GuardianError);
      asserts.assertStringIncludes(err.message, 'must not be empty');
    });
  });
});
