/**
 * Example usage of the Guardian validation library.
 * This file demonstrates various patterns and use cases.
 */

import { Guardian } from './mod.ts';

// Basic string validation
const nameSchema = Guardian.string()
  .minLength(2, 'Name must be at least 2 characters')
  .maxLength(50, 'Name cannot exceed 50 characters')
  .trim()
  .nonEmpty('Name is required');

// Email validation with transformations
const emailSchema = Guardian.string()
  .trim()
  .toLowerCase()
  .email('Please enter a valid email address');

// Number validation with ranges
const ageSchema = Guardian.number()
  .integer('Age must be a whole number')
  .min(0, 'Age cannot be negative')
  .max(150, 'Age cannot exceed 150');

// String to number transformation
const stringToNumberSchema = Guardian.string()
  .regex(/^\d+(\.\d+)?$/, 'Must be a valid number string')
  .toNumber();

// String to integer transformation
const stringToIntSchema = Guardian.string()
  .regex(/^\d+$/, 'Must be digits only')
  .toInt();

// Usage examples
function demonstrateUsage() {
  console.log('=== Guardian Validation Library Examples ===');
  console.log('');

  // Basic validation
  console.log('1. Basic String Validation:');
  try {
    const name = nameSchema.parse('  John Doe  ');
    console.log(`✓ Valid name: "${name}"`);
  } catch (error) {
    console.log(`✗ Error: ${(error as Error).message}`);
  }

  try {
    nameSchema.parse('J');
  } catch (error) {
    console.log(`✗ Invalid name: ${(error as Error).message}`);
  }

  // Email validation
  console.log('');
  console.log('2. Email Validation:');
  try {
    const email = emailSchema.parse('  JOHN@EXAMPLE.COM  ');
    console.log(`✓ Valid email: "${email}"`);
  } catch (error) {
    console.log(`✗ Error: ${(error as Error).message}`);
  }

  // Number validation
  console.log('');
  console.log('3. Number Validation:');
  try {
    const age = ageSchema.parse(25);
    console.log(`✓ Valid age: ${age}`);
  } catch (error) {
    console.log(`✗ Error: ${(error as Error).message}`);
  }

  try {
    ageSchema.parse(200);
  } catch (error) {
    console.log(`✗ Invalid age: ${(error as Error).message}`);
  }

  // String to number transformation
  console.log('');
  console.log('4. String to Number Transformation:');
  try {
    const number = stringToNumberSchema.parse('123.45');
    console.log(`✓ Converted to number: ${number} (type: ${typeof number})`);
  } catch (error) {
    console.log(`✗ Error: ${(error as Error).message}`);
  }

  try {
    stringToNumberSchema.parse('not-a-number');
  } catch (error) {
    console.log(`✗ Invalid number string: ${(error as Error).message}`);
  }

  // String to integer transformation
  console.log('');
  console.log('5. String to Integer Transformation:');
  try {
    const integer = stringToIntSchema.parse('42');
    console.log(`✓ Converted to integer: ${integer} (type: ${typeof integer})`);
  } catch (error) {
    console.log(`✗ Error: ${(error as Error).message}`);
  }

  try {
    stringToIntSchema.parse('3.14');
  } catch (error) {
    console.log(`✗ Invalid integer string: ${(error as Error).message}`);
  }

  // Safe parsing
  console.log('');
  console.log('6. Safe Parsing:');
  const safeResult = nameSchema.safeParse('Valid Name');
  const [safeError, safeData] = safeResult;
  if (safeError === null) {
    console.log(`✓ Safe parse success: "${safeData}"`);
  } else {
    console.log(`✗ Safe parse error: ${safeError.message}`);
  }

  const unsafeResult = nameSchema.safeParse('');
  const [unsafeError, unsafeData] = unsafeResult;
  if (unsafeError === null) {
    console.log(`✓ Safe parse success: "${unsafeData}"`);
  } else {
    console.log(`✗ Safe parse error: ${unsafeError.message}`);
  }

  // Chained operations
  console.log('');
  console.log('7. Chained Operations:');
  const chainedSchema = Guardian.string()
    .trim()
    .toLowerCase()
    .minLength(3)
    .step(
      (value: string) => value.replace(/\s+/g, '-'),
      'Replace spaces with dashes',
    );

  try {
    const result = chainedSchema.parse('  Hello World  ');
    console.log(`✓ Chained result: "${result}"`);
  } catch (error) {
    console.log(`✗ Chained error: ${(error as Error).message}`);
  }

  // Number operations
  console.log('');
  console.log('8. Number Operations:');
  const mathSchema = Guardian.number()
    .positive()
    .min(1)
    .step(
      (value: number) => Math.round(value * 100) / 100,
      'Round to 2 decimals',
    );

  try {
    const result = mathSchema.parse(3.14159);
    console.log(`✓ Math result: ${result}`);
  } catch (error) {
    console.log(`✗ Math error: ${(error as Error).message}`);
  }

  // Value equality validations
  console.log('');
  console.log('9. Value Equality Validations:');

  // Exact value matching
  const exactValue = Guardian.string().equals('admin');
  try {
    console.log(`✓ Exact match: "${exactValue.parse('admin')}"`);
  } catch (error) {
    console.log(`✗ Exact match error: ${(error as Error).message}`);
  }

  try {
    exactValue.parse('user');
  } catch (error) {
    console.log(`✗ Invalid exact value: ${(error as Error).message}`);
  }

  // Not equals validation
  const notEmpty = Guardian.string().notEquals('');
  try {
    console.log(`✓ Non-empty string: "${notEmpty.parse('hello')}"`);
  } catch (error) {
    console.log(`✗ Not empty error: ${(error as Error).message}`);
  }

  try {
    notEmpty.parse('');
  } catch (error) {
    console.log(`✗ Empty string rejected: ${(error as Error).message}`);
  }

  // Inclusion validation
  const validColor = Guardian.string().in(['red', 'green', 'blue']);
  try {
    console.log(`✓ Valid color: "${validColor.parse('red')}"`);
  } catch (error) {
    console.log(`✗ Color validation error: ${(error as Error).message}`);
  }

  try {
    validColor.parse('yellow');
  } catch (error) {
    console.log(`✗ Invalid color: ${(error as Error).message}`);
  }

  // Exclusion validation
  const safeContent = Guardian.string().notIn(['spam', 'scam', 'phishing']);
  try {
    console.log(`✓ Safe content: "${safeContent.parse('hello world')}"`);
  } catch (error) {
    console.log(`✗ Safe content error: ${(error as Error).message}`);
  }

  try {
    safeContent.parse('spam');
  } catch (error) {
    console.log(`✗ Unsafe content blocked: ${(error as Error).message}`);
  }

  // Number-based validations
  const validGrade = Guardian.number().in([1, 2, 3, 4, 5]);
  try {
    console.log(`✓ Valid grade: ${validGrade.parse(4)}`);
  } catch (error) {
    console.log(`✗ Grade validation error: ${(error as Error).message}`);
  }
}

// Run examples
if (import.meta.main) {
  demonstrateUsage();
}
