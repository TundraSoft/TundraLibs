# DAM (Database Access Manager)

A unified database abstraction layer for Deno, providing consistent interfaces
across multiple database engines with advanced features like transaction
management, connection pooling, event monitoring, and comprehensive error
handling.

## Table of Contents

- [Quick Start](#quick-start)
- [Features](#features)
  - [Transaction Management](#-transaction-management)
  - [Parameter Handling](#-parameter-handling)
  - [Event System](#-event-system)
  - [Connection Pooling](#-connection-pooling)
  - [Query Statistics](#-query-statistics)
  - [Health Checks](#-health-checks)
  - [SSL/TLS Support](#-ssltls-support)
- [DAM Manager](#dam-manager)
  - [Creating Instances](#creating-instances)
  - [Retrieving Instances](#retrieving-instances)
  - [Managing Instances](#managing-instances)
  - [Engine Registration](#engine-registration)
- [Engine Options](#engine-options)
  - [Required Options](#required-options)
  - [Common Optional Options](#common-optional-options)
- [Engines](#engines)
  - [MariaDB / MySQL](#mariadb--mysql)
  - [PostgreSQL (Native)](#postgresql-native)
  - [PostgreSQL 2 (Node.js)](#postgresql-2-nodejs)
  - [MongoDB](#mongodb)
  - [SQLite](#sqlite)

## Quick Start

```typescript
import { DAM } from '@tundralibs/dam';

// Create a database instance
const db = DAM.create('SQLITE', 'my-db', {
  database: './app.db',
  slowQueryThreshold: 300,
  transactionTimeout: 30,
  autoRollbackOnFailure: true,
});

// Connect and execute queries
await db.connect();

const result = await db.execute({
  sql: 'SELECT * FROM users WHERE id = :id:',
  params: { id: 1 },
});

console.log(result.data);
await db.disconnect();
```

## Features

### 🔄 Transaction Management

Full ACID transaction support with timeout handling and auto-rollback:

```typescript
// Begin a transaction
const txId = await db.beginTransaction();

try {
  await db.execute({
    sql: 'INSERT INTO accounts (name, balance) VALUES (:name:, :balance:)',
    params: { name: 'Alice', balance: 1000 },
    transactionId: txId,
  });

  await db.execute({
    sql: 'UPDATE accounts SET balance = balance - :amount: WHERE name = :name:',
    params: { amount: 100, name: 'Alice' },
    transactionId: txId,
  });

  // Commit on success
  await db.commitTransaction(txId);
} catch (error) {
  // Rollback on error
  await db.rollbackTransaction(txId);
  throw error;
}
```

**Transaction Features:**

- Isolated transaction execution with unique IDs
- Automatic timeout handling (configurable per-engine)
- Auto-rollback on failure (when `autoRollbackOnFailure: true`)
- Idempotent commit/rollback operations
- Transaction status tracking and event emission

### 📝 Parameter Handling

Named parameter support with automatic escaping and type safety:

```typescript
// Named parameters with :param: syntax
await db.execute({
  sql: 'SELECT * FROM users WHERE name = :name: AND age > :age:',
  params: { name: 'John', age: 18 },
});

// Repeated parameters (same param used multiple times)
await db.execute({
  sql: 'SELECT :name: as first_name, :name: as last_name, :age: as years',
  params: { name: 'John', age: 30 },
});

// Array/batch execution
await db.batchExecute([
  {
    sql: 'INSERT INTO logs (message) VALUES (:msg:)',
    params: { msg: 'Log 1' },
  },
  {
    sql: 'INSERT INTO logs (message) VALUES (:msg:)',
    params: { msg: 'Log 2' },
  },
]);
```

### 📊 Event System

Real-time monitoring with comprehensive event emissions:

```typescript
// Listen to connection events
db.on('connect', (instanceId) => {
  console.log(`Connected: ${instanceId}`);
});

// Monitor query performance
db.on('query', (instanceId, result) => {
  console.log(`Query executed in ${result.executionTime}ms`);
});

db.on('slowQuery', (instanceId, result) => {
  console.warn(`Slow query detected: ${result.sql}`);
});

// Track transactions
db.on('transactionBegin', (instanceId, txId) => {
  console.log(`Transaction started: ${txId}`);
});

db.on('transactionCommit', (instanceId, txId) => {
  console.log(`Transaction committed: ${txId}`);
});

db.on('transactionTimeout', (instanceId, txId) => {
  console.error(`Transaction timed out: ${txId}`);
});

// Handle errors
db.on('error', (instanceId, error) => {
  console.error(`Engine error: ${error.message}`);
});
```

**Available Events:**

- `connect` - Database connection established
- `disconnect` - Database connection closed
- `connectionFailed` - Connection attempt failed
- `query` - Query executed successfully
- `slowQuery` - Query exceeded slow query threshold
- `transactionBegin` - Transaction started
- `transactionCommit` - Transaction committed
- `transactionRollback` - Transaction rolled back
- `transactionTimeout` - Transaction exceeded timeout
- `error` - Error occurred
- `warn` - Warning message

### 🔌 Connection Pooling

Automatic connection pool management for optimal performance:

```typescript
const db = DAM.create('POSTGRES', 'pool-db', {
  host: 'localhost',
  port: 5432,
  database: 'myapp',
  username: 'user',
  password: 'pass',
  pool: {
    max: 20, // Maximum connections
    min: 2, // Minimum idle connections
  },
  idleTimeoutSeconds: 300, // Close idle connections after 5 minutes
  slowQueryThreshold: 300,
  transactionTimeout: 30,
  autoRollbackOnFailure: true,
});

// Get pool statistics
const stats = db.poolStats;
console.log(`Active: ${stats.activeConnections}`);
console.log(`Idle: ${stats.idleConnections}`);
console.log(`Waiting: ${stats.waitingRequests}`);
```

### 📈 Query Statistics

Built-in performance tracking and metrics:

```typescript
// Execute some queries
await db.execute({ sql: 'SELECT * FROM users' });
await db.execute({ sql: 'SELECT * FROM orders' });

// Get statistics
const stats = db.queryStats;
console.log(`Total queries: ${stats.totalQueries}`);
console.log(`Successful: ${stats.successfulQueries}`);
console.log(`Failed: ${stats.failedQueries}`);
console.log(`Avg execution time: ${stats.averageExecutionTime}ms`);
console.log(`Slow queries: ${stats.slowQueries}`);
```

### 🏥 Health Checks

Built-in ping functionality for connection validation:

```typescript
// Check if database is responsive
const isHealthy = await db.ping();

if (!isHealthy) {
  console.error('Database connection is unhealthy!');
  await db.disconnect();
  await db.connect(); // Reconnect
}
```

### 🔒 SSL/TLS Support

Secure connections with certificate management:

```typescript
const db = DAM.create('POSTGRES', 'secure-db', {
  host: 'db.example.com',
  port: 5432,
  database: 'myapp',
  username: 'user',
  password: 'pass',
  ssl: {
    ca: '/path/to/ca.crt', // CA certificate
    cert: '/path/to/client.crt', // Client certificate
    key: '/path/to/client.key', // Client key
    rejectUnauthorized: true, // Validate server certificate
  },
  slowQueryThreshold: 300,
  transactionTimeout: 30,
  autoRollbackOnFailure: true,
});
```

## DAM Manager

The DAM manager is a singleton that provides centralized database instance
management.

### Creating Instances

```typescript
import { DAM } from '@tundralibs/dam';

// Create a new database instance
const db = DAM.create(
  'SQLITE', // Engine type
  'my-app-db', // Unique instance name
  { // Configuration options
    database: './app.db',
    slowQueryThreshold: 300,
    transactionTimeout: 30,
    autoRollbackOnFailure: true,
  },
);
```

### Retrieving Instances

```typescript
// Get an existing instance by name
const db = DAM.getInstance('my-app-db');

if (db) {
  await db.connect();
  // Use database...
} else {
  console.error('Instance not found');
}

// Check if instance exists
if (DAM.hasInstance('my-app-db')) {
  console.log('Instance exists');
}

// Get all active instance names
const instances = DAM.getActiveInstances();
console.log('Active instances:', instances);
```

### Managing Instances

```typescript
// Remove a specific instance
await DAM.removeInstance('my-app-db');

// Clear all instances
await DAM.clear();
```

### Engine Registration

```typescript
// Get list of registered engines
const engines = DAM.getRegisteredEngines();
console.log(engines); // ['MARIA', 'MONGODB', 'POSTGRES', 'POSTGRES2', 'SQLITE']

// Register a custom engine
import { AbstractEngine } from '@tundralibs/dam';

class MyCustomEngine extends AbstractEngine {
  public readonly Engine = 'MYCUSTOM';
  public readonly Capabilities = {
    transactions: true,
    pooledConnections: true,
    preparedStatements: true,
  };
  // ... implement required methods
}

DAM.addEngine('MYCUSTOM', MyCustomEngine);

// Remove an engine (for testing)
DAM.removeEngine('MYCUSTOM');
```

## Engine Options

All engines require these base configuration options:

### Required Options

```typescript
{
  slowQueryThreshold: number; // Threshold in seconds (max 600)
  transactionTimeout: number; // Timeout in seconds (max 600)
  autoRollbackOnFailure: boolean; // Auto-rollback on errors
}
```

### Common Optional Options

```typescript
{
  // Connection settings (engine-specific)
  host?: string;                   // Database host
  port?: number;                   // Database port
  database: string;                // Database name (required for most engines)
  username?: string;               // Database username
  password?: string;               // Database password
  
  // Pool configuration
  pool?: {
    max?: number;                  // Maximum connections (default varies)
    min?: number;                  // Minimum connections (default 0)
  };
  
  // Advanced settings
  idleTimeoutSeconds?: number;     // Close idle connections after N seconds
  idGenerator?: (prefix?: string) => string;  // Custom ID generator
  
  // SSL configuration
  ssl?: boolean | {
    ca?: string;                   // Path to CA certificate
    cert?: string;                 // Path to client certificate
    key?: string;                  // Path to client key
    rejectUnauthorized?: boolean;  // Validate server certificate
  };
}
```

## Engines

DAM comes with 5 pre-registered database engines, each optimized for its
specific database system.

### MariaDB / MySQL

**Engine ID:** `MARIA`\
**Driver:** npm:mariadb@^3.4.0\
**Features:** Connection pooling, transactions, prepared statements

```typescript
const db = DAM.create('MARIA', 'mariadb-instance', {
  // Connection
  host: 'localhost',
  port: 3306,
  database: 'myapp',
  username: 'root',
  password: 'password',

  // Pool configuration
  pool: {
    max: 20, // Maximum connections
    min: 2, // Minimum idle connections
  },

  // Performance tuning
  slowQueryThreshold: 300, // 300ms slow query threshold
  transactionTimeout: 30, // 30 second transaction timeout
  autoRollbackOnFailure: true, // Auto-rollback on errors
  idleTimeoutSeconds: 300, // Close idle connections after 5 minutes

  // SSL (optional)
  ssl: {
    ca: '/path/to/ca.crt',
    rejectUnauthorized: true,
  },
});

// Named parameters with :param: syntax
await db.execute({
  sql: 'SELECT * FROM users WHERE name = :name: AND age > :age:',
  params: { name: 'John', age: 18 },
});
```

**Configuration Options:**

- All base options plus standard connection settings
- Default port: `3306`
- Supports connection pooling (min/max)
- Named parameters: `:param:` syntax
- Type casting: Automatic for BIGINT, DECIMAL, etc.

---

### PostgreSQL (Native)

**Engine ID:** `POSTGRES`\
**Driver:** jsr:@db/postgres@^0.19.5\
**Features:** Native Deno driver, connection pooling, transactions, prepared
statements

```typescript
const db = DAM.create('POSTGRES', 'postgres-instance', {
  // Connection
  host: 'localhost',
  port: 5432,
  database: 'myapp',
  username: 'postgres',
  password: 'password',

  // Pool configuration
  pool: {
    max: 20,
    min: 2,
  },

  // Performance tuning
  slowQueryThreshold: 300,
  transactionTimeout: 30,
  autoRollbackOnFailure: true,
  idleTimeoutSeconds: 300,

  // SSL (optional)
  ssl: {
    ca: '/path/to/ca.crt',
    cert: '/path/to/client.crt',
    key: '/path/to/client.key',
    rejectUnauthorized: true,
  },
});

// PostgreSQL requires type casting for operators
await db.execute({
  sql: 'SELECT * FROM users WHERE age > :age:::integer',
  params: { age: 18 },
});
```

**Configuration Options:**

- All base options plus standard connection settings
- Default port: `5432`
- Supports connection pooling (min/max)
- Named parameters: `:param:` syntax (requires `:::type` for operators)
- Native Deno implementation (optimized performance)

---

### PostgreSQL 2 (Node.js)

**Engine ID:** `POSTGRES2`\
**Driver:** npm:pg (node-postgres)\
**Features:** Connection pooling, transactions, prepared statements, mature
ecosystem

```typescript
const db = DAM.create('POSTGRES2', 'postgres2-instance', {
  // Connection
  host: 'localhost',
  port: 5432,
  database: 'myapp',
  username: 'postgres',
  password: 'password',

  // Pool configuration
  pool: {
    max: 20,
    min: 2,
  },

  // Performance tuning
  slowQueryThreshold: 300,
  transactionTimeout: 30,
  autoRollbackOnFailure: true,
  idleTimeoutSeconds: 300,

  // SSL (optional)
  ssl: true, // Or detailed config
});

// Same syntax as POSTGRES engine
await db.execute({
  sql: 'SELECT * FROM users WHERE age > :age:::integer',
  params: { age: 18 },
});
```

**Configuration Options:**

- Identical to POSTGRES engine
- Uses npm:pg driver (more mature ecosystem)
- Automatic type parsing (INT2/4/8, FLOAT4/8, NUMERIC, BOOL)
- BigInt support for large integers

---

### MongoDB

**Engine ID:** `MONGODB`\
**Driver:** npm:mongodb (official driver)\
**Features:** Connection pooling, action-based queries, aggregation pipelines

**Note:** Transactions are disabled by default (require replica set
configuration)

```typescript
const db = DAM.create('MONGODB', 'mongo-instance', {
  // Connection
  host: 'localhost',
  port: 27017,
  database: 'myapp',
  username: 'admin',
  password: 'password',
  authSource: 'admin', // MongoDB-specific: authentication database

  // Pool configuration
  pool: {
    max: 20,
  },

  // Performance tuning
  slowQueryThreshold: 300,
  transactionTimeout: 30,
  autoRollbackOnFailure: true,

  // SSL (optional)
  ssl: {
    ca: '/path/to/ca.crt',
    rejectUnauthorized: true,
  },
});

// MongoDB uses action-based query structure
// Insert document
await db.execute({
  sql: 'insert', // Action: insert, find, update, delete, aggregate, etc.
  collection: 'users', // Collection name
  data: { // Document to insert
    name: 'John Doe',
    age: 30,
    email: 'john@example.com',
  },
});

// Find documents
await db.execute({
  sql: 'find',
  collection: 'users',
  filter: { age: { $gte: 18 } }, // MongoDB query filter
  options: { limit: 10 },
});

// Update documents
await db.execute({
  sql: 'update',
  collection: 'users',
  filter: { name: 'John Doe' },
  data: { $set: { age: 31 } }, // Update operations
});

// Delete documents
await db.execute({
  sql: 'delete',
  collection: 'users',
  filter: { age: { $lt: 18 } },
});

// Aggregation pipeline
await db.execute({
  sql: 'aggregate',
  collection: 'users',
  data: [
    { $match: { age: { $gte: 18 } } },
    { $group: { _id: '$city', count: { $sum: 1 } } },
  ],
});
```

**Configuration Options:**

- All base options plus standard connection settings
- Default port: `27017`
- Additional option: `authSource` (authentication database, default: 'admin')
- Supports connection pooling (max only)
- Action-based query structure (not SQL)
- No named parameters (uses MongoDB filter objects)

**Available Actions:**

- `insert` - Insert document(s)
- `find` - Query documents
- `update` - Update document(s)
- `delete` - Delete document(s)
- `aggregate` - Run aggregation pipeline
- `count` - Count documents
- `distinct` - Get distinct values

---

### SQLite

**Engine ID:** `SQLITE`\
**Driver:** jsr:@db/sqlite@^0.12.0\
**Features:** File-based or in-memory, transactions, prepared statements

**Note:** SQLite is single-threaded (no connection pooling)

```typescript
// File-based database
const db = DAM.create('SQLITE', 'sqlite-instance', {
  database: './data/app.db', // Path to database file

  // SQLite-specific options
  cacheSize: -64000, // Cache size: negative = KB (64MB)
  synchronous: 'NORMAL', // Sync mode: OFF, NORMAL, FULL

  // Performance tuning
  slowQueryThreshold: 300,
  transactionTimeout: 30,
  autoRollbackOnFailure: true,
});

// In-memory database (for testing)
const memDb = DAM.create('SQLITE', 'memory-db', {
  database: ':memory:', // Special in-memory database
  slowQueryThreshold: 300,
  transactionTimeout: 30,
  autoRollbackOnFailure: true,
});

// Named parameters with :param: syntax
await db.execute({
  sql: 'SELECT * FROM users WHERE name = :name: AND age > :age:',
  params: { name: 'John', age: 18 },
});
```

**Configuration Options:**

- `database` (required): File path or ':memory:' for in-memory DB
- `cacheSize` (optional): Cache size in pages (negative for KB), default: -64000
  (64MB)
- `synchronous` (optional): Sync mode ('OFF', 'NORMAL', 'FULL'), default:
  'NORMAL'
- Does NOT support: `host`, `port`, `username`, `password`, `ssl`, `pool`
- Single-threaded: All queries execute sequentially
- Transactions must be sequential (no concurrent transactions)

**Synchronous Modes:**

- `OFF` - No syncing (fastest, least safe - data loss risk on crash)
- `NORMAL` - Sync at critical moments (default, balanced)
- `FULL` - Always sync (safest, slowest)
