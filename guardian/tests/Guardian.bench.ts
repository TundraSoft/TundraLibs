import { Guardian } from '../Guardian.ts';

// Sample data for testing
const validString = 'hello world';
const validObject = { name: 'John', age: 30, email: 'john@example.com' };
const validArray = [1, 2, 3, 4, 5];

// Simple validation benchmarks
Deno.bench('String validation - Direct check', () => {
  if (typeof validString !== 'string' || validString.length < 3) {
    throw new Error('Invalid string');
  }
});

Deno.bench('String validation - Guardian', () => {
  Guardian.string().minLength(3)(validString);
});

// Object validation benchmarks
Deno.bench('Object validation - Direct check', () => {
  if (
    typeof validObject !== 'object' || validObject === null ||
    typeof validObject.name !== 'string' || validObject.name.length < 2 ||
    typeof validObject.age !== 'number' || validObject.age < 18 ||
    (validObject.email !== undefined && typeof validObject.email !== 'string')
  ) {
    throw new Error('Invalid object');
  }
});

Deno.bench('Object validation - Guardian', () => {
  Guardian.object().schema({
    name: Guardian.string().minLength(2),
    age: Guardian.number().min(18),
    email: Guardian.string().optional(),
  })(validObject);
});

// Array validation benchmarks
Deno.bench('Array validation - Direct check', () => {
  if (!Array.isArray(validArray)) {
    throw new Error('Not an array');
  }

  for (const item of validArray) {
    if (typeof item !== 'number' || item < 0) {
      throw new Error('Invalid array item');
    }
  }
});

Deno.bench('Array validation - Guardian', () => {
  Guardian.array().of(Guardian.number().min(0))(validArray);
});

// Complex validation chains
Deno.bench('Complex validation - Direct check', () => {
  if (
    typeof validObject !== 'object' ||
    validObject === null ||
    !('name' in validObject) ||
    !('age' in validObject) ||
    typeof validObject.name !== 'string' ||
    validObject.name.length < 2 ||
    typeof validObject.age !== 'number' ||
    validObject.age < 18 ||
    (validObject.email !== undefined &&
      typeof validObject.email !== 'string') ||
    Object.keys(validObject).some((key) =>
      !['name', 'age', 'email'].includes(key)
    )
  ) {
    throw new Error('Invalid object');
  }
});

Deno.bench('Complex validation - Guardian', () => {
  Guardian.object()
    .schema({
      name: Guardian.string().minLength(2),
      age: Guardian.number().min(18),
      email: Guardian.string().optional(),
    }, { strict: true })(validObject);
});

// Union type validation
Deno.bench('Union type validation - Direct check', () => {
  const id: unknown = '123';
  if (
    (typeof id !== 'string' && typeof id !== 'number') ||
    (typeof id === 'string' && !/^\d+$/.test(id)) ||
    (typeof id === 'number' && (id < 0 || !Number.isInteger(id)))
  ) {
    throw new Error('Invalid ID');
  }
});

Deno.bench('Union type validation - Guardian', () => {
  const idGuard = Guardian.oneOf([
    Guardian.string().pattern(/^\d+$/),
    Guardian.number().integer().min(0),
  ]);
  idGuard('123');
});

// Nested object validation
const nestedObject = {
  user: {
    profile: {
      name: 'John',
      contact: {
        email: 'john@example.com',
        phone: '1234567890',
      },
    },
    settings: {
      theme: 'dark',
      notifications: true,
    },
  },
  posts: [
    { id: 1, title: 'Hello World', tags: ['tech', 'news'] },
    { id: 2, title: 'Guardian Library', tags: ['tech', 'typescript'] },
  ],
};

Deno.bench('Nested object validation - Guardian', () => {
  const postGuard = Guardian.object().schema({
    id: Guardian.number().positive(),
    title: Guardian.string().minLength(1),
    tags: Guardian.array().of(Guardian.string()),
  });

  Guardian.object().schema({
    user: Guardian.object().schema({
      profile: Guardian.object().schema({
        name: Guardian.string(),
        contact: Guardian.object().schema({
          email: Guardian.string(),
          phone: Guardian.string(),
        }),
      }),
      settings: Guardian.object().schema({
        theme: Guardian.string().in(['light', 'dark']),
        notifications: Guardian.boolean(),
      }),
    }),
    posts: Guardian.array().of(postGuard),
  })(nestedObject);
});

// Optional fields test
Deno.bench('Optional fields - Direct check', () => {
  const obj = { name: 'John', age: 30 };

  if (
    typeof obj !== 'object' || obj === null ||
    typeof obj.name !== 'string' ||
    typeof obj.age !== 'number' ||
    ('email' in obj && typeof obj.email !== 'string')
  ) {
    throw new Error('Invalid object');
  }
});

Deno.bench('Optional fields - Guardian', () => {
  Guardian.object().schema({
    name: Guardian.string(),
    age: Guardian.number(),
    email: Guardian.string().optional(),
  })({ name: 'John', age: 30 });
});

// Error case benchmarks
Deno.bench('Error handling - Direct check', () => {
  try {
    const value = 'not a number';
    if (typeof value !== 'number') {
      throw new Error(`Expected number, got ${typeof value}`);
    }
  } catch {
    // Silently catch the error
  }
});

Deno.bench('Error handling - Guardian', () => {
  try {
    Guardian.number()('not a number');
  } catch {
    // Silently catch the error
  }
});
