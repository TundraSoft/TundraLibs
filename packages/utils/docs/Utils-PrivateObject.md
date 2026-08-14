# Utils - privateObject

Private data encapsulation utility for secure, type-safe storage.

[← Back to Utils](../README.md)

## Overview

The privateObject utility creates encapsulated data stores with controlled access:

- **Data Hiding**: Prevents direct access to internal state
- **Type Safety**: Full TypeScript generic support
- **Immutable Mode**: Optional mutation prevention
- **Iteration Support**: forEach for data traversal
- **Utilities**: Keys, clear, and object conversion

## Installation

```bash
deno add @tundralibs/utils
```

## API Reference

### `privateObject<T>(data: T, enableMutations?: boolean): PrivateObject<T>`

Creates a private object with controlled access.

**Parameters:**

- `data`: Initial data object
- `enableMutations`: Allow mutations (default: true)

**Returns:** PrivateObject with access methods

**`T` must be a `type` alias, not an `interface`.** It is constrained to
`Record<string, unknown>`, and an interface will not satisfy that —
`Index signature for type 'string' is missing in type 'MyData'`.
Interfaces are open, since declaration merging lets another file add
members later, so TypeScript withholds the implicit index signature; a
`type` alias with the same members is closed and qualifies. For a
generated or third-party shape, intersect it:

```typescript
import { privateObject } from '@tundralibs/utils';

interface Generated {
  token: string;
}

type MyData = Generated & Record<string, unknown>;

const store = privateObject<MyData>({ token: 'secret' });
```

### PrivateObject Methods

- `get<K>(key: K): T[K]` - Retrieve value
- `set<K>(key: K, value: T[K]): void` - Set value
- `has<K>(key: K): boolean` - Check key existence
- `delete<K>(key: K): void` - Remove key
- `forEach(callback): void` - Iterate entries
- `keys(): string[]` - Get all keys
- `clear(): void` - Remove all entries
- `asObject(): T` - Convert to plain object

## Usage Examples

### Basic Usage

```typescript
import { privateObject } from '@tundralibs/utils';

const store = privateObject({
  name: 'John',
  age: 30,
  email: 'john@example.com',
});

// Get values
console.log(store.get('name')); // "John"
console.log(store.get('age')); // 30

// Set values
store.set('age', 31);

// Check existence
if (store.has('email')) {
  console.log('Email exists');
}

// Delete
store.delete('email');
console.log(store.has('email')); // false
```

### Immutable Mode

```typescript
import { privateObject } from '@tundralibs/utils';

const config = privateObject(
  { apiKey: 'secret', timeout: 5000 },
  false, // Disable mutations
);

console.log(config.get('apiKey')); // "secret"

config.set('apiKey', 'new'); // Throws Error!
config.delete('timeout'); // Throws Error!
config.clear(); // Throws Error!
```

### Iteration

```typescript
import { privateObject } from '@tundralibs/utils';

const userData = privateObject({
  firstName: 'Alice',
  lastName: 'Smith',
  age: 28,
});

// Iterate over all entries
userData.forEach((key, value) => {
  console.log(`${key}: ${value}`);
});

// Get all keys
const keys = userData.keys();
console.log(keys); // ['firstName', 'lastName', 'age']
```

### Class Private State

```typescript
import { privateObject } from '@tundralibs/utils';

class User {
  private data = privateObject({
    id: 0,
    name: '',
    email: '',
  });

  constructor(id: number, name: string, email: string) {
    this.data.set('id', id);
    this.data.set('name', name);
    this.data.set('email', email);
  }

  getName(): string {
    return this.data.get('name');
  }

  setEmail(email: string): void {
    this.data.set('email', email);
  }

  toJSON() {
    return this.data.asObject();
  }
}
```

### Configuration Store

```typescript
import { privateObject } from '@tundralibs/utils';

type AppConfig = {
  apiUrl: string;
  timeout: number;
  retries: number;
};

const config = privateObject<AppConfig>({
  apiUrl: 'https://api.example.com',
  timeout: 5000,
  retries: 3,
});

function getConfig() {
  return config.asObject(); // Returns plain object copy
}

function updateTimeout(ms: number) {
  config.set('timeout', ms);
}
```

### Cache Implementation

```typescript
import { privateObject } from '@tundralibs/utils';

class Cache<T> {
  private store = privateObject<Record<string, T>>({});

  set(key: string, value: T): void {
    this.store.set(key, value);
  }

  get(key: string): T | undefined {
    return this.store.has(key) ? this.store.get(key) : undefined;
  }

  has(key: string): boolean {
    return this.store.has(key);
  }

  delete(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }

  size(): number {
    return this.store.keys().length;
  }

  entries(): Array<[string, T]> {
    const result: Array<[string, T]> = [];
    this.store.forEach((key, value) => {
      result.push([key, value]);
    });
    return result;
  }
}
```

### Settings Manager

```typescript
import { privateObject } from '@tundralibs/utils';

type Settings = {
  theme: 'light' | 'dark';
  language: string;
  notifications: boolean;
};

class SettingsManager {
  private settings = privateObject<Settings>({
    theme: 'light',
    language: 'en',
    notifications: true,
  });

  get<K extends keyof Settings>(key: K): Settings[K] {
    return this.settings.get(key);
  }

  set<K extends keyof Settings>(key: K, value: Settings[K]): void {
    this.settings.set(key, value);
    this.save();
  }

  reset(): void {
    this.settings.clear();
    // Re-populate with defaults
  }

  private save(): void {
    localStorage.setItem('settings', JSON.stringify(this.settings.asObject()));
  }
}
```

## Best Practices

1. **Use for Encapsulation**: Hide implementation details
2. **Type Definitions**: Always define data type
3. **Immutability**: Use `false` for read-only stores
4. **Conversion**: Use `asObject()` for serialization

## Common Patterns

### Private Module State

```typescript
import { privateObject } from '@tundralibs/utils';

const state = privateObject({
  initialized: false,
  connections: 0,
});

export function initialize() {
  if (!state.get('initialized')) {
    // Setup...
    state.set('initialized', true);
  }
}

export function getStatus() {
  return {
    initialized: state.get('initialized'),
    connections: state.get('connections'),
  };
}
```

### Type-Safe Storage

```typescript
import { privateObject } from '@tundralibs/utils';

type UserData = {
  id: number;
  username: string;
  roles: string[];
};

const userData = privateObject<UserData>({
  id: 1,
  username: 'admin',
  roles: ['admin', 'user'],
});

// Type-safe access
const id: number = userData.get('id');
const roles: string[] = userData.get('roles');
```

## Related Utilities

- [Options](Utils-Options.md) - Uses privateObject internally
- [Singleton](Utils-Singleton.md) - Single instance pattern
- [Config](Utils-Config.md) - Configuration management

[← Back to Utils](../README.md)
