import { Guardian } from '../Guardian.ts';

// Simple assert functions
function assertEquals<T>(actual: T, expected: T, message?: string): void {
  // Handle arrays with deep comparison
  if (Array.isArray(actual) && Array.isArray(expected)) {
    if (actual.length !== expected.length) {
      throw new Error(
        message ||
          `Expected array of length ${expected.length}, got array of length ${actual.length}`,
      );
    }
    for (let i = 0; i < actual.length; i++) {
      if (actual[i] !== expected[i]) {
        throw new Error(
          message ||
            `Expected array[${i}] to be ${expected[i]}, got ${actual[i]}`,
        );
      }
    }
    return;
  }

  // Handle objects with deep comparison (basic)
  if (
    typeof actual === 'object' && typeof expected === 'object' &&
    actual !== null && expected !== null
  ) {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error(
        message ||
          `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
      );
    }
    return;
  }

  // Handle primitives
  if (actual !== expected) {
    throw new Error(message || `Expected ${expected}, got ${actual}`);
  }
}

function assertThrows(
  fn: () => void,
  ErrorClass?: ErrorConstructor,
  msgIncludes?: string,
): void {
  try {
    fn();
    throw new Error('Expected function to throw');
  } catch (error) {
    if (ErrorClass && !(error instanceof ErrorClass)) {
      throw new Error(
        `Expected ${ErrorClass.name}, got ${(error as Error).constructor.name}`,
      );
    }
    if (msgIncludes && !(error as Error).message.includes(msgIncludes)) {
      throw new Error(
        `Expected error message to include "${msgIncludes}", got "${
          (error as Error).message
        }"`,
      );
    }
  }
}

Deno.test('Guardian JSON Schema - Basic String Validation', () => {
  const schema = {
    type: 'string' as const,
    minLength: 3,
    maxLength: 10,
    trim: true,
  };

  const validator = Guardian.fromJSON(schema);

  // Valid cases
  assertEquals(validator('  hello  '), 'hello'); // Should be trimmed
  assertEquals(validator('test'), 'test');

  // Invalid cases
  assertThrows(() => validator('hi'), Error); // Too short
  assertThrows(() => validator('this is too long'), Error); // Too long
});

Deno.test('Guardian JSON Schema - Object Validation', () => {
  const schema = {
    type: 'object' as const,
    schema: {
      name: { type: 'string' as const, minLength: 1 },
      age: { type: 'number' as const, min: 0, max: 120, integer: true },
      email: { type: 'string' as const, email: true, optional: true },
    },
  };

  const validator = Guardian.fromJSON(schema);

  // Valid case
  const result = validator({
    name: 'John Doe',
    age: 30,
    email: 'john@example.com',
  });

  assertEquals(result.name, 'John Doe');
  assertEquals(result.age, 30);
  assertEquals(result.email, 'john@example.com');

  // Invalid cases
  assertThrows(() =>
    validator({
      name: '',
      age: 30,
    }), Error); // Empty name

  assertThrows(() =>
    validator({
      name: 'John',
      age: -5,
    }), Error); // Negative age

  assertThrows(() =>
    validator({
      name: 'John',
      age: 25,
      email: 'invalid-email',
    }), Error); // Invalid email
});

Deno.test('Guardian JSON Schema - Nested Objects', () => {
  const schema = {
    type: 'object' as const,
    schema: {
      user: {
        type: 'object' as const,
        schema: {
          profile: {
            type: 'object' as const,
            schema: {
              firstName: { type: 'string' as const, minLength: 1 },
              lastName: { type: 'string' as const, minLength: 1 },
            },
          },
        },
      },
    },
  };

  const validator = Guardian.fromJSON(schema);

  const result = validator({
    user: {
      profile: {
        firstName: 'John',
        lastName: 'Doe',
      },
    },
  });

  assertEquals(result.user.profile.firstName, 'John');
  assertEquals(result.user.profile.lastName, 'Doe');
});

Deno.test('Guardian JSON Schema - Array Validation', () => {
  const schema = {
    type: 'array' as const,
    of: { type: 'string' as const, minLength: 1 },
    minLength: 1,
    maxLength: 5,
  };

  const validator = Guardian.fromJSON(schema);

  // Valid case
  const result = validator(['hello', 'world']);
  assertEquals(result, ['hello', 'world']);

  // Invalid cases
  assertThrows(() => validator([]), Error); // Empty array
  assertThrows(() => validator(['', 'test']), Error); // Empty string element
  assertThrows(() => validator(['a', 'b', 'c', 'd', 'e', 'f']), Error); // Too many elements
});

Deno.test('Guardian JSON Schema - OneOf Validation', () => {
  const schema = {
    type: 'oneOf' as const,
    options: [
      { type: 'string' as const },
      { type: 'number' as const, positive: true },
      {
        type: 'object' as const,
        schema: {
          type: { type: 'string' as const, equals: 'special' },
          value: { type: 'string' as const },
        },
      },
    ],
  };

  const validator = Guardian.fromJSON(schema);

  // Valid cases
  assertEquals(validator('hello'), 'hello');
  assertEquals(validator(42), 42);

  const objResult = validator({ type: 'special', value: 'test' });
  assertEquals(objResult.type, 'special');
  assertEquals(objResult.value, 'test');

  // Invalid cases
  assertThrows(() => validator(true), Error); // Boolean not in union
  assertThrows(() => validator(-5), Error); // Negative number
  assertThrows(() => validator({ type: 'wrong', value: 'test' }), Error); // Wrong object type
});
