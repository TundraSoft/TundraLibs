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
