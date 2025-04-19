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
  email: Guardian.string().optional(),
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

  // Create API-ready object with a different structure
  return Guardian.object().schema({
    FirstName: Guardian.string().minLength(1),
    LastName: Guardian.string(),
    Age: Guardian.number().min(0).max(120),
    Contact: Guardian.object().schema({
      Email: Guardian.string().pattern(/^.+@.+\..+$/),
      Address: Guardian.object().schema({
        Line1: Guardian.string().minLength(1),
        Line2: Guardian.string().optional(),
        Line3: Guardian.string().optional(),
      }),
    }),
    // Additional validation on the transformed data
    AccountType: Guardian.string().in(['standard', 'premium', 'admin'])
      .optional('standard'),
  })({
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
    // Additional properties computed from the source data
    JoinDate: new Date(),
    LastLogin: new Date(),
  });
});

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
/* Result has the transformed structure with additional validation:
{
  FirstName: 'Jane',
  LastName: 'Maria Smith',
  Age: 31,
  Contact: {
    Email: 'jane.smith@admin.example.com',
    Address: {
      Line1: '456 Park Ave',
      Line2: 'Suite 10B',
      Line3: 'New York, NY 10022'
    }
  },
  AccountType: 'admin',
  JoinDate: Date(...),
  LastLogin: Date(...)
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

## Performance

Guardian is designed to be performant while providing powerful validation features. You can run benchmarks using:

```bash
deno bench guardian
```

## License

MIT
