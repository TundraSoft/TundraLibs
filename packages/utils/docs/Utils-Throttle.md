# Utils - throttle

Advanced function throttling for rate-limiting execution.

[← Back to Utils](../README.md)

## Overview

The throttle utility limits how frequently functions can execute:

- **Rate Limiting**: Max execution frequency control
- **Async Support**: Proper promise handling
- **Argument Discrimination**: Per-argument or global throttling
- **High Precision**: Sub-millisecond timing
- **Method Decorator**: `@Throttle` for class methods

## Installation

```bash
deno add @tundralibs/utils
```

## API Reference

### `throttle<T>(fn: T, delay: number, ignoreArgs?: boolean): T`

Throttles function to execute at most once per delay period.

**Parameters:**

- `fn`: Function to throttle
- `delay`: Minimum milliseconds between executions
- `ignoreArgs`: If true, throttles globally; if false, per unique args

### `@Throttle(delay: number, ignoreArgs?: boolean)`

Decorator for throttling class methods.

## Usage Examples

### Basic Throttling

```typescript
import { throttle } from '@tundralibs/utils';

const logMessage = (message: string) => {
  console.log(`Logged: ${message}`);
};

const throttledLog = throttle(logMessage, 2000); // Max once per 2s

throttledLog('First call'); // ✓ Executes immediately
throttledLog('Second call'); // ✗ Ignored (within 2s)
throttledLog('Third call'); // ✗ Ignored (within 2s)

setTimeout(() => throttledLog('Fourth call'), 2500); // ✓ Executes
```

### API Rate Limiting

```typescript
import { throttle } from '@tundralibs/utils';

interface User {
  id: string;
  name: string;
}

const fetchUserData = throttle(
  async (userId: string): Promise<User> => {
    const response = await fetch(`/api/users/${userId}`);
    return response.json();
  },
  1000, // Max 1 request per second
);

// Rapid calls - only first executes
await fetchUserData('123'); // ✓ API call
await fetchUserData('123'); // ✗ Returns cached result
await fetchUserData('123'); // ✗ Returns cached result
```

### UI Event Handling

```typescript
import { throttle } from '@tundralibs/utils';

declare function updateScrollPosition(): void;
declare function checkVisibility(): void;
declare function lazyLoadImages(): void;

const handleScroll = throttle(() => {
  updateScrollPosition();
  checkVisibility();
  lazyLoadImages();
}, 100); // Update at most every 100ms

window.addEventListener('scroll', handleScroll);
```

### Per-Argument Throttling

```typescript
import { throttle } from '@tundralibs/utils';

declare function fetchUser(userId: string): Promise<{ id: string }>;

// Each userId has its own throttle
const getUserData = throttle(
  async (userId: string) => await fetchUser(userId),
  5000,
  false, // Throttle per argument (default)
);

// Different users can be fetched
await getUserData('user1'); // ✓ Executes
await getUserData('user2'); // ✓ Executes (different arg)
await getUserData('user1'); // ✗ Cached (within 5s for user1)
```

### Global Throttling

```typescript
import { throttle } from '@tundralibs/utils';

// Throttles all calls regardless of arguments
const logAny = throttle(
  (message: string) => console.log(message),
  1000,
  true, // Global throttle
);

logAny('Message 1'); // ✓ Logs
logAny('Message 2'); // ✗ Ignored (within 1s)
logAny('Message 3'); // ✗ Ignored (within 1s)
```

### Method Decorator

```typescript
import { Throttle } from '@tundralibs/utils';

declare const api: { search(query: string): Promise<string[]> };
declare const database: { save(state: unknown): void };

class SearchComponent {
  state = {};

  @Throttle(300) // 300ms throttle
  async search(query: string) {
    console.log('Searching for:', query);
    return await api.search(query);
  }

  @Throttle(1000, true) // Global throttle
  save() {
    console.log('Saving...');
    database.save(this.state);
  }
}

const search = new SearchComponent();

// Rapid typing
search.search('a'); // ✓ Searches
search.search('ab'); // ✗ Ignored
search.search('abc'); // ✗ Ignored
// After 300ms
search.search('abcd'); // ✓ Searches
```

**Behavior notes:**

- **`this` binding**: A decorated method receives its normal `this`, so it can
  safely read and mutate instance state (e.g. `this.state`, `this.count`).
- **Per-instance throttling**: For both methods and getters, each instance has
  its own throttle window and cached result. One instance never receives
  another instance's cached return value, and a decorated method's own body is
  never skipped in favour of another instance's result — so mutating methods
  (`save() { database.save(this.state) }`) run correctly on every instance. Use
  `throttle()` directly if you instead need a single window shared across all
  instances.
- **Async rejections don't crash**: When a throttled async function rejects,
  the rejection surfaces only on the promise returned to the caller. It never
  leaks as an unhandled rejection, so a rejecting throttled call (e.g. a
  throttled `fetch` hitting a network error) will not terminate the process
  under the Node ≥15 / Deno default policy — handle it with a normal
  `try/catch` or `.catch()`.

### Database Query Optimization

```typescript
import { throttle } from '@tundralibs/utils';

declare const database: {
  query(sql: string, params: unknown[]): Promise<void>;
};

const updateUserStats = throttle(
  async (userId: string) => {
    await database.query(
      `
      UPDATE users 
      SET last_activity = NOW() 
      WHERE id = $1
    `,
      [userId],
    );
  },
  60000, // Max once per minute per user
);

// Frequent user activity, but DB updates throttled
updateUserStats('user123'); // ✓ Updates DB
updateUserStats('user123'); // ✗ Skipped
updateUserStats('user123'); // ✗ Skipped
```

### Resize Handler

```typescript
import { throttle } from '@tundralibs/utils';

declare const window: {
  innerWidth: number;
  innerHeight: number;
  scrollY: number;
  addEventListener(type: string, listener: () => void): void;
};

declare function adjustLayout(width: number, height: number): void;
declare function recalculatePositions(): void;
declare function redraw(): void;

const handleResize = throttle(() => {
  const width = window.innerWidth;
  const height = window.innerHeight;

  adjustLayout(width, height);
  recalculatePositions();
  redraw();
}, 200);

window.addEventListener('resize', handleResize);
```

## Best Practices

1. **Choose Appropriate Delay**: Balance responsiveness vs. performance
2. **UI Events**: 100-300ms for scroll/resize
3. **API Calls**: Match server rate limits
4. **Consider debounce**: For "wait until done" behavior

## Performance Characteristics

- **Time Complexity**: O(1) for execution check
- **Space Complexity**: O(n) for unique argument combinations
- **Precision**: Sub-millisecond with performance.now()

## Common Patterns

### Scroll Progress Tracking

```typescript
import { throttle } from '@tundralibs/utils';

declare const window: {
  innerWidth: number;
  innerHeight: number;
  scrollY: number;
  addEventListener(type: string, listener: () => void): void;
};

declare const document: { body: { scrollHeight: number } };
declare const progressBar: { style: { width: string } };

const updateProgress = throttle(() => {
  const scrollPercent =
    (window.scrollY / (document.body.scrollHeight - window.innerHeight)) * 100;
  progressBar.style.width = `${scrollPercent}%`;
}, 50);

window.addEventListener('scroll', updateProgress);
```

### Real-Time Search

```typescript
import { throttle } from '@tundralibs/utils';

declare const api: { search(query: string): Promise<string[]> };
declare function displayResults(results: string[]): void;
declare const searchInput: {
  addEventListener(
    type: 'input',
    listener: (event: { target: { value: string } }) => void,
  ): void;
};

const performSearch = throttle(async (query: string) => {
  const results = await api.search(query);
  displayResults(results);
}, 300);

searchInput.addEventListener('input', (e) => {
  performSearch(e.target.value);
});
```

## Throttle vs. Debounce

| Feature       | Throttle        | Debounce            |
| ------------- | --------------- | ------------------- |
| When executes | At intervals    | After quiet period  |
| Use case      | Regular updates | Wait for completion |
| Example       | Scroll tracking | Search autocomplete |

## Related Utilities

- [memoize](Utils-Memoize.md) - Cache function results
- [once](Utils-Once.md) - Execute exactly once

[← Back to Utils](../README.md)
