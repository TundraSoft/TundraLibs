# Utils - once

Function execution control for single-call enforcement with result caching.

[← Back to Utils](../README.md)

## Overview

The once utility ensures functions execute only once, caching results for subsequent calls:

- **Single Execution**: Guaranteed one-time execution
- **Result Caching**: Memoizes return value
- **Error Handling**: Caches and re-throws errors
- **Async Support**: Works with promises
- **Method Decorator**: `@Once` for class methods

## Installation

```bash
deno add @tundralibs/utils
```

## API Reference

### `once<T>(fn: T): T`

Wraps a function to execute only once.

**Parameters:**

- `fn`: Function to wrap

**Returns:** Wrapped function that executes once

### `@Once`

Decorator for class methods.

## Usage Examples

### Basic Usage

```typescript
import { once } from '@tundralibs/utils';

const initialize = once(() => {
  console.log('Initializing...');
  return loadConfiguration();
});

initialize(); // Logs "Initializing...", returns config
initialize(); // Returns cached config (no log)
initialize(); // Returns cached config (no log)
```

### Expensive Computation

```typescript
const calculatePi = once((precision: number) => {
  console.log('Computing π...');
  // Expensive calculation
  return complexPiCalculation(precision);
});

const pi1 = calculatePi(1000); // Computes
const pi2 = calculatePi(2000); // Returns cached result (ignores new arg)
console.log(pi1 === pi2); // true
```

### Async Initialization

```typescript
const connectDB = once(async () => {
  console.log('Connecting to database...');
  await delay(1000);
  return new DatabaseConnection();
});

// Multiple calls, but only one connection
const db1 = await connectDB();
const db2 = await connectDB();
console.log(db1 === db2); // true
```

### Method Decorator

```typescript
import { Once } from '@tundralibs/utils';

class Application {
  @Once
  initialize() {
    console.log('App initializing...');
    this.loadPlugins();
    this.setupRoutes();
    return 'ready';
  }

  @Once
  async loadDatabase() {
    console.log('Loading DB...');
    return await connectToDatabase();
  }
}

const app = new Application();
app.initialize(); // Runs initialization
app.initialize(); // Returns cached result
app.initialize(); // Returns cached result
```

### Error Handling

```typescript
const riskyOperation = once(() => {
  throw new Error('Operation failed');
});

try {
  riskyOperation();
} catch (err) {
  console.log(err.message); // "Operation failed"
}

try {
  riskyOperation(); // Throws same cached error
} catch (err) {
  console.log(err.message); // "Operation failed"
}
```

### Resource Allocation

```typescript
const getLogger = once(() => {
  console.log('Creating logger instance...');
  return new Logger({
    level: 'info',
    output: 'console',
  });
});

// Safe to call from multiple modules
export const logger = getLogger();
```

## Best Practices

1. **Initialization**: Use for setup functions
2. **Resource Creation**: Single instance of connections, loggers
3. **Expensive Ops**: Cache results of costly operations
4. **Not for Parameterized Calls**: Arguments after first call are ignored

## Common Patterns

### Module Initialization

```typescript
const initializeModule = once(() => {
  console.log('Module initializing...');
  loadConfig();
  setupHooks();
  registerPlugins();
  return { status: 'ready' };
});

export { initializeModule };
```

### Lazy Loading

```typescript
const getHeavyLib = once(async () => {
  console.log('Loading heavy library...');
  return await import('./heavy-library.js');
});

// Library loads only when first needed
const lib = await getHeavyLib();
```

## Comparison with memoize

| Feature           | once                | memoize              |
| ----------------- | ------------------- | -------------------- |
| Execution count   | Exactly once        | Once per unique args |
| Argument handling | Ignores after first | Considers all        |
| Use case          | Initialization      | Computation cache    |
| TTL support       | No                  | Yes                  |

## Related Utilities

- [memoize](Utils-Memoize.md) - Cache with argument-based keys
- [Singleton](Utils-Singleton.md) - Single class instance
- [throttle](Utils-Throttle.md) - Rate-limit execution

[← Back to Utils](../README.md)
