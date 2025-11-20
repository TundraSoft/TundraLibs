/**
 * Guardian vs Zod Performance Comparison
 *
 * Benchmarks comparing Guardian against Zod for equivalent validation scenarios.
 * This helps track Guardian's performance relative to a well-established library.
 *
 * Run with: deno bench guardian/tests/guardian-vs-zod.bench.ts --allow-all
 */

import { z } from "npm:zod";
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

// =============================================================================
// STRING VALIDATION COMPARISON
// =============================================================================

Deno.bench("String Basic - Guardian", () => {
  const guard = Guardian.string();
  guard.parse(sampleString);
});

Deno.bench("String Basic - Zod", () => {
  const schema = z.string();
  schema.parse(sampleString);
});

Deno.bench("String with Length - Guardian", () => {
  const guard = Guardian.string().minLength(5).maxLength(100);
  guard.parse(sampleString);
});

Deno.bench("String with Length - Zod", () => {
  const schema = z.string().min(5).max(100);
  schema.parse(sampleString);
});

Deno.bench("String Email - Guardian", () => {
  const guard = Guardian.string().email();
  guard.parse("john.doe@example.com");
});

Deno.bench("String Email - Zod", () => {
  const schema = z.string().email();
  schema.parse("john.doe@example.com");
});

Deno.bench("String Pattern - Guardian", () => {
  const guard = Guardian.string().pattern(/^[A-Za-z\s,!.]+$/);
  guard.parse(sampleString);
});

Deno.bench("String Pattern - Zod", () => {
  const schema = z.string().regex(/^[A-Za-z\s,!.]+$/);
  schema.parse(sampleString);
});

Deno.bench("String Transform - Guardian", () => {
  const guard = Guardian.string().trim().toLowerCase();
  guard.parse("  HELLO WORLD  ");
});

Deno.bench("String Transform - Zod", () => {
  const schema = z.string().trim().toLowerCase();
  schema.parse("  HELLO WORLD  ");
});

// =============================================================================
// NUMBER VALIDATION COMPARISON
// =============================================================================

Deno.bench("Number Basic - Guardian", () => {
  const guard = Guardian.number();
  guard.parse(sampleNumber);
});

Deno.bench("Number Basic - Zod", () => {
  const schema = z.number();
  schema.parse(sampleNumber);
});

Deno.bench("Number Range - Guardian", () => {
  const guard = Guardian.number().min(0).max(100);
  guard.parse(42);
});

Deno.bench("Number Range - Zod", () => {
  const schema = z.number().min(0).max(100);
  schema.parse(42);
});

Deno.bench("Number Integer - Guardian", () => {
  const guard = Guardian.number().integer();
  guard.parse(42);
});

Deno.bench("Number Integer - Zod", () => {
  const schema = z.number().int();
  schema.parse(42);
});

Deno.bench("Number Positive Integer - Guardian", () => {
  const guard = Guardian.number().positive().integer();
  guard.parse(42);
});

Deno.bench("Number Positive Integer - Zod", () => {
  const schema = z.number().positive().int();
  schema.parse(42);
});

// =============================================================================
// BOOLEAN VALIDATION COMPARISON
// =============================================================================

Deno.bench("Boolean Basic - Guardian", () => {
  const guard = Guardian.boolean();
  guard.parse(true);
});

Deno.bench("Boolean Basic - Zod", () => {
  const schema = z.boolean();
  schema.parse(true);
});

// =============================================================================
// ARRAY VALIDATION COMPARISON
// =============================================================================

Deno.bench("Array Basic - Guardian", () => {
  const guard = Guardian.array(Guardian.string());
  guard.parse(sampleArray);
});

Deno.bench("Array Basic - Zod", () => {
  const schema = z.array(z.string());
  schema.parse(sampleArray);
});

Deno.bench("Array with Length - Guardian", () => {
  const guard = Guardian.array(Guardian.string()).minLength(1).maxLength(10);
  guard.parse(sampleArray);
});

Deno.bench("Array with Length - Zod", () => {
  const schema = z.array(z.string()).min(1).max(10);
  schema.parse(sampleArray);
});

Deno.bench("Array Numbers - Guardian", () => {
  const guard = Guardian.array(Guardian.number());
  guard.parse([1, 2, 3, 4, 5]);
});

Deno.bench("Array Numbers - Zod", () => {
  const schema = z.array(z.number());
  schema.parse([1, 2, 3, 4, 5]);
});

// =============================================================================
// OBJECT VALIDATION COMPARISON
// =============================================================================

Deno.bench("Object Simple - Guardian", () => {
  const guard = Guardian.object({
    id: Guardian.number(),
    name: Guardian.string(),
  });
  guard.parse({ id: 1, name: "Test" });
});

Deno.bench("Object Simple - Zod", () => {
  const schema = z.object({
    id: z.number(),
    name: z.string(),
  });
  schema.parse({ id: 1, name: "Test" });
});

Deno.bench("Object Complex - Guardian", () => {
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

Deno.bench("Object Complex - Zod", () => {
  const schema = z.object({
    id: z.number().positive().int(),
    name: z.string().min(1).max(100),
    email: z.string().email(),
    age: z.number().min(0).max(150).int(),
    active: z.boolean(),
    tags: z.array(z.string()),
    metadata: z.object({
      created: z.date(),
      updated: z.date(),
      version: z.number(),
    }),
  });
  schema.parse(sampleObject);
});

Deno.bench("Object Optional Fields - Guardian", () => {
  const guard = Guardian.object({
    id: Guardian.number(),
    name: Guardian.string(),
    email: Guardian.string().optional(),
    phone: Guardian.string().optional(),
  });
  guard.parse({ id: 1, name: "Test" });
});

Deno.bench("Object Optional Fields - Zod", () => {
  const schema = z.object({
    id: z.number(),
    name: z.string(),
    email: z.string().optional(),
    phone: z.string().optional(),
  });
  schema.parse({ id: 1, name: "Test" });
});

// =============================================================================
// DATE VALIDATION COMPARISON
// =============================================================================

Deno.bench("Date Basic - Guardian", () => {
  const guard = Guardian.date();
  guard.parse(sampleDate);
});

Deno.bench("Date Basic - Zod", () => {
  const schema = z.date();
  schema.parse(sampleDate);
});

Deno.bench("Date Range - Guardian", () => {
  const guard = Guardian.date()
    .min(new Date("2020-01-01"))
    .max(new Date("2030-12-31"));
  guard.parse(sampleDate);
});

Deno.bench("Date Range - Zod", () => {
  const schema = z.date()
    .min(new Date("2020-01-01"))
    .max(new Date("2030-12-31"));
  schema.parse(sampleDate);
});

// =============================================================================
// ENUM VALIDATION COMPARISON
// =============================================================================

Deno.bench("Enum String - Guardian", () => {
  const guard = Guardian.enum(["admin", "user", "guest"]);
  guard.parse("admin");
});

Deno.bench("Enum String - Zod", () => {
  const schema = z.enum(["admin", "user", "guest"]);
  schema.parse("admin");
});

// =============================================================================
// UNION VALIDATION COMPARISON
// =============================================================================

Deno.bench("Union Simple - Guardian", () => {
  const guard = Guardian.oneOf([
    Guardian.string(),
    Guardian.number(),
  ], "Expected string or number");
  guard.parse("hello");
});

Deno.bench("Union Simple - Zod", () => {
  const schema = z.union([z.string(), z.number()]);
  schema.parse("hello");
});

// =============================================================================
// TRANSFORMATION COMPARISON
// =============================================================================

Deno.bench("Transform String to Number - Guardian", () => {
  const guard = Guardian.string().process((s: string) => parseInt(s, 10));
  guard.parse("123");
});

Deno.bench("Transform String to Number - Zod", () => {
  const schema = z.string().transform((s) => parseInt(s, 10));
  schema.parse("123");
});

Deno.bench("Transform Chain - Guardian", () => {
  const guard = Guardian.string()
    .process((s: string) => s.trim())
    .process((s: string) => s.toLowerCase())
    .process((s: string) => s.replace(/\s+/g, "-"));
  guard.parse("  Hello World  ");
});

Deno.bench("Transform Chain - Zod", () => {
  const schema = z.string()
    .transform((s) => s.trim())
    .transform((s) => s.toLowerCase())
    .transform((s) => s.replace(/\s+/g, "-"));
  schema.parse("  Hello World  ");
});

// =============================================================================
// REFINEMENT COMPARISON
// =============================================================================

Deno.bench("Refine Simple - Guardian", () => {
  const guard = Guardian.string().test(
    (s: string) => s.includes("@"),
    "Must contain @",
  );
  guard.parse("user@domain.com");
});

Deno.bench("Refine Simple - Zod", () => {
  const schema = z.string().refine((s) => s.includes("@"), "Must contain @");
  schema.parse("user@domain.com");
});

Deno.bench("Refine Complex - Guardian", () => {
  const guard = Guardian.object({
    password: Guardian.string(),
    confirmPassword: Guardian.string(),
  }).test(
    (data: { password: string; confirmPassword: string }) =>
      data.password === data.confirmPassword,
    "Passwords must match",
  );
  guard.parse({ password: "secret", confirmPassword: "secret" });
});

Deno.bench("Refine Complex - Zod", () => {
  const schema = z.object({
    password: z.string(),
    confirmPassword: z.string(),
  }).refine(
    (data) => data.password === data.confirmPassword,
    "Passwords must match",
  );
  schema.parse({ password: "secret", confirmPassword: "secret" });
});

// =============================================================================
// SAFE PARSING COMPARISON
// =============================================================================

Deno.bench("Safe Parse Success - Guardian", () => {
  const guard = Guardian.string();
  guard.safeParse(sampleString);
});

Deno.bench("Safe Parse Success - Zod", () => {
  const schema = z.string();
  schema.safeParse(sampleString);
});

Deno.bench("Safe Parse Failure - Guardian", () => {
  const guard = Guardian.string();
  guard.safeParse(123);
});

Deno.bench("Safe Parse Failure - Zod", () => {
  const schema = z.string();
  schema.safeParse(123);
});

// =============================================================================
// SCALABILITY COMPARISON
// =============================================================================

Deno.bench("Large Array - Guardian", () => {
  const guard = Guardian.array(Guardian.number());
  const largeArray = Array.from({ length: 1000 }, (_, i) => i);
  guard.parse(largeArray);
});

Deno.bench("Large Array - Zod", () => {
  const schema = z.array(z.number());
  const largeArray = Array.from({ length: 1000 }, (_, i) => i);
  schema.parse(largeArray);
});

Deno.bench("Large Object - Guardian", () => {
  const guard = Guardian.object(
    Object.fromEntries(
      Array.from({ length: 100 }, (_, i) => [`field${i}`, Guardian.string()]),
    ),
  );
  const largeObject = Object.fromEntries(
    Array.from({ length: 100 }, (_, i) => [`field${i}`, `value${i}`]),
  );
  guard.parse(largeObject);
});

Deno.bench("Large Object - Zod", () => {
  const schema = z.object(
    Object.fromEntries(
      Array.from({ length: 100 }, (_, i) => [`field${i}`, z.string()]),
    ),
  );
  const largeObject = Object.fromEntries(
    Array.from({ length: 100 }, (_, i) => [`field${i}`, `value${i}`]),
  );
  schema.parse(largeObject);
});

// =============================================================================
// REAL-WORLD SCENARIO COMPARISON
// =============================================================================

Deno.bench("User Registration - Guardian", () => {
  const guard = Guardian.object({
    username: Guardian.string()
      .trim()
      .minLength(3)
      .maxLength(20)
      .pattern(/^[a-zA-Z0-9_]+$/),
    email: Guardian.string().trim().toLowerCase().email(),
    password: Guardian.string()
      .minLength(8)
      .pattern(/[A-Z]/)
      .pattern(/[a-z]/)
      .pattern(/\d/),
    confirmPassword: Guardian.string(),
    age: Guardian.number().integer().min(13).max(120),
    terms: Guardian.boolean().equals(true),
  }).test(
    (data: any) => data.password === data.confirmPassword,
    "Passwords do not match",
  );

  guard.parse({
    username: "johndoe",
    email: "JOHN@EXAMPLE.COM",
    password: "SecurePass123",
    confirmPassword: "SecurePass123",
    age: 25,
    terms: true,
  });
});

Deno.bench("User Registration - Zod", () => {
  const schema = z.object({
    username: z.string()
      .trim()
      .min(3)
      .max(20)
      .regex(/^[a-zA-Z0-9_]+$/),
    email: z.string().trim().toLowerCase().email(),
    password: z.string()
      .min(8)
      .regex(/[A-Z]/)
      .regex(/[a-z]/)
      .regex(/\d/),
    confirmPassword: z.string(),
    age: z.number().int().min(13).max(120),
    terms: z.boolean().refine((val) => val === true),
  }).refine(
    (data) => data.password === data.confirmPassword,
    "Passwords do not match",
  );

  schema.parse({
    username: "johndoe",
    email: "JOHN@EXAMPLE.COM",
    password: "SecurePass123",
    confirmPassword: "SecurePass123",
    age: 25,
    terms: true,
  });
});

console.log("🔥 Guardian vs Zod benchmarks completed!");
console.log("📊 Compare the results to see relative performance differences.");
console.log(
  "💡 Run with: deno bench guardian/tests/guardian-vs-zod.bench.ts --allow-all",
);
