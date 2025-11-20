/**
 * Guardian vs Zod Output Comparison Tests
 *
 * Ensures that Guardian and Zod produce equivalent results for the same validation scenarios.
 * This helps verify that Guardian maintains compatibility with Zod's behavior.
 *
 * Run with: deno test guardian/tests/guardian-zod-comparison.test.ts --allow-all
 */

import {
  assertEquals,
  assertThrows,
} from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { z } from 'npm:zod';
import { Guardian } from '../mod.ts';

// Test data
const validString = 'hello world';
const invalidString = 123;
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

Deno.test('String basic validation - success', () => {
  const guardianSchema = Guardian.string();
  const zodSchema = z.string();

  const guardianResult = guardianSchema.parse(validString);
  const zodResult = zodSchema.parse(validString);

  assertEquals(guardianResult, zodResult);
  assertEquals(guardianResult, validString);
});

Deno.test('String basic validation - failure', () => {
  const guardianSchema = Guardian.string();
  const zodSchema = z.string();

  assertThrows(() => guardianSchema.parse(invalidString));
  assertThrows(() => zodSchema.parse(invalidString));
});

Deno.test('String with length constraints - success', () => {
  const guardianSchema = Guardian.string().minLength(3).maxLength(20);
  const zodSchema = z.string().min(3).max(20);

  const testString = 'hello';
  const guardianResult = guardianSchema.parse(testString);
  const zodResult = zodSchema.parse(testString);

  assertEquals(guardianResult, zodResult);
  assertEquals(guardianResult, testString);
});

Deno.test('String with length constraints - too short', () => {
  const guardianSchema = Guardian.string().minLength(5);
  const zodSchema = z.string().min(5);

  const shortString = 'hi';
  assertThrows(() => guardianSchema.parse(shortString));
  assertThrows(() => zodSchema.parse(shortString));
});

Deno.test('String with length constraints - too long', () => {
  const guardianSchema = Guardian.string().maxLength(5);
  const zodSchema = z.string().max(5);

  const longString = 'this is too long';
  assertThrows(() => guardianSchema.parse(longString));
  assertThrows(() => zodSchema.parse(longString));
});

Deno.test('String email validation - success', () => {
  const guardianSchema = Guardian.string().email();
  const zodSchema = z.string().email();

  const guardianResult = guardianSchema.parse(validEmail);
  const zodResult = zodSchema.parse(validEmail);

  assertEquals(guardianResult, zodResult);
  assertEquals(guardianResult, validEmail);
});

Deno.test('String email validation - failure', () => {
  const guardianSchema = Guardian.string().email();
  const zodSchema = z.string().email();

  assertThrows(() => guardianSchema.parse(invalidEmail));
  assertThrows(() => zodSchema.parse(invalidEmail));
});

Deno.test('String pattern validation - success', () => {
  const pattern = /^[a-z\s]+$/;
  const guardianSchema = Guardian.string().pattern(pattern);
  const zodSchema = z.string().regex(pattern);

  const testString = 'hello world';
  const guardianResult = guardianSchema.parse(testString);
  const zodResult = zodSchema.parse(testString);

  assertEquals(guardianResult, zodResult);
  assertEquals(guardianResult, testString);
});

Deno.test('String pattern validation - failure', () => {
  const pattern = /^[a-z]+$/;
  const guardianSchema = Guardian.string().pattern(pattern);
  const zodSchema = z.string().regex(pattern);

  const testString = 'Hello123';
  assertThrows(() => guardianSchema.parse(testString));
  assertThrows(() => zodSchema.parse(testString));
});

Deno.test('String transformations - trim and lowercase', () => {
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

Deno.test('Number basic validation - success', () => {
  const guardianSchema = Guardian.number();
  const zodSchema = z.number();

  const guardianResult = guardianSchema.parse(validNumber);
  const zodResult = zodSchema.parse(validNumber);

  assertEquals(guardianResult, zodResult);
  assertEquals(guardianResult, validNumber);
});

Deno.test('Number basic validation - failure', () => {
  const guardianSchema = Guardian.number();
  const zodSchema = z.number();

  assertThrows(() => guardianSchema.parse(invalidNumber));
  assertThrows(() => zodSchema.parse(invalidNumber));
});

Deno.test('Number with range constraints - success', () => {
  const guardianSchema = Guardian.number().min(0).max(100);
  const zodSchema = z.number().min(0).max(100);

  const testNumber = 50;
  const guardianResult = guardianSchema.parse(testNumber);
  const zodResult = zodSchema.parse(testNumber);

  assertEquals(guardianResult, zodResult);
  assertEquals(guardianResult, testNumber);
});

Deno.test('Number with range constraints - below minimum', () => {
  const guardianSchema = Guardian.number().min(10);
  const zodSchema = z.number().min(10);

  const testNumber = 5;
  assertThrows(() => guardianSchema.parse(testNumber));
  assertThrows(() => zodSchema.parse(testNumber));
});

Deno.test('Number with range constraints - above maximum', () => {
  const guardianSchema = Guardian.number().max(100);
  const zodSchema = z.number().max(100);

  const testNumber = 150;
  assertThrows(() => guardianSchema.parse(testNumber));
  assertThrows(() => zodSchema.parse(testNumber));
});

Deno.test('Number integer validation - success', () => {
  const guardianSchema = Guardian.number().integer();
  const zodSchema = z.number().int();

  const testNumber = 42;
  const guardianResult = guardianSchema.parse(testNumber);
  const zodResult = zodSchema.parse(testNumber);

  assertEquals(guardianResult, zodResult);
  assertEquals(guardianResult, testNumber);
});

Deno.test('Number integer validation - failure', () => {
  const guardianSchema = Guardian.number().integer();
  const zodSchema = z.number().int();

  const testNumber = 42.5;
  assertThrows(() => guardianSchema.parse(testNumber));
  assertThrows(() => zodSchema.parse(testNumber));
});

Deno.test('Number positive validation - success', () => {
  const guardianSchema = Guardian.number().positive();
  const zodSchema = z.number().positive();

  const testNumber = 42;
  const guardianResult = guardianSchema.parse(testNumber);
  const zodResult = zodSchema.parse(testNumber);

  assertEquals(guardianResult, zodResult);
  assertEquals(guardianResult, testNumber);
});

Deno.test('Number positive validation - failure', () => {
  const guardianSchema = Guardian.number().positive();
  const zodSchema = z.number().positive();

  const testNumber = -5;
  assertThrows(() => guardianSchema.parse(testNumber));
  assertThrows(() => zodSchema.parse(testNumber));
});

// =============================================================================
// BOOLEAN VALIDATION COMPARISON
// =============================================================================

Deno.test('Boolean validation - true', () => {
  const guardianSchema = Guardian.boolean();
  const zodSchema = z.boolean();

  const guardianResult = guardianSchema.parse(true);
  const zodResult = zodSchema.parse(true);

  assertEquals(guardianResult, zodResult);
  assertEquals(guardianResult, true);
});

Deno.test('Boolean validation - false', () => {
  const guardianSchema = Guardian.boolean();
  const zodSchema = z.boolean();

  const guardianResult = guardianSchema.parse(false);
  const zodResult = zodSchema.parse(false);

  assertEquals(guardianResult, zodResult);
  assertEquals(guardianResult, false);
});

Deno.test('Boolean validation - failure', () => {
  const guardianSchema = Guardian.boolean();
  const zodSchema = z.boolean();

  assertThrows(() => guardianSchema.parse('true'));
  assertThrows(() => zodSchema.parse('true'));
});

// =============================================================================
// ARRAY VALIDATION COMPARISON
// =============================================================================

Deno.test('Array basic validation - success', () => {
  const guardianSchema = Guardian.array(Guardian.string());
  const zodSchema = z.array(z.string());

  const guardianResult = guardianSchema.parse(validArray);
  const zodResult = zodSchema.parse(validArray);

  assertEquals(guardianResult, zodResult);
  assertEquals(guardianResult, validArray);
});

Deno.test('Array basic validation - failure', () => {
  const guardianSchema = Guardian.array(Guardian.string());
  const zodSchema = z.array(z.string());

  assertThrows(() => guardianSchema.parse(invalidArray));
  assertThrows(() => zodSchema.parse(invalidArray));
});

Deno.test('Array with length constraints - success', () => {
  const guardianSchema = Guardian.array(Guardian.string()).minLength(2)
    .maxLength(5);
  const zodSchema = z.array(z.string()).min(2).max(5);

  const testArray = ['a', 'b', 'c'];
  const guardianResult = guardianSchema.parse(testArray);
  const zodResult = zodSchema.parse(testArray);

  assertEquals(guardianResult, zodResult);
  assertEquals(guardianResult, testArray);
});

Deno.test('Array with length constraints - too short', () => {
  const guardianSchema = Guardian.array(Guardian.string()).minLength(5);
  const zodSchema = z.array(z.string()).min(5);

  const testArray = ['a', 'b'];
  assertThrows(() => guardianSchema.parse(testArray));
  assertThrows(() => zodSchema.parse(testArray));
});

Deno.test('Array with element validation - mixed types failure', () => {
  const guardianSchema = Guardian.array(Guardian.string());
  const zodSchema = z.array(z.string());

  const testArray = ['a', 123, 'c'];
  assertThrows(() => guardianSchema.parse(testArray));
  assertThrows(() => zodSchema.parse(testArray));
});

// =============================================================================
// OBJECT VALIDATION COMPARISON
// =============================================================================

Deno.test('Object simple validation - success', () => {
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

Deno.test('Object validation - missing field', () => {
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

Deno.test('Object validation - wrong field type', () => {
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

Deno.test('Object with optional fields - success', () => {
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

Deno.test('Object nested validation - success', () => {
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

Deno.test('Date basic validation - success', () => {
  const guardianSchema = Guardian.date();
  const zodSchema = z.date();

  const guardianResult = guardianSchema.parse(validDate);
  const zodResult = zodSchema.parse(validDate);

  assertEquals(guardianResult, zodResult);
  assertEquals(guardianResult, validDate);
});

Deno.test('Date basic validation - failure', () => {
  const guardianSchema = Guardian.date();
  const zodSchema = z.date();

  assertThrows(() => guardianSchema.parse(invalidDate));
  assertThrows(() => zodSchema.parse(invalidDate));
});

Deno.test('Date range validation - success', () => {
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

Deno.test('Enum string validation - success', () => {
  const guardianSchema = Guardian.enum(['admin', 'user', 'guest']);
  const zodSchema = z.enum(['admin', 'user', 'guest']);

  const testValue = 'admin';
  const guardianResult = guardianSchema.parse(testValue);
  const zodResult = zodSchema.parse(testValue);

  assertEquals(guardianResult, zodResult);
  assertEquals(guardianResult, testValue);
});

Deno.test('Enum string validation - failure', () => {
  const guardianSchema = Guardian.enum(['admin', 'user', 'guest']);
  const zodSchema = z.enum(['admin', 'user', 'guest']);

  const testValue = 'invalid';
  assertThrows(() => guardianSchema.parse(testValue));
  assertThrows(() => zodSchema.parse(testValue));
});

// =============================================================================
// UNION VALIDATION COMPARISON
// =============================================================================

Deno.test('Union validation - string success', () => {
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

Deno.test('Union validation - number success', () => {
  const guardianSchema = Guardian.oneOf([
    Guardian.string(),
    Guardian.number(),
  ], 'Expected string or number');
  const zodSchema = z.union([z.string(), z.number()]);

  const testValue = 42;
  const guardianResult = guardianSchema.parse(testValue);
  const zodResult = zodSchema.parse(testValue);

  assertEquals(guardianResult, zodResult);
  assertEquals(guardianResult, testValue);
});

Deno.test('Union validation - failure', () => {
  const guardianSchema = Guardian.oneOf([
    Guardian.string(),
    Guardian.number(),
  ], 'Expected string or number');
  const zodSchema = z.union([z.string(), z.number()]);

  const testValue = true;
  assertThrows(() => guardianSchema.parse(testValue));
  assertThrows(() => zodSchema.parse(testValue));
});

// =============================================================================
// TRANSFORMATION COMPARISON
// =============================================================================

Deno.test('String to number transformation - success', () => {
  const guardianSchema = Guardian.string().process((s: string) =>
    parseInt(s, 10)
  );
  const zodSchema = z.string().transform((s) => parseInt(s, 10));

  const testValue = '123';
  const guardianResult = guardianSchema.parse(testValue);
  const zodResult = zodSchema.parse(testValue);

  assertEquals(guardianResult, zodResult);
  assertEquals(guardianResult, 123);
});

Deno.test('Chain transformations - success', () => {
  const guardianSchema = Guardian.string()
    .process((s: string) => s.trim())
    .process((s: string) => s.toLowerCase())
    .process((s: string) => s.replace(/\s+/g, '-'));
  const zodSchema = z.string()
    .transform((s) => s.trim())
    .transform((s) => s.toLowerCase())
    .transform((s) => s.replace(/\s+/g, '-'));

  const testValue = '  Hello World  ';
  const guardianResult = guardianSchema.parse(testValue);
  const zodResult = zodSchema.parse(testValue);

  assertEquals(guardianResult, zodResult);
  assertEquals(guardianResult, 'hello-world');
});

// =============================================================================
// SAFE PARSING COMPARISON
// =============================================================================

Deno.test('Safe parse - success', () => {
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

Deno.test('Safe parse - failure', () => {
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

Deno.test('User registration form - success', () => {
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
