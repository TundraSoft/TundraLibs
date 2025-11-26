# SQLite Engine

A comprehensive SQLite database engine for the DAM framework, providing
file-based database capabilities with full transaction support, WAL mode
optimization, and extensive configuration options.

## Features

- **File-based Storage**: Support for both file-based databases and in-memory
  databases
- **Transaction Support**: Full ACID transaction support with savepoints for
  nested transactions
- **WAL Mode**: Write-Ahead Logging mode for improved performance and concurrent
  access
- **Pragma Configuration**: Extensive SQLite pragma settings for performance
  tuning
- **Foreign Key Support**: Optional foreign key constraint enforcement
- **Connection Management**: Robust connection handling with automatic recovery
- **Performance Optimization**: Built-in support for VACUUM and ANALYZE
  operations
- **Comprehensive Error Handling**: Detailed error reporting with
  SQLite-specific error codes

## Installation

The SQLite engine uses the `jsr:@db/sqlite` library for SQLite operations:

```json
{
  "imports": {
    "@db/sqlite": "jsr:@db/sqlite@^0.12.0"
  }
}
```

## Basic Usage

```typescript
import { SQLiteEngine } from '@tundralibs/dam/engines/sqlite';

// Create a file-based database
const engine = new SQLiteEngine('my-database', {
  database: './data/myapp.db',
  enableWAL: true,
  enableForeignKeys: true,
  timeout: 30000,
});

// Create an in-memory database
const memoryEngine = new SQLiteEngine('memory-db', {
  database: ':memory:',
  enableForeignKeys: true,
});

// Connect and execute queries
await engine.connect();

const result = await engine.execute({
  sql: 'SELECT * FROM users WHERE active = :active:',
  params: { active: true },
});

console.log(result.data);
await engine.close();
```

## Configuration Options

### Basic Configuration

```typescript
interface SQLiteEngineOptions extends EngineOptions {
  /** Database file path or ':memory:' for in-memory database */
  database: string;

  /** Database access mode */
  mode?: 'readonly' | 'readwrite' | 'create';

  /** Connection timeout in milliseconds */
  timeout?: number;

  /** Busy timeout for locked database */
  busyTimeout?: number;
}
```

### Performance Configuration

```typescript
{
  /** Enable Write-Ahead Logging mode */
  enableWAL?: boolean;
  
  /** Journal mode setting */
  journalMode?: 'DELETE' | 'TRUNCATE' | 'PERSIST' | 'MEMORY' | 'WAL' | 'OFF';
  
  /** Synchronous mode */
  synchronous?: 'OFF' | 'NORMAL' | 'FULL' | 'EXTRA';
  
  /** Cache size (negative for KB, positive for pages) */
  cacheSize?: number;
  
  /** Page size in bytes (must be power of 2, 512-65536) */
  pageSize?: number;
  
  /** Auto-vacuum mode */
  autoVacuum?: 'NONE' | 'FULL' | 'INCREMENTAL';
}
```

### Schema Configuration

```typescript
{
  /** Enable foreign key constraints */
  enableForeignKeys?: boolean;
  
  /** Enable recursive triggers */
  enableTriggers?: boolean;
  
  /** Custom pragma settings */
  customPragmas?: Record<string, string | number>;
}
```

## Transaction Management

### Basic Transactions

```typescript
const txId = await engine.begin();
try {
  await engine.execute({
    sql: 'INSERT INTO users (name) VALUES (:name:)',
    params: { name: 'John Doe' },
    transactionId: txId,
  });

  await engine.commit(txId);
} catch (error) {
  await engine.rollback(txId);
  throw error;
}
```

### Nested Transactions with Savepoints

```typescript
const outerTx = await engine.begin({ name: 'outer' });
try {
  await engine.execute({
    sql: 'INSERT INTO users (name) VALUES (:name:)',
    params: { name: 'User 1' },
    transactionId: outerTx,
  });

  const innerTx = await engine.begin({ name: 'inner' });
  try {
    await engine.execute({
      sql: 'INSERT INTO orders (user_id) VALUES (:userId:)',
      params: { userId: 1 },
      transactionId: innerTx,
    });

    await engine.commit(innerTx);
  } catch (error) {
    await engine.rollback(innerTx);
    throw error;
  }

  await engine.commit(outerTx);
} catch (error) {
  await engine.rollback(outerTx);
  throw error;
}
```

### Transaction with Timeout

```typescript
const txId = await engine.begin({ timeout: 5000 }); // 5 second timeout
// Transaction will be automatically rolled back after timeout
```

## Performance Optimization

### WAL Mode Configuration

```typescript
const engine = new SQLiteEngine('high-performance', {
  database: './data/app.db',
  enableWAL: true,
  synchronous: 'NORMAL',
  cacheSize: -128000, // 128MB cache
  pageSize: 4096,
  journalMode: 'WAL',
});
```

### Database Maintenance

```typescript
// Vacuum database to reclaim space
await engine.vacuum();

// Analyze database for query optimization
await engine.analyze();

// Get database statistics
const info = engine.getDatabaseInfo();
console.log('Page count:', info.pageCount.page_count);
console.log('Page size:', info.pragmas.pageSize.page_size);
console.log('Cache size:', info.pragmas.cacheSize.cache_size);
```

## Error Handling

The SQLite engine provides comprehensive error handling with specific error
codes:

```typescript
import { DAMEngineError } from '@tundralibs/dam';

try {
  await engine.execute({
    sql: 'INSERT INTO users (id) VALUES (:id:)',
    params: { id: 1 },
  });
} catch (error) {
  if (error instanceof DAMEngineError) {
    switch (error.code) {
      case 'SQLITE_CONSTRAINT_UNIQUE':
        console.log('Unique constraint violation');
        break;
      case 'SQLITE_CONSTRAINT_FOREIGNKEY':
        console.log('Foreign key constraint violation');
        break;
      case 'QUERY_EXECUTION_FAILED':
        console.log('SQL syntax or execution error');
        break;
    }
  }
}
```

## Configuration Examples

### Development Setup (In-Memory)

```typescript
const devEngine = new SQLiteEngine('development', {
  database: ':memory:',
  enableForeignKeys: true,
  synchronous: 'OFF', // Fastest for development
});
```

### Production Setup (File-Based with WAL)

```typescript
const prodEngine = new SQLiteEngine('production', {
  database: './data/production.db',
  mode: 'readwrite',
  enableWAL: true,
  enableForeignKeys: true,
  synchronous: 'NORMAL',
  cacheSize: -256000, // 256MB cache
  pageSize: 4096,
  busyTimeout: 30000,
  timeout: 60000,
});
```

### Read-Only Setup

```typescript
const readOnlyEngine = new SQLiteEngine('readonly', {
  database: './data/readonly.db',
  mode: 'readonly',
  cacheSize: -64000, // 64MB cache for read performance
  enableWAL: false, // Not needed for read-only
});
```

## Monitoring and Health Checks

```typescript
// Check engine health
const health = engine.healthStatus;
console.log('Is healthy:', health.isHealthy);
console.log('Consecutive errors:', health.consecutiveErrors);

// Get connection statistics
const stats = engine.getPoolStats();
console.log('Total connections:', stats.totalConnections);
console.log('Active connections:', stats.activeConnections);

// Get database information
const dbInfo = engine.getDatabaseInfo();
console.log('SQLite version:', dbInfo.version.version);
console.log('Active transactions:', dbInfo.activeTransactions);
```

## Best Practices

1. **Use WAL Mode for Production**: Enables better concurrent access and
   performance
2. **Set Appropriate Cache Size**: Use negative values for memory size (e.g.,
   -128000 = 128MB)
3. **Enable Foreign Keys**: Essential for data integrity
4. **Use Transactions**: Group related operations for consistency and
   performance
5. **Regular Maintenance**: Run VACUUM and ANALYZE periodically
6. **Monitor Database Size**: Check page count and fragmentation
7. **Set Timeouts**: Prevent hanging connections with appropriate timeout values

## Troubleshooting

### Connection Issues

- Ensure database file path is accessible
- Check file permissions for the database directory
- Verify disk space availability

### Performance Issues

- Increase cache size for better performance
- Use WAL mode for concurrent access
- Analyze query performance with EXPLAIN QUERY PLAN
- Run VACUUM to defragment the database

### Lock Issues

- Increase busyTimeout for better lock handling
- Use WAL mode to reduce lock contention
- Ensure transactions are properly closed

For more advanced usage and configuration options, refer to the
[SQLite documentation](https://www.sqlite.org/docs.html).
