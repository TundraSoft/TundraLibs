# Guardian OpenAPI Integration

Guardian provides comprehensive OpenAPI 3.0 schema generation from your validation schemas, enabling a "validate once, document everywhere" approach for your APIs. This eliminates the need to maintain separate validation logic and API documentation.

## Table of Contents

- [Quick Start](#quick-start)
- [Core Concepts](#core-concepts)
- [API Reference](#api-reference)
- [Schema Generation](#schema-generation)
- [Framework Integration](#framework-integration)
- [Advanced Usage](#advanced-usage)
- [Best Practices](#best-practices)
- [Examples](#examples)

## Quick Start

### Installation

```bash
deno add @tundralibs/guardian
```

### Basic Example

```typescript
import { Guardian } from '@tundralibs/guardian';

// Define a schema with descriptions
const userSchema = Guardian.object()
  .describe('User profile information', {
    title: 'User',
    examples: [{
      name: 'John Doe',
      email: 'john@example.com',
      age: 30,
    }],
  })
  .schema({
    name: Guardian.string()
      .describe('Full name of the user')
      .minLength(1),
    email: Guardian.string()
      .describe('Email address for contact')
      .email(),
    age: Guardian.number()
      .describe('Age in years')
      .min(0)
      .max(150)
      .integer(),
  });

// Use for validation
const userData = { name: 'Alice', email: 'alice@example.com', age: 28 };
const validatedUser = userSchema(userData);

// Generate OpenAPI schema
const openApiSchema = userSchema.openapi();
console.log(JSON.stringify(openApiSchema, null, 2));
```

## Core Concepts

### Schema Description

The `describe()` method adds human-readable metadata to your schemas:

```typescript
const guardian = Guardian.string()
  .describe('A descriptive explanation of this field', {
    title: 'Short Title', // Optional short title
    examples: ['example1', 'example2'], // Optional array of examples
    deprecated: false, // Optional deprecation flag
  });
```

### OpenAPI Generation

The `openapi()` method converts Guardian schemas to OpenAPI 3.0 compatible objects:

```typescript
const schema = Guardian.string().email().openapi();
// Returns: { type: 'string', format: 'email' }
```

## API Reference

### `describe(description, options?)`

Adds descriptive metadata to a Guardian schema.

**Parameters:**

- `description` (string): Human-readable description of the schema
- `options` (object, optional):
  - `title` (string): Short title for the schema
  - `examples` (array): Array of example valid values
  - `deprecated` (boolean): Mark as deprecated

**Returns:** GuardianProxy with metadata attached

**Example:**

```typescript
const emailGuardian = Guardian.string()
  .describe('User email address for authentication and notifications', {
    title: 'Email Address',
    examples: ['user@example.com', 'admin@company.org'],
    deprecated: false,
  })
  .email();
```

### `openapi()`

Generates an OpenAPI 3.0 schema object from the Guardian.

**Returns:** OpenAPI schema object

**Example:**

```typescript
const schema = Guardian.number()
  .describe('User age in years')
  .min(18)
  .max(120)
  .integer()
  .openapi();

// Result:
{
  "type": "integer",
  "description": "User age in years",
  "minimum": 18,
  "maximum": 120
}
```

## Schema Generation

### Type Mapping

Guardian types map to OpenAPI types as follows:

| Guardian Type                 | OpenAPI Type | Format      | Notes                      |
| ----------------------------- | ------------ | ----------- | -------------------------- |
| `Guardian.string()`           | `string`     | -           | Basic string type          |
| `Guardian.string().email()`   | `string`     | `email`     | Email validation           |
| `Guardian.string().uuid()`    | `string`     | `uuid`      | UUID format                |
| `Guardian.string().url()`     | `string`     | `uri`       | URL format                 |
| `Guardian.number()`           | `number`     | -           | Floating point number      |
| `Guardian.number().integer()` | `integer`    | -           | Whole number               |
| `Guardian.bigint()`           | `integer`    | `int64`     | 64-bit integer             |
| `Guardian.boolean()`          | `boolean`    | -           | Boolean value              |
| `Guardian.date()`             | `string`     | `date-time` | ISO 8601 timestamp         |
| `Guardian.array()`            | `array`      | -           | Array with item schema     |
| `Guardian.object()`           | `object`     | -           | Object with properties     |
| `Guardian.unknown()`          | `object`     | -           | Any value (no constraints) |

### Constraint Detection

Guardian automatically detects and includes validation constraints in OpenAPI schemas:

```typescript
const ageGuardian = Guardian.number()
  .describe('User age')
  .min(18)
  .max(120)
  .integer();

const schema = ageGuardian.openapi();
// Result:
{
  "type": "integer",
  "description": "User age",
  "minimum": 18,
  "maximum": 120
}
```

### Complex Schemas

#### Object Schemas

```typescript
const addressSchema = Guardian.object()
  .describe('Mailing address information')
  .schema({
    street: Guardian.string().describe('Street address'),
    city: Guardian.string().describe('City name'),
    zipCode: Guardian.string()
      .describe('Postal code')
      .pattern(/^\d{5}(-\d{4})?$/),
    country: Guardian.string()
      .describe('Country code')
      .length(2)
      .optional(),
  });

const openApiSchema = addressSchema.openapi();
```

#### Array Schemas

```typescript
const tagsSchema = Guardian.array()
  .describe('List of user tags')
  .of(Guardian.string().describe('Tag name'))
  .minItems(1)
  .maxItems(10);

const openApiSchema = tagsSchema.openapi();
```

#### Union Types (OneOf)

```typescript
const idSchema = Guardian.oneOf([
  Guardian.string().uuid().describe('UUID identifier'),
  Guardian.number().integer().positive().describe('Numeric ID'),
]).describe('Unique identifier');

const openApiSchema = idSchema.openapi();
```

## Framework Integration

### Deno Fresh

```typescript
import { Handlers } from '$fresh/server.ts';
import { Guardian } from '@tundralibs/guardian';

// Define request/response schemas
const createUserRequest = Guardian.object()
  .describe('User creation request')
  .schema({
    name: Guardian.string().describe('User full name').minLength(1),
    email: Guardian.string().describe('User email').email(),
    age: Guardian.number().describe('User age').min(18).integer(),
  });

const userResponse = Guardian.object()
  .describe('User creation response')
  .schema({
    success: Guardian.boolean().describe('Operation success'),
    data: Guardian.object().schema({
      id: Guardian.string().uuid().describe('User ID'),
      name: Guardian.string().describe('User name'),
      email: Guardian.string().describe('User email'),
      createdAt: Guardian.string().describe('Creation timestamp'),
    }),
  });

export const handler: Handlers = {
  async POST(req) {
    try {
      const body = await req.json();
      const validatedData = createUserRequest(body);

      // Your business logic here
      const user = await createUser(validatedData);

      return Response.json({
        success: true,
        data: user,
      });
    } catch (error) {
      return Response.json(
        { success: false, error: error.message },
        { status: 400 },
      );
    }
  },
};

// Generate OpenAPI documentation endpoint
export const openApiHandler: Handlers = {
  GET() {
    const spec = {
      openapi: '3.0.3',
      info: {
        title: 'User API',
        version: '1.0.0',
      },
      paths: {
        '/users': {
          post: {
            summary: 'Create user',
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: createUserRequest.openapi(),
                },
              },
            },
            responses: {
              '200': {
                description: 'User created successfully',
                content: {
                  'application/json': {
                    schema: userResponse.openapi(),
                  },
                },
              },
            },
          },
        },
      },
    };

    return Response.json(spec);
  },
};
```

### Express.js (Node.js)

```typescript
import express from 'express';
import { Guardian } from '@tundralibs/guardian';

const app = express();
app.use(express.json());

// Schema definitions
const userSchema = Guardian.object()
  .describe('User data')
  .schema({
    name: Guardian.string().minLength(1),
    email: Guardian.string().email(),
    age: Guardian.number().min(18).integer(),
  });

// API endpoint with validation
app.post('/users', (req, res) => {
  try {
    const validatedData = userSchema(req.body);
    // Process validatedData...
    res.json({ success: true, data: validatedData });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

// OpenAPI spec endpoint
app.get('/api-docs.json', (req, res) => {
  const spec = {
    openapi: '3.0.3',
    info: { title: 'My API', version: '1.0.0' },
    components: {
      schemas: {
        User: userSchema.openapi(),
      },
    },
  };
  res.json(spec);
});
```

### Hono

```typescript
import { Hono } from 'hono';
import { Guardian } from '@tundralibs/guardian';

const app = new Hono();

const userSchema = Guardian.object()
  .describe('User information')
  .schema({
    name: Guardian.string().minLength(1),
    email: Guardian.string().email(),
  });

app.post('/users', async (c) => {
  try {
    const body = await c.req.json();
    const validatedData = userSchema(body);

    // Your logic here
    return c.json({ success: true, data: validatedData });
  } catch (error) {
    return c.json({ success: false, error: error.message }, 400);
  }
});

// OpenAPI documentation
app.get('/openapi.json', (c) => {
  return c.json({
    openapi: '3.0.3',
    info: { title: 'Hono API', version: '1.0.0' },
    components: {
      schemas: {
        User: userSchema.openapi(),
      },
    },
  });
});
```

## Advanced Usage

### Reusable Schema Components

```typescript
// Define reusable components
const EmailGuardian = Guardian.string()
  .describe('Email address with validation')
  .email();

const IdGuardian = Guardian.string()
  .describe('UUID identifier')
  .uuid();

const TimestampGuardian = Guardian.string()
  .describe('ISO 8601 timestamp');

// Use in multiple schemas
const UserGuardian = Guardian.object()
  .describe('User entity')
  .schema({
    id: IdGuardian,
    email: EmailGuardian,
    createdAt: TimestampGuardian,
    updatedAt: TimestampGuardian.optional(),
  });

const CreateUserGuardian = Guardian.object()
  .describe('User creation request')
  .schema({
    email: EmailGuardian,
    name: Guardian.string().describe('Full name').minLength(1),
  });
```

### Nested Schema References

```typescript
const AddressGuardian = Guardian.object()
  .describe('Physical address')
  .schema({
    street: Guardian.string().describe('Street address'),
    city: Guardian.string().describe('City'),
    country: Guardian.string().describe('Country code').length(2),
  });

const UserGuardian = Guardian.object()
  .describe('User with address')
  .schema({
    name: Guardian.string().describe('Full name'),
    address: AddressGuardian,
    billingAddress: AddressGuardian.optional(),
  });

// Generate complete schema tree
const userSchema = UserGuardian.openapi();
// Address schema is automatically included
```

### Custom Schema Extensions

```typescript
// Add custom properties to OpenAPI schemas
const customGuardian = Guardian.string()
  .describe('Custom field with extensions')
  .email();

const schema = customGuardian.openapi();
// Add custom OpenAPI extensions
schema['x-validation-level'] = 'strict';
schema['x-field-category'] = 'authentication';

console.log(schema);
// {
//   "type": "string",
//   "format": "email",
//   "description": "Custom field with extensions",
//   "x-validation-level": "strict",
//   "x-field-category": "authentication"
// }
```

### Complete API Specification

```typescript
// Define all schemas for a complete API
const schemas = {
  // Request schemas
  CreateUserRequest: Guardian.object()
    .describe('Request to create a new user')
    .schema({
      name: Guardian.string().describe('Full name').minLength(1),
      email: Guardian.string().describe('Email address').email(),
      age: Guardian.number().describe('Age in years').min(18).integer(),
    }),

  UpdateUserRequest: Guardian.object()
    .describe('Request to update user information')
    .schema({
      name: Guardian.string().describe('Updated name').minLength(1).optional(),
      email: Guardian.string().describe('Updated email').email().optional(),
      age: Guardian.number().describe('Updated age').min(18).integer()
        .optional(),
    }),

  // Response schemas
  UserResponse: Guardian.object()
    .describe('Single user response')
    .schema({
      success: Guardian.boolean().describe('Operation success'),
      data: Guardian.object().schema({
        id: Guardian.string().uuid().describe('User ID'),
        name: Guardian.string().describe('User name'),
        email: Guardian.string().describe('User email'),
        age: Guardian.number().describe('User age'),
        createdAt: Guardian.string().describe('Creation timestamp'),
        updatedAt: Guardian.string().describe('Last update timestamp'),
      }),
    }),

  UserListResponse: Guardian.object()
    .describe('Paginated user list response')
    .schema({
      success: Guardian.boolean().describe('Operation success'),
      data: Guardian.array()
        .describe('List of users')
        .of(
          Guardian.object().schema({
            id: Guardian.string().uuid(),
            name: Guardian.string(),
            email: Guardian.string(),
            createdAt: Guardian.string(),
          }),
        ),
      pagination: Guardian.object()
        .describe('Pagination metadata')
        .schema({
          page: Guardian.number().integer().min(1),
          limit: Guardian.number().integer().min(1).max(100),
          total: Guardian.number().integer().min(0),
          hasNext: Guardian.boolean(),
        }),
    }),

  ErrorResponse: Guardian.object()
    .describe('Error response format')
    .schema({
      success: Guardian.boolean().describe('Always false for errors'),
      error: Guardian.object()
        .describe('Error details')
        .schema({
          code: Guardian.string().describe('Error code'),
          message: Guardian.string().describe('Error message'),
          details: Guardian.unknown().describe('Additional error context')
            .optional(),
        }),
    }),
};

// Generate complete OpenAPI specification
function generateOpenAPISpec() {
  return {
    openapi: '3.0.3',
    info: {
      title: 'User Management API',
      description: 'Complete API for managing users with Guardian validation',
      version: '1.0.0',
      contact: {
        name: 'API Support',
        email: 'support@example.com',
      },
    },
    servers: [
      {
        url: 'https://api.example.com/v1',
        description: 'Production server',
      },
      {
        url: 'https://staging-api.example.com/v1',
        description: 'Staging server',
      },
    ],
    components: {
      schemas: Object.fromEntries(
        Object.entries(schemas).map(([name, guardian]) => [
          name,
          guardian.openapi(),
        ]),
      ),
    },
    paths: {
      '/users': {
        get: {
          summary: 'List users',
          description: 'Retrieve a paginated list of users',
          parameters: [
            {
              name: 'page',
              in: 'query',
              description: 'Page number',
              schema: { type: 'integer', minimum: 1, default: 1 },
            },
            {
              name: 'limit',
              in: 'query',
              description: 'Items per page',
              schema: {
                type: 'integer',
                minimum: 1,
                maximum: 100,
                default: 20,
              },
            },
          ],
          responses: {
            '200': {
              description: 'Users retrieved successfully',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/UserListResponse' },
                },
              },
            },
            '400': {
              description: 'Invalid query parameters',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ErrorResponse' },
                },
              },
            },
          },
        },
        post: {
          summary: 'Create user',
          description: 'Create a new user account',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/CreateUserRequest' },
              },
            },
          },
          responses: {
            '201': {
              description: 'User created successfully',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/UserResponse' },
                },
              },
            },
            '400': {
              description: 'Validation error',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ErrorResponse' },
                },
              },
            },
          },
        },
      },
      '/users/{id}': {
        get: {
          summary: 'Get user',
          description: 'Retrieve a specific user by ID',
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              description: 'User ID',
              schema: { type: 'string', format: 'uuid' },
            },
          ],
          responses: {
            '200': {
              description: 'User found',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/UserResponse' },
                },
              },
            },
            '404': {
              description: 'User not found',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ErrorResponse' },
                },
              },
            },
          },
        },
        patch: {
          summary: 'Update user',
          description: 'Update user information',
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              description: 'User ID',
              schema: { type: 'string', format: 'uuid' },
            },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/UpdateUserRequest' },
              },
            },
          },
          responses: {
            '200': {
              description: 'User updated successfully',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/UserResponse' },
                },
              },
            },
            '400': {
              description: 'Validation error',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ErrorResponse' },
                },
              },
            },
            '404': {
              description: 'User not found',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ErrorResponse' },
                },
              },
            },
          },
        },
      },
    },
  };
}

// Export the complete specification
export const openApiSpec = generateOpenAPISpec();
```

## Best Practices

### 1. Consistent Descriptions

```typescript
// Good: Clear, consistent descriptions
const userSchema = Guardian.object()
  .describe('User account information')
  .schema({
    id: Guardian.string().uuid().describe('Unique user identifier'),
    email: Guardian.string().email().describe('User email address'),
    name: Guardian.string().describe('User full name').minLength(1),
  });

// Avoid: Vague or missing descriptions
const badSchema = Guardian.object().schema({
  id: Guardian.string().uuid(), // No description
  email: Guardian.string().email().describe('Email'), // Too vague
  name: Guardian.string().describe('A name field'), // Not helpful
});
```

### 2. Provide Examples

```typescript
const productSchema = Guardian.object()
  .describe('Product information', {
    examples: [{
      name: 'Wireless Headphones',
      price: 99.99,
      category: 'electronics',
      inStock: true,
    }],
  })
  .schema({
    name: Guardian.string().describe('Product name'),
    price: Guardian.number().describe('Price in USD').min(0),
    category: Guardian.string().describe('Product category'),
    inStock: Guardian.boolean().describe('Availability status'),
  });
```

### 3. Use Semantic Field Names

```typescript
// Good: Clear, semantic names
const addressSchema = Guardian.object().schema({
  streetAddress: Guardian.string().describe('Street address line'),
  city: Guardian.string().describe('City name'),
  postalCode: Guardian.string().describe('ZIP or postal code'),
  countryCode: Guardian.string().describe('ISO country code').length(2),
});

// Avoid: Generic or unclear names
const badAddressSchema = Guardian.object().schema({
  line1: Guardian.string(), // What kind of line?
  area: Guardian.string(), // City? State? Region?
  code: Guardian.string(), // What kind of code?
  country: Guardian.string(), // Full name or code?
});
```

### 4. Group Related Schemas

```typescript
// Organization by domain
export const UserSchemas = {
  User: Guardian.object().describe('User entity').schema({
    id: Guardian.string().uuid(),
    name: Guardian.string(),
    email: Guardian.string().email(),
  }),

  CreateUserRequest: Guardian.object().describe('User creation request').schema(
    {
      name: Guardian.string().minLength(1),
      email: Guardian.string().email(),
    },
  ),

  UpdateUserRequest: Guardian.object().describe('User update request').schema({
    name: Guardian.string().minLength(1).optional(),
    email: Guardian.string().email().optional(),
  }),
};

export const ProductSchemas = {
  Product: Guardian.object().describe('Product entity').schema({
    id: Guardian.string().uuid(),
    name: Guardian.string(),
    price: Guardian.number().min(0),
  }),

  CreateProductRequest: Guardian.object().describe('Product creation request')
    .schema({
      name: Guardian.string().minLength(1),
      price: Guardian.number().min(0),
    }),
};
```

### 5. Version Your Schemas

```typescript
// Version 1
export const UserV1 = Guardian.object()
  .describe('User entity (v1)', { deprecated: true })
  .schema({
    id: Guardian.number().integer(),
    name: Guardian.string(),
    email: Guardian.string().email(),
  });

// Version 2
export const UserV2 = Guardian.object()
  .describe('User entity (v2)')
  .schema({
    id: Guardian.string().uuid(), // Changed from number to UUID
    name: Guardian.string(),
    email: Guardian.string().email(),
    createdAt: Guardian.string().describe('Creation timestamp'), // New field
  });
```

## Examples

### E-commerce API

```typescript
import { Guardian } from '@tundralibs/guardian';

// Product management schemas
const ProductGuardian = Guardian.object()
  .describe('Product in the catalog', {
    title: 'Product',
    examples: [{
      id: '123e4567-e89b-12d3-a456-426614174000',
      name: 'Wireless Bluetooth Headphones',
      description: 'High-quality noise-canceling headphones',
      price: 99.99,
      currency: 'USD',
      category: 'electronics',
      inStock: true,
      inventory: 150,
      tags: ['wireless', 'bluetooth', 'audio'],
    }],
  })
  .schema({
    id: Guardian.string().uuid().describe('Unique product identifier'),
    name: Guardian.string()
      .describe('Product name')
      .minLength(1)
      .maxLength(200),
    description: Guardian.string()
      .describe('Product description')
      .maxLength(1000)
      .optional(),
    price: Guardian.number()
      .describe('Product price')
      .min(0),
    currency: Guardian.string()
      .describe('Price currency code')
      .length(3)
      .upperCase(),
    category: Guardian.string()
      .describe('Product category')
      .in(['electronics', 'clothing', 'books', 'home', 'sports']),
    inStock: Guardian.boolean()
      .describe('Product availability'),
    inventory: Guardian.number()
      .describe('Available quantity')
      .integer()
      .min(0),
    tags: Guardian.array()
      .describe('Product tags for search')
      .of(Guardian.string())
      .optional(),
  });

// Order management schemas
const OrderItemGuardian = Guardian.object()
  .describe('Item in an order')
  .schema({
    productId: Guardian.string().uuid().describe('Product identifier'),
    quantity: Guardian.number().integer().min(1).describe('Quantity ordered'),
    price: Guardian.number().min(0).describe('Unit price at time of order'),
  });

const OrderGuardian = Guardian.object()
  .describe('Customer order', {
    title: 'Order',
    examples: [{
      id: '123e4567-e89b-12d3-a456-426614174000',
      customerId: '987fcdeb-51a2-34c6-d789-123456789abc',
      items: [
        { productId: 'prod-123', quantity: 2, price: 99.99 },
      ],
      status: 'pending',
      total: 199.98,
      currency: 'USD',
      createdAt: '2023-01-01T10:00:00Z',
    }],
  })
  .schema({
    id: Guardian.string().uuid().describe('Unique order identifier'),
    customerId: Guardian.string().uuid().describe('Customer identifier'),
    items: Guardian.array()
      .describe('Ordered items')
      .of(OrderItemGuardian)
      .minItems(1),
    status: Guardian.string()
      .describe('Order status')
      .in(['pending', 'processing', 'shipped', 'delivered', 'cancelled']),
    total: Guardian.number()
      .describe('Total order amount')
      .min(0),
    currency: Guardian.string()
      .describe('Order currency')
      .length(3),
    createdAt: Guardian.string()
      .describe('Order creation timestamp'),
    shippingAddress: Guardian.object()
      .describe('Delivery address')
      .schema({
        street: Guardian.string().describe('Street address'),
        city: Guardian.string().describe('City'),
        state: Guardian.string().describe('State or province'),
        zipCode: Guardian.string().describe('ZIP or postal code'),
        country: Guardian.string().describe('Country code').length(2),
      }),
  });

// Generate complete OpenAPI spec
export const ecommerceApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'E-commerce API',
    description: 'API for managing products and orders',
    version: '1.0.0',
  },
  components: {
    schemas: {
      Product: ProductGuardian.openapi(),
      Order: OrderGuardian.openapi(),
      OrderItem: OrderItemGuardian.openapi(),
    },
  },
  paths: {
    '/products': {
      get: {
        summary: 'List products',
        responses: {
          '200': {
            description: 'Products retrieved',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    products: {
                      type: 'array',
                      items: { $ref: '#/components/schemas/Product' },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/orders': {
      post: {
        summary: 'Create order',
        requestBody: {
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Order' },
            },
          },
        },
        responses: {
          '201': {
            description: 'Order created',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Order' },
              },
            },
          },
        },
      },
    },
  },
};
```

### Social Media API

```typescript
import { Guardian } from '@tundralibs/guardian';

const UserGuardian = Guardian.object()
  .describe('Social media user profile')
  .schema({
    id: Guardian.string().uuid().describe('User ID'),
    username: Guardian.string()
      .describe('Unique username')
      .pattern(/^[a-zA-Z0-9_]{3,20}$/),
    displayName: Guardian.string()
      .describe('Display name')
      .minLength(1)
      .maxLength(50),
    email: Guardian.string()
      .describe('Email address')
      .email(),
    bio: Guardian.string()
      .describe('User biography')
      .maxLength(500)
      .optional(),
    avatar: Guardian.string()
      .describe('Avatar image URL')
      .url()
      .optional(),
    verified: Guardian.boolean()
      .describe('Account verification status'),
    followerCount: Guardian.number()
      .describe('Number of followers')
      .integer()
      .min(0),
    followingCount: Guardian.number()
      .describe('Number of users being followed')
      .integer()
      .min(0),
    createdAt: Guardian.string()
      .describe('Account creation date'),
    lastActiveAt: Guardian.string()
      .describe('Last activity timestamp')
      .optional(),
  });

const PostGuardian = Guardian.object()
  .describe('Social media post')
  .schema({
    id: Guardian.string().uuid().describe('Post ID'),
    authorId: Guardian.string().uuid().describe('Author user ID'),
    content: Guardian.string()
      .describe('Post content')
      .minLength(1)
      .maxLength(2000),
    media: Guardian.array()
      .describe('Attached media files')
      .of(
        Guardian.object().schema({
          type: Guardian.string().in(['image', 'video']),
          url: Guardian.string().url(),
          alt: Guardian.string().optional(),
        }),
      )
      .optional(),
    hashtags: Guardian.array()
      .describe('Post hashtags')
      .of(Guardian.string().pattern(/^#[a-zA-Z0-9_]+$/))
      .optional(),
    mentions: Guardian.array()
      .describe('User mentions')
      .of(Guardian.string().uuid())
      .optional(),
    likeCount: Guardian.number()
      .describe('Number of likes')
      .integer()
      .min(0),
    shareCount: Guardian.number()
      .describe('Number of shares')
      .integer()
      .min(0),
    createdAt: Guardian.string()
      .describe('Post creation timestamp'),
    editedAt: Guardian.string()
      .describe('Last edit timestamp')
      .optional(),
  });

// API endpoint schemas
const CreatePostRequest = Guardian.object()
  .describe('Request to create a new post')
  .schema({
    content: Guardian.string().minLength(1).maxLength(2000),
    media: Guardian.array()
      .of(
        Guardian.object().schema({
          type: Guardian.string().in(['image', 'video']),
          url: Guardian.string().url(),
          alt: Guardian.string().optional(),
        }),
      )
      .maxItems(10)
      .optional(),
  });

export const socialApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'Social Media API',
    version: '1.0.0',
  },
  components: {
    schemas: {
      User: UserGuardian.openapi(),
      Post: PostGuardian.openapi(),
      CreatePostRequest: CreatePostRequest.openapi(),
    },
  },
};
```

These examples demonstrate how Guardian's OpenAPI integration provides:

1. **Type Safety**: Full TypeScript support with proper type inference
2. **Single Source of Truth**: One schema for validation and documentation
3. **Comprehensive Documentation**: Rich metadata and examples
4. **Framework Agnostic**: Works with any TypeScript/JavaScript framework
5. **Standards Compliant**: Generates valid OpenAPI 3.0 specifications

The generated OpenAPI schemas can be used with tools like Swagger UI, Postman, or any OpenAPI-compatible documentation generator to create interactive API documentation.
