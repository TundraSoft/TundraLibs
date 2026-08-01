import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat';
import { EnumGuardian, GuardianError } from '../../mod.ts';

describe('guardian.EnumGuardian', () => {
  describe('basic functionality', () => {
    it('should validate enum values', () => {
      const colors = ['red', 'green', 'blue'] as const;
      const guardian = new EnumGuardian(colors);

      asserts.assertEquals(guardian.parse('red'), 'red');
      asserts.assertEquals(guardian.parse('green'), 'green');
      asserts.assertEquals(guardian.parse('blue'), 'blue');

      asserts.assertThrows(() => guardian.parse('yellow'), GuardianError);
      asserts.assertThrows(() => guardian.parse('purple'), GuardianError);
      asserts.assertThrows(() => guardian.parse(123), GuardianError);
      asserts.assertThrows(() => guardian.parse(null), GuardianError);
    });

    it('should work with number enums', () => {
      const numbers = [1, 2, 3] as const;
      const guardian = new EnumGuardian(numbers);

      asserts.assertEquals(guardian.parse(1), 1);
      asserts.assertEquals(guardian.parse(2), 2);
      asserts.assertEquals(guardian.parse(3), 3);

      asserts.assertThrows(() => guardian.parse(4), GuardianError);
      asserts.assertThrows(() => guardian.parse('1'), GuardianError);
    });

    it('should require at least one allowed value', () => {
      asserts.assertThrows(() => new EnumGuardian([]), Error);
    });

    it('should expose allowed values', () => {
      const values = ['a', 'b', 'c'] as const;
      const guardian = new EnumGuardian(values);

      asserts.assertEquals(guardian.allowedValues, values);
    });
  });

  describe('validation methods', () => {
    it('should exclude specific values', () => {
      const colors = ['red', 'green', 'blue', 'yellow'] as const;
      const guardian = new EnumGuardian(colors).exclude(['yellow']);

      asserts.assertEquals(guardian.parse('red'), 'red');
      asserts.assertEquals(guardian.parse('green'), 'green');
      asserts.assertEquals(guardian.parse('blue'), 'blue');

      asserts.assertThrows(() => guardian.parse('yellow'), GuardianError);
    });

    it('should support custom error message for exclusion', () => {
      const colors = ['red', 'green', 'blue', 'yellow'] as const;
      const guardian = new EnumGuardian(colors).exclude(
        ['yellow'],
        'Yellow is not allowed',
      );

      asserts.assertThrows(
        () => guardian.parse('yellow'),
        GuardianError,
        'Yellow is not allowed',
      );
    });
  });

  describe('transformations', () => {
    it('should transform to string', () => {
      const numbers = [1, 2, 3] as const;
      const guardian = new EnumGuardian(numbers).toString();

      asserts.assertEquals(guardian.parse(1), '1');
      asserts.assertEquals(guardian.parse(2), '2');
      asserts.assertEquals(guardian.parse(3), '3');
    });

    it('should map values', () => {
      const colors = ['red', 'green', 'blue'] as const;
      const guardian = new EnumGuardian(colors).map((color) =>
        color.toUpperCase()
      );

      asserts.assertEquals(guardian.parse('red'), 'RED');
      asserts.assertEquals(guardian.parse('green'), 'GREEN');
      asserts.assertEquals(guardian.parse('blue'), 'BLUE');
    });

    it('should map to different types', () => {
      const status = ['active', 'inactive'] as const;
      const guardian = new EnumGuardian(status).map((s) =>
        s === 'active' ? 1 : 0
      );

      asserts.assertEquals(guardian.parse('active'), 1);
      asserts.assertEquals(guardian.parse('inactive'), 0);
    });
  });

  describe('chained validations', () => {
    it('should chain exclusions and transformations', () => {
      const colors = ['red', 'green', 'blue', 'yellow'] as const;
      const guardian = new EnumGuardian(colors)
        .exclude(['yellow'])
        .map((color) => color.toUpperCase());

      asserts.assertEquals(guardian.parse('red'), 'RED');
      asserts.assertThrows(() => guardian.parse('yellow'), GuardianError);
    });
  });

  describe('safe parsing', () => {
    it('should return success result for valid input', () => {
      const colors = ['red', 'green', 'blue'] as const;
      const guardian = new EnumGuardian(colors);
      const [error, result] = guardian.safeParse('red');

      asserts.assertEquals(error, null);
      asserts.assertEquals(result, 'red');
    });

    it('should return error result for invalid input', () => {
      const colors = ['red', 'green', 'blue'] as const;
      const guardian = new EnumGuardian(colors);
      const [error, result] = guardian.safeParse('yellow');

      asserts.assertEquals(error instanceof GuardianError, true);
      asserts.assertEquals(result, undefined);
    });
  });

  describe('error handling', () => {
    it('should provide detailed error messages', () => {
      const colors = ['red', 'green', 'blue'] as const;
      const guardian = new EnumGuardian(colors);

      asserts.assertThrows(
        () => guardian.parse('yellow'),
        GuardianError,
        'Value must be one of: red, green, blue',
      );
    });
  });

  describe('real world usage', () => {
    it('should work with TypeScript enums', () => {
      // Simulate enum usage
      const UserRole = {
        ADMIN: 'admin',
        USER: 'user',
        MODERATOR: 'moderator',
      } as const;

      const guardian = new EnumGuardian(Object.values(UserRole));

      asserts.assertEquals(guardian.parse('admin'), 'admin');
      asserts.assertEquals(guardian.parse('user'), 'user');
      asserts.assertEquals(guardian.parse('moderator'), 'moderator');

      asserts.assertThrows(() => guardian.parse('guest'), GuardianError);
    });
  });

  describe('nullable and optional chaining', () => {
    const colors = ['red', 'green', 'blue'] as const;

    it(
      'nullable().optional() allows null, undefined, and valid enum values',
      () => {
        const guard = new EnumGuardian(colors).nullable().optional();

        asserts.assertEquals(guard.parse(null), null);
        asserts.assertEquals(guard.parse(undefined), undefined);
        asserts.assertEquals(guard.parse('red'), 'red');
        asserts.assertEquals(guard.parse('green'), 'green');
        asserts.assertEquals(guard.parse('blue'), 'blue');
      },
    );

    it(
      'optional().nullable() allows undefined, null, and valid enum values',
      () => {
        const guard = new EnumGuardian(colors).optional().nullable();

        asserts.assertEquals(guard.parse(undefined), undefined);
        asserts.assertEquals(guard.parse(null), null);
        asserts.assertEquals(guard.parse('red'), 'red');
        asserts.assertEquals(guard.parse('green'), 'green');
        asserts.assertEquals(guard.parse('blue'), 'blue');
      },
    );

    it('nullable().optional() rejects invalid enum values', () => {
      const guard = new EnumGuardian(colors).nullable().optional();

      asserts.assertThrows(() => guard.parse('yellow'), GuardianError);
      asserts.assertThrows(() => guard.parse('purple'), GuardianError);
      asserts.assertThrows(() => guard.parse(123), GuardianError);
    });

    it('optional().nullable() rejects invalid enum values', () => {
      const guard = new EnumGuardian(colors).optional().nullable();

      asserts.assertThrows(() => guard.parse('yellow'), GuardianError);
      asserts.assertThrows(() => guard.parse('purple'), GuardianError);
      asserts.assertThrows(() => guard.parse(123), GuardianError);
    });
  });

  // ============================================================================
  // COMPREHENSIVE EDGE CASE TESTS - Added for Production Readiness
  // ============================================================================

  describe('Process and refine functionality', () => {
    const colors = ['red', 'green', 'blue'] as const;

    it('should process enum to different value', () => {
      const guard = new EnumGuardian(colors).process((val) =>
        val.toUpperCase()
      );

      asserts.assertEquals(guard.parse('red'), 'RED');
      asserts.assertEquals(guard.parse('blue'), 'BLUE');
    });

    it('should chain multiple processes', () => {
      const guard = new EnumGuardian(colors)
        .process((val) => val.toUpperCase())
        .process((val) => `Color: ${val}`);

      asserts.assertEquals(guard.parse('red'), 'Color: RED');
    });

    it('should handle async process', async () => {
      const guard = new EnumGuardian(colors).process(async (val) => {
        await new Promise((resolve) => setTimeout(resolve, 1));
        return val.toUpperCase();
      });

      const result = await guard.parseAsync('red');
      asserts.assertEquals(result, 'RED');
    });

    it('should process with number enums', () => {
      const numbers = [1, 2, 3] as const;
      const guard = new EnumGuardian(numbers).process((val) => val * 10);

      asserts.assertEquals(guard.parse(1), 10);
      asserts.assertEquals(guard.parse(2), 20);
    });
  });

  describe('Metadata and describe', () => {
    const colors = ['red', 'green', 'blue'] as const;

    it('should set metadata via describe', () => {
      const guard = new EnumGuardian(colors).describe({
        title: 'Theme Color',
        description: 'Selectable theme colors',
      });

      asserts.assertEquals(guard.metaData?.title, 'Theme Color');
      asserts.assertEquals(
        guard.metaData?.description,
        'Selectable theme colors',
      );
    });

    it('should not override protected flags with describe', () => {
      const guard = new EnumGuardian(colors)
        .nullable()
        .describe({
          title: 'Test',
          isNullable: false as any,
        });

      asserts.assertEquals(guard.parse(null), null);
    });

    it('should merge metadata across describe calls', () => {
      const guard = new EnumGuardian(colors);

      const withTitle = guard.describe({ title: 'Step 1' });
      const withDesc = withTitle.describe({ description: 'Color choice' });

      asserts.assertEquals(withDesc.metaData?.title, 'Step 1');
      asserts.assertEquals(withDesc.metaData?.description, 'Color choice');
    });
  });

  describe('Exclude edge cases', () => {
    const colors = ['red', 'green', 'blue', 'yellow', 'purple'] as const;

    it('should handle multiple excludes', () => {
      const guard = new EnumGuardian(colors).exclude(['yellow', 'purple']);

      asserts.assertEquals(guard.parse('red'), 'red');
      asserts.assertEquals(guard.parse('green'), 'green');
      asserts.assertThrows(() => guard.parse('yellow'), GuardianError);
      asserts.assertThrows(() => guard.parse('purple'), GuardianError);
    });

    it('should handle chained excludes', () => {
      const guard = new EnumGuardian(colors)
        .exclude(['yellow'])
        .exclude(['purple']);

      asserts.assertEquals(guard.parse('red'), 'red');
      asserts.assertThrows(() => guard.parse('yellow'), GuardianError);
      asserts.assertThrows(() => guard.parse('purple'), GuardianError);
    });

    it('should allow excluding most but not all values', () => {
      const guard = new EnumGuardian(colors).exclude(['yellow', 'blue']);
      // This is allowed - we can still validate 'red' and 'green'
      asserts.assertEquals(guard.parse('red'), 'red');
    });

    it('should work with nullable and exclude', () => {
      const guard = new EnumGuardian(colors).exclude(['yellow']).nullable();

      asserts.assertEquals(guard.parse('red'), 'red');
      asserts.assertEquals(guard.parse(null), null);
      asserts.assertThrows(() => guard.parse('yellow'), GuardianError);
    });
  });

  describe('Mixed type enums', () => {
    it('should handle mixed string and number enums', () => {
      const mixed = ['a', 1, 'b', 2] as const;
      const guard = new EnumGuardian(mixed);

      asserts.assertEquals(guard.parse('a'), 'a');
      asserts.assertEquals(guard.parse(1), 1);
      asserts.assertEquals(guard.parse('b'), 'b');
      asserts.assertEquals(guard.parse(2), 2);
      asserts.assertThrows(() => guard.parse('c'), GuardianError);
      asserts.assertThrows(() => guard.parse(3), GuardianError);
    });

    it('should handle boolean enums', () => {
      const booleans = [true, false] as const;
      const guard = new EnumGuardian(booleans);

      asserts.assertEquals(guard.parse(true), true);
      asserts.assertEquals(guard.parse(false), false);
      asserts.assertThrows(() => guard.parse('true'), GuardianError);
    });
  });

  describe('SafeParse comprehensive', () => {
    const colors = ['red', 'green', 'blue'] as const;

    it('should handle safeParse with valid values', () => {
      const guard = new EnumGuardian(colors);

      const [error, data] = guard.safeParse('red');
      asserts.assertEquals(error, null);
      asserts.assertEquals(data, 'red');
    });

    it('should handle safeParse with invalid values', () => {
      const guard = new EnumGuardian(colors);

      const [error, data] = guard.safeParse('yellow');
      asserts.assertInstanceOf(error, GuardianError);
      asserts.assertEquals(data, undefined);
    });

    it('should handle safeParse with transformations', () => {
      const guard = new EnumGuardian(colors).process((val) =>
        val.toUpperCase()
      );

      const [error, data] = guard.safeParse('red');
      asserts.assertEquals(error, null);
      asserts.assertEquals(data, 'RED');
    });

    it('should handle safeParse with exclude', () => {
      const guard = new EnumGuardian(colors).exclude(['blue']);

      const [error1, data1] = guard.safeParse('red');
      asserts.assertEquals(error1, null);
      asserts.assertEquals(data1, 'red');

      const [error2, data2] = guard.safeParse('blue');
      asserts.assertInstanceOf(error2, GuardianError);
      asserts.assertEquals(data2, undefined);
    });
  });

  describe('Async parseAsync comprehensive', () => {
    const colors = ['red', 'green', 'blue'] as const;

    it('should handle parseAsync with sync operations', async () => {
      const guard = new EnumGuardian(colors);

      const result = await guard.parseAsync('red');
      asserts.assertEquals(result, 'red');
    });

    it('should handle parseAsync with async transformations', async () => {
      const guard = new EnumGuardian(colors).process(async (val) => {
        await new Promise((resolve) => setTimeout(resolve, 1));
        return `Async: ${val}`;
      });

      const result = await guard.parseAsync('red');
      asserts.assertEquals(result, 'Async: red');
    });

    it('should handle parseAsync errors', async () => {
      const guard = new EnumGuardian(colors);

      let caught = false;
      try {
        await guard.parseAsync('invalid');
      } catch (error) {
        caught = true;
        asserts.assertInstanceOf(error, GuardianError);
      }
      asserts.assert(caught);
    });
  });

  describe('Error scenarios', () => {
    const colors = ['red', 'green', 'blue'] as const;

    it('should reject undefined by default', () => {
      const guard = new EnumGuardian(colors);
      asserts.assertThrows(() => guard.parse(undefined), GuardianError);
    });

    it('should reject null by default', () => {
      const guard = new EnumGuardian(colors);
      asserts.assertThrows(() => guard.parse(null), GuardianError);
    });

    it('should reject objects', () => {
      const guard = new EnumGuardian(colors);
      asserts.assertThrows(() => guard.parse({ value: 'red' }), GuardianError);
    });

    it('should reject arrays', () => {
      const guard = new EnumGuardian(colors);
      asserts.assertThrows(() => guard.parse(['red']), GuardianError);
    });

    it('should provide clear error messages', () => {
      const guard = new EnumGuardian(colors);

      try {
        guard.parse('invalid');
        asserts.fail('Should have thrown');
      } catch (error) {
        asserts.assertInstanceOf(error, GuardianError);
        // Message should mention allowed values
        asserts.assert(
          error.message.includes('red') || error.message.includes('one of'),
        );
      }
    });

    it('should include allowed values in error message', () => {
      const guard = new EnumGuardian(colors);

      try {
        guard.parse('invalid');
        asserts.fail('Should have thrown');
      } catch (error) {
        asserts.assertInstanceOf(error, GuardianError);
        // Message should mention allowed values
        asserts.assert(
          error.message.includes('red') ||
            error.message.includes('allowed'),
        );
      }
    });
  });

  describe('OpenAPI generation', () => {
    it('should generate correct OpenAPI schema for string enum', () => {
      const colors = ['red', 'green', 'blue'] as const;
      const guard = new EnumGuardian(colors);
      const schema = guard.toOpenAPI();

      asserts.assertEquals(schema.type, 'string');
      asserts.assertEquals(schema.enum, ['red', 'green', 'blue']);
    });

    it('should generate correct OpenAPI schema for number enum', () => {
      const numbers = [1, 2, 3] as const;
      const guard = new EnumGuardian(numbers);
      const schema = guard.toOpenAPI();

      asserts.assertEquals(schema.type, 'number');
      asserts.assertEquals(schema.enum, [1, 2, 3]);
    });

    it('should handle mixed types in OpenAPI', () => {
      const mixed = ['a', 1, 'b', 2] as const;
      const guard = new EnumGuardian(mixed);
      const schema = guard.toOpenAPI();

      // Should default to string type or handle mixed
      asserts.assert(schema.enum);
      asserts.assert(Array.isArray(schema.enum));
      asserts.assertEquals(schema.enum!.length, 4);
    });

    it('should include metadata in OpenAPI schema', () => {
      const colors = ['red', 'green', 'blue'] as const;
      const guard = new EnumGuardian(colors).describe({
        title: 'Color Choice',
        description: 'Choose a color',
        default: 'red',
      });

      const schema = guard.toOpenAPI();

      asserts.assertEquals(schema.title, 'Color Choice');
      asserts.assertEquals(schema.description, 'Choose a color');
      asserts.assertEquals(schema.default, 'red');
    });

    it('should handle nullable in OpenAPI', () => {
      const colors = ['red', 'green', 'blue'] as const;
      const guard = new EnumGuardian(colors).nullable();
      const schema = guard.toOpenAPI();

      asserts.assertEquals(schema.nullable, true);
    });

    it('should reflect exclude in OpenAPI validation', () => {
      const colors = ['red', 'green', 'blue', 'yellow'] as const;
      const guard = new EnumGuardian(colors).exclude(['yellow']);
      const schema = guard.toOpenAPI();

      // The schema enum will still have all values,
      // but the exclude is enforced at validation time
      asserts.assert(schema.enum);
      asserts.assert(Array.isArray(schema.enum));

      // Verify validation actually excludes yellow
      asserts.assertEquals(guard.parse('red'), 'red');
      asserts.assertThrows(() => guard.parse('yellow'), GuardianError);
    });
  });

  describe('caseInsensitive', () => {
    it('matches inputs ignoring case, returns canonical value', () => {
      const method = new EnumGuardian(['GET', 'POST', 'PUT'] as const)
        .caseInsensitive();

      // Canonical form returned regardless of input case.
      asserts.assertEquals(method.parse('get'), 'GET');
      asserts.assertEquals(method.parse('Post'), 'POST');
      asserts.assertEquals(method.parse('PUT'), 'PUT');

      // Outside the set still throws.
      asserts.assertThrows(() => method.parse('PATCH'), GuardianError);
    });

    it('rejects non-string allowed values at construction', () => {
      asserts.assertThrows(
        () => new EnumGuardian([1, 2, 3] as const).caseInsensitive(),
        TypeError,
        'allowed values to be strings',
      );
    });

    it('rejects ambiguous lowercased allowed values', () => {
      // 'Foo' and 'foo' both lowercase to 'foo' — ambiguous.
      asserts.assertThrows(
        () => new EnumGuardian(['Foo', 'foo'] as const).caseInsensitive(),
        Error,
        'ambiguous',
      );
    });
  });
});
