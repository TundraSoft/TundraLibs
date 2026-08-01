# Compat-Test

Cross-runtime testing framework with unified API.

![Deno](https://img.shields.io/badge/Deno-000000?logo=deno)
![Bun](https://img.shields.io/badge/Bun-f9f1e1?logo=bun)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)

## Table of Contents

- [Overview](#overview)
- [Installation](#installation)
- [API Reference](#api-reference)
- [Test Filtering](#test-filtering)
- [Examples](#examples)

## Overview

The Test module provides a unified testing API that works seamlessly across Deno, Bun, and Node.js. It wraps each runtime's native test framework with a consistent interface.

### Features

| Feature            | Bun | Deno | Node.js |
| ------------------ | --- | ---- | ------- |
| describe/it syntax | ✅  | ✅   | ✅      |
| Async tests        | ✅  | ✅   | ✅      |
| Lifecycle hooks    | ✅  | ✅   | ✅      |
| Runtime filtering  | ✅  | ✅   | ✅      |
| OS filtering       | ✅  | ✅   | ✅      |
| Permissions (Deno) | ➖  | ✅   | ➖      |
| Test isolation     | ✅  | ✅   | ✅      |

## Installation

**Deno:**

```bash
deno add @tundralibs/compat
```

**Bun:**

```bash
bunx jsr add @tundralibs/compat
```

**Node.js:**

```bash
npx jsr add @tundralibs/compat
```

## API Reference

### Test Structure

#### `describe()`

Creates a test suite (group of related tests).

```typescript
function describe(
  name: string,
  fn: () => void | Promise<void>,
): void;

function describe(
  options: DescribeOptions,
): void;
```

**Parameters:**

- `name` - Suite name
- `options` - Suite configuration including `fn` (see [DescribeOptions](#describeoptions))

**Example:**

```typescript
import { describe } from '@tundralibs/compat/test';

describe('Calculator', () => {
  // Tests go here
});

describe({
  name: 'API Tests',
  permissions: { net: true },
  beforeAll() {
    // Setup
  },
  fn() {
    // Tests go here
  },
});
```

#### `it()` / `test()`

Creates a test case. `test()` is an alias for `it()`.

```typescript
function it(
  name: string,
  fn: () => void | Promise<void>,
): void;

function it(
  options: ItOptions,
): void;

// Alias
const test = it;
```

**Parameters:**

- `name` - Test name
- `options` - Test configuration including `fn` (see [ItOptions](#itoptions))

**Example:**

```typescript
import { it, test } from '@tundralibs/compat/test';

it('should add numbers', () => {
  // assertion here
});

test('should handle async', async () => {
  const result = await Promise.resolve(42);
  // assertion here
});

it({
  name: 'should work in Deno only',
  deno: true,
  bun: false,
  node: false,
  fn() {
    // Test code
  },
});
```

### Lifecycle Hooks

#### `beforeAll()`

Runs once before all tests in the current suite.

```typescript
function beforeAll(fn: HookFn): void;

type HookFn = () => void | Promise<void>;
```

**Example:**

```typescript
import { beforeAll, describe, it } from '@tundralibs/compat/test';

describe('Database', () => {
  beforeAll(async () => {
    await database.connect();
  });

  it('should query', async () => {
    const result = await database.query('SELECT 1');
    assert(result !== undefined);
  });
});
```

#### `afterAll()`

Runs once after all tests in the current suite.

```typescript
function afterAll(fn: HookFn): void;
```

**Example:**

```typescript
import { afterAll, describe, it } from '@tundralibs/compat/test';

describe('Database', () => {
  afterAll(async () => {
    await database.disconnect();
  });

  // Tests...
});
```

#### `beforeEach()`

Runs before each test in the current suite.

```typescript
function beforeEach(fn: HookFn): void;
```

**Example:**

```typescript
import { beforeEach, describe, it } from '@tundralibs/compat/test';

describe('Counter', () => {
  let counter: Counter;

  beforeEach(() => {
    counter = new Counter();
  });

  it('should start at zero', () => {
    assertEquals(counter.value, 0);
  });

  it('should increment', () => {
    counter.increment();
    assertEquals(counter.value, 1);
  });
});
```

#### `afterEach()`

Runs after each test in the current suite.

```typescript
function afterEach(fn: HookFn): void;
```

**Example:**

```typescript
import { afterEach, describe, it } from '@tundralibs/compat/test';

describe('File operations', () => {
  afterEach(async () => {
    await cleanupTempFiles();
  });

  it('should create file', async () => {
    await createFile('./temp/test.txt');
    assert(await fileExists('./temp/test.txt'));
  });
});
```

### Options Types

#### `ItOptions`

Configuration for individual test cases.

```typescript
interface ItOptions {
  name?: string;
  fn?: () => void | Promise<void>;
  ignore?: boolean; // Skip this test
  only?: boolean; // Run only this test
  deno?: boolean; // If false, skip in Deno
  bun?: boolean; // If false, skip in Bun
  node?: boolean; // If false, skip in Node.js
  windows?: boolean; // If false, skip on Windows
  linux?: boolean; // If false, skip on Linux
  darwin?: boolean; // If false, skip on macOS
}
```

#### `DescribeOptions`

Configuration for test suites.

```typescript
interface DescribeOptions extends ItOptions {
  permissions?: PermissionOptions; // Deno only
  sanitizeOps?: boolean; // Deno only
  sanitizeResources?: boolean; // Deno only
  sanitizeExit?: boolean; // Deno only
  beforeAll?: HookFn;
  afterAll?: HookFn;
  beforeEach?: HookFn;
  afterEach?: HookFn;
}

type PermissionOptions = {
  [K in PermissionName]?: 'inherit' | boolean | string[];
};
```

## Test Filtering

### Runtime Filtering

Skip tests based on runtime:

```typescript
import { it } from '@tundralibs/compat/test';

// Run only in Deno
it({
  name: 'Deno-specific test',
  deno: true,
  bun: false,
  node: false,
  fn() {
    const file = Deno.readTextFileSync('./file.txt');
  },
});

// Skip in Bun
it({
  name: 'Not for Bun',
  bun: false,
  fn() {
    // Runs in Deno and Node.js only
  },
});

// Run in Bun or Node.js
it({
  name: 'Server runtimes',
  deno: false,
  fn() {
    // Runs in Bun and Node.js
  },
});
```

### OS Filtering

Skip tests based on operating system:

```typescript
import { it } from '@tundralibs/compat/test';

// Run only on Windows
it({
  name: 'Windows-specific',
  windows: true,
  linux: false,
  darwin: false,
  fn() {
    // Windows-only test
  },
});

// Skip on Windows
it({
  name: 'Unix-like systems',
  windows: false,
  fn() {
    // Runs on Linux and macOS
  },
});

// Run only on macOS
it({
  name: 'macOS-specific',
  darwin: true,
  windows: false,
  linux: false,
  fn() {
    // macOS-only test
  },
});
```

### Combined Filtering

Combine runtime and OS filters:

```typescript
import { it } from '@tundralibs/compat/test';

it({
  name: 'Deno on Linux',
  deno: true,
  bun: false,
  node: false,
  linux: true,
  windows: false,
  darwin: false,
  fn() {
    // Only runs on Deno + Linux
  },
});
```

### Manual Ignore

```typescript
import { it } from '@tundralibs/compat/test';

// Always skip
it({
  name: 'Work in progress',
  ignore: true,
  fn() {
    // Not implemented yet
  },
});

// Skip conditionally
const isCI = Deno.env.get('CI') === 'true';
it({
  name: 'Local only',
  ignore: isCI,
  fn() {
    // Only runs locally, not in CI
  },
});
```

### Focus Tests

```typescript
import { it } from '@tundralibs/compat/test';

// Run only this test (and other 'only' tests)
it({
  name: 'Debug this',
  only: true,
  fn() {
    // Focused test
  },
});

// This won't run when 'only' tests exist
it('Normal test', () => {
  // Skipped
});
```

## Examples

> **Note:** The `compat/test` module provides the test structure (`describe`, `it`, hooks). Use your preferred assertion library — for example `@std/assert` in Deno (`assertEquals`, `assertStrictEquals`) or any compatible assertion library.

### Basic Testing

```typescript
import { describe, it } from '@tundralibs/compat/test';
import { assertEquals } from '@std/assert';

describe('Math operations', () => {
  it('should add', () => {
    assertEquals(2 + 2, 4);
  });

  it('should subtract', () => {
    assertEquals(5 - 3, 2);
  });

  it('should multiply', () => {
    assertEquals(3 * 4, 12);
  });

  it('should divide', () => {
    assertEquals(10 / 2, 5);
  });
});
```

### Async Testing

```typescript
import { describe, it } from '@tundralibs/compat/test';
import { assert, assertEquals } from '@std/assert';

describe('Async operations', () => {
  it('should fetch data', async () => {
    const response = await fetch('https://api.example.com/data');
    const data = await response.json();
    assert(data !== undefined);
  });

  it('should handle promises', async () => {
    const result = await Promise.resolve(42);
    assertEquals(result, 42);
  });

  it('should handle rejection', async () => {
    let threw = false;
    try {
      await Promise.reject(new Error('error'));
    } catch {
      threw = true;
    }
    assert(threw);
  });
});
```

### Lifecycle Hooks

```typescript
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  it,
} from '@tundralibs/compat/test';

describe('User service', () => {
  let database: Database;
  let user: User;

  beforeAll(async () => {
    database = await Database.connect();
    await database.migrate();
  });

  afterAll(async () => {
    await database.disconnect();
  });

  beforeEach(async () => {
    user = await database.users.create({
      name: 'Test User',
      email: 'test@example.com',
    });
  });

  afterEach(async () => {
    await database.users.deleteAll();
  });

  it('should create user', () => {
    assert(user.id !== undefined);
    assertEquals(user.name, 'Test User');
  });

  it('should update user', async () => {
    await database.users.update(user.id, { name: 'Updated' });
    const updated = await database.users.findById(user.id);
    assertEquals(updated.name, 'Updated');
  });
});
```

### Runtime-Specific Tests

```typescript
import { describe, it } from '@tundralibs/compat/test';

describe('File system', () => {
  it({
    name: 'should read file (Deno)',
    deno: true,
    bun: false,
    node: false,
    async fn() {
      const content = await Deno.readTextFile('./test.txt');
      assert(content.includes('test'));
    },
  });

  it({
    name: 'should read file (Bun)',
    deno: false,
    bun: true,
    node: false,
    async fn() {
      const file = Bun.file('./test.txt');
      const content = await file.text();
      assert(content.includes('test'));
    },
  });

  it({
    name: 'should read file (Node.js)',
    deno: false,
    bun: false,
    node: true,
    async fn() {
      const fs = await import('node:fs/promises');
      const content = await fs.readFile('./test.txt', 'utf-8');
      assert(content.includes('test'));
    },
  });
});
```

### Deno Permissions

```typescript
import { describe, it } from '@tundralibs/compat/test';

describe('Network operations', {
  permissions: {
    net: ['api.example.com'],
    read: ['./config.json'],
  },
  fn() {
    it('should fetch from API', async () => {
      const response = await fetch('https://api.example.com/data');
      assert(response.ok);
    });

    it('should read config', async () => {
      const config = await Deno.readTextFile('./config.json');
      assert(JSON.parse(config) !== undefined);
    });
  },
});
```

### Nested Suites

```typescript
import { beforeEach, describe, it } from '@tundralibs/compat/test';
import { assertEquals } from '@std/assert';

describe('Calculator', () => {
  let calc: Calculator;

  beforeEach(() => {
    calc = new Calculator();
  });

  describe('Addition', () => {
    it('should add positive numbers', () => {
      assertEquals(calc.add(2, 3), 5);
    });

    it('should add negative numbers', () => {
      assertEquals(calc.add(-2, -3), -5);
    });

    it('should add mixed signs', () => {
      assertEquals(calc.add(5, -3), 2);
    });
  });

  describe('Subtraction', () => {
    it('should subtract positive numbers', () => {
      assertEquals(calc.subtract(5, 3), 2);
    });

    it('should subtract negative numbers', () => {
      assertEquals(calc.subtract(-5, -3), -2);
    });
  });
});
```

### Error Testing

```typescript
import { describe, it } from '@tundralibs/compat/test';
import { assertRejects, assertThrows } from '@std/assert';

describe('Error handling', () => {
  it('should throw error', () => {
    assertThrows(() => {
      throw new Error('Test error');
    });
  });

  it('should throw specific error', () => {
    assertThrows(() => {
      throw new TypeError('Invalid type');
    }, TypeError);
  });

  it('should throw with message', () => {
    assertThrows(
      () => {
        throw new Error('Expected message');
      },
      Error,
      'Expected message',
    );
  });

  it('should handle async errors', async () => {
    await assertRejects(async () => {
      throw new Error('Async error');
    });
  });
});
```

### OS-Specific Tests

```typescript
import { describe, it } from '@tundralibs/compat/test';

describe('Path handling', () => {
  it({
    name: 'should use backslash on Windows',
    windows: true,
    linux: false,
    darwin: false,
    fn() {
      assertEquals(path.separator, '\\');
    },
  });

  it({
    name: 'should use forward slash on Unix',
    windows: false,
    fn() {
      assertEquals(path.separator, '/');
    },
  });
});
```

## Best Practices

1. **Use descriptive names** - Test names should clearly describe what is being tested
2. **One assertion per test** - Keep tests focused on a single behavior
3. **Use lifecycle hooks** - Setup and cleanup in hooks, not in tests
4. **Test isolation** - Each test should be independent
5. **Filter appropriately** - Only skip tests when necessary for compatibility

**Example:**

```typescript
// ✅ Good - Descriptive and focused
it('should return empty array when no users exist', async () => {
  const users = await userService.getAll();
  assertEquals(users, []);
});

// ❌ Bad - Vague and multiple concerns
it('works', async () => {
  const users = await userService.getAll();
  assertEquals(users, []);
  const user = await userService.create({ name: 'Test' });
  assert(user.id !== undefined);
});

// ✅ Good - Proper filtering
it({
  name: 'should use Deno.serve',
  deno: true,
  fn() {
    // Deno-specific code
  },
});

// ❌ Bad - Unnecessary filtering
it('should add numbers', () => {
  assertEquals(1 + 1, 2); // Works everywhere, no filter needed
});
```

---

[← Back to Compat](../README.md)
