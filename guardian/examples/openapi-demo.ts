import { Guardian } from '../Guardian.ts';

// Example: Create a user guardian with descriptions
const userGuardian = Guardian.object()
  .describe('User profile object', {
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
      .minLength(1, 'Name cannot be empty'),
    email: Guardian.string()
      .describe('Email address for contact')
      .email('Must be a valid email'),
    age: Guardian.number()
      .describe('Age in years')
      .min(0, 'Age must be positive')
      .max(150, 'Age must be realistic')
      .integer('Age must be a whole number'),
    isActive: Guardian.boolean()
      .describe('Whether the user account is active')
      .optional(),
  });

// Example: API endpoint guardian
const createUserRequestGuardian = Guardian.object()
  .describe('Request body for creating a new user', {
    title: 'CreateUserRequest',
  })
  .schema({
    name: Guardian.string().describe('User full name').minLength(1),
    email: Guardian.string().describe('User email address').email(),
    age: Guardian.number().describe('User age').min(18).max(150).integer(),
  });

// Example: API response guardian
const userResponseGuardian = Guardian.object()
  .describe('Successful user creation response', {
    title: 'UserResponse',
  })
  .schema({
    id: Guardian.string().describe('Unique user identifier').uuid(),
    name: Guardian.string().describe('User full name'),
    email: Guardian.string().describe('User email address'),
    age: Guardian.number().describe('User age'),
    createdAt: Guardian.string().describe('Account creation timestamp'),
    isActive: Guardian.boolean().describe('Account status'),
  });

// Demonstrate usage
console.log('=== Guardian OpenAPI Demo ===');

// Test basic validation
const userData = {
  name: 'Alice Johnson',
  email: 'alice@example.com',
  age: 28,
};

try {
  const validatedUser = userGuardian(userData);
  console.log('✅ User validation passed:', validatedUser);
} catch (error: unknown) {
  console.log('❌ User validation failed:', (error as Error).message);
}

// Generate OpenAPI schemas
console.log('\n=== OpenAPI Schemas ===');

console.log('\n1. User Guardian OpenAPI Schema:');
console.log(JSON.stringify(userGuardian.openapi(), null, 2));

console.log('\n2. Create User Request Schema:');
console.log(JSON.stringify(createUserRequestGuardian.openapi(), null, 2));

console.log('\n3. User Response Schema:');
console.log(JSON.stringify(userResponseGuardian.openapi(), null, 2));

// Demonstrate individual type schemas
console.log('\n=== Individual Type Schemas ===');

const stringGuardian = Guardian.string()
  .describe('Email validation with format checking')
  .email();

const numberGuardian = Guardian.number()
  .describe('Age validation with reasonable bounds')
  .min(0)
  .max(150)
  .integer();

const arrayGuardian = Guardian.array()
  .describe('List of user tags');

console.log('\n1. String (Email) Schema:');
console.log(JSON.stringify(stringGuardian.openapi(), null, 2));

console.log('\n2. Number (Age) Schema:');
console.log(JSON.stringify(numberGuardian.openapi(), null, 2));

console.log('\n3. Array Schema:');
console.log(JSON.stringify(arrayGuardian.openapi(), null, 2));

console.log('\n=== Demo Complete ===');
