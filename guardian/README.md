# Guardian

A powerful, TypeScript-first validation library with fluent API design. Guardian
provides comprehensive data validation, type transformation, and schema
composition with excellent developer experience.

## Installation & Quick Start

```bash
# Deno
import { Guardian } from 'jsr:@tundralibs/guardian';

# Node.js (via JSR)
npx jsr add @tundralibs/guardian
```

```typescript
import { Guardian } from "@tundralibs/guardian";

// String validation with transformations
const username = Guardian.string()
  .trim()
  .minLength(3)
  .maxLength(20)
  .pattern(/^[a-zA-Z0-9_]+$/);

const result = username.parse("  john_doe  "); // 'john_doe'

// Object schema validation
const userSchema = Guardian.object({
  id: Guardian.number().integer().positive(),
  name: Guardian.string().minLength(1),
  email: Guardian.string().email(),
  age: Guardian.number().min(0).max(120).optional(),
});

const user = userSchema.parse({
  id: 1,
  name: "John Doe",
  email: "john@example.com",
}); // { id: 1, name: "John Doe", email: "john@example.com" }

// Safe parsing (doesn't throw)
const [error, data] = Guardian.number().safeParse("invalid");
if (error) {
  console.log("Validation failed:", error.message);
} else {
  console.log("Valid data:", data);
}
```

## Features

### 🔷 **Complete Type System**

Full support for all JavaScript types with TypeScript inference:

- **Primitives**: `string`, `number`, `boolean`, `bigint`, `date`
- **Complex**: `object`, `array`, `enum`, `union` types
- **Special**: `unknown`, `nullable`, `optional` values

### 🔗 **Fluent API Design**

Chainable methods for building validation schemas:

```typescript
Guardian.string().trim().toLowerCase().email().optional();
Guardian.number().positive().integer().max(100);
Guardian.array(Guardian.string()).minLength(1).unique();
```

### 🔄 **Built-in Transformations**

Convert between types seamlessly:

```typescript
Guardian.string().toNumber(); // "123" → 123
Guardian.number().toString(); // 123 → "123"
Guardian.string().toDate(); // "2023-01-01" → Date
Guardian.object().pick("id", "name"); // Extract specific fields
```

### 🛡️ **Safe & Async Support**

- **Safe parsing**: Returns `[error, data]` tuples instead of throwing
- **Async validation**: Native support for async validation steps
- **Error handling**: Rich error messages with context and suggestions

### 🏗️ **Advanced Schema Composition**

- **Object refinements**: Custom validation logic for entire objects
- **Key validation**: `hasKeys()`, `forbiddenKeys()` for dynamic schemas
- **Schema manipulation**: `extend()`, `pick()`, `omit()` for reusable schemas
- **Union types**: `oneOf()` for multiple valid types

### 📝 **Developer Experience**

- **Full TypeScript support**: Complete type inference and safety
- **Immutable mode**: Create new instances instead of mutating
- **Metadata support**: Attach documentation, examples, and OpenAPI specs
- **Performance optimized**: Efficient validation with minimal overhead

## Examples

### API Request Validation

```typescript
// Complete user registration schema
const registerSchema = Guardian.object({
  // User details with transformations
  username: Guardian.string()
    .trim()
    .toLowerCase()
    .minLength(3)
    .maxLength(20)
    .pattern(
      /^[a-zA-Z0-9_]+$/,
      "Only letters, numbers, and underscores allowed",
    ),

  email: Guardian.string()
    .trim()
    .toLowerCase()
    .email("Must be a valid email address"),

  password: Guardian.string()
    .minLength(8, "Password must be at least 8 characters")
    .pattern(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
      "Must contain uppercase, lowercase, and number",
    ),

  confirmPassword: Guardian.string(),

  age: Guardian.number()
    .integer()
    .min(13, "Must be at least 13 years old")
    .max(120, "Age seems unrealistic"),

  // Optional fields
  phone: Guardian.string().phone().optional(),
  website: Guardian.string().url().optional(),

  // Nested objects
  preferences: Guardian.object({
    newsletter: Guardian.boolean().default(false),
    theme: Guardian.enum(["light", "dark", "auto"]).default("auto"),
    notifications: Guardian.object({
      email: Guardian.boolean().default(true),
      push: Guardian.boolean().default(false),
    }),
  }).optional(),
})
  // Object-level validation
  .refine(
    (data) => data.password === data.confirmPassword,
    "Passwords do not match",
  )
  .refine(
    async (data) => {
      const exists = await checkUsernameExists(data.username);
      return !exists;
    },
    "Username is already taken",
  );

// Usage
const userData = await registerSchema.parseAsync({
  username: "  JohnDoe123  ",
  email: "JOHN@EXAMPLE.COM",
  password: "SecurePass123",
  confirmPassword: "SecurePass123",
  age: 25,
  preferences: {
    newsletter: true,
    theme: "dark",
  },
});
```

### E-commerce Product Schema

```typescript
// Complex product validation with dynamic schema
const productSchema = Guardian.object({
  // Basic product info
  name: Guardian.string().trim().minLength(1).maxLength(200),
  description: Guardian.string().trim().maxLength(2000).optional(),

  // Price handling with transformation
  price: Guardian.string()
    .pattern(/^\$?\d+(\.\d{2})?$/, "Invalid price format")
    .transform((price) => parseFloat(price.replace("$", "")))
    .min(0, "Price cannot be negative"),

  // Category with enum validation
  category: Guardian.enum([
    "electronics",
    "clothing",
    "books",
    "home",
    "sports",
  ]),

  // Dynamic attributes based on category
  attributes: Guardian.unknown()
    .transform((attrs, ctx) => {
      const category = ctx.parent?.category;

      if (category === "electronics") {
        return Guardian.object({
          brand: Guardian.string().minLength(1),
          model: Guardian.string().minLength(1),
          warranty: Guardian.number().positive().integer(), // months
        }).parse(attrs);
      }

      if (category === "clothing") {
        return Guardian.object({
          size: Guardian.enum(["XS", "S", "M", "L", "XL", "XXL"]),
          color: Guardian.string().minLength(1),
          material: Guardian.string().minLength(1),
        }).parse(attrs);
      }

      return attrs; // Other categories accept any attributes
    }),

  // Inventory tracking
  stock: Guardian.object({
    quantity: Guardian.number().integer().min(0),
    reserved: Guardian.number().integer().min(0).default(0),
    available: Guardian.number().integer().min(0),
  })
    .refine(
      (stock) => stock.available === stock.quantity - stock.reserved,
      "Available stock calculation is incorrect",
    ),

  // Tags array with validation
  tags: Guardian.array(Guardian.string().trim().minLength(1))
    .unique()
    .maxLength(10)
    .optional(),

  // Media files
  images: Guardian.array(
    Guardian.object({
      url: Guardian.string().url(),
      alt: Guardian.string().optional(),
      primary: Guardian.boolean().default(false),
    }),
  ).minLength(1, "At least one image is required")
    .refine(
      (images) => images.filter((img) => img.primary).length <= 1,
      "Only one image can be marked as primary",
    ),
})
  // Ensure required keys are present
  .hasKeys(["name", "price", "category", "stock"])
  // Ensure no sensitive internal fields
  .forbiddenKeys(["internalId", "cost", "profit"]);
```

### Configuration File Validation

```typescript
// Application configuration with environment-specific validation
const configSchema = Guardian.object({
  environment: Guardian.enum(["development", "staging", "production"]),

  server: Guardian.object({
    port: Guardian.number().integer().min(1000).max(65535),
    host: Guardian.string().default("localhost"),
    https: Guardian.boolean().default(false),
  }),

  database: Guardian.object({
    url: Guardian.string().url(),
    poolSize: Guardian.number().integer().positive().max(100).default(10),
    ssl: Guardian.boolean().default(false),
    migrations: Guardian.object({
      auto: Guardian.boolean().default(false),
      path: Guardian.string().default("./migrations"),
    }),
  }),

  auth: Guardian.object({
    jwtSecret: Guardian.string().minLength(32),
    tokenExpiry: Guardian.string().pattern(
      /^\d+[smhd]$/,
      "Use format like '24h', '30m'",
    ),
    bcryptRounds: Guardian.number().integer().min(10).max(15).default(12),
  }),

  redis: Guardian.object({
    url: Guardian.string().url(),
    keyPrefix: Guardian.string().default("app:"),
    ttl: Guardian.number().positive().default(3600), // seconds
  }).optional(),

  logging: Guardian.object({
    level: Guardian.enum(["error", "warn", "info", "debug"]).default("info"),
    format: Guardian.enum(["json", "text"]).default("json"),
    outputs: Guardian.array(
      Guardian.enum(["console", "file", "syslog"]),
    ).minLength(1),
  }),
})
  // Environment-specific validation
  .refine((config) => {
    if (config.environment === "production") {
      // Production must have HTTPS and strong JWT secret
      return config.server.https && config.auth.jwtSecret.length >= 64;
    }
    return true;
  }, "Production environment requires HTTPS and strong JWT secret")
  .refine((config) => {
    if (config.environment === "production") {
      // Production should not auto-migrate
      return !config.database.migrations.auto;
    }
    return true;
  }, "Auto-migrations should be disabled in production");
```

### Form Data Processing

```typescript
// Multi-step form with conditional validation
const multiStepFormSchema = Guardian.object({
  step: Guardian.number().integer().min(1).max(3),

  // Step 1: Personal Information
  personalInfo: Guardian.object({
    firstName: Guardian.string().trim().minLength(1),
    lastName: Guardian.string().trim().minLength(1),
    dateOfBirth: Guardian.string().toDate(),
    ssn: Guardian.string()
      .pattern(/^\d{3}-\d{2}-\d{4}$/, "SSN must be in format XXX-XX-XXXX")
      .optional(),
  }).optional(),

  // Step 2: Employment Information
  employment: Guardian.object({
    status: Guardian.enum(["employed", "unemployed", "student", "retired"]),
    company: Guardian.string().trim().minLength(1).optional(),
    salary: Guardian.number().positive().optional(),
    startDate: Guardian.string().toDate().optional(),
  }).optional(),

  // Step 3: Financial Information
  financial: Guardian.object({
    bankAccount: Guardian.string().pattern(/^\d{10,12}$/),
    routingNumber: Guardian.string().pattern(/^\d{9}$/),
    creditScore: Guardian.number().integer().min(300).max(850).optional(),
  }).optional(),
})
  // Conditional validation based on current step
  .refine((data) => {
    if (data.step >= 1) {
      return data.personalInfo !== undefined;
    }
    return true;
  }, "Personal information is required for step 1 and above")
  .refine((data) => {
    if (data.step >= 2) {
      return data.employment !== undefined;
    }
    return true;
  }, "Employment information is required for step 2 and above")
  .refine((data) => {
    if (data.step >= 3) {
      return data.financial !== undefined;
    }
    return true;
  }, "Financial information is required for step 3")
  // Cross-field validation
  .refine((data) => {
    if (data.employment?.status === "employed") {
      return data.employment.company && data.employment.salary;
    }
    return true;
  }, "Company and salary are required when employed");
```

## Known Issues

Currently, there are no known major issues. Guardian is stable and
production-ready.

If you encounter any problems, please check our
[GitHub Issues](https://github.com/TundraSoft/TundraLibs/issues) or create a new
issue with:

- Your Guardian version
- Minimal reproduction code
- Expected vs actual behavior
- Error messages (if any)

## Roadmap

### 🎯 **Current Focus (v1.x)**

- [ ] **Performance optimizations** - Reduce bundle size and improve validation
      speed
- [ ] **Enhanced error messages** - More helpful validation failure descriptions
- [ ] **Schema introspection** - Better runtime schema analysis and
      documentation
- [ ] **Serialization support** - JSON schema export and import capabilities

### 🚀 **Future Plans (v2.x)**

- [ ] **Plugin system** - Extensible validation with community plugins
- [ ] **Advanced transformations** - More built-in data transformation utilities
- [ ] **Localization** - Multi-language error messages and formatting
- [ ] **Browser optimizations** - Smaller builds for client-side usage

### 💡 **Ideas Under Consideration**

- [ ] **GraphQL integration** - Generate GraphQL schemas from Guardian schemas
- [ ] **Database integration** - Direct ORM/query builder integration
- [ ] **Mock data generation** - Generate test data from schemas
- [ ] **Visual schema builder** - GUI for creating validation schemas

---

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](../CONTRIBUTING.md) for
guidelines.

## License

MIT License - see [LICENSE](../LICENSE) for details.

---

Built with ❤️ by the TundraLibs team.
