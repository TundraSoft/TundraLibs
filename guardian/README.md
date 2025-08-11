# Guardian

Guardian is a type-safe validation library for TypeScript and JavaScript. It provides a fluent, chainable API for validating and transforming data.

## Features

- Type-safe validations with proper TypeScript inference
- Chain multiple validations together
- Detailed error messages with path information
- Support for nested objects and arrays
- Extensible design for custom validations
- Union type support with `oneOf`
- Automatic type coercion when appropriate
- **Clean null and undefined handling** with separate `optional()` and `nullable()` methods
- **Predictable behavior** with clear separation between null and undefined handling
- No dependencies

## Basic Usage

```typescript
import { Guardian } from '@tundralibs/guardian';

// Simple string validation
const nameValidator = Guardian.string().minLength(2).maxLength(50);
const validName = nameValidator('John'); // Returns: 'John'
nameValidator(123); // Throws: "Expected string, got number"

// Object validation with schema
const userValidator = Guardian.object().schema({
  name: Guardian.string().minLength(2),
  age: Guardian.number().min(18),
  email: Guardian.string().optional(), // Optional field, returns undefined if not provided
  roles: Guardian.array().of(Guardian.string()),
});

// Validate a user object
const user = userValidator({
  name: 'John',
  age: 30,
  roles: ['admin', 'user'],
});

// Union types
const idValidator = Guardian.oneOf([
  Guardian.string().pattern(/^\d+$/),
  Guardian.number().integer().positive(),
]);

const id1 = idValidator('123'); // Returns: '123'
const id2 = idValidator(456); // Returns: 456
idValidator('abc'); // Throws: "Expected value to match one of the types: string, number"

// Data transformation example (API reshaping)
// Input schema validation with strong typing
interface UserProfile {
  name: string;
  dob: Date;
  email: string;
  address: string;
  preferences?: {
    theme: string;
    notifications: boolean;
  };
}

// Define the input schema validator with proper types
const profileValidator = Guardian.object<UserProfile>().schema({
  name: Guardian.string().minLength(2),
  dob: Guardian.date(),
  email: Guardian.string().pattern(/^.+@.+\..+$/),
  address: Guardian.string(),
  preferences: Guardian.object().schema({
    theme: Guardian.string().in(['light', 'dark', 'system']),
    notifications: Guardian.boolean(),
  }).optional(),
});

// Transform to API format with different structure and validation
const apiFormatValidator = profileValidator.mutate((profile) => {
  // Parse name into components
  const nameParts = profile.name.split(' ');

  // Transform the validated profile data into a new structure
  return {
    FirstName: nameParts[0],
    LastName: nameParts.length > 1 ? nameParts.slice(1).join(' ') : '',
    Age: Math.floor(
      (Date.now() - profile.dob.getTime()) / (365.25 * 24 * 60 * 60 * 1000),
    ),
    Contact: {
      Email: profile.email,
      Address: parseAddress(profile.address),
    },
    AccountType: deriveAccountType(profile),
    JoinDate: new Date(),
    LastLogin: new Date(),
  };
}).pick(['FirstName', 'LastName', 'Age']);

// Helper functions
function parseAddress(address: string) {
  const parts = address.split(',').map((p) => p.trim());
  return {
    Line1: parts[0] || '',
    Line2: parts[1] || undefined,
    Line3: parts.length > 2 ? parts.slice(2).join(', ') : undefined,
  };
}

function deriveAccountType(profile: UserProfile): string {
  if (profile.email.endsWith('@admin.example.com')) return 'admin';
  if (profile.preferences?.theme === 'dark') return 'premium';
  return 'standard';
}

// Input data to validate and transform
const profile = {
  name: 'Jane Maria Smith',
  dob: new Date('1992-04-12'),
  email: 'jane.smith@admin.example.com',
  address: '456 Park Ave, Suite 10B, New York, NY 10022',
  preferences: {
    theme: 'dark',
    notifications: true,
  },
};

// Validate and transform in one step
const apiReadyData = apiFormatValidator(profile);
console.log(apiReadyData);
/* Result has the transformed structure with only selected fields:
{
  FirstName: 'Jane',
  LastName: 'Maria Smith',
  Age: 31
}
*/

// Real-world example: Validating an API response payload
const apiResponseValidator = Guardian.object().schema({
  data: Guardian.object().schema({
    user: Guardian.object().schema({
      id: Guardian.oneOf([
        Guardian.string().pattern(/^\d+$/),
        Guardian.number().integer().positive(),
      ]),
      name: Guardian.string().minLength(2),
      email: Guardian.string().optional(),
      roles: Guardian.array().of(Guardian.string()),
    }),
    posts: Guardian.array().of(
      Guardian.object().schema({
        id: Guardian.oneOf([
          Guardian.string().pattern(/^\d+$/),
          Guardian.number().integer().positive(),
        ]),
        title: Guardian.string().minLength(5),
        content: Guardian.string().minLength(20),
        tags: Guardian.array().of(Guardian.string()).optional(),
      }),
    ),
  }),
  meta: Guardian.object().schema({
    totalCount: Guardian.number().integer().positive(),
    pageCount: Guardian.number().integer().positive(),
  }),
});

// Validate an API response payload
const apiResponse = apiResponseValidator({
  data: {
    user: {
      id: '123',
      name: 'John Doe',
      email: 'john.doe@example.com',
      roles: ['admin', 'user'],
    },
    posts: [
      {
        id: 1,
        title: 'First Post',
        content: 'This is the content of the first post.',
        tags: ['tag1', 'tag2'],
      },
      {
        id: 2,
        title: 'Second Post',
        content: 'This is the content of the second post.',
      },
    ],
  },
  meta: {
    totalCount: 2,
    pageCount: 1,
  },
});
```

## Null and Undefined Handling

Guardian provides clean and predictable null and undefined handling with two separate methods that handle distinct concerns:

### `optional()` Method

The `optional()` method handles `undefined` values by providing default values or allowing them to pass through.

```typescript
import { Guardian } from '@tundralibs/guardian';

// Basic optional usage with default value
const nameValidator = Guardian.string().minLength(2).optional('Anonymous');

nameValidator('John'); // Returns: 'John'
nameValidator(undefined); // Returns: 'Anonymous'
nameValidator(null); // Passes null to underlying validator (would throw error)

// Optional without default value - allows undefined to pass through
const optionalString = Guardian.string().optional();
optionalString('hello'); // Returns: 'hello'
optionalString(undefined); // Returns: undefined
optionalString(null); // Passes null to underlying validator (would throw error)

// Optional with function-based default
const timestampValidator = Guardian.date().optional(() => new Date());
timestampValidator(undefined); // Returns: current Date
```

### `nullable()` Method

The `nullable()` method allows `null` values to pass through without validation.

```typescript
// Allow null values
const nullableString = Guardian.string().nullable();

nullableString('hello'); // Returns: 'hello'
nullableString(null); // Returns: null (passes through)
nullableString(undefined); // Passes to underlying validator (would throw error)

// Combining with other validations
const nullableEmail = Guardian.string().email().nullable();
nullableEmail('user@example.com'); // Returns: 'user@example.com'
nullableEmail(null); // Returns: null
nullableEmail('invalid'); // Throws: email validation error
```

### Combining `nullable()` and `optional()`

These methods work together to provide precise control over null and undefined handling:

```typescript
// Allow both null and undefined, with default for undefined
const flexibleValidator = Guardian.string()
  .nullable()
  .optional('default value');

flexibleValidator('hello'); // Returns: 'hello'
flexibleValidator(null); // Returns: null
flexibleValidator(undefined); // Returns: 'default value'

// Reject null but allow undefined with default
const strictValidator = Guardian.string()
  .notNull() // Built-in validation that rejects null
  .optional('default value');

strictValidator('hello'); // Returns: 'hello'
strictValidator(undefined); // Returns: 'default value'
strictValidator(null); // Throws: "Expected value to not be null"
```

### Real-World Usage Examples

#### API Response Validation

```typescript
// Handling API responses where null and undefined have different meanings
const userProfileValidator = Guardian.object().schema({
  id: Guardian.number(), // Required, no null/undefined allowed
  name: Guardian.string(), // Required
  email: Guardian.string().optional(), // undefined means not provided
  avatar: Guardian.string().nullable().optional('default-avatar.png'),
  // null means explicitly no avatar, undefined gets default
  preferences: Guardian.object().schema({
    theme: Guardian.string().optional('light'),
    notifications: Guardian.boolean().optional(true),
  }).optional({}), // Default to empty preferences object
});

// This validates and provides sensible defaults
const profile = userProfileValidator({
  id: 123,
  name: 'John Doe',
  email: undefined, // Uses undefined (no email provided)
  avatar: null, // Returns null (explicitly no avatar)
  // preferences omitted entirely - gets default empty object
});
```

#### Form Data Validation

```typescript
// Form validation with proper null/undefined distinction
const formValidator = Guardian.object().schema({
  firstName: Guardian.string(), // Required
  lastName: Guardian.string(), // Required
  middleName: Guardian.string().optional(), // Optional field - undefined if not provided
  age: Guardian.number().min(0).nullable().optional(), // Can be null or undefined
  subscribe: Guardian.boolean().optional(false), // Default to false if undefined
  notes: Guardian.string().nullable().optional(''), // Allow null, default to empty string
});

// Usage
const formData = formValidator({
  firstName: 'John',
  lastName: 'Doe',
  middleName: undefined, // Optional field not provided
  age: null, // Explicitly no age provided
  // subscribe omitted - gets default false
  notes: null, // Explicitly no notes - returns null
});
```

#### Environment Variable Validation

```typescript
// Environment variables - undefined means "not set", null shouldn't occur
const envValidator = Guardian.object().schema({
  NODE_ENV: Guardian.string().in(['development', 'production', 'test'])
    .optional('development'),
  PORT: Guardian.string().pattern(/^\d+$/).transform(parseInt).optional(3000),
  DATABASE_URL: Guardian.string(), // Required - no null/undefined allowed
  API_KEY: Guardian.string().optional(), // Optional but if provided, must be valid
  DEBUG: Guardian.string().nullable().optional('false'), // Can be explicitly null
});

const env = envValidator(process.env);
```

### Key Principles

1. **Separation of Concerns**:
   - `optional()` handles `undefined` values only
   - `nullable()` handles `null` values only
   - Use both when you need both behaviors

2. **Predictable Behavior**:
   - No complex configuration options
   - Clear, explicit method names
   - Composable and chainable

3. **Type Safety**:
   - TypeScript types correctly reflect nullable/optional behavior
   - IntelliSense shows accurate types throughout the chain

### Migration from Old API

If you were using the old `notNullable()` method or `treatNullAsUndefined` option:

```typescript
// Old approach (deprecated)
// const validator = Guardian.string().notNullable().optional('default', { treatNullAsUndefined: false });

// New approach - clean and explicit
const validator = Guardian.string()
  .notNull() // Use built-in notNull validation
  .optional('default'); // Only handles undefined

// Or if you need both null and undefined handling
const validator = Guardian.string()
  .nullable() // Allow null to pass through
  .optional('default'); // Provide default for undefined
```

## Performance

Guardian is designed to be performant while providing powerful validation features. You can run benchmarks using:

```bash
deno bench guardian
```

## License

MIT
