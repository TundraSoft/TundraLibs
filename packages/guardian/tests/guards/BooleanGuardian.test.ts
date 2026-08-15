import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { BooleanGuardian, GuardianError } from '../../mod.ts';

describe('guardian.BooleanGuardian', () => {
  describe('basic functionality', () => {
    it('should validate boolean type', () => {
      const guardian = new BooleanGuardian();

      asserts.assertEquals(guardian.parse(true), true);
      asserts.assertEquals(guardian.parse(false), false);

      // Coerce-by-default: strict-list strings + 0/1 flow through.
      asserts.assertEquals(guardian.parse('true'), true);
      asserts.assertEquals(guardian.parse('false'), false);
      asserts.assertEquals(guardian.parse('yes'), true);
      asserts.assertEquals(guardian.parse('no'), false);
      asserts.assertEquals(guardian.parse('1'), true);
      asserts.assertEquals(guardian.parse('0'), false);
      asserts.assertEquals(guardian.parse(''), false);
      asserts.assertEquals(guardian.parse(1), true);
      asserts.assertEquals(guardian.parse(0), false);

      // Non-list strings + other numbers + null/undefined still throw.
      asserts.assertThrows(() => guardian.parse('maybe'), GuardianError);
      asserts.assertThrows(() => guardian.parse(42), GuardianError);
      asserts.assertThrows(() => guardian.parse(null), GuardianError);
      asserts.assertThrows(() => guardian.parse(undefined), GuardianError);
      asserts.assertThrows(() => guardian.parse({}), GuardianError);
    });

    it('should preserve boolean values', () => {
      const guardian = new BooleanGuardian();

      asserts.assertEquals(guardian.parse(true), true);
      asserts.assertEquals(guardian.parse(false), false);
    });
  });

  describe('specific value validations', () => {
    it('should validate true values', () => {
      const guardian = new BooleanGuardian().true();

      asserts.assertEquals(guardian.parse(true), true);

      asserts.assertThrows(
        () => guardian.parse(false),
        GuardianError,
        'Expected true but got false',
      );
    });

    it('should validate false values', () => {
      const guardian = new BooleanGuardian().false();

      asserts.assertEquals(guardian.parse(false), false);

      asserts.assertThrows(
        () => guardian.parse(true),
        GuardianError,
        'Expected false but got true',
      );
    });

    it('should support custom error messages', () => {
      const guardian = new BooleanGuardian().true('Must be enabled');

      asserts.assertThrows(
        () => guardian.parse(false),
        GuardianError,
        'Must be enabled',
      );
    });
  });

  describe('transformations', () => {
    it('should transform to string', () => {
      const guardian = new BooleanGuardian().toString();

      asserts.assertEquals(guardian.parse(true), 'true');
      asserts.assertEquals(guardian.parse(false), 'false');
    });

    it('should transform to number', () => {
      const guardian = new BooleanGuardian().toNumber();

      asserts.assertEquals(guardian.parse(true), 1);
      asserts.assertEquals(guardian.parse(false), 0);
    });
  });

  describe('chained validations', () => {
    it('should chain validations', () => {
      const guardian = new BooleanGuardian().true().toString();

      asserts.assertEquals(guardian.parse(true), 'true');

      asserts.assertThrows(() => guardian.parse(false), GuardianError);
    });
  });

  describe('safe parsing', () => {
    it('should return success result for valid input', () => {
      const guardian = new BooleanGuardian();
      const [error, result] = guardian.safeParse(true);

      asserts.assertEquals(error, null);
      asserts.assertEquals(result, true);
    });

    it('should return error result for invalid input', () => {
      const guardian = new BooleanGuardian();

      // Coerce-by-default: 'true' now coerces successfully.
      const [okErr, okData] = guardian.safeParse('true');
      asserts.assertEquals(okErr, null);
      asserts.assertEquals(okData, true);

      // Genuinely unrecognised input still errors.
      const [error, result] = guardian.safeParse('maybe');
      asserts.assertEquals(error instanceof GuardianError, true);
      asserts.assertEquals(result, undefined);
    });
  });

  describe('error handling', () => {
    it('should provide detailed error messages', () => {
      const guardian = new BooleanGuardian();

      // Strings outside the accepted truthy/falsy list throw with a
      // hint listing the accepted forms.
      asserts.assertThrows(
        () => guardian.parse('maybe'),
        GuardianError,
        'accepted',
      );
      // Numbers other than 0/1 throw — no silent truthification.
      asserts.assertThrows(
        () => guardian.parse(42),
        GuardianError,
        'only 0/1 accepted',
      );
    });

    it('should support custom error messages', () => {
      const guardian = new BooleanGuardian().true('Custom error message');

      asserts.assertThrows(
        () => guardian.parse(false),
        GuardianError,
        'Custom error message',
      );
    });
  });

  describe('nullable and optional', () => {
    it('should handle nullable booleans', () => {
      const schema = new BooleanGuardian().nullable();
      asserts.assertEquals(schema.parse(true), true);
      asserts.assertEquals(schema.parse(false), false);
      asserts.assertEquals(schema.parse(null), null);
      asserts.assertThrows(() => schema.parse('not boolean'), GuardianError);
    });

    it('should handle optional booleans', () => {
      const schema = new BooleanGuardian().optional(true);
      asserts.assertEquals(schema.parse(true), true);
      asserts.assertEquals(schema.parse(false), false);
      asserts.assertEquals(schema.parse(undefined), true);
      asserts.assertThrows(() => schema.parse('not boolean'), GuardianError);
    });

    it('should handle nullable().optional() chaining', () => {
      const schema = new BooleanGuardian().nullable().optional(true);
      asserts.assertEquals(schema.parse(true), true);
      asserts.assertEquals(schema.parse(null), null);
      asserts.assertEquals(schema.parse(undefined), true);
    });

    it('should handle optional().nullable() chaining', () => {
      const schema = new BooleanGuardian().optional(true).nullable();
      asserts.assertEquals(schema.parse(true), true);
      asserts.assertEquals(schema.parse(null), null);
      asserts.assertEquals(schema.parse(undefined), true);
    });
  });

  // ============================================================================
  // COMPREHENSIVE EDGE CASE TESTS - Added for Production Readiness
  // ============================================================================

  describe('Process and refine functionality', () => {
    it('should process boolean to string', () => {
      const guard = new BooleanGuardian().process((val) => val ? 'YES' : 'NO');

      asserts.assertEquals(guard.parse(true), 'YES');
      asserts.assertEquals(guard.parse(false), 'NO');
    });

    it('should chain multiple processes', () => {
      const guard = new BooleanGuardian()
        .process((val) => !val)
        .process((val) => val ? 1 : 0);

      asserts.assertEquals(guard.parse(true), 0);
      asserts.assertEquals(guard.parse(false), 1);
    });

    it('should handle async process', async () => {
      const guard = new BooleanGuardian().process(async (val) => {
        await new Promise((resolve) => setTimeout(resolve, 1));
        return !val;
      });

      const result = await guard.parseAsync(true);
      asserts.assertEquals(result, false);
    });

    it('should handle async process in parseAsync', async () => {
      const guard = new BooleanGuardian().process(async (val) => {
        await new Promise((resolve) => setTimeout(resolve, 1));
        return !val;
      });

      const result = await guard.parseAsync(true);
      asserts.assertEquals(result, false);
    });
  });

  describe('Metadata and describe', () => {
    it('should set metadata via describe', () => {
      const guard = new BooleanGuardian().describe({
        title: 'Active Flag',
        description: 'Whether the item is active',
      });

      asserts.assertEquals(guard.metaData?.title, 'Active Flag');
      asserts.assertEquals(
        guard.metaData?.description,
        'Whether the item is active',
      );
    });

    it('should not override protected flags with describe', () => {
      const guard = new BooleanGuardian()
        .nullable()
        .describe({
          title: 'Test',
          isNullable: false as any, // Try to override
        });

      // Should still be nullable
      asserts.assertEquals(guard.parse(null), null);
    });

    it('should merge metadata across describe calls', () => {
      const guard = new BooleanGuardian();

      const withTitle = guard.describe({ title: 'Step 1' });
      const withDesc = withTitle.describe({ description: 'Description' });

      asserts.assertEquals(withDesc.metaData?.title, 'Step 1');
      asserts.assertEquals(withDesc.metaData?.description, 'Description');
    });
  });

  describe('true and false edge cases', () => {
    it('true should work with nullable', () => {
      const guard = new BooleanGuardian().true().nullable();

      asserts.assertEquals(guard.parse(true), true);
      asserts.assertEquals(guard.parse(null), null);
      asserts.assertThrows(() => guard.parse(false), GuardianError);
    });

    it('false should work with nullable', () => {
      const guard = new BooleanGuardian().false().nullable();

      asserts.assertEquals(guard.parse(false), false);
      asserts.assertEquals(guard.parse(null), null);
      asserts.assertThrows(() => guard.parse(true), GuardianError);
    });

    it('true and false should work with optional', () => {
      const guard1 = new BooleanGuardian().true().optional();
      asserts.assertEquals(guard1.parse(true), true);
      asserts.assertEquals(guard1.parse(undefined), undefined);
      asserts.assertThrows(() => guard1.parse(false), GuardianError);

      const guard2 = new BooleanGuardian().false().optional();
      asserts.assertEquals(guard2.parse(false), false);
      asserts.assertEquals(guard2.parse(undefined), undefined);
      asserts.assertThrows(() => guard2.parse(true), GuardianError);
    });

    it('should handle double true calls', () => {
      const guard = new BooleanGuardian().true().true();

      asserts.assertEquals(guard.parse(true), true);
      asserts.assertThrows(() => guard.parse(false), GuardianError);
    });

    it('should handle chaining true and false', () => {
      // Both validations apply, so nothing can pass
      const guard = new BooleanGuardian().true().false();

      // Both true and false should fail because both validations are active
      asserts.assertThrows(() => guard.parse(true), GuardianError);
      asserts.assertThrows(() => guard.parse(false), GuardianError);
    });
  });

  describe('Transformation combinations', () => {
    it('should transform to different types', () => {
      const toString = new BooleanGuardian().toString();
      asserts.assertEquals(toString.parse(true), 'true');
      asserts.assertEquals(toString.parse(false), 'false');

      const toNumber = new BooleanGuardian().toNumber();
      asserts.assertEquals(toNumber.parse(true), 1);
      asserts.assertEquals(toNumber.parse(false), 0);
    });

    it('should chain transformations', () => {
      const guard = new BooleanGuardian()
        .toNumber()
        .process((num) => num * 100);

      asserts.assertEquals(guard.parse(true), 100);
      asserts.assertEquals(guard.parse(false), 0);
    });

    it('should transform with true/false', () => {
      const guard = new BooleanGuardian()
        .true()
        .toNumber();

      asserts.assertEquals(guard.parse(true), 1);
      asserts.assertThrows(() => guard.parse(false), GuardianError);
    });
  });

  describe('Error scenarios', () => {
    it('should coerce accepted strings, reject the rest', () => {
      const guard = new BooleanGuardian();

      // Coerce-by-default: the strict accepted list flows through.
      asserts.assertEquals(guard.parse('true'), true);
      asserts.assertEquals(guard.parse('false'), false);
      asserts.assertEquals(guard.parse('yes'), true);
      asserts.assertEquals(guard.parse('no'), false);
      asserts.assertEquals(guard.parse('1'), true);
      asserts.assertEquals(guard.parse('0'), false);

      // Strings outside the accepted set throw — no `Boolean('false')` footgun.
      asserts.assertThrows(() => guard.parse('maybe'), GuardianError);
      asserts.assertThrows(() => guard.parse('truthy'), GuardianError);
    });

    it('should coerce 0/1, reject other numbers', () => {
      const guard = new BooleanGuardian();

      asserts.assertEquals(guard.parse(1), true);
      asserts.assertEquals(guard.parse(0), false);

      // No silent truthification of arbitrary numbers.
      asserts.assertThrows(() => guard.parse(-1), GuardianError);
      asserts.assertThrows(() => guard.parse(2), GuardianError);
      asserts.assertThrows(() => guard.parse(Number.NaN), GuardianError);
    });

    it('should reject objects and arrays', () => {
      const guard = new BooleanGuardian();

      asserts.assertThrows(() => guard.parse({}), GuardianError);
      asserts.assertThrows(() => guard.parse([]), GuardianError);
      asserts.assertThrows(() => guard.parse([true]), GuardianError);
      asserts.assertThrows(() => guard.parse({ value: true }), GuardianError);
    });

    it('should provide clear error messages', () => {
      const guard = new BooleanGuardian();

      try {
        guard.parse('not a boolean');
        asserts.fail('Should have thrown');
      } catch (error) {
        asserts.assertInstanceOf(error, GuardianError);
        asserts.assert(error.message.includes('boolean'));
      }
    });
  });

  describe('SafeParse comprehensive', () => {
    it('should handle safeParse with transformations', () => {
      const guard = new BooleanGuardian().toNumber();

      const [error1, data1] = guard.safeParse(true);
      asserts.assertEquals(error1, null);
      asserts.assertEquals(data1, 1);

      const [error2, data2] = guard.safeParse('not boolean');
      asserts.assertInstanceOf(error2, GuardianError);
      asserts.assertEquals(data2, undefined);
    });

    it('should handle safeParse with true/false', () => {
      const guard = new BooleanGuardian().true();

      const [error1, data1] = guard.safeParse(true);
      asserts.assertEquals(error1, null);
      asserts.assertEquals(data1, true);

      const [error2, data2] = guard.safeParse(false);
      asserts.assertInstanceOf(error2, GuardianError);
      asserts.assertEquals(data2, undefined);
    });
  });

  describe('Async parseAsync comprehensive', () => {
    it('should handle parseAsync with sync operations', async () => {
      const guard = new BooleanGuardian();

      const result = await guard.parseAsync(true);
      asserts.assertEquals(result, true);
    });

    it('should handle parseAsync with async transformations', async () => {
      const guard = new BooleanGuardian().process(async (val) => {
        await new Promise((resolve) => setTimeout(resolve, 1));
        return val ? 'yes' : 'no';
      });

      const result = await guard.parseAsync(true);
      asserts.assertEquals(result, 'yes');
    });

    it('should handle parseAsync errors', async () => {
      const guard = new BooleanGuardian();

      let caught = false;
      try {
        await guard.parseAsync('not boolean');
      } catch (error) {
        caught = true;
        asserts.assertInstanceOf(error, GuardianError);
      }
      asserts.assert(caught);
    });
  });

  describe('OpenAPI generation', () => {
    it('should generate correct OpenAPI schema', () => {
      const guard = new BooleanGuardian();
      const schema = guard.toOpenAPI();

      asserts.assertEquals(schema.type, 'boolean');
    });

    it('should include metadata in OpenAPI schema', () => {
      const guard = new BooleanGuardian().describe({
        title: 'Active Flag',
        description: 'Whether the item is active',
        default: true,
      });

      const schema = guard.toOpenAPI();

      asserts.assertEquals(schema.type, 'boolean');
      asserts.assertEquals(schema.title, 'Active Flag');
      asserts.assertEquals(schema.description, 'Whether the item is active');
      asserts.assertEquals(schema.default, true);
    });

    it('should handle nullable in OpenAPI', () => {
      const guard = new BooleanGuardian().nullable();
      const schema = guard.toOpenAPI();

      asserts.assertEquals(schema.type, 'boolean');
      asserts.assertEquals(schema.nullable, true);
    });
  });
});
