# DAM Engine Module

The DAM (Database Access Manager) Engine module provides a comprehensive
abstract base class and supporting infrastructure for building database drivers
with consistent functionality across different database systems.

## Features

- **🔗 Connection Management**: Robust connection lifecycle with automatic
  reconnection
- **📊 Transaction Support**: Full ACID transactions with nested savepoint
  support
- **🏊 Connection Pooling**: Configurable connection pooling abstraction
- **💓 Health Monitoring**: Automatic health checks with configurable failure
  thresholds
- **⚡ Performance Tracking**: Query execution timing and slow query detection
- **🎯 Event-Driven**: Rich event system for monitoring and debugging
- **🛡️ Error Handling**: Comprehensive error codes with contextual information
- **🔒 Type Safety**: Full TypeScript support with generic query result types

## Architecture

```
AbstractEngine<O extends EngineOptions>
├── Connection Management
├── Transaction Support (with Savepoints)
├── Query Processing & Validation
├── Connection Pooling Abstraction
├── Health Monitoring
├── Performance Tracking
└── Event Emission
```

## Quick Start

### 1. Extend AbstractEngine

```typescript
import { AbstractEngine } from './AbstractEngine.ts';
import { Client } from 'npm:pg';

interface PostgreSQLOptions extends EngineOptions {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
}

class PostgreSQLEngine extends AbstractEngine<PostgreSQLOptions> {
  public readonly Engine = 'postgresql';
  private client?: Client;

  protected async _connect(): Promise<void> {
    this.client = new Client({
      host: this.getOption('host'),
      port: this.getOption('port'),
      database: this.getOption('database'),
      user: this.getOption('username'),
      password: this.getOption('password'),
    });
    await this.client.connect();
  }

  protected async _close(): Promise<void> {
    if (this.client) {
      await this.client.end();
      this.client = undefined;
    }
  }

  protected async _executeQuery<R>(
    query: EngineQuery,
  ): Promise<{ data: R[]; count: number }> {
    if (!this.client) throw new Error('Not connected');

    const result = await this.client.query(
      query.sql,
      Object.values(query.params || {}),
    );
    return {
      data: result.rows as R[],
      count: result.rowCount || 0,
    };
  }

  // Implement other abstract methods...
}
```

### 2. Create and Use Engine Instance

```typescript
const engine = new PostgreSQLEngine('userdb::primary', {
  host: 'localhost',
  port: 5432,
  database: 'myapp',
  username: 'user',
  password: 'pass',
  connectionTimeout: 30,
  queryTimeout: 10,
  slowQueryThreshold: 1.0,
  healthCheckInterval: 60,
  on: {
    connect: (id) => console.log(`Connected: ${id}`),
    disconnect: (id) => console.log(`Disconnected: ${id}`),
    error: (id, error) => console.error(`Error: ${error.message}`),
    query: (id, result, error) => {
      if (error) {
        console.error(`Query failed: ${error.message}`);
      } else if (result.isSlow) {
        console.warn(`Slow query: ${result.time}s`);
      }
    },
  },
});

// Connect and execute queries
await engine.connect();

const users = await engine.execute<{ id: number; name: string }>({
  sql: 'SELECT id, name FROM users WHERE active = :active:',
  params: { active: true },
});

console.log(`Found ${users.count} active users`);
```

### 3. Transaction Support

```typescript
// Simple transaction
await engine.begin();
try {
  await engine.execute({
    sql: 'INSERT INTO users (name, email) VALUES (:name:, :email:)',
    params: { name: 'John Doe', email: 'john@example.com' },
  });

  await engine.execute({
    sql: 'INSERT INTO user_profiles (user_id, bio) VALUES (:userId:, :bio:)',
    params: { userId: 123, bio: 'Software developer' },
  });

  await engine.commit();
} catch (error) {
  await engine.rollback();
  throw error;
}

// Nested transactions with savepoints
await engine.begin(); // Level 1
try {
  await engine.execute({ sql: 'INSERT INTO orders ...', params: {} });

  await engine.begin(); // Level 2 (savepoint)
  try {
    await engine.execute({ sql: 'INSERT INTO order_items ...', params: {} });
    await engine.commit(); // Release savepoint
  } catch (error) {
    await engine.rollback(); // Rollback to savepoint
    // Continue with main transaction
  }

  await engine.commit(); // Commit main transaction
} catch (error) {
  await engine.rollback();
}
```

## Configuration Options

### Base Engine Options

```typescript
interface EngineOptions {
  // Performance
  slowQueryThreshold?: number; // Seconds (default: 0.5)
  queryTimeout?: number; // Seconds (default: 30)

  // Connection
  connectionTimeout?: number; // Seconds (default: 30)

  // Health Monitoring
  healthCheckInterval?: number; // Seconds (default: 60)
  maxConsecutiveErrors?: number; // Count (default: 5)

  // Transactions
  transactionTimeout?: number; // Seconds (default: 30)

  // Connection Pooling
  minConnections?: number; // Minimum pool size
  maxConnections?: number; // Maximum pool size
  acquireTimeout?: number; // Seconds (default: 10)
  idleTimeout?: number; // Seconds (default: 300)

  // Customization
  generateQueryId?: (prefix?: string) => string;
}
```

### Event Handlers

```typescript
interface EngineEvents {
  connect: (instanceId: string) => void;
  disconnect: (instanceId: string) => void;
  query: (
    instanceId: string,
    result: EngineQueryResult,
    error?: DAMEngineError,
  ) => void;
  error: (instanceId: string, error: DAMEngineError) => void;
}
```

## Abstract Methods to Implement

All concrete engine implementations must provide:

```typescript
class MyEngine extends AbstractEngine<MyOptions> {
  public readonly Engine = 'myengine';

  // Connection lifecycle
  protected abstract _connect(): Promise<void>;
  protected abstract _close(): Promise<void>;

  // Query execution
  protected abstract _executeQuery<R>(
    query: EngineQuery,
  ): Promise<{ data: R[]; count: number }>;

  // Transaction support
  protected abstract _beginTransaction(
    options?: TransactionOptions,
  ): Promise<void>;
  protected abstract _commitTransaction(): Promise<void>;
  protected abstract _rollbackTransaction(): Promise<void>;
  protected abstract _createSavepoint(name: string): Promise<void>;
  protected abstract _releaseSavepoint(name: string): Promise<void>;
  protected abstract _rollbackToSavepoint(name: string): Promise<void>;

  // Health monitoring
  protected abstract _healthCheck(): Promise<void>;
}
```

## Error Handling

The engine uses comprehensive error codes for different failure scenarios:

```typescript
try {
  await engine.execute({ sql: 'SELECT * FROM users', params: {} });
} catch (error) {
  if (error instanceof DAMEngineError) {
    switch (error.code) {
      case 'CONNECTION_FAILED':
        console.error('Database connection failed:', error.context.reason);
        break;
      case 'QUERY_TIMEOUT':
        console.error(`Query timed out after ${error.context.timeout}s`);
        break;
      case 'QUERY_MISSING_PARAMETERS':
        console.error('Missing parameters:', error.context.missing);
        break;
      case 'TRANSACTION_ROLLBACK_FAILED':
        console.error('Transaction rollback failed:', error.context.reason);
        break;
      default:
        console.error('Unexpected error:', error.message);
    }
  }
}
```

See [ERROR_CODES.md](./ERROR_CODES.md) for complete error code documentation.

## Health Monitoring

Engines automatically monitor their health when configured:

```typescript
const engine = new MyEngine('db::instance', {
  healthCheckInterval: 30, // Check every 30 seconds
  maxConsecutiveErrors: 3, // Mark unhealthy after 3 failures
  on: {
    error: (instanceId, error) => {
      if (error.code === 'ENGINE_UNHEALTHY') {
        console.error(
          `Engine ${instanceId} is unhealthy: ${error.context.consecutiveErrors} consecutive errors`,
        );
        // Trigger alerting, failover, etc.
      }
    },
  },
});
```

## Connection Pooling

Pool configuration is automatically detected and enabled:

```typescript
const engine = new MyEngine('db::pool', {
  minConnections: 2,
  maxConnections: 10,
  acquireTimeout: 5,
  idleTimeout: 60,
});

// Monitor pool statistics
console.log('Pool stats:', engine.poolStats);
// Output: { totalConnections: 5, activeConnections: 2, idleConnections: 3, waitingRequests: 0 }
```

## Performance Monitoring

Track query performance automatically:

```typescript
engine.on('query', (instanceId, result, error) => {
  if (!error) {
    if (result.isSlow) {
      console.warn(
        `Slow query detected: ${result.time.toFixed(3)}s - ${result.query.sql}`,
      );
    }

    console.log(
      `Query executed in ${
        result.time.toFixed(3)
      }s, returned ${result.count} rows`,
    );
  }
});
```

## Type Safety

Full TypeScript support with generic result types:

```typescript
interface User {
  id: number;
  name: string;
  email: string;
  createdAt: Date;
}

interface UserStats {
  totalUsers: number;
  activeUsers: number;
}

// Type-safe query results
const users = await engine.execute<User>({
  sql: 'SELECT * FROM users WHERE active = :active:',
  params: { active: true },
});
// users.data is now User[]

const stats = await engine.execute<UserStats>({
  sql:
    'SELECT COUNT(*) as totalUsers, COUNT(CASE WHEN active THEN 1 END) as activeUsers FROM users',
  params: {},
});
// stats.data is now UserStats[]
```

## File Structure

```
engine/
├── AbstractEngine.ts          # Main abstract base class
├── ERROR_CODES.md            # Error code documentation  
├── README.md                 # This file
├── types/
│   ├── mod.ts                # Type exports
│   ├── Options.ts            # Engine configuration types
│   ├── Query.ts              # Query-related types
│   ├── Events.ts             # Event system types
│   ├── Status.ts             # Engine status types
│   └── Transaction.ts        # Transaction types
└── errors/
    ├── mod.ts                # Error exports
    ├── EngineError.ts        # DAMEngineError class
    └── EngineErrorCodes.ts   # Error code definitions
```

## Best Practices

### 1. Connection Management

- Always call `connect()` before using the engine
- Use `close()` in cleanup handlers for graceful shutdown
- Handle connection failures with appropriate retry logic

### 2. Transaction Usage

- Keep transactions as short as possible
- Always handle rollback in error cases
- Use nested transactions (savepoints) for complex operations

### 3. Error Handling

- Check error codes for specific handling logic
- Log error context for debugging
- Implement retry logic for transient errors

### 4. Performance

- Configure appropriate query timeouts
- Monitor slow queries and optimize
- Use connection pooling for high-throughput applications

### 5. Health Monitoring

- Set reasonable health check intervals
- Monitor consecutive error counts
- Implement alerting for unhealthy engines

## Related Documentation

- [Types Documentation](./types/README.md)
- [Error Handling Guide](./errors/README.md)
- [Transaction Guide](./docs/TRANSACTIONS.md)
- [Performance Tuning](./docs/PERFORMANCE.md)
- [Implementation Examples](./docs/EXAMPLES.md)
