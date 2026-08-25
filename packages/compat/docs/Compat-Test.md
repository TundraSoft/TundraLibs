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

> `describe`, `it`, and every hook delegate to the detected runtime's own
> framework (`@std/testing/bdd` on Deno, `bun:test` on Bun, `node:test` on
> Node). Outside those three — browsers, Cloudflare Workers, any other
> runtime — every one of them throws `UnsupportedRuntimeError` (from
> `@tundralibs/compat`) instead of silently no-op'ing: there's no native
> test framework to delegate to.

Reach for this when a suite has to run unmodified under `deno test`,
`bun test`, and `node --test`. It only covers the shape common to all
three — no parametrized/`.each` tests, no built-in mocking (Node's
`test.mock`), no snapshot testing or `.todo` (Bun), no test-context
`t.step()` sub-steps (Deno). If a suite only ever runs on one runtime, or
needs one of those runtime-specific features, importing that runtime's
native test module directly is the better fit.

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

```typescript ignore
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

```typescript ignore
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

#### `.skip` / `.only` shortcuts

`describe` and `it` each carry `.skip` and `.only` static methods —
shorthand for `{ ignore: true }` / `{ only: true }` on the options form.
They only accept the `(name, fn)` string shape; for the options-object
form, pass `ignore`/`only` directly instead.

```typescript ignore
function skip(name: string, fn: () => void | Promise<void>): void;
function only(name: string, fn: () => void | Promise<void>): void;
```

**Example:**

```typescript
import { describe, it } from '@tundralibs/compat/test';

// Bring your own assertions (e.g. `@std/assert` on Deno).
declare function assert(expr: unknown, msg?: string): asserts expr;

describe('Feature flags', () => {
  it.skip('not implemented yet', () => {
    throw new Error('unreachable — skipped');
  });

  it('still runs normally', () => {
    assert(true);
  });
});

// Parked for later — the whole suite (and its children) is skipped.
describe.skip('Legacy importer', () => {
  it('never runs', () => {
    throw new Error('unreachable — suite skipped');
  });
});
```

> `only: true` — including via `.only` — restricts that suite/runtime's
> run to the marked tests, exactly like the native runners' own focus
> mode. Don't leave an `.only` committed: nothing in this module flags it
> the way `compat/bench`'s `only` does for CI (which exits non-zero on an
> auto-run).

### Lifecycle Hooks

> Hook functions are handed straight to the underlying runtime's own
> runner, so whatever `this` resolves to inside one is that runner's
> behavior — not something this module normalizes. Don't rely on `this`
> for a hook meant to run portably; close over local variables instead, as
> the examples below do.

#### `beforeAll()`

Runs once before all tests in the current suite.

```typescript ignore
function beforeAll(fn: HookFn): void;

type HookFn = () => void | Promise<void>;
```

**Example:**

```typescript
import { beforeAll, describe, it } from '@tundralibs/compat/test';

// Bring your own assertions (e.g. `@std/assert` on Deno).
declare function assert(expr: unknown, msg?: string): asserts expr;
declare const database: {
  connect(): Promise<void>;
  query(sql: string): Promise<unknown>;
};

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

```typescript ignore
function afterAll(fn: HookFn): void;
```

**Example:**

```typescript
import { afterAll, describe, it } from '@tundralibs/compat/test';

declare const database: { disconnect(): Promise<void> };

describe('Database', () => {
  afterAll(async () => {
    await database.disconnect();
  });

  // Tests...
});
```

#### `beforeEach()`

Runs before each test in the current suite.

```typescript ignore
function beforeEach(fn: HookFn): void;
```

**Example:**

```typescript
import { beforeEach, describe, it } from '@tundralibs/compat/test';

// Bring your own assertions (e.g. `@std/assert` on Deno).
declare function assertEquals<T>(actual: T, expected: T): void;
declare class Counter {
  readonly value: number;
  increment(): void;
}

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

```typescript ignore
function afterEach(fn: HookFn): void;
```

**Example:**

```typescript
import { afterEach, describe, it } from '@tundralibs/compat/test';

// Bring your own assertions (e.g. `@std/assert` on Deno).
declare function assert(expr: unknown, msg?: string): asserts expr;
declare function cleanupTempFiles(): Promise<void>;
declare function createFile(path: string): Promise<void>;
declare function fileExists(path: string): Promise<boolean>;

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

```typescript ignore
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

// Bring your own assertions (e.g. `@std/assert` on Deno).
declare function assertEquals<T>(actual: T, expected: T): void;

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

// Bring your own assertions (e.g. `@std/assert` on Deno).
declare function assert(expr: unknown, msg?: string): asserts expr;
declare function assertEquals<T>(actual: T, expected: T): void;

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

// Bring your own assertions (e.g. `@std/assert` on Deno).
declare function assert(expr: unknown, msg?: string): asserts expr;
declare function assertEquals<T>(actual: T, expected: T): void;

type User = { id: string; name: string; email: string };

declare class Database {
  static connect(): Promise<Database>;
  migrate(): Promise<void>;
  disconnect(): Promise<void>;
  users: {
    create(data: { name: string; email: string }): Promise<User>;
    update(id: string, data: Partial<User>): Promise<void>;
    findById(id: string): Promise<User>;
    deleteAll(): Promise<void>;
  };
}

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

// Bring your own assertions (e.g. `@std/assert` on Deno).
declare function assert(expr: unknown, msg?: string): asserts expr;
// `Bun` is typed by `@types/bun` in Bun projects.
declare const Bun: { file(path: string): { text(): Promise<string> } };

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

// Bring your own assertions (e.g. `@std/assert` on Deno).
declare function assert(expr: unknown, msg?: string): asserts expr;

describe({
  name: 'Network operations',
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

// Bring your own assertions (e.g. `@std/assert` on Deno).
declare function assertEquals<T>(actual: T, expected: T): void;
declare class Calculator {
  add(a: number, b: number): number;
  subtract(a: number, b: number): number;
}

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

// Bring your own assertions (e.g. `@std/assert` on Deno).
declare function assertThrows(
  fn: () => unknown,
  ErrorClass?: new (...args: never[]) => Error,
  msgIncludes?: string,
): void;
declare function assertRejects(fn: () => Promise<unknown>): Promise<void>;

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
import { SEPARATOR } from '@tundralibs/compat/path';

// Bring your own assertions (e.g. `@std/assert` on Deno).
declare function assertEquals<T>(actual: T, expected: T): void;

describe('Path handling', () => {
  it({
    name: 'should use backslash on Windows',
    windows: true,
    linux: false,
    darwin: false,
    fn() {
      assertEquals(SEPARATOR, '\\');
    },
  });

  it({
    name: 'should use forward slash on Unix',
    windows: false,
    fn() {
      assertEquals(SEPARATOR, '/');
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
import { it } from '@tundralibs/compat/test';

// Bring your own assertions (e.g. `@std/assert` on Deno).
declare function assert(expr: unknown, msg?: string): asserts expr;
declare function assertEquals<T>(actual: T, expected: T): void;
declare const userService: {
  getAll(): Promise<{ id: string; name: string }[]>;
  create(data: { name: string }): Promise<{ id: string; name: string }>;
};

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
