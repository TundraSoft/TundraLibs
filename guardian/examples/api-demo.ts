import { Guardian } from '../Guardian.ts';

/**
 * Example: Complete API specification using Guardian with OpenAPI export
 * This demonstrates how Guardian can be used for both validation and documentation
 */

// Define reusable schemas with descriptions
const EmailGuardian = Guardian.string()
  .describe('Email address with validation')
  .email('Must be a valid email format');

const IdGuardian = Guardian.string()
  .describe('UUID identifier')
  .uuid('Must be a valid UUID');

const TimestampGuardian = Guardian.string()
  .describe('ISO 8601 timestamp');

// User entity schema
const UserGuardian = Guardian.object()
  .describe('User entity representing a platform user', {
    title: 'User',
    examples: [{
      id: '123e4567-e89b-12d3-a456-426614174000',
      email: 'john.doe@example.com',
      name: 'John Doe',
      age: 30,
      isActive: true,
      roles: ['user'],
      createdAt: '2023-01-01T00:00:00Z',
      lastLoginAt: '2023-12-01T10:30:00Z',
    }],
  })
  .schema({
    id: IdGuardian,
    email: EmailGuardian,
    name: Guardian.string()
      .describe('Full name of the user')
      .minLength(1, 'Name cannot be empty')
      .maxLength(100, 'Name too long'),
    age: Guardian.number()
      .describe('Age in years')
      .min(13, 'Must be at least 13 years old')
      .max(120, 'Age must be realistic')
      .integer('Age must be a whole number'),
    isActive: Guardian.boolean()
      .describe('Whether the user account is active'),
    roles: Guardian.array()
      .describe('User roles and permissions')
      .of(Guardian.string().describe('Role name')),
    createdAt: TimestampGuardian,
    lastLoginAt: TimestampGuardian.optional(),
  });

// API Request schemas
const CreateUserRequestGuardian = Guardian.object()
  .describe('Request payload for creating a new user', {
    title: 'CreateUserRequest',
  })
  .schema({
    email: EmailGuardian,
    name: Guardian.string()
      .describe('Full name of the user')
      .minLength(1)
      .maxLength(100),
    age: Guardian.number()
      .describe('Age in years')
      .min(13)
      .max(120)
      .integer(),
    roles: Guardian.array()
      .describe('Initial user roles')
      .of(Guardian.string())
      .optional(),
  });

const UpdateUserRequestGuardian = Guardian.object()
  .describe('Request payload for updating user information', {
    title: 'UpdateUserRequest',
  })
  .schema({
    name: Guardian.string()
      .describe('Updated full name')
      .minLength(1)
      .maxLength(100)
      .optional(),
    age: Guardian.number()
      .describe('Updated age')
      .min(13)
      .max(120)
      .integer()
      .optional(),
    isActive: Guardian.boolean()
      .describe('Updated active status')
      .optional(),
  });

// API Response schemas
const UserResponseGuardian = Guardian.object()
  .describe('User data response', {
    title: 'UserResponse',
  })
  .schema({
    success: Guardian.boolean()
      .describe('Whether the operation was successful'),
    data: UserGuardian,
  });

const ErrorResponseGuardian = Guardian.object()
  .describe('Error response format', {
    title: 'ErrorResponse',
  })
  .schema({
    success: Guardian.boolean()
      .describe('Always false for error responses'),
    error: Guardian.object()
      .describe('Error details')
      .schema({
        code: Guardian.string()
          .describe('Error code identifier'),
        message: Guardian.string()
          .describe('Human-readable error message'),
        details: Guardian.unknown()
          .describe('Additional error context')
          .optional(),
      }),
  });

// List response with pagination
const UserListResponseGuardian = Guardian.object()
  .describe('Paginated list of users', {
    title: 'UserListResponse',
  })
  .schema({
    success: Guardian.boolean()
      .describe('Whether the operation was successful'),
    data: Guardian.array()
      .describe('Array of user objects')
      .of(UserGuardian),
    pagination: Guardian.object()
      .describe('Pagination metadata')
      .schema({
        page: Guardian.number()
          .describe('Current page number')
          .min(1)
          .integer(),
        limit: Guardian.number()
          .describe('Items per page')
          .min(1)
          .max(100)
          .integer(),
        total: Guardian.number()
          .describe('Total number of items')
          .min(0)
          .integer(),
      }),
  });

// Generate OpenAPI documentation
function generateOpenAPISpec() {
  return {
    openapi: '3.0.3',
    info: {
      title: 'User Management API',
      description: 'API for managing user accounts with Guardian validation',
      version: '1.0.0',
    },
    components: {
      schemas: {
        // Core entities
        User: UserGuardian.openapi(),

        // Request schemas
        CreateUserRequest: CreateUserRequestGuardian.openapi(),
        UpdateUserRequest: UpdateUserRequestGuardian.openapi(),

        // Response schemas
        UserResponse: UserResponseGuardian.openapi(),
        UserListResponse: UserListResponseGuardian.openapi(),
        ErrorResponse: ErrorResponseGuardian.openapi(),

        // Reusable components
        Email: EmailGuardian.openapi(),
        UUID: IdGuardian.openapi(),
        Timestamp: TimestampGuardian.openapi(),
      },
    },
    paths: {
      '/users': {
        get: {
          summary: 'List users',
          parameters: [
            {
              name: 'page',
              in: 'query',
              schema: { type: 'integer', minimum: 1, default: 1 },
            },
            {
              name: 'limit',
              in: 'query',
              schema: {
                type: 'integer',
                minimum: 1,
                maximum: 100,
                default: 20,
              },
            },
          ],
          responses: {
            200: {
              description: 'Successful response',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/UserListResponse' },
                },
              },
            },
            400: {
              description: 'Bad request',
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
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/CreateUserRequest' },
              },
            },
          },
          responses: {
            201: {
              description: 'User created successfully',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/UserResponse' },
                },
              },
            },
            400: {
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
          summary: 'Get user by ID',
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: { $ref: '#/components/schemas/UUID' },
            },
          ],
          responses: {
            200: {
              description: 'User found',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/UserResponse' },
                },
              },
            },
            404: {
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
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: { $ref: '#/components/schemas/UUID' },
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
            200: {
              description: 'User updated successfully',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/UserResponse' },
                },
              },
            },
            400: {
              description: 'Validation error',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ErrorResponse' },
                },
              },
            },
            404: {
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

// Example API usage with validation
function demonstrateAPIUsage() {
  console.log('=== Guardian API Validation Demo ===\n');

  // Simulate API request validation
  const createRequest = {
    email: 'jane.doe@example.com',
    name: 'Jane Doe',
    age: 28,
    roles: ['user', 'moderator'],
  };

  try {
    const validatedRequest = CreateUserRequestGuardian(createRequest);
    console.log('✅ Create request validation passed');
    console.log('Validated data:', validatedRequest);
  } catch (error) {
    console.log(
      '❌ Create request validation failed:',
      (error as Error).message,
    );
  }

  // Simulate invalid request
  const invalidRequest = {
    email: 'not-an-email',
    name: '',
    age: -5,
  };

  try {
    CreateUserRequestGuardian(invalidRequest);
    console.log('✅ This should not happen');
  } catch (error) {
    console.log('\n❌ Invalid request validation failed (as expected):');
    console.log((error as Error).message);
  }

  // Generate and display OpenAPI spec
  console.log('\n=== Generated OpenAPI Specification ===');
  const openApiSpec = generateOpenAPISpec();
  console.log(JSON.stringify(openApiSpec, null, 2));
}

// Run the demonstration
if (import.meta.main) {
  demonstrateAPIUsage();
}
