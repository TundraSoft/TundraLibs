/**
 * Guardian Performance Benchmarks
 * 
 * Comprehensive benchmarks for all Guardian functionality to track performance
 * characteristics and identify optimization opportunities.
 * 
 * Run with: deno bench guardian/tests/guardian.bench.ts --allow-all
 */

import { Guardian } from "../mod.ts";

// Sample data for benchmarks
const sampleString = "Hello, World! This is a test string for benchmarking.";
const sampleNumber = 42.123456789;
const sampleArray = ["apple", "banana", "cherry", "date", "elderberry"];
const sampleObject = {
  id: 12345,
  name: "John Doe",
  email: "john.doe@example.com",
  age: 30,
  active: true,
  tags: ["developer", "typescript", "javascript"],
  metadata: {
    created: new Date("2023-01-01"),
    updated: new Date("2023-12-01"),
    version: 1.5,
  },
};
const sampleDate = new Date("2023-06-15T10:30:00Z");
const sampleBigInt = BigInt("123456789012345678901234567890");

// =============================================================================
// STRING GUARDIAN BENCHMARKS
// =============================================================================

Deno.bench("String Guardian - Basic Validation", () => {
  const guard = Guardian.string();
  guard.parse(sampleString);
});

Deno.bench("String Guardian - With Length Constraints", () => {
  const guard = Guardian.string().minLength(5).maxLength(100);
  guard.parse(sampleString);
});

Deno.bench("String Guardian - With Pattern Matching", () => {
  const guard = Guardian.string().pattern(/^[A-Za-z\s,!.]+$/);
  guard.parse(sampleString);
});

Deno.bench("String Guardian - Email Validation", () => {
  const guard = Guardian.string().email();
  guard.parse("john.doe@example.com");
});

Deno.bench("String Guardian - With Transformations", () => {
  const guard = Guardian.string().trim().toLowerCase();
  guard.parse("  HELLO WORLD  ");
});

Deno.bench("String Guardian - Complex Chain", () => {
  const guard = Guardian.string()
    .trim()
    .minLength(3)
    .maxLength(50)
    .pattern(/^[A-Za-z\s]+$/)
    .process((s: string) => s.toUpperCase());
  guard.parse("  john doe  ");
});

// =============================================================================
// NUMBER GUARDIAN BENCHMARKS
// =============================================================================

Deno.bench("Number Guardian - Basic Validation", () => {
  const guard = Guardian.number();
  guard.parse(sampleNumber);
});

Deno.bench("Number Guardian - With Range", () => {
  const guard = Guardian.number().min(0).max(100);
  guard.parse(sampleNumber);
});

Deno.bench("Number Guardian - Integer Validation", () => {
  const guard = Guardian.number().integer();
  guard.parse(42);
});

Deno.bench("Number Guardian - Positive Integer", () => {
  const guard = Guardian.number().positive().integer();
  guard.parse(42);
});

Deno.bench("Number Guardian - With Transformations", () => {
  const guard = Guardian.number().process((n: number) => Math.round(n * 100) / 100);
  guard.parse(sampleNumber);
});

Deno.bench("Number Guardian - Complex Chain", () => {
  const guard = Guardian.number()
    .min(0)
    .max(1000)
    .process((n: number) => Math.round(n))
    .test((n: number) => n % 2 === 0, "Must be even");
  guard.parse(42);
});

// =============================================================================
// BOOLEAN GUARDIAN BENCHMARKS
// =============================================================================

Deno.bench("Boolean Guardian - Basic Validation", () => {
  const guard = Guardian.boolean();
  guard.parse(true);
});

Deno.bench("Boolean Guardian - With Transformation", () => {
  const guard = Guardian.string().process((s: string) => s === "true");
  guard.parse("true");
});

// =============================================================================
// ARRAY GUARDIAN BENCHMARKS
// =============================================================================

Deno.bench("Array Guardian - Basic Validation", () => {
  const guard = Guardian.array(Guardian.string());
  guard.parse(sampleArray);
});

Deno.bench("Array Guardian - With Length Constraints", () => {
  const guard = Guardian.array(Guardian.string()).minLength(1).maxLength(10);
  guard.parse(sampleArray);
});

Deno.bench("Array Guardian - Number Array", () => {
  const guard = Guardian.array(Guardian.number());
  guard.parse([1, 2, 3, 4, 5]);
});

Deno.bench("Array Guardian - Complex Element Validation", () => {
  const guard = Guardian.array(
    Guardian.string().minLength(3).maxLength(20)
  );
  guard.parse(sampleArray);
});

Deno.bench("Array Guardian - With Transformations", () => {
  const guard = Guardian.array(Guardian.string())
    .process((arr: string[]) => arr.sort())
    .process((arr: string[]) => arr.slice(0, 3));
  guard.parse([...sampleArray]);
});

// =============================================================================
// OBJECT GUARDIAN BENCHMARKS
// =============================================================================

Deno.bench("Object Guardian - Simple Schema", () => {
  const guard = Guardian.object({
    id: Guardian.number(),
    name: Guardian.string(),
  });
  guard.parse({ id: 1, name: "Test" });
});

Deno.bench("Object Guardian - Complex Schema", () => {
  const guard = Guardian.object({
    id: Guardian.number().positive().integer(),
    name: Guardian.string().minLength(1).maxLength(100),
    email: Guardian.string().email(),
    age: Guardian.number().min(0).max(150).integer(),
    active: Guardian.boolean(),
    tags: Guardian.array(Guardian.string()),
    metadata: Guardian.object({
      created: Guardian.date(),
      updated: Guardian.date(),
      version: Guardian.number(),
    }),
  });
  guard.parse(sampleObject);
});

Deno.bench("Object Guardian - Optional Fields", () => {
  const guard = Guardian.object({
    id: Guardian.number(),
    name: Guardian.string(),
    email: Guardian.string().optional(),
    phone: Guardian.string().optional(),
  });
  guard.parse({ id: 1, name: "Test" });
});

Deno.bench("Object Guardian - With Processing", () => {
  const guard = Guardian.object({
    id: Guardian.number(),
    name: Guardian.string(),
    status: Guardian.string().optional(),
    priority: Guardian.number().optional(),
  });
  guard.parse({ id: 1, name: "Test" });
});

Deno.bench("Object Guardian - Nested Objects", () => {
  const guard = Guardian.object({
    user: Guardian.object({
      profile: Guardian.object({
        name: Guardian.string(),
        email: Guardian.string(),
      }),
      settings: Guardian.object({
        theme: Guardian.string(),
        notifications: Guardian.boolean(),
      }),
    }),
  });
  guard.parse({
    user: {
      profile: { name: "John", email: "john@example.com" },
      settings: { theme: "dark", notifications: true },
    },
  });
});

// =============================================================================
// DATE GUARDIAN BENCHMARKS
// =============================================================================

Deno.bench("Date Guardian - Basic Validation", () => {
  const guard = Guardian.date();
  guard.parse(sampleDate);
});

Deno.bench("Date Guardian - With Range", () => {
  const guard = Guardian.date()
    .min(new Date("2020-01-01"))
    .max(new Date("2030-12-31"));
  guard.parse(sampleDate);
});

Deno.bench("Date Guardian - String Parsing", () => {
  const guard = Guardian.string().process((s: string) => new Date(s));
  guard.parse("2023-06-15T10:30:00Z");
});

// =============================================================================
// BIGINT GUARDIAN BENCHMARKS
// =============================================================================

Deno.bench("BigInt Guardian - Basic Validation", () => {
  const guard = Guardian.bigint();
  guard.parse(sampleBigInt);
});

Deno.bench("BigInt Guardian - With Constraints", () => {
  const guard = Guardian.bigint().positive();
  guard.parse(sampleBigInt);
});

// =============================================================================
// ENUM GUARDIAN BENCHMARKS
// =============================================================================

Deno.bench("Enum Guardian - String Enum", () => {
  const guard = Guardian.enum(["admin", "user", "guest"]);
  guard.parse("admin");
});

Deno.bench("Enum Guardian - Number Enum", () => {
  const guard = Guardian.enum([1, 2, 3, 4, 5]);
  guard.parse(3);
});

// =============================================================================
// UNION AND INTERSECTION BENCHMARKS
// =============================================================================

Deno.bench("Union Guardian - Simple Union", () => {
  const guard = Guardian.oneOf([
    Guardian.string(),
    Guardian.number(),
  ], "Expected string or number");
  guard.parse("hello");
});

Deno.bench("Union Guardian - Complex Union", () => {
  const guard = Guardian.oneOf([
    Guardian.object({ type: Guardian.string().equals("user"), name: Guardian.string() }),
    Guardian.object({ type: Guardian.string().equals("admin"), permissions: Guardian.array(Guardian.string()) }),
  ], "Expected user or admin object");
  guard.parse({ type: "user", name: "John" });
});

// =============================================================================
// TRANSFORMATION BENCHMARKS
// =============================================================================

Deno.bench("Transform - String to Number", () => {
  const guard = Guardian.string().process((s: string) => parseInt(s, 10));
  guard.parse("123");
});

Deno.bench("Transform - Chain Multiple", () => {
  const guard = Guardian.string()
    .process((s: string) => s.trim())
    .process((s: string) => s.toLowerCase())
    .process((s: string) => s.replace(/\s+/g, "-"));
  guard.parse("  Hello World  ");
});

Deno.bench("Transform - Object Transformation", () => {
  const guard = Guardian.object({
    firstName: Guardian.string(),
    lastName: Guardian.string(),
  }).process(({ firstName, lastName }: { firstName: string; lastName: string }) => ({
    fullName: `${firstName} ${lastName}`,
    initials: `${firstName[0]}${lastName[0]}`,
  }));
  guard.parse({ firstName: "John", lastName: "Doe" });
});

// =============================================================================
// REFINEMENT BENCHMARKS
// =============================================================================

Deno.bench("Refine - Simple Refinement", () => {
  const guard = Guardian.string().test((s: string) => s.includes("@"), "Must contain @");
  guard.parse("user@domain.com");
});

Deno.bench("Refine - Complex Refinement", () => {
  const guard = Guardian.object({
    password: Guardian.string(),
    confirmPassword: Guardian.string(),
  }).test(
    (data: { password: string; confirmPassword: string }) => data.password === data.confirmPassword,
    "Passwords must match"
  );
  guard.parse({ password: "secret", confirmPassword: "secret" });
});

// =============================================================================
// SAFE PARSING BENCHMARKS
// =============================================================================

Deno.bench("Safe Parse - Success", () => {
  const guard = Guardian.string();
  guard.safeParse(sampleString);
});

Deno.bench("Safe Parse - Failure", () => {
  const guard = Guardian.string();
  guard.safeParse(123);
});

Deno.bench("Safe Parse - Complex Schema Success", () => {
  const guard = Guardian.object({
    id: Guardian.number(),
    name: Guardian.string(),
    email: Guardian.string().email(),
  });
  guard.safeParse({ id: 1, name: "John", email: "john@example.com" });
});

Deno.bench("Safe Parse - Complex Schema Failure", () => {
  const guard = Guardian.object({
    id: Guardian.number(),
    name: Guardian.string(),
    email: Guardian.string().email(),
  });
  guard.safeParse({ id: "invalid", name: 123, email: "not-an-email" });
});

// =============================================================================
// TYPE CONVERSION BENCHMARKS
// =============================================================================

Deno.bench("Convert - String to Number", () => {
  const guard = Guardian.string().process((s: string) => parseFloat(s));
  guard.parse("123.45");
});

Deno.bench("Convert - String to Boolean", () => {
  const guard = Guardian.string().process((s: string) => s === "true");
  guard.parse("true");
});

Deno.bench("Convert - String to Date", () => {
  const guard = Guardian.string().process((s: string) => new Date(s));
  guard.parse("2023-06-15");
});

// =============================================================================
// LAZY EVALUATION BENCHMARKS
// =============================================================================

Deno.bench("Lazy Guardian - Recursive Schema", () => {
  interface Node {
    value: string;
    children?: Node[];
  }
  
  // Simple recursive validation without lazy (for benchmark purposes)
  const nodeGuard = Guardian.object({
    value: Guardian.string(),
    children: Guardian.array(Guardian.object({
      value: Guardian.string(),
    })).optional(),
  });
  
  nodeGuard.parse({
    value: "root",
    children: [
      { value: "child1" },
      { value: "child2" },
    ],
  });
});

// =============================================================================
// MEMORY AND SCALABILITY BENCHMARKS
// =============================================================================

Deno.bench("Scalability - Large Array", () => {
  const guard = Guardian.array(Guardian.number());
  const largeArray = Array.from({ length: 1000 }, (_, i) => i);
  guard.parse(largeArray);
});

Deno.bench("Scalability - Large Object", () => {
  const guard = Guardian.object(
    Object.fromEntries(
      Array.from({ length: 100 }, (_, i) => [`field${i}`, Guardian.string()])
    )
  );
  const largeObject = Object.fromEntries(
    Array.from({ length: 100 }, (_, i) => [`field${i}`, `value${i}`])
  );
  guard.parse(largeObject);
});

Deno.bench("Scalability - Deep Nesting", () => {
  const guard = Guardian.object({
    level1: Guardian.object({
      level2: Guardian.object({
        level3: Guardian.object({
          level4: Guardian.object({
            level5: Guardian.object({
              value: Guardian.string(),
            }),
          }),
        }),
      }),
    }),
  });
  
  guard.parse({
    level1: {
      level2: {
        level3: {
          level4: {
            level5: {
              value: "deep",
            },
          },
        },
      },
    },
  });
});

// =============================================================================
// REUSABILITY BENCHMARKS
// =============================================================================

Deno.bench("Reusability - Guard Reuse vs Recreation", () => {
  // This benchmark shows the benefit of reusing guards
  const reusableGuard = Guardian.string().minLength(3).maxLength(10);
  
  // Reuse the same guard multiple times
  for (let i = 0; i < 100; i++) {
    reusableGuard.parse("test");
  }
});

Deno.bench("Reusability - Guard Recreation (Anti-pattern)", () => {
  // This shows the cost of recreating guards
  for (let i = 0; i < 100; i++) {
    const guard = Guardian.string().minLength(3).maxLength(10);
    guard.parse("test");
  }
});

console.log("🚀 Guardian benchmarks completed!");
console.log("Run with: deno bench guardian/tests/guardian.bench.ts --allow-all");