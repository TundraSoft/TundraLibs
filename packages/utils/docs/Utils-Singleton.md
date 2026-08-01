# Utils - Singleton

Singleton pattern decorator for ensuring single-instance classes.

[← Back to Utils](../README.md)

## Overview

The Singleton decorator implements the classic Singleton design pattern:

- **Single Instance**: Only one instance per decorated class
- **Type Safe**: Full TypeScript support
- **Inheritance Support**: Works with class hierarchies
- **Zero Config**: No manual instance management
- **Memory Efficient**: Uses WeakMap for storage

## Installation

```bash
deno add @tundralibs/utils
```

## API Reference

### `@Singleton`

Class decorator that enforces singleton pattern.

```typescript
@Singleton
class MyClass {
  // class implementation
}
```

## Usage Examples

### Basic Singleton

```typescript
import { Singleton } from '@tundralibs/utils';

@Singleton
class DatabaseConnection {
  constructor(public connectionString: string) {
    console.log('Connecting to:', connectionString);
  }
}

const db1 = new DatabaseConnection('postgresql://...');
// Logs: "Connecting to: postgresql://..."

const db2 = new DatabaseConnection('mysql://...');
// No log - returns existing instance

console.log(db1 === db2); // true
console.log(db1.connectionString); // "postgresql://..."
```

### Configuration Manager

```typescript
@Singleton
class AppConfig {
  private settings = new Map<string, unknown>();

  constructor() {
    this.loadDefaults();
  }

  loadDefaults() {
    this.settings.set('apiUrl', 'https://api.example.com');
    this.settings.set('timeout', 5000);
  }

  get(key: string): unknown {
    return this.settings.get(key);
  }

  set(key: string, value: unknown): void {
    this.settings.set(key, value);
  }
}

const config1 = new AppConfig();
config1.set('theme', 'dark');

const config2 = new AppConfig();
console.log(config2.get('theme')); // 'dark' (same instance)
```

### Logger Instance

```typescript
@Singleton
class Logger {
  private level: string;

  constructor(level: string = 'info') {
    this.level = level;
  }

  log(message: string) {
    console.log(`[${this.level}] ${message}`);
  }

  setLevel(level: string) {
    this.level = level;
  }
}

const logger1 = new Logger('debug');
logger1.log('Hello'); // [debug] Hello

const logger2 = new Logger('error'); // Ignored
logger2.log('World'); // [debug] World (same instance, same level)

console.log(logger1 === logger2); // true
```

### With Initialization

```typescript
@Singleton
class CacheManager {
  private cache = new Map<string, any>();
  private initialized = false;

  constructor() {
    if (!this.initialized) {
      this.initialize();
      this.initialized = true;
    }
  }

  private initialize() {
    console.log('Initializing cache...');
    // Setup logic
  }

  set(key: string, value: any) {
    this.cache.set(key, value);
  }

  get(key: string): any {
    return this.cache.get(key);
  }
}

const cache = new CacheManager(); // Initializes once
```

### Inheritance

```typescript
@Singleton
class BaseService {
  constructor(public name: string) {}
}

@Singleton
class ApiService extends BaseService {
  constructor(name: string, public url: string) {
    super(name);
  }
}

// Each class maintains its own singleton
const base1 = new BaseService('Base');
const base2 = new BaseService('Base2');
console.log(base1 === base2); // true

const api1 = new ApiService('API', 'https://api.com');
const api2 = new ApiService('API', 'https://other.com');
console.log(api1 === api2); // true
console.log(api1.url); // "https://api.com"
```

## Best Practices

1. **First Call Wins**: Constructor args from first instantiation are used
2. **Idempotent Constructors**: Design constructors to handle multiple calls safely
3. **State Management**: Be aware that all references share state
4. **Testing**: Reset singletons between tests if needed

## Common Patterns

### Global State

```typescript
@Singleton
class AppState {
  private state: Record<string, any> = {};

  get(key: string) {
    return this.state[key];
  }

  set(key: string, value: any) {
    this.state[key] = value;
  }
}

export const appState = new AppState();
```

### Resource Pool

```typescript
@Singleton
class ConnectionPool {
  private connections: Connection[] = [];

  getConnection(): Connection {
    return this.connections.pop() || new Connection();
  }

  releaseConnection(conn: Connection) {
    this.connections.push(conn);
  }
}
```

## When to Use

✅ **Good Use Cases:**

- Database connections
- Configuration managers
- Logging systems
- Cache managers
- Resource pools
- Application state

❌ **Avoid When:**

- Testing requires multiple instances
- Need different configurations
- Working with multiple databases
- Parallel processing requirements

## Related Utilities

- [once](Utils-Once.md) - Execute function once
- [privateObject](Utils-PrivateObject.md) - Encapsulated state

[← Back to Utils](../README.md)
