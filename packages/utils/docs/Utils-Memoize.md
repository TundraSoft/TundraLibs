# Utils - memoize

Function and method memoization with TTL, async support, and automatic cleanup.

[← Back to Utils](../README.md)

## Overview

The memoize utility provides advanced caching for functions and class methods:

- **TTL Support**: Time-based cache expiration
- **Async Functions**: Proper promise handling and deduplication
- **Method Decorator**: `@Memoize` for class methods
- **Memory Management**: Automatic cache cleanup
- **Type Safety**: Full TypeScript support

## Installation

```bash
deno add @tundralibs/utils
```

## API Reference

### `memoize<T>(fn: T, timeout?: number): T`

Memoizes a function with optional time-to-live.

**Parameters:**

- `fn`: Function to memoize
- `timeout`: Cache lifetime in **seconds** (default: 1800 — 30 minutes)

**Returns:** Memoized version of the function

### `@Memoize(timeout?: number)`

Decorator for memoizing class methods. Exported directly from `memoize.ts`; the main module only exports `memoize`.

## Usage Examples

### Basic Function Memoization

```typescript
import { memoize } from '@tundralibs/utils';

const expensiveCalc = (n: number): number => {
  console.log('Computing...');
  return n * n * n;
};

const memoized = memoize(expensiveCalc);

console.log(memoized(5)); // Logs "Computing...", returns 125
console.log(memoized(5)); // Returns 125 (cached, no log)
console.log(memoized(6)); // Logs "Computing...", returns 216
```

### With TTL (Time-To-Live)

```typescript
import { memoize } from '@tundralibs/utils';

declare function fetchFromAPI(id: string): Promise<string>;

// Cache expires after 5 seconds
const getData = memoize(
  async (id: string) => await fetchFromAPI(id),
  5, // seconds
);

await getData('user123'); // Fetches from API
await getData('user123'); // Returns cached (within 5s)

// Wait 6 seconds
await new Promise((r) => setTimeout(r, 6000));
await getData('user123'); // Fetches again (cache expired)
```

### Method Decorator

```typescript
import { Memoize } from '@tundralibs/utils'; // also available at '@tundralibs/utils/memoize'

interface Data {
  id: number;
}

declare const api: { get(path: string): Promise<Data> };
declare function complexCalculation(precision: number): number;

class Calculator {
  @Memoize(10) // 10 second cache
  async fetchData(id: number): Promise<Data> {
    console.log('Fetching data...');
    return await api.get(`/data/${id}`);
  }

  @Memoize() // 30-minute cache (default)
  calculatePi(precision: number): number {
    console.log('Computing π...');
    return complexCalculation(precision);
  }
}

const calc = new Calculator();

// First call - computes
await calc.fetchData(1);

// Second call - cached
await calc.fetchData(1);
```

### Async Function Deduplication

```typescript
import { memoize } from '@tundralibs/utils';

declare const database: {
  users: { findById(id: string): Promise<{ id: string }> };
};

const fetchUser = memoize(async (id: string) => {
  return await database.users.findById(id);
});

// These run concurrently but only one DB query executes
const [user1, user2, user3] = await Promise.all([
  fetchUser('123'),
  fetchUser('123'),
  fetchUser('123'),
]);

console.log(user1 === user2 && user2 === user3); // true (same cached result)
```

### Fibonacci with Memoization

```typescript
import { memoize } from '@tundralibs/utils';

const fibonacci: (n: number) => number = memoize((n: number): number => {
  if (n <= 1) return n;
  return fibonacci(n - 1) + fibonacci(n - 2);
});

console.log(fibonacci(40)); // Fast with memoization
// Without memoization, this would take forever
```

### API Rate Limiting

```typescript
import { memoize } from '@tundralibs/utils';

// Cache API responses for 1 minute
const getWeather = memoize(
  async (city: string) => {
    return await fetch(`/api/weather?city=${city}`).then((r) => r.json());
  },
  60, // seconds
);

// Multiple requests within 1 minute return cached data
await getWeather('London'); // API call
await getWeather('London'); // Cached
await getWeather('London'); // Cached
```

## Best Practices

1. **Choose Appropriate TTL**: Balance freshness vs performance
2. **Pure Functions**: Memoize pure functions (same input = same output)
3. **Argument Serialization**: Simple arguments work best
4. **Memory Considerations**: Long TTLs increase memory usage

## Performance Characteristics

- **Time Complexity**: O(1) cache lookup
- **Space Complexity**: O(n) where n is unique argument combinations
- **Memory Cleanup**: Automatic after TTL expiration

## Common Pitfalls

### Non-Serializable Arguments

```typescript
import { memoize } from '@tundralibs/utils';

declare function fetchData(id: number): Promise<string>;

// ❌ Functions as arguments don't memoize well
const bad = memoize((fn: () => unknown) => fn());

// ✅ Use primitive arguments
const good = memoize((id: number) => fetchData(id));
```

### Side Effects

```typescript
import { memoize } from '@tundralibs/utils';

// ❌ Don't memoize functions with side effects
const bad = memoize(() => {
  console.log('Side effect!');
  return Math.random();
});

// ✅ Memoize pure computations
const good = memoize((n: number) => n * n);
```

## Related Utilities

- [once](Utils-Once.md) - Execute function exactly once
- [throttle](Utils-Throttle.md) - Rate-limit function execution

[← Back to Utils](../README.md)
