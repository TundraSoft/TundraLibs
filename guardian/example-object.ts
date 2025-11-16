#!/usr/bin/env -S deno run --allow-read --allow-write --allow-env

/**
 * ObjectGuardian Example
 *
 * This example demonstrates the comprehensive ObjectGuardian functionality
 * including validation modes, schema manipulation, and error handling.
 */

import { Guardian, GuardianError } from './mod.ts';

console.log('🛡️  ObjectGuardian Example\n');

// 1. Basic object validation
console.log('1. Basic Object Validation');
console.log('========================');

const userSchema = Guardian.object({
  id: Guardian.number().positive(),
  name: Guardian.string().minLength(2),
  email: Guardian.string().email(),
  age: Guardian.number().min(0).max(120).optional(),
});

try {
  const validUser = userSchema.parse({
    id: 1,
    name: 'John Doe',
    email: 'john@example.com',
    age: 30,
    // Extra properties are allowed by default (passthrough mode)
    preferences: { theme: 'dark' },
  });

  console.log('✓ Valid user:', validUser);
} catch (error) {
  console.log('✗ Validation failed:', (error as Error).message);
}

// 2. Validation modes
console.log('\n2. Validation Modes');
console.log('==================');

// Strict mode - rejects extra properties
console.log('\nStrict Mode:');
const strictSchema = userSchema.strict();
try {
  strictSchema.parse({
    id: 1,
    name: 'John',
    email: 'john@example.com',
    extraProp: 'not allowed', // This will cause an error
  });
} catch {
  console.log('✓ Strict mode correctly rejected extra property');
}

// Strip mode - removes extra properties
console.log('\nStrip Mode:');
const stripSchema = userSchema.strip();
const strippedResult = stripSchema.parse({
  id: 1,
  name: 'John',
  email: 'john@example.com',
  extraProp: 'will be removed',
});
console.log('✓ Strip mode result (extra property removed):', strippedResult);

// 3. Schema manipulation
console.log('\n3. Schema Manipulation');
console.log('=====================');

// Pick specific properties
const publicUserSchema = userSchema.pick('id', 'name', 'email');
const publicUser = publicUserSchema.parse({
  id: 1,
  name: 'John',
  email: 'john@example.com',
});
console.log('✓ Picked properties:', publicUser);

// Omit sensitive properties
const safeUserSchema = userSchema.omit('id');
const safeUser = safeUserSchema.parse({
  name: 'John',
  email: 'john@example.com',
  age: 30,
});
console.log('✓ Omitted id property:', safeUser);

// Make all properties optional
const partialUserSchema = userSchema.partial();
const partialUser = partialUserSchema.parse({
  name: 'John', // Only name provided, others are optional
});
console.log('✓ Partial schema (all optional):', partialUser);

// Extend schema with new properties
const extendedUserSchema = userSchema.extend({
  role: Guardian.enum(['admin', 'user', 'guest']),
  createdAt: Guardian.date(),
});

const extendedUser = extendedUserSchema.parse({
  id: 1,
  name: 'John',
  email: 'john@example.com',
  role: 'admin',
  createdAt: new Date(),
});
console.log('✓ Extended schema:', extendedUser);

// 4. Nested objects
console.log('\n4. Nested Objects');
console.log('================');

const addressSchema = Guardian.object({
  street: Guardian.string(),
  city: Guardian.string(),
  zipCode: Guardian.string().regex(/^\d{5}$/),
});

const userWithAddressSchema = Guardian.object({
  id: Guardian.number(),
  name: Guardian.string(),
  address: addressSchema,
  workAddress: addressSchema.optional(),
});

const userWithAddress = userWithAddressSchema.parse({
  id: 1,
  name: 'John',
  address: {
    street: '123 Main St',
    city: 'Anytown',
    zipCode: '12345',
  },
});
console.log('✓ Nested object validation:', userWithAddress);

// 5. Object transformation
console.log('\n5. Object Transformation');
console.log('========================');

const nameSchema = Guardian.object({
  firstName: Guardian.string(),
  lastName: Guardian.string(),
}).transform((data) => ({
  fullName: `${data.firstName} ${data.lastName}`,
  initials: `${data.firstName[0]}${data.lastName[0]}`,
}));

const transformedName = nameSchema.parse({
  firstName: 'John',
  lastName: 'Doe',
});
console.log('✓ Transformed object:', transformedName);

// 6. Error handling
console.log('\n6. Error Handling');
console.log('================');

try {
  userSchema.parse({
    id: -1, // Invalid: should be positive
    name: 'J', // Invalid: too short
    email: 'invalid-email', // Invalid: not an email
    age: 150, // Invalid: too old
  });
} catch (error) {
  console.log('✓ Multiple validation errors caught:');
  console.log('  Error:', (error as Error).message);
  if ((error as GuardianError).cause) {
    console.log('  Property errors:');
    for (
      const [prop, propError] of Object.entries(
        (error as GuardianError).listCauses(),
      )
    ) {
      console.log(`    - ${prop}: ${propError}`);
    }
  }
}

// 7. SafeParse for non-throwing validation
console.log('\n7. SafeParse');
console.log('===========');

const [error, data] = userSchema.safeParse({
  id: 1,
  name: 'John',
  email: 'john@example.com',
});

if (error) {
  console.log('✗ Validation failed:', error.message);
} else {
  console.log('✓ SafeParse success:', data);
}

// 8. Real-world example: API request validation
console.log('\n8. Real-World Example: API Request');
console.log('=================================');

const createUserRequestSchema = Guardian.object({
  name: Guardian.string().minLength(2).maxLength(50),
  email: Guardian.string().email(),
  password: Guardian.string().minLength(8),
  age: Guardian.number().min(13).optional(),
  terms: Guardian.boolean().true(), // Must accept terms
}).strict(); // Reject any extra fields

const apiRequestData = {
  name: 'Jane Smith',
  email: 'jane@example.com',
  password: 'securepassword123',
  age: 25,
  terms: true,
};

try {
  const validatedRequest = createUserRequestSchema.parse(apiRequestData);
  console.log('✓ API request validated:', validatedRequest);

  // Transform to database model (omit password for logging)
  const userForDb = createUserRequestSchema
    .omit('password', 'terms')
    .extend({
      id: Guardian.number(),
      createdAt: Guardian.date(),
    })
    .parse({
      ...validatedRequest,
      id: Math.floor(Math.random() * 1000),
      createdAt: new Date(),
    });

  console.log('✓ Database model:', userForDb);
} catch (error) {
  console.log('✗ API request validation failed:', (error as Error).message);
}

console.log('\n🎉 ObjectGuardian example completed!');
