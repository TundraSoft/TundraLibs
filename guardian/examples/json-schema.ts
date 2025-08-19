import { Guardian } from '../Guardian.ts';
import { GuardianType } from '@tundralibs/guardian';
import type { GuardianSchema } from '../types/mod.ts';

// Example usage of Guardian JSON functionality

// 1. Basic string validation schema
const stringSchema: GuardianSchema = {
  type: 'string',
  minLength: 3,
  maxLength: 20,
  trim: true,
};

// 2. Complex object validation schema
const userSchema: GuardianSchema = {
  type: 'object',
  schema: {
    id: {
      type: 'oneOf',
      options: [
        { type: 'string', uuid: true },
        { type: 'number', positive: true },
      ],
    },
    profile: {
      type: 'object',
      schema: {
        firstName: { type: 'string', minLength: 1, maxLength: 50, trim: true },
        lastName: { type: 'string', minLength: 1, maxLength: 50, trim: true },
        email: { type: 'string', email: true },
        age: { type: 'number', min: 0, max: 120, integer: true },
        avatar: {
          type: 'object',
          optional: true,
          schema: {
            url: { type: 'string', url: true },
            width: { type: 'number', positive: true, integer: true },
            height: { type: 'number', positive: true, integer: true },
          },
        },
      },
    },
    roles: {
      type: 'array',
      of: { type: 'string', in: ['admin', 'user', 'moderator'] },
      notEmpty: true,
      unique: true,
    },
    preferences: {
      type: 'object',
      schema: {
        theme: { type: 'string', in: ['light', 'dark', 'auto'] },
        notifications: { type: 'boolean' },
        language: {
          type: 'string',
          optional: true,
          in: ['en', 'es', 'fr', 'de'],
        },
      },
    },
    metadata: {
      type: 'object',
      optional: true,
      additionalProperties: true,
    },
  },
  strict: false,
  additionalProperties: false,
};

// 3. Array of mixed types
const mixedArraySchema: GuardianSchema = {
  type: 'array',
  of: {
    type: 'oneOf',
    options: [
      { type: 'string' },
      { type: 'number' },
      {
        type: 'object',
        schema: {
          type: { type: 'string', equals: 'special' },
          value: { type: 'string' },
        },
      },
    ],
  },
  minLength: 1,
  maxLength: 100,
};

// Example usage functions
export function demonstrateJSONGuardians() {
  console.log('=== Guardian JSON Schema Examples ===\\n');

  // Create guardians from JSON schemas
  const stringValidator = Guardian.fromJSON(stringSchema);
  const userValidator = Guardian.fromJSON(userSchema);
  const mixedArrayValidator = Guardian.fromJSON(mixedArraySchema);

  // Test string validation
  console.log('1. String Validation:');
  try {
    const validString = stringValidator('  hello world  '); // Should be trimmed
    console.log('✓ Valid string:', validString);
  } catch (error) {
    console.log('✗ String validation failed:', (error as Error).message);
  }

  // Test invalid string
  try {
    stringValidator('hi'); // Too short
  } catch (error) {
    console.log(
      '✓ Expected validation error for short string:',
      (error as Error).message,
    );
  }

  console.log('\\n2. User Object Validation:');
  const validUser = {
    id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    profile: {
      firstName: '  John  ',
      lastName: '  Doe  ',
      email: 'john.doe@example.com',
      age: 30,
      avatar: {
        url: 'https://example.com/avatar.jpg',
        width: 200,
        height: 200,
      },
    },
    roles: ['user', 'admin'],
    preferences: {
      theme: 'dark',
      notifications: true,
      language: 'en',
    },
  };

  try {
    const validatedUser = userValidator(validUser);
    console.log('✓ Valid user object validated successfully');
    console.log('  - First name (trimmed):', validatedUser.profile.firstName);
    console.log('  - Roles:', validatedUser.roles);
  } catch (error) {
    console.log('✗ User validation failed:', (error as Error).message);
  }

  console.log('\\n3. Mixed Array Validation:');
  const mixedArray = [
    'hello',
    42,
    { type: 'special', value: 'test' },
    'world',
    3.14,
  ];

  try {
    const validatedArray = mixedArrayValidator(mixedArray);
    console.log('✓ Mixed array validated successfully:', validatedArray);
  } catch (error) {
    console.log('✗ Mixed array validation failed:', (error as Error).message);
  }

  console.log('\\n=== JSON Schema Export Examples ===\\n');

  // Create some guardians programmatically
  const programmaticStringGuard = Guardian.string().minLength(5).maxLength(100)
    .trim();

  // Note: toJSON implementation is basic and may not capture all validation rules
  // This would require storing validation metadata in guardian instances
  console.log('4. Export to JSON (Basic Implementation):');
  try {
    const exportedStringSchema = Guardian.serialize(programmaticStringGuard);
    console.log(
      '✓ Exported string schema:',
      JSON.stringify(exportedStringSchema, null, 2),
    );
  } catch (error) {
    console.log('✗ Export failed:', (error as Error).message);
  }
}

// Schema examples for documentation
export const schemaExamples = {
  // Simple validation schemas
  email: { type: 'string', email: true } as GuardianSchema,
  positiveInteger: {
    type: 'number',
    positive: true,
    integer: true,
  } as GuardianSchema,
  uuid: { type: 'string', uuid: true } as GuardianSchema,

  // Complex nested schemas
  userProfile: {
    type: 'object',
    schema: {
      name: { type: 'string', minLength: 1, maxLength: 100 },
      email: { type: 'string', email: true },
      age: { type: 'number', min: 0, max: 120, optional: true },
      tags: {
        type: 'array',
        of: { type: 'string' },
        optional: true,
      },
    },
  } as GuardianSchema,

  // Union type schemas
  stringOrNumber: {
    type: 'oneOf',
    options: [
      { type: 'string' },
      { type: 'number' },
    ],
  } as GuardianSchema,

  // API response schema
  apiResponse: {
    type: 'object',
    schema: {
      success: { type: 'boolean' },
      data: {
        type: 'oneOf',
        options: [
          { type: 'object', additionalProperties: true },
          { type: 'array', of: { type: 'unknown' } },
          { type: 'string' },
          { type: 'number' },
        ],
      },
      error: {
        type: 'object',
        optional: true,
        schema: {
          message: { type: 'string' },
          code: { type: 'number', optional: true },
        },
      },
      pagination: {
        type: 'object',
        optional: true,
        schema: {
          page: { type: 'number', min: 1, integer: true },
          limit: { type: 'number', min: 1, max: 100, integer: true },
          total: { type: 'number', min: 0, integer: true },
        },
      },
    },
  } as GuardianSchema,
};
