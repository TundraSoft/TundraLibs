# Testing Instructions

Guidelines for creating and maintaining tests in TundraLibs.

## Testing Philosophy

All code in TundraLibs MUST have comprehensive test coverage. Tests should:

1. **Be cross-runtime** - Work on Deno, Bun, and Node.js
2. **Test all scenarios** - Happy paths, edge cases, and error conditions
3. **Use runtime filters** - Skip tests that don't apply to specific runtimes/OS
4. **Be deterministic** - No flaky tests, no random data
5. **Be isolated** - No dependencies between tests
6. **Be fast** - Use mocks for external services, no unnecessary delays

## File Naming Convention

### Test Files

Test files MUST follow this pattern:

```
{module}.test.ts
```

### Benchmark Files

Benchmark files MUST follow this pattern:

```
{module}.bench.ts
```

### Examples

| Module | Test File        | Benchmark File        | Location                                |
| ------ | ---------------- | --------------------- | --------------------------------------- |
| fetch  | `fetch.test.ts`  | `fetch.bench.ts`      | `packages/compat/`                      |
| Server | `Server.test.ts` | `Server.bench.ts`     | `packages/compat/server/`               |
| once   | `once.test.ts`   | `once.bench.ts`       | `packages/utils/`                       |
| digest | `digest.test.ts` | `digest.bench.ts`     | `packages/crypt/digest/`                |

### Rules

1. **Use .test.ts extension for tests** - Not `.spec.ts` or `_test.ts`
2. **Use .bench.ts extension for benchmarks** - For performance measurements
3. **Match source file name** - `fetch.ts` → `fetch.test.ts` and `fetch.bench.ts`
4. **Same directory as source** - Test and benchmark files live next to source files
5. **One test/benchmark file per source file** - Don't combine multiple modules

## Test File Structure

```typescript
/**
 * @fileoverview Tests for {module description}.
 * @module
 */

import { describe, it } from './test.ts';
import { functionToTest } from './module.ts';
import * as asserts from '@std/asserts';

// =============================================================================
// Test Data / Fixtures
// =============================================================================

const VALID_INPUT = 'test data';
const INVALID_INPUT = '';

// =============================================================================
// Test Suites
// =============================================================================

describe('{Module Name}', () => {
  // ===========================================================================
  // Feature/Section Name
  // ===========================================================================

  describe('Feature Name', () => {
    it('should handle happy path', () => {
      const result = functionToTest(VALID_INPUT);
      asserts.assertEquals(result, expected);
    });

    it('should throw error for invalid input', () => {
      asserts.assertThrows(
        () => functionToTest(INVALID_INPUT),
        ErrorType,
        'expected error message',
      );
    });
  });
});
```

## Runtime and OS Filtering

Use the `describe()` and `it()` options to skip tests on specific runtimes or operating systems.

### Runtime Filters

```typescript
// Skip test on Node.js (TLS not supported)
describe({
  name: 'TLS Features',
  node: false,
  fn: () => {
    it('should use client certificates', async () => {
      // Test TLS
    });
  },
});

// Run test ONLY on Node.js
it({
  name: 'should throw UnsupportedRuntimeError',
  deno: false,
  bun: false,
  fn: async () => {
    await asserts.assertRejects(
      async () => await fetch(url, { tls }),
      UnsupportedRuntimeError,
    );
  },
});

// Skip on multiple runtimes
describe({
  name: 'Runtime-specific feature',
  node: false,
  bun: false,
  fn: () => {
    // Only runs on Deno
  },
});
```

### OS Filters

```typescript
// Skip on Windows (Unix sockets not available)
describe({
  name: 'Unix Socket Tests',
  windows: false,
  fn: () => {
    it('should connect via Unix socket', async () => {
      // Test Unix socket
    });
  },
});

// Skip on Linux
it({
  name: 'should handle Windows-specific path',
  linux: false,
  darwin: false,
  fn: () => {
    // Test Windows paths
  },
});
```

### Available Filters

| Filter    | Type      | Description                     |
| --------- | --------- | ------------------------------- |
| `deno`    | `boolean` | If `false`, skip on Deno        |
| `bun`     | `boolean` | If `false`, skip on Bun         |
| `node`    | `boolean` | If `false`, skip on Node.js     |
| `windows` | `boolean` | If `false`, skip on Windows     |
| `linux`   | `boolean` | If `false`, skip on Linux       |
| `darwin`  | `boolean` | If `false`, skip on macOS       |
| `ignore`  | `boolean` | If `true`, skip unconditionally |
| `only`    | `boolean` | If `true`, run only this test   |

## Test Organization

### 1. Group by Feature/Section

```typescript
describe('Module Name', () => {
  describe('Error Classes', () => {
    describe('ErrorName', () => {
      it('should create error with message', () => {});
      it('should include cause when provided', () => {});
      it('should serialize to JSON', () => {});
    });
  });

  describe('Validation', () => {
    it('should accept valid input', () => {});
    it('should reject invalid input', () => {});
  });

  describe('Edge Cases', () => {
    it('should handle empty input', () => {});
    it('should handle null', () => {});
  });
});
```

### 2. Use Clear Test Names

**Good:**

```typescript
it('should throw FetchFileNotFoundError for missing certificate file', () => {});
it('should accept PKCS#8 private key format', () => {});
it('should validate path against traversal attacks', () => {});
```

**Bad:**

```typescript
it('test 1', () => {});
it('works', () => {});
it('error', () => {});
```

### 3. Test Name Patterns

- **Positive tests**: "should {do something}" or "should accept {valid input}"
- **Negative tests**: "should throw {ErrorType} for {invalid input}"
- **Edge cases**: "should handle {edge case scenario}"
- **State changes**: "should transition from {state A} to {state B}"

## Assertion Patterns

### Basic Assertions

```typescript
import * as asserts from '@std/asserts';

// Equality
asserts.assertEquals(actual, expected);
asserts.assertStrictEquals(actual, expected); // Use for primitives

// Truthiness
asserts.assert(value);
asserts.assertFalse(value);

// Types
asserts.assertInstanceOf(error, ErrorClass);
asserts.assertExists(value);
```

### Error Assertions

```typescript
// Synchronous error
asserts.assertThrows(
  () => functionThatThrows(),
  ErrorType,
  'expected error message substring',
);

// Async error
await asserts.assertRejects(
  async () => await asyncFunctionThatThrows(),
  ErrorType,
  'expected error message substring',
);

// Assert error properties
try {
  functionThatThrows();
  asserts.fail('Should have thrown');
} catch (error) {
  asserts.assertInstanceOf(error, CustomError);
  asserts.assertEquals(error.code, 'EXPECTED_CODE');
  asserts.assertEquals(error.details, expectedDetails);
}
```

### Async Testing

```typescript
// Using async/await
it('should return data', async () => {
  const result = await fetchData();
  asserts.assertEquals(result.status, 'ok');
});

// Testing promises
it('should reject with error', async () => {
  await asserts.assertRejects(
    () => fetchData(),
    NetworkError,
  );
});
```

## Test Data and Fixtures

### 1. Define Constants at Top

```typescript
// At top of file, after imports
const VALID_CERT = `-----BEGIN CERTIFICATE-----
MIIBkTCB+wIJAKHHCgVZU7OXMA0GCSqGSIb3DQEBCwUAMBExDzANBgNVBAMMBnRl
...
-----END CERTIFICATE-----`;

const VALID_KEY = `-----BEGIN PRIVATE KEY-----
...
-----END PRIVATE KEY-----`;

const TEST_CONFIG = {
  timeout: 5000,
  retries: 3,
};
```

### 2. Use Fixtures Directory

For complex test data (files, large JSON, etc.):

```
packages/compat/
├── fetch.ts
├── fetch.test.ts
└── fixtures/
    ├── test-cert.pem
    ├── test-key.pem
    └── test-data.json
```

### 3. Generate Test Data Programmatically

```typescript
// Create temporary test files
it('should read file', async () => {
  const tempDir = makeTempDirSync({ prefix: 'test_' });
  const testFile = join(tempDir, 'test.txt');
  await writeTextFile(testFile, 'test content');

  try {
    const result = await readFile(testFile);
    asserts.assertEquals(result, 'test content');
  } finally {
    removeSync(tempDir); // Cleanup
  }
});
```

## Coverage Goals

### Target Coverage

- **Line Coverage**: 90%+ for new code
- **Branch Coverage**: 85%+ for new code
- **Critical Paths**: 100% (error handling, security, validation)

### What to Test

✅ **Must Test:**

- All exported functions and classes
- All error conditions and error classes
- All validation logic
- Edge cases (empty, null, undefined, boundaries)
- Security features (path traversal, injection, etc.)
- Type discrimination logic
- State transitions

❌ **Don't Test:**

- Third-party library internals
- Simple getters/setters without logic
- Type definitions (TypeScript checks these)

### Running Coverage

```bash
# Deno
deno test -A --coverage=coverage packages/compat/fetch.test.ts
deno coverage coverage --include="fetch.ts"

# Bun
bun test --coverage packages/compat/fetch.test.ts

# Node.js
node --experimental-test-coverage --test packages/compat/fetch.test.ts
```

## Testing Cross-Runtime Code

### 1. Test Runtime Detection

```typescript
describe('Runtime Support', () => {
  it({
    name: 'should throw UnsupportedRuntimeError on Node.js',
    deno: false,
    bun: false,
    fn: async () => {
      await asserts.assertRejects(
        async () => await featureOnlyInDenoBun(),
        UnsupportedRuntimeError,
      );
    },
  });
});
```

### 2. Don't Use Runtime Conditionals

**Bad:**

```typescript
it('should work', () => {
  if (RUNTIME === 'DENO') {
    // Deno test
  } else if (RUNTIME === 'BUN') {
    // Bun test
  }
});
```

**Good:**

```typescript
describe({
  name: 'Deno-specific behavior',
  bun: false,
  node: false,
  fn: () => {
    it('should work', () => {
      // Deno test
    });
  },
});

describe({
  name: 'Bun-specific behavior',
  deno: false,
  node: false,
  fn: () => {
    it('should work', () => {
      // Bun test
    });
  },
});
```

### 3. Test All Runtimes Locally

Before committing:

```bash
# Test on all runtimes
deno test -A packages/compat/fetch.test.ts
bun test packages/compat/fetch.test.ts
node --experimental-strip-types --test packages/compat/fetch.test.ts
```

## Common Patterns

### Testing Error Classes

```typescript
describe('ErrorName', () => {
  it('should create error with all properties', () => {
    const error = new ErrorName('message', 'source');
    asserts.assertStrictEquals(error.message, 'message');
    asserts.assertStrictEquals(error.source, 'source');
    asserts.assertStrictEquals(error.name, 'ErrorName');
    asserts.assert(error instanceof Error);
    asserts.assert(error instanceof ErrorName);
  });

  it('should include cause when provided', () => {
    const cause = new Error('underlying error');
    const error = new ErrorName('wrapper', 'src', cause);
    asserts.assertStrictEquals(error.cause, cause);
  });

  it('should serialize to JSON correctly', () => {
    const error = new ErrorName('test', 'src');
    const json = error.toJSON();
    asserts.assertStrictEquals(json.name, 'ErrorName');
    asserts.assertStrictEquals(json.message, 'test');
    asserts.assertStrictEquals(json.source, 'src');
  });
});
```

### Testing Validation Functions

```typescript
describe('Validation', () => {
  it('should accept valid input', () => {
    asserts.assertStrictEquals(validate('valid'), true);
  });

  it('should reject empty string', () => {
    asserts.assertThrows(
      () => validate(''),
      ValidationError,
      'cannot be empty',
    );
  });

  it('should reject null', () => {
    asserts.assertThrows(
      () => validate(null),
      ValidationError,
    );
  });

  it('should handle boundary values', () => {
    asserts.assertStrictEquals(validate('a'), true); // Min
    asserts.assertStrictEquals(validate('x'.repeat(1000)), true); // Max
  });
});
```

### Testing Async Functions

```typescript
describe('Async Operations', () => {
  it('should return data on success', async () => {
    const result = await fetchData();
    asserts.assertEquals(result.status, 'ok');
    asserts.assertExists(result.data);
  });

  it('should throw on network error', async () => {
    await asserts.assertRejects(
      async () => await fetchData('https://invalid.invalid'),
      NetworkError,
    );
  });

  it('should support AbortController', async () => {
    const controller = new AbortController();
    controller.abort();

    await asserts.assertRejects(
      async () => await fetchData(url, { signal: controller.signal }),
    );
  });
});
```

### Testing File Operations

```typescript
describe('File Operations', () => {
  it('should read file content', async () => {
    const tempDir = makeTempDirSync({ prefix: 'test_' });
    const testFile = join(tempDir, 'test.txt');
    await writeTextFile(testFile, 'content');

    try {
      const result = await readFile(testFile);
      asserts.assertEquals(result, 'content');
    } finally {
      removeSync(tempDir);
    }
  });

  it('should throw for non-existent file', async () => {
    await asserts.assertRejects(
      async () => await readFile('/nonexistent/file.txt'),
      FileNotFoundError,
    );
  });
});
```

## Anti-Patterns

### ❌ Don't Do This

```typescript
// ❌ Using if statements for runtime checks
it('test', () => {
  if (RUNTIME === 'DENO') {
    // ...
  }
});

// ❌ Vague test names
it('test 1', () => {});
it('works', () => {});

// ❌ Testing implementation details
it('should call internal function', () => {
  // Don't test private/internal implementation
});

// ❌ Tests that depend on execution order
it('setup', () => {
  globalState = 'ready';
});
it('test', () => {/* depends on previous test */});

// ❌ Not cleaning up resources
it('test', async () => {
  const tempFile = await createTempFile();
  // Test code
  // ❌ File not deleted!
});

// ❌ Catching exceptions without assertions
it('test', () => {
  try {
    functionThatShouldThrow();
  } catch {
    // ❌ Exception caught but not verified!
  }
});

// ❌ Using real external services
it('test', async () => {
  await fetch('https://real-api.com'); // ❌ Flaky, slow
});

// ❌ Random/non-deterministic data
it('test', () => {
  const random = Math.random(); // ❌ Non-deterministic
});
```

### ✅ Do This Instead

```typescript
// ✅ Use runtime filters
describe({
  name: 'Deno feature',
  bun: false,
  node: false,
  fn: () => {
    it('test', () => {});
  },
});

// ✅ Clear, descriptive test names
it('should throw FileNotFoundError for missing file', () => {});

// ✅ Test public API behavior
it('should return correct result', () => {
  const result = publicFunction();
  asserts.assertEquals(result, expected);
});

// ✅ Isolated tests with cleanup
it('should read file', async () => {
  const tempDir = makeTempDirSync();
  try {
    // Test code
  } finally {
    removeSync(tempDir); // ✅ Always cleanup
  }
});

// ✅ Verify exceptions properly
it('should throw error', () => {
  asserts.assertThrows(
    () => functionThatShouldThrow(),
    ErrorType,
    'expected message',
  );
});

// ✅ Use mock data
it('test', async () => {
  const mockResponse = { status: 'ok', data: 'test' };
  // Test with mock
});

// ✅ Deterministic data
it('test', () => {
  const testData = 'consistent-test-value';
  // Test with fixed data
});
```

## Benchmarking

### When to Create Benchmarks

Create benchmark files for:

✅ **Should Benchmark:**
- Performance-critical functions (parsing, hashing, encryption)
- Functions with multiple implementation strategies
- Functions that process large data sets
- Caching and memoization implementations
- String/array manipulation utilities
- Network operations
- File I/O operations

❌ **Don't Benchmark:**
- Simple getters/setters
- Type guards and validations
- Error constructors
- Configuration objects
- Trivial utility functions

### Benchmark File Structure

```typescript
/**
 * @fileoverview Benchmarks for {module description}.
 * @module
 */

import { functionToBench } from './module.ts';

// =============================================================================
// Setup / Test Data
// =============================================================================

const TEST_DATA = 'sample data';
const LARGE_DATA = 'x'.repeat(10000);

// Prime any cached functions
const cachedFn = memoize((x: number) => x * 2);
cachedFn(1);

// =============================================================================
// Benchmarks
// =============================================================================

Deno.bench({
  name: 'module.function - baseline case',
  fn: () => {
    functionToBench(TEST_DATA);
  },
});

Deno.bench({
  name: 'module.function - large input',
  fn: () => {
    functionToBench(LARGE_DATA);
  },
});

Deno.bench({
  name: 'module.function - async operation',
  fn: async () => {
    await asyncFunctionToBench(TEST_DATA);
  },
});
```

### Benchmark Naming Convention

Use this format:

```
{package}.{module} - {scenario}
```

**Examples:**

```typescript
Deno.bench({
  name: 'utils.once - plain function call',
  fn: () => plainFn(10, 20),
});

Deno.bench({
  name: 'utils.once - first invocation cost',
  fn: () => {
    const local = once((x: number) => x * 2);
    local(5);
  },
});

Deno.bench({
  name: 'utils.once - cached invocation cost',
  fn: () => onceFn(10, 20),
});

Deno.bench({
  name: 'crypt.digest - SHA-256',
  fn: async () => {
    await digest('hello world', { algorithm: 'SHA-256' });
  },
});
```

### Benchmark Scenarios

Test multiple scenarios:

1. **Baseline** - Normal/expected input
2. **Small input** - Minimal data
3. **Large input** - Maximum realistic data size
4. **Edge cases** - Empty, null, boundary values
5. **Cached vs uncached** - First call vs subsequent calls
6. **Different algorithms** - Compare multiple approaches
7. **Async vs sync** - If both variants exist

**Example:**

```typescript
// Baseline
Deno.bench({
  name: 'utils.templatize - simple template',
  fn: () => templatize('Hello {{name}}', { name: 'World' }),
});

// Large input
Deno.bench({
  name: 'utils.templatize - large template',
  fn: () => templatize(largeTemplate, largeData),
});

// Multiple variables
Deno.bench({
  name: 'utils.templatize - many variables',
  fn: () => templatize(templateWithManyVars, manyVarData),
});

// Comparison
Deno.bench({
  name: 'utils.templatize - vs string concatenation',
  fn: () => `Hello ${data.name}`,
});
```

### Setup and Priming

**Prime cached functions before benchmarking:**

```typescript
// Prime the cache with first invocation
const cachedFn = memoize((x: number) => x * 2);
cachedFn(1); // Don't measure this

Deno.bench({
  name: 'utils.memoize - cached invocation',
  fn: () => cachedFn(1), // Measure cached performance
});
```

**Create test data outside bench functions:**

```typescript
// ✅ Good - data created once
const testData = generateLargeData();

Deno.bench({
  name: 'process large data',
  fn: () => process(testData),
});

// ❌ Bad - data created each iteration
Deno.bench({
  name: 'process large data',
  fn: () => {
    const testData = generateLargeData(); // Measured!
    process(testData);
  },
});
```

### Async Benchmarks

```typescript
Deno.bench({
  name: 'async operation',
  fn: async () => {
    await asyncFunction();
  },
});

// Multiple async operations
Deno.bench({
  name: 'parallel operations',
  fn: async () => {
    await Promise.all([
      asyncFunc1(),
      asyncFunc2(),
      asyncFunc3(),
    ]);
  },
});
```

### Running Benchmarks

**Single file:**

```bash
deno bench packages/utils/once.bench.ts
```

**All benchmarks in package:**

```bash
deno bench packages/utils/**/*.bench.ts
```

**All benchmarks in workspace:**

```bash
deno bench
```

**With permissions:**

```bash
deno bench -A packages/compat/file.bench.ts
```

### Benchmark Output

```
cpu: Apple M1 Pro
runtime: deno 1.40.0 (aarch64-apple-darwin)

file:///packages/utils/once.bench.ts
benchmark                          time (avg)        iter/s             (min … max)       p75       p99      p995
----------------------------------------------------------------- -----------------------------
utils.once - plain function call    3.14 ns/iter 318,471,337.9   (2.92 ns … 33.33 ns)   3.13 ns   3.75 ns   4.17 ns
utils.once - first invocation      42.08 ns/iter  23,764,258.6  (40.83 ns … 70.83 ns)  41.67 ns  50.42 ns  54.17 ns
utils.once - cached invocation      4.17 ns/iter 239,808,153.5   (3.75 ns … 41.67 ns)   4.17 ns   5.42 ns   7.08 ns
```

### Interpreting Results

- **time (avg)** - Average execution time per iteration
- **iter/s** - Iterations per second (throughput)
- **min … max** - Range of execution times
- **p75, p99, p995** - Percentile values

### Best Practices

✅ **Do:**
- Use realistic test data sizes
- Prime caches before measuring cached performance
- Create test data outside benchmark functions
- Test multiple input sizes
- Compare against baseline (plain implementation)
- Use descriptive benchmark names
- Include async benchmarks for async functions

❌ **Don't:**
- Measure setup/initialization in benchmarks
- Use random data (non-deterministic)
- Include console.log in benchmarks
- Benchmark trivial operations
- Forget to prime cached functions
- Mix sync and async in same benchmark

### Cross-Runtime Benchmarking

**Current Status:** Deno only

Benchmarks currently use `Deno.bench` and only run on Deno. Cross-runtime benchmarking utilities are being developed.

**Future:** When cross-runtime benchmarking is available, benchmarks will run on Deno, Bun, and Node.js for comparison.

## Pre-Commit Checklist

Before committing test/benchmark files:

**Tests:**
- [ ] All tests pass on Deno, Bun, and Node.js
- [ ] Coverage meets targets (90%+ line, 85%+ branch)
- [ ] No flaky tests (run multiple times to verify)
- [ ] Runtime filters used correctly (no if/else for RUNTIME)
- [ ] All resources cleaned up (files, connections, etc.)
- [ ] Test names are clear and descriptive
- [ ] No hardcoded paths or URLs
- [ ] File follows naming convention (`{module}.test.ts`)
- [ ] Documentation added for complex test scenarios
- [ ] No console.log or debug code left in

**Benchmarks:**
- [ ] Benchmark file created for performance-critical functions
- [ ] File follows naming convention (`{module}.bench.ts`)
- [ ] Benchmarks run successfully with `deno bench`
- [ ] Multiple scenarios tested (baseline, large input, edge cases)
- [ ] Test data created outside benchmark functions
- [ ] Cached functions primed before measuring
- [ ] Benchmark names follow `{package}.{module} - {scenario}` format
- [ ] No setup/initialization measured in benchmarks
- [ ] Async operations use async benchmark format
- [ ] Results are deterministic (no random data)

## Related Files

- `packages/compat/test.ts` - Test infrastructure and utilities
- `.github/workflows/test.yml` - CI test configuration
