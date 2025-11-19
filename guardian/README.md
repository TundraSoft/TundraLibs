# Guardian - TypeScript Validation Library

A powerful, TypeScript-first validation library with fluent API design, inspired
by Zod but built with step-based validation and transformation pipeline
approach.

## Features

- 🔷 **TypeScript-first** - Full type safety with excellent TypeScript support
- 🔗 **Fluent API** - Chainable methods for building complex validation schemas
- 🔄 **Type Transformations** - Convert between types (string → number, etc.)
- 📝 **Step-based Validation** - Build validation pipelines with custom steps
- 🔒 **Async Support** - Handle both synchronous and asynchronous validations
- 🛡️ **Safe Parsing** - Parse without throwing exceptions
- 📊 **Rich Error Messages** - Detailed error information with context
- 🏷️ **Metadata Support** - Attach documentation and examples to schemas

## Installation

```bash
# Deno
import { Guardian } from 'jsr:@tundralibs/guardian';

# Node.js (via JSR)
npx jsr add @tundralibs/guardian
```

## Quick Start

```typescript
import { Guardian } from "@tundralibs/guardian";

// Basic string validation
const name = Guardian.string()
  .minLength(2)
  .maxLength(50)
  .trim();

const result = name.parse("  John Doe  "); // 'John Doe'

// Number validation
const age = Guardian.number()
  .integer()
  .min(0)
  .max(120);

const validAge = age.parse(25); // 25

// Type transformation
const stringToNumber = Guardian.string()
  .regex(/^\\d+$/)
  .toNumber();

const converted = stringToNumber.parse("123"); // 123 (number)
```

## API Reference

### String Validation

```typescript
const schema = Guardian.string()
  .minLength(3) // Minimum length
  .maxLength(100) // Maximum length
  .length(10) // Exact length
  .regex(/^[a-zA-Z]+$/) // Match regex pattern
  .email() // Valid email format
  .url() // Valid URL format
  .nonEmpty() // Not empty after trimming
  .trim() // Trim whitespace
  .toLowerCase() // Convert to lowercase
  .toUpperCase() // Convert to uppercase
  .toNumber() // Transform to number
  .toInt() // Transform to integer
  .toDate(); // Transform to Date
```

### Number Validation

```typescript
const schema = Guardian.number()
  .min(0) // Minimum value
  .max(100) // Maximum value
  .positive() // > 0
  .negative() // < 0
  .nonNegative() // >= 0
  .nonPositive() // <= 0
  .integer() // Must be integer
  .finite() // Must be finite (not Infinity)
  .safeInteger() // Within safe integer range
  .multipleOf(5) // Must be multiple of value
  .round() // Round to nearest integer
  .floor() // Round down
  .ceil() // Round up
  .trunc() // Truncate decimal
  .abs() // Absolute value
  .toString() // Transform to string
  .toBigInt() // Transform to BigInt
  .toDate(); // Transform to Date (as timestamp)
```

### Custom Validation Steps

```typescript
const schema = Guardian.string()
  .step((value: string) => {
    if (!value.includes("@")) {
      throw new GuardianError("Must contain @", {
        expected: "string with @",
        got: value,
        comparison: "custom",
        type: "string",
      });
    }
    return value;
  }, "Custom @ validation");
```

### Async Validation

```typescript
const asyncSchema = Guardian.string()
  .minLength(3)
  .step(async (value: string) => {
    // Simulate async validation (e.g., database check)
    await new Promise((resolve) => setTimeout(resolve, 100));

    if (value === "taken") {
      throw new Error("Username already taken");
    }
    return value;
  }, "Check availability");

// Use parseAsync for async schemas
const result = await asyncSchema.parseAsync("username");
```

### Safe Parsing

```typescript
const schema = Guardian.number().positive();

// Returns result object instead of throwing
const result = schema.safeParse(-5);

if (result.success) {
  console.log(result.data); // number
} else {
  console.log(result.error.message); // GuardianError message
}

// Async safe parsing
const asyncResult = await schema.safeParseAsync(10);
```

### Metadata and Documentation

```typescript
const schema = Guardian.string({
  description: "User email address",
  title: "Email",
  examples: ["user@example.com", "admin@company.org"],
});

// Or set after creation
schema.description = "Updated description";
schema.title = "New Title";
schema.examples = ["example1", "example2"];

console.log(schema.metaData);
```

### Error Handling

Guardian provides detailed error information:

```typescript
try {
  Guardian.string().minLength(5).parse("hi");
} catch (error) {
  if (error instanceof GuardianError) {
    console.log(error.message); // Human readable message
    console.log(error.context); // Detailed error context
    console.log(error.context.got); // Actual value received
    console.log(error.context.expected); // Expected value/type
  }
}
```

## Advanced Examples

### Complex Validation Pipeline

```typescript
const userSchema = Guardian.string()
  .trim() // Remove whitespace
  .toLowerCase() // Normalize case
  .minLength(3, "Too short") // Minimum length
  .maxLength(20, "Too long") // Maximum length
  .regex(/^[a-z0-9_]+$/, "Invalid chars") // Only alphanumeric + underscore
  .step(async (username) => { // Custom async validation
    const exists = await checkUserExists(username);
    if (exists) {
      throw new Error("Username taken");
    }
    return username;
  }, "Availability check");

const username = await userSchema.parseAsync("  JohnDoe123  "); // 'johndoe123'
```

### Type Transformation Chain

```typescript
const priceSchema = Guardian.string()
  .regex(/^\\$?\\d+(\\.\\d{2})?$/, "Invalid price format") // $29.99 or 29.99
  .step((value) => value.replace("$", ""), "Remove dollar") // Remove $
  .toNumber() // String → Number
  .min(0, "Price cannot be negative") // Validate positive
  .step((price) => Math.round(price * 100) / 100, "Round"); // Round to 2 decimals

const price = priceSchema.parse("$29.999"); // 30.00
```

### Conditional Validation

```typescript
const conditionalSchema = Guardian.string()
  .step((value: string) => {
    if (value.startsWith("temp_")) {
      // Temporary values need longer length
      if (value.length < 10) {
        throw new Error("Temporary values must be at least 10 characters");
      }
    } else {
      // Regular values
      if (value.length < 3) {
        throw new Error("Regular values must be at least 3 characters");
      }
    }
    return value;
  }, "Conditional validation");
```

## Comparison with Zod

| Feature               | Guardian        | Zod               |
| --------------------- | --------------- | ----------------- |
| TypeScript Support    | ✅ Full         | ✅ Full           |
| Fluent API            | ✅ Yes          | ✅ Yes            |
| Type Transformations  | ✅ Built-in     | ✅ Built-in       |
| Step-based Validation | ✅ Core feature | ❌ No             |
| Async Support         | ✅ Native       | ✅ With .refine() |
| Safe Parsing          | ✅ Yes          | ✅ Yes            |
| Custom Steps          | ✅ Easy         | ✅ Via .refine()  |
| Bundle Size           | 🟡 Medium       | 🟡 Medium         |
| Learning Curve        | 🟢 Low          | 🟢 Low            |

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](../CONTRIBUTING.md) for
guidelines.

## License

MIT License - see [LICENSE](../LICENSE) for details.

## Roadmap

- [ ] Array validation (`Guardian.array()`)
- [ ] Object validation (`Guardian.object()`)
- [ ] Union types (`Guardian.union()`)
- [ ] Optional/Nullable types
- [ ] Boolean validation
- [ ] Date validation
- [ ] Custom error types
- [ ] Schema serialization
- [ ] Performance optimizations

---

Built with ❤️ by the TundraLibs team.
