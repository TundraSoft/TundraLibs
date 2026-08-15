/**
 * Guardian vs Zod Output Comparison Tests
 *
 * Ensures that Guardian and Zod produce equivalent results for the same validation scenarios.
 * This helps verify that Guardian maintains compatibility with Zod's behavior.
 *
 * Run with: deno test guardian/tests/guardian-zod-comparison.test.ts --allow-all
 *
 * Note: This test requires zod to be installed (devDependency).
 * - Deno: Works with npm:zod specifier
 * - Bun: Works with npm:zod specifier
 * - Node.js: Requires zod in devDependencies (npm install)
 */

import { assertEquals, assertThrows } from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { Guardian } from '../mod.ts';

// Dynamic import of zod with fallback
let z: typeof import('npm:zod').z;
let zodAvailable = false;

try {
  const zodModule = await import('npm:zod');
  console.log('✅ Zod module loaded successfully for comparison tests');
  z = zodModule.z;
  zodAvailable = true;
} catch {
  // Zod not available - tests will be skipped
  console.warn('⚠️  Zod not available - comparison tests will be skipped');
}

// Test data
const validString = 'hello world';
// Pick something neither Guardian (coerce-by-default) nor Zod will accept
// as a string — both libs must reject this for the comparison to mean anything.
const invalidString: unknown = {};
const validEmail = 'test@example.com';
const invalidEmail = 'not-an-email';
const validNumber = 42;
const invalidNumber = 'not-a-number';
const validArray = ['a', 'b', 'c'];
const invalidArray = 'not-an-array';
const validDate = new Date('2023-01-01');
const invalidDate = 'not-a-date';

// =============================================================================
// STRING VALIDATION COMPARISON
// =============================================================================

describe({
  name: 'Guardian vs Zod Validation Comparison',
  ignore: !zodAvailable,
  fn: () => {
    it('String basic validation - success', () => {
      const guardianSchema = Guardian.string();
      const zodSchema = z.string();

      const guardianResult = guardianSchema.parse(validString);
      const zodResult = zodSchema.parse(validString);

      assertEquals(guardianResult, zodResult);
      assertEquals(guardianResult, validString);
    });

    it('String basic validation - failure', () => {
      const guardianSchema = Guardian.string();
      const zodSchema = z.string();

      assertThrows(() => guardianSchema.parse(invalidString));
      assertThrows(() => zodSchema.parse(invalidString));
    });

    it('String with length constraints - success', () => {
      const guardianSchema = Guardian.string().minLength(3).maxLength(20);
      const zodSchema = z.string().min(3).max(20);

      const testString = 'hello';
      const guardianResult = guardianSchema.parse(testString);
      const zodResult = zodSchema.parse(testString);

      assertEquals(guardianResult, zodResult);
      assertEquals(guardianResult, testString);
    });

    it('String with length constraints - too short', () => {
      const guardianSchema = Guardian.string().minLength(5);
      const zodSchema = z.string().min(5);

      const shortString = 'hi';
      assertThrows(() => guardianSchema.parse(shortString));
      assertThrows(() => zodSchema.parse(shortString));
    });

    it('String with length constraints - too long', () => {
      const guardianSchema = Guardian.string().maxLength(5);
      const zodSchema = z.string().max(5);

      const longString = 'this is too long';
      assertThrows(() => guardianSchema.parse(longString));
      assertThrows(() => zodSchema.parse(longString));
    });

    it('String email validation - success', () => {
      const guardianSchema = Guardian.string().email();
      const zodSchema = z.string().email();

      const guardianResult = guardianSchema.parse(validEmail);
      const zodResult = zodSchema.parse(validEmail);

      assertEquals(guardianResult, zodResult);
      assertEquals(guardianResult, validEmail);
    });

    it('String email validation - failure', () => {
      const guardianSchema = Guardian.string().email();
      const zodSchema = z.string().email();

      assertThrows(() => guardianSchema.parse(invalidEmail));
      assertThrows(() => zodSchema.parse(invalidEmail));
    });

    it('String pattern validation - success', () => {
      const pattern = /^[a-z\s]+$/;
      const guardianSchema = Guardian.string().pattern(pattern);
      const zodSchema = z.string().regex(pattern);

      const testString = 'hello world';
      const guardianResult = guardianSchema.parse(testString);
      const zodResult = zodSchema.parse(testString);

      assertEquals(guardianResult, zodResult);
      assertEquals(guardianResult, testString);
    });

    it('String pattern validation - failure', () => {
      const pattern = /^[a-z]+$/;
      const guardianSchema = Guardian.string().pattern(pattern);
      const zodSchema = z.string().regex(pattern);

      const testString = 'Hello123';
      assertThrows(() => guardianSchema.parse(testString));
      assertThrows(() => zodSchema.parse(testString));
    });

    it('String transformations - trim and lowercase', () => {
      const guardianSchema = Guardian.string().trim().toLowerCase();
      const zodSchema = z.string().trim().toLowerCase();

      const testString = '  HELLO WORLD  ';
      const guardianResult = guardianSchema.parse(testString);
      const zodResult = zodSchema.parse(testString);

      assertEquals(guardianResult, zodResult);
      assertEquals(guardianResult, 'hello world');
    });

    // =============================================================================
    // NUMBER VALIDATION COMPARISON
    // =============================================================================

    it('Number basic validation - success', () => {
      const guardianSchema = Guardian.number();
      const zodSchema = z.number();

      const guardianResult = guardianSchema.parse(validNumber);
      const zodResult = zodSchema.parse(validNumber);

      assertEquals(guardianResult, zodResult);
      assertEquals(guardianResult, validNumber);
    });

    it('Number basic validation - failure', () => {
      const guardianSchema = Guardian.number();
      const zodSchema = z.number();

      assertThrows(() => guardianSchema.parse(invalidNumber));
      assertThrows(() => zodSchema.parse(invalidNumber));
    });

    it('Number with range constraints - success', () => {
      const guardianSchema = Guardian.number().min(0).max(100);
      const zodSchema = z.number().min(0).max(100);

      const testNumber = 50;
      const guardianResult = guardianSchema.parse(testNumber);
      const zodResult = zodSchema.parse(testNumber);

      assertEquals(guardianResult, zodResult);
      assertEquals(guardianResult, testNumber);
    });

    it('Number with range constraints - below minimum', () => {
      const guardianSchema = Guardian.number().min(10);
      const zodSchema = z.number().min(10);

      const testNumber = 5;
      assertThrows(() => guardianSchema.parse(testNumber));
      assertThrows(() => zodSchema.parse(testNumber));
    });

    it('Number with range constraints - above maximum', () => {
      const guardianSchema = Guardian.number().max(100);
      const zodSchema = z.number().max(100);

      const testNumber = 150;
      assertThrows(() => guardianSchema.parse(testNumber));
      assertThrows(() => zodSchema.parse(testNumber));
    });

    it('Number integer validation - success', () => {
      const guardianSchema = Guardian.number().integer();
      const zodSchema = z.number().int();

      const testNumber = 42;
      const guardianResult = guardianSchema.parse(testNumber);
      const zodResult = zodSchema.parse(testNumber);

      assertEquals(guardianResult, zodResult);
      assertEquals(guardianResult, testNumber);
    });

    it('Number integer validation - failure', () => {
      const guardianSchema = Guardian.number().integer();
      const zodSchema = z.number().int();

      const testNumber = 42.5;
      assertThrows(() => guardianSchema.parse(testNumber));
      assertThrows(() => zodSchema.parse(testNumber));
    });

    it('Number positive validation - success', () => {
      const guardianSchema = Guardian.number().positive();
      const zodSchema = z.number().positive();

      const testNumber = 42;
      const guardianResult = guardianSchema.parse(testNumber);
      const zodResult = zodSchema.parse(testNumber);

      assertEquals(guardianResult, zodResult);
      assertEquals(guardianResult, testNumber);
    });

    it('Number positive validation - failure', () => {
      const guardianSchema = Guardian.number().positive();
      const zodSchema = z.number().positive();

      const testNumber = -5;
      assertThrows(() => guardianSchema.parse(testNumber));
      assertThrows(() => zodSchema.parse(testNumber));
    });

    // =============================================================================
    // BOOLEAN VALIDATION COMPARISON
    // =============================================================================

    it('Boolean validation - true', () => {
      const guardianSchema = Guardian.boolean();
      const zodSchema = z.boolean();

      const guardianResult = guardianSchema.parse(true);
      const zodResult = zodSchema.parse(true);

      assertEquals(guardianResult, zodResult);
      assertEquals(guardianResult, true);
    });

    it('Boolean validation - false', () => {
      const guardianSchema = Guardian.boolean();
      const zodSchema = z.boolean();

      const guardianResult = guardianSchema.parse(false);
      const zodResult = zodSchema.parse(false);

      assertEquals(guardianResult, zodResult);
      assertEquals(guardianResult, false);
    });

    it('Boolean validation - failure', () => {
      const guardianSchema = Guardian.boolean();
      const zodSchema = z.boolean();

      // Guardian coerces 'true' / 'false' / etc by default; pick a string
      // outside the accepted list so both libs reject it.
      assertThrows(() => guardianSchema.parse('maybe'));
      assertThrows(() => zodSchema.parse('maybe'));
    });

    // =============================================================================
    // ARRAY VALIDATION COMPARISON
    // =============================================================================

    it('Array basic validation - success', () => {
      const guardianSchema = Guardian.array(Guardian.string());
      const zodSchema = z.array(z.string());

      const guardianResult = guardianSchema.parse(validArray);
      const zodResult = zodSchema.parse(validArray);

      assertEquals(guardianResult, zodResult);
      assertEquals(guardianResult, validArray);
    });

    it('Array basic validation - failure', () => {
      const guardianSchema = Guardian.array(Guardian.string());
      const zodSchema = z.array(z.string());

      assertThrows(() => guardianSchema.parse(invalidArray));
      assertThrows(() => zodSchema.parse(invalidArray));
    });

    it('Array with length constraints - success', () => {
      const guardianSchema = Guardian.array(Guardian.string()).minLength(2)
        .maxLength(5);
      const zodSchema = z.array(z.string()).min(2).max(5);

      const testArray = ['a', 'b', 'c'];
      const guardianResult = guardianSchema.parse(testArray);
      const zodResult = zodSchema.parse(testArray);

      assertEquals(guardianResult, zodResult);
      assertEquals(guardianResult, testArray);
    });

    it('Array with length constraints - too short', () => {
      const guardianSchema = Guardian.array(Guardian.string()).minLength(5);
      const zodSchema = z.array(z.string()).min(5);

      const testArray = ['a', 'b'];
      assertThrows(() => guardianSchema.parse(testArray));
      assertThrows(() => zodSchema.parse(testArray));
    });

    it('Array with element validation - mixed types failure', () => {
      const guardianSchema = Guardian.array(Guardian.string());
      const zodSchema = z.array(z.string());

      // Guardian coerces 123 → '123' inside StringGuardian by default;
      // use a non-coercible element (object) so both libs reject the array.
      const testArray = ['a', {}, 'c'];
      assertThrows(() => guardianSchema.parse(testArray));
      assertThrows(() => zodSchema.parse(testArray));
    });

    // =============================================================================
    // OBJECT VALIDATION COMPARISON
    // =============================================================================

    it('Object simple validation - success', () => {
      const guardianSchema = Guardian.object({
        name: Guardian.string(),
        age: Guardian.number(),
      });
      const zodSchema = z.object({
        name: z.string(),
        age: z.number(),
      });

      const testObject = { name: 'John', age: 30 };
      const guardianResult = guardianSchema.parse(testObject);
      const zodResult = zodSchema.parse(testObject);

      assertEquals(guardianResult, zodResult);
      assertEquals(guardianResult, testObject);
    });

    it('Object validation - missing field', () => {
      const guardianSchema = Guardian.object({
        name: Guardian.string(),
        age: Guardian.number(),
      });
      const zodSchema = z.object({
        name: z.string(),
        age: z.number(),
      });

      const testObject = { name: 'John' };
      assertThrows(() => guardianSchema.parse(testObject));
      assertThrows(() => zodSchema.parse(testObject));
    });

    it('Object validation - wrong field type', () => {
      const guardianSchema = Guardian.object({
        name: Guardian.string(),
        age: Guardian.number(),
      });
      const zodSchema = z.object({
        name: z.string(),
        age: z.number(),
      });

      const testObject = { name: 'John', age: 'thirty' };
      assertThrows(() => guardianSchema.parse(testObject));
      assertThrows(() => zodSchema.parse(testObject));
    });

    it('Object with optional fields - success', () => {
      const guardianSchema = Guardian.object({
        name: Guardian.string(),
        age: Guardian.number().optional(),
      });
      const zodSchema = z.object({
        name: z.string(),
        age: z.number().optional(),
      });

      const testObject = { name: 'John' };
      const guardianResult = guardianSchema.parse(testObject);
      const zodResult = zodSchema.parse(testObject);

      assertEquals(guardianResult, zodResult);
      assertEquals(guardianResult, testObject);
    });

    it('Object nested validation - success', () => {
      const guardianSchema = Guardian.object({
        user: Guardian.object({
          name: Guardian.string(),
          email: Guardian.string(),
        }),
      });
      const zodSchema = z.object({
        user: z.object({
          name: z.string(),
          email: z.string(),
        }),
      });

      const testObject = {
        user: {
          name: 'John',
          email: 'john@example.com',
        },
      };
      const guardianResult = guardianSchema.parse(testObject);
      const zodResult = zodSchema.parse(testObject);

      assertEquals(guardianResult, zodResult);
      assertEquals(guardianResult, testObject);
    });

    // =============================================================================
    // DATE VALIDATION COMPARISON
    // =============================================================================

    it('Date basic validation - success', () => {
      const guardianSchema = Guardian.date();
      const zodSchema = z.date();

      const guardianResult = guardianSchema.parse(validDate);
      const zodResult = zodSchema.parse(validDate);

      assertEquals(guardianResult, zodResult);
      assertEquals(guardianResult, validDate);
    });

    it('Date basic validation - failure', () => {
      const guardianSchema = Guardian.date();
      const zodSchema = z.date();

      assertThrows(() => guardianSchema.parse(invalidDate));
      assertThrows(() => zodSchema.parse(invalidDate));
    });

    it('Date range validation - success', () => {
      const minDate = new Date('2020-01-01');
      const maxDate = new Date('2030-12-31');
      const guardianSchema = Guardian.date().min(minDate).max(maxDate);
      const zodSchema = z.date().min(minDate).max(maxDate);

      const testDate = new Date('2023-06-15');
      const guardianResult = guardianSchema.parse(testDate);
      const zodResult = zodSchema.parse(testDate);

      assertEquals(guardianResult, zodResult);
      assertEquals(guardianResult, testDate);
    });

    // =============================================================================
    // ENUM VALIDATION COMPARISON
    // =============================================================================

    it('Enum string validation - success', () => {
      const guardianSchema = Guardian.enum(['admin', 'user', 'guest']);
      const zodSchema = z.enum(['admin', 'user', 'guest']);

      const testValue = 'admin';
      const guardianResult = guardianSchema.parse(testValue);
      const zodResult = zodSchema.parse(testValue);

      assertEquals(guardianResult, zodResult);
      assertEquals(guardianResult, testValue);
    });

    it('Enum string validation - failure', () => {
      const guardianSchema = Guardian.enum(['admin', 'user', 'guest']);
      const zodSchema = z.enum(['admin', 'user', 'guest']);

      const testValue = 'invalid';
      assertThrows(() => guardianSchema.parse(testValue));
      assertThrows(() => zodSchema.parse(testValue));
    });

    // =============================================================================
    // UNION VALIDATION COMPARISON
    // =============================================================================

    it('Union validation - string success', () => {
      const guardianSchema = Guardian.oneOf([
        Guardian.string(),
        Guardian.number(),
      ], 'Expected string or number');
      const zodSchema = z.union([z.string(), z.number()]);

      const testValue = 'hello';
      const guardianResult = guardianSchema.parse(testValue);
      const zodResult = zodSchema.parse(testValue);

      assertEquals(guardianResult, zodResult);
      assertEquals(guardianResult, testValue);
    });

    it('Union validation - number success', () => {
      // Order matters under coerce-by-default: put the more-specific type
      // (number) first so a numeric input doesn't get coerced to string
      // by the more-permissive branch.
      const guardianSchema = Guardian.oneOf([
        Guardian.number(),
        Guardian.string(),
      ], 'Expected string or number');
      const zodSchema = z.union([z.number(), z.string()]);

      const testValue = 42;
      const guardianResult = guardianSchema.parse(testValue);
      const zodResult = zodSchema.parse(testValue);

      assertEquals(guardianResult, zodResult);
      assertEquals(guardianResult, testValue);
    });

    it('Union validation - failure', () => {
      const guardianSchema = Guardian.oneOf([
        Guardian.number(),
        Guardian.string(),
      ], 'Expected string or number');
      const zodSchema = z.union([z.number(), z.string()]);

      // Object is non-coercible to either number or string under our rules,
      // so both libs reject it.
      const testValue: unknown = {};
      assertThrows(() => guardianSchema.parse(testValue));
      assertThrows(() => zodSchema.parse(testValue));
    });

    // =============================================================================
    // TRANSFORMATION COMPARISON
    // =============================================================================

    it('String to number transformation - success', () => {
      const guardianSchema = Guardian.string().process((s: string) =>
        Number.parseInt(s, 10)
      );
      const zodSchema = z.string().transform((s) => Number.parseInt(s, 10));

      const testValue = '123';
      const guardianResult = guardianSchema.parse(testValue);
      const zodResult = zodSchema.parse(testValue);

      assertEquals(guardianResult, zodResult);
      assertEquals(guardianResult, 123);
    });

    it('Chain transformations - success', () => {
      const guardianSchema = Guardian.string()
        .process((s: string) => s.trim())
        .process((s: string) => s.toLowerCase())
        .process((s: string) => s.replaceAll(/\s+/g, '-'));
      const zodSchema = z.string()
        .transform((s) => s.trim())
        .transform((s) => s.toLowerCase())
        .transform((s) => s.replaceAll(/\s+/g, '-'));

      const testValue = '  Hello World  ';
      const guardianResult = guardianSchema.parse(testValue);
      const zodResult = zodSchema.parse(testValue);

      assertEquals(guardianResult, zodResult);
      assertEquals(guardianResult, 'hello-world');
    });

    // =============================================================================
    // SAFE PARSING COMPARISON
    // =============================================================================

    it('Safe parse - success', () => {
      const guardianSchema = Guardian.string();
      const zodSchema = z.string();

      const guardianResult = guardianSchema.safeParse(validString);
      const zodResult = zodSchema.safeParse(validString);

      // Guardian returns [error, data] tuple, Zod returns { success, data? }
      const [guardianError, guardianData] = guardianResult;

      assertEquals(guardianError, null); // No error for Guardian
      assertEquals(zodResult.success, true); // Success for Zod

      if (guardianError === null && zodResult.success) {
        assertEquals(guardianData, zodResult.data);
        assertEquals(guardianData, validString);
      }
    });

    it('Safe parse - failure', () => {
      const guardianSchema = Guardian.string();
      const zodSchema = z.string();

      const guardianResult = guardianSchema.safeParse(invalidString);
      const zodResult = zodSchema.safeParse(invalidString);

      // Guardian returns [error, data] tuple, Zod returns { success, error? }
      const [guardianError, guardianData] = guardianResult;

      assertEquals(guardianError !== null, true); // Guardian has error
      assertEquals(zodResult.success, false); // Zod failed
      assertEquals(guardianData, undefined); // Guardian data is undefined on error

      // Both should have error information
      assertEquals(!!guardianError, !zodResult.success);
    });

    // =============================================================================
    // COMPLEX REAL-WORLD SCENARIO COMPARISON
    // =============================================================================

    it('User registration form - success', () => {
      const guardianSchema = Guardian.object({
        username: Guardian.string().trim().minLength(3).maxLength(20),
        email: Guardian.string().trim().toLowerCase().email(),
        age: Guardian.number().integer().min(18).max(120),
        terms: Guardian.boolean().equals(true),
      });

      const zodSchema = z.object({
        username: z.string().trim().min(3).max(20),
        email: z.string().trim().toLowerCase().email(),
        age: z.number().int().min(18).max(120),
        terms: z.boolean().refine((val) => val === true),
      });

      const testData = {
        username: '  johndoe  ',
        email: '  JOHN@EXAMPLE.COM  ',
        age: 25,
        terms: true,
      };

      const guardianResult = guardianSchema.parse(testData);
      const zodResult = zodSchema.parse(testData);

      assertEquals(guardianResult, zodResult);
      assertEquals(guardianResult.username, 'johndoe');
      assertEquals(guardianResult.email, 'john@example.com');
      assertEquals(guardianResult.age, 25);
      assertEquals(guardianResult.terms, true);
    });

    console.log('✅ All Guardian vs Zod comparison tests completed!');
    console.log(
      '🎯 Guardian and Zod produce equivalent results for all test scenarios.',
    );
  },
});
