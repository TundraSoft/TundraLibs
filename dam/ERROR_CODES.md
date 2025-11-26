/**

- @fileoverview DAM Engine Error Codes Documentation
-
- This document provides comprehensive documentation for all error codes used
- throughout the DAM (Database Access Manager) engine system. All error codes
- support variable substitution using the BaseError ${variable} syntax.
-
- @module DAM/Engine/Errors
- @version 1.0.0
- @see {@link DAMEngineError} - Error class implementation
- @see {@link BaseError} - Base error class with variable substitution */

# DAM Engine Error Codes Reference

## Overview

DAM engines use comprehensive error codes to provide detailed context about
failures. All errors follow a consistent pattern:

- **Contextual Information**: Every error includes `${engine}::${name}` for
  identification
- **Variable Substitution**: Uses `${variable}` syntax compatible with
  `BaseError`
- **Error Chaining**: Original errors preserved as `cause` for debugging
- **Standardized Time**: All timeout values expressed in seconds

## Error Categories

### Configuration Errors

#### `CONFIG_MISSING`

**Message**: `Configuration key ${configKey} is missing for ${engine}::${name}`

**Context Variables**:

- `engine` - Engine type (postgresql, mongodb, etc.)
- `name` - Engine instance name
- `configKey` - Missing configuration key

**Usage**: Thrown when required configuration options are not provided during
engine initialization.

#### `CONFIG_INVALID`

**Message**:
`Configuration value for ${configKey} is invalid in ${engine}::${name}: ${reason}`

**Context Variables**:

- `engine` - Engine type
- `name` - Engine instance name
- `configKey` - Invalid configuration key
- `reason` - Detailed validation failure reason

**Usage**: Thrown when configuration values fail validation (e.g., negative
timeouts, invalid functions).

#### `ENGINE_NOT_SUPPORTED`

**Message**: `Engine ${engine} is not supported`

**Context Variables**:

- `engine` - Unsupported engine type

**Usage**: Thrown when attempting to use an unrecognized engine type.

#### `OPTION_VALIDATION_FAILED`

**Message**:
`Option validation failed for ${engine}::${name}: ${option} - ${reason}`

**Context Variables**:

- `engine` - Engine type
- `name` - Engine instance name
- `option` - Failed option name
- `reason` - Validation failure reason

### Connection Errors

#### `CONNECTION_FAILED`

**Message**: `Failed to connect to ${engine}::${name}: ${reason}`

**Context Variables**:

- `engine` - Engine type
- `name` - Engine instance name
- `reason` - Connection failure reason

**Usage**: Thrown when database connection establishment fails.

#### `CONNECTION_TIMEOUT`

**Message**:
`Connection to ${engine}::${name} timed out after ${timeout} seconds`

**Context Variables**:

- `engine` - Engine type
- `name` - Engine instance name
- `timeout` - Connection timeout in seconds

**Usage**: Thrown when connection attempts exceed the configured timeout.

#### `CONNECTION_REFUSED`

**Message**: `Connection to ${engine}::${name} was refused: ${reason}`

**Context Variables**:

- `engine` - Engine type
- `name` - Engine instance name
- `reason` - Refusal reason

**Usage**: Thrown when database server actively refuses connections.

#### `CONNECTION_INVALID_CREDENTIALS`

**Message**: `Invalid credentials for ${engine}::${name}: ${reason}`

**Context Variables**:

- `engine` - Engine type
- `name` - Engine instance name
- `reason` - Authentication failure details

**Usage**: Thrown when authentication fails due to invalid credentials.

#### `CONNECTION_LOST`

**Message**: `Connection to ${engine}::${name} was lost: ${reason}`

**Context Variables**:

- `engine` - Engine type
- `name` - Engine instance name
- `reason` - Connection loss reason

**Usage**: Thrown when an established connection is unexpectedly lost.

### Connection Pool Errors

#### `CONNECTION_POOL_EXHAUSTED`

**Message**:
`Connection pool exhausted for ${engine}::${name}: ${activeConnections}/${maxConnections} connections in use`

**Context Variables**:

- `engine` - Engine type
- `name` - Engine instance name
- `activeConnections` - Current active connection count
- `maxConnections` - Maximum allowed connections

**Usage**: Thrown when all pool connections are in use and new requests cannot
be served.

#### `CONNECTION_POOL_TIMEOUT`

**Message**:
`Failed to acquire connection from pool for ${engine}::${name} within ${timeout} seconds`

**Context Variables**:

- `engine` - Engine type
- `name` - Engine instance name
- `timeout` - Pool acquisition timeout in seconds

**Usage**: Thrown when connection acquisition from pool exceeds timeout.

#### `POOL_INITIALIZATION_FAILED`

**Message**:
`Failed to initialize connection pool for ${engine}::${name}: ${reason}`

**Context Variables**:

- `engine` - Engine type
- `name` - Engine instance name
- `reason` - Pool initialization failure reason

**Usage**: Thrown when connection pool setup fails.

### Query Execution Errors

#### `QUERY_EXECUTION_FAILED`

**Message**: `Query execution failed on ${engine}::${name}: ${reason}`

**Context Variables**:

- `engine` - Engine type
- `name` - Engine instance name
- `reason` - Query execution failure reason
- `query` - SQL query (optional)
- `params` - Query parameters (optional)

**Usage**: Thrown when query execution encounters errors.

#### `QUERY_TIMEOUT`

**Message**:
`Query timed out on ${engine}::${name} after ${timeout} seconds: ${sql}`

**Context Variables**:

- `engine` - Engine type
- `name` - Engine instance name
- `timeout` - Query timeout in seconds
- `sql` - Timed out SQL query

**Usage**: Thrown when query execution exceeds configured timeout.

#### `QUERY_MISSING_PARAMETERS`

**Message**:
`Query missing required parameters on ${engine}::${name}: ${missing}`

**Context Variables**:

- `engine` - Engine type
- `name` - Engine instance name
- `missing` - Comma-separated list of missing parameters
- `query` - Query object with SQL and params

**Usage**: Thrown when SQL contains :param: placeholders without corresponding
parameters.

#### `QUERY_INVALID_SQL`

**Message**: `Invalid SQL syntax on ${engine}::${name}: ${reason}`

**Context Variables**:

- `engine` - Engine type
- `name` - Engine instance name
- `reason` - SQL validation failure reason

**Usage**: Thrown when SQL syntax validation fails.

### Transaction Errors

#### `TRANSACTION_NOT_FOUND`

**Message**: `Transaction ${transactionId} not found on ${engine}::${name}`

**Context Variables**:

- `engine` - Engine type
- `name` - Engine instance name
- `transactionId` - Missing transaction identifier

**Usage**: Thrown when referencing a non-existent transaction.

#### `TRANSACTION_NOT_ACTIVE`

**Message**: `No active transaction on ${engine}::${name} to ${operation}`

**Context Variables**:

- `engine` - Engine type
- `name` - Engine instance name
- `operation` - Attempted operation (commit, rollback)

**Usage**: Thrown when attempting transaction operations without an active
transaction.

#### `TRANSACTION_TIMEOUT`

**Message**:
`Transaction ${transactionId} timed out on ${engine}::${name} after ${timeout} seconds`

**Context Variables**:

- `engine` - Engine type
- `name` - Engine instance name
- `transactionId` - Timed out transaction ID
- `timeout` - Transaction timeout in seconds

**Usage**: Thrown when transaction operations exceed configured timeout.

#### `TRANSACTION_COMMIT_FAILED`

**Message**:
`Failed to commit transaction ${transactionId} on ${engine}::${name}: ${reason}`

**Context Variables**:

- `engine` - Engine type
- `name` - Engine instance name
- `transactionId` - Failed transaction ID (optional)
- `reason` - Commit failure reason

**Usage**: Thrown when transaction commit operations fail.

#### `TRANSACTION_ROLLBACK_FAILED`

**Message**:
`Failed to rollback transaction ${transactionId} on ${engine}::${name}: ${reason}`

**Context Variables**:

- `engine` - Engine type
- `name` - Engine instance name
- `transactionId` - Failed transaction ID (optional)
- `reason` - Rollback failure reason

**Usage**: Thrown when transaction rollback operations fail.

#### `TRANSACTION_SAVEPOINT_FAILED`

**Message**:
`Savepoint operation failed on ${engine}::${name}: ${operation} ${savepoint} - ${reason}`

**Context Variables**:

- `engine` - Engine type
- `name` - Engine instance name
- `operation` - Savepoint operation (create, release, rollback)
- `savepoint` - Savepoint name
- `reason` - Operation failure reason

**Usage**: Thrown when nested transaction savepoint operations fail.

### Engine Lifecycle Errors

#### `ENGINE_ALREADY_CONNECTED`

**Message**: `Engine ${engine}::${name} is already connected`

**Context Variables**:

- `engine` - Engine type
- `name` - Engine instance name

**Usage**: Thrown when attempting to connect an already connected engine.

#### `ENGINE_NOT_CONNECTED`

**Message**: `Engine ${engine}::${name} is not connected`

**Context Variables**:

- `engine` - Engine type
- `name` - Engine instance name

**Usage**: Thrown when attempting operations that require connection on
disconnected engine.

#### `ENGINE_CLEANUP_FAILED`

**Message**: `Failed to cleanup engine ${engine}::${name}: ${reason}`

**Context Variables**:

- `engine` - Engine type
- `name` - Engine instance name
- `reason` - Cleanup failure reason

**Usage**: Thrown when engine cleanup during close() operations fails.

### Health Monitoring Errors

#### `HEALTH_CHECK_FAILED`

**Message**: `Health check failed for ${engine}::${name}: ${reason}`

**Context Variables**:

- `engine` - Engine type
- `name` - Engine instance name
- `reason` - Health check failure reason

**Usage**: Thrown when periodic health checks fail.

#### `ENGINE_UNHEALTHY`

**Message**:
`Engine ${engine}::${name} is unhealthy: ${consecutiveErrors} consecutive errors`

**Context Variables**:

- `engine` - Engine type
- `name` - Engine instance name
- `consecutiveErrors` - Number of consecutive health check failures

**Usage**: Thrown when consecutive health check failures exceed the configured
threshold.

### Database-Specific Errors

#### `SQL_CONSTRAINT_VIOLATION`

**Message**:
`SQL constraint violation on ${engine}::${name}: ${constraint} - ${reason}`

**Context Variables**:

- `engine` - Engine type
- `name` - Engine instance name
- `constraint` - Violated constraint name
- `reason` - Violation details

**Usage**: Thrown when SQL operations violate database constraints.

#### `MONGODB_OPERATION_FAILED`

**Message**:
`MongoDB operation failed on ${engine}::${name}: ${operation} - ${reason}`

**Context Variables**:

- `engine` - Engine type (mongodb)
- `name` - Engine instance name
- `operation` - Failed MongoDB operation
- `reason` - Operation failure reason

**Usage**: Thrown when MongoDB-specific operations fail.

#### `SQLITE_LOCK_TIMEOUT`

**Message**:
`SQLite database lock timeout on ${engine}::${name} after ${timeout} seconds`

**Context Variables**:

- `engine` - Engine type (sqlite)
- `name` - Engine instance name
- `timeout` - Lock timeout in seconds

**Usage**: Thrown when SQLite database lock acquisition times out.

## Error Handling Best Practices

### 1. Error Code Checking

```typescript
try {
  await engine.connect();
} catch (error) {
  if (error instanceof DAMEngineError) {
    switch (error.code) {
      case 'CONNECTION_FAILED':
        console.error(`Connection failed: ${error.context.reason}`);
        break;
      case 'CONNECTION_TIMEOUT':
        console.error(`Connection timed out after ${error.context.timeout}s`);
        break;
      default:
        console.error(`Unexpected error: ${error.message}`);
    }
  }
}
```

### 2. Context Information Access

```typescript
if (error.code === 'QUERY_MISSING_PARAMETERS') {
  console.error(`Missing parameters: ${error.context.missing}`);
  console.error(`Query: ${error.context.query.sql}`);
}
```

### 3. Error Monitoring

```typescript
engine.on('error', (instanceId, error) => {
  logger.error('Engine error occurred', {
    instanceId,
    errorCode: error.code,
    errorMessage: error.message,
    context: error.context,
    timestamp: new Date().toISOString(),
  });
});
```

### 4. Retry Logic

```typescript
async function executeWithRetry<R>(
  query: EngineQuery,
  maxRetries = 3,
): Promise<EngineQueryResult<R>> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await engine.execute<R>(query);
    } catch (error) {
      if (error instanceof DAMEngineError) {
        // Don't retry on certain error types
        if (
          ['QUERY_MISSING_PARAMETERS', 'CONFIG_INVALID'].includes(error.code)
        ) {
          throw error;
        }

        // Retry on transient errors
        if (
          ['CONNECTION_LOST', 'QUERY_TIMEOUT'].includes(error.code) &&
          attempt < maxRetries
        ) {
          await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
          continue;
        }
      }
      throw error;
    }
  }
}
```

## Related Documentation

- **AbstractEngine**: Main engine base class
- **DAMEngineError**: Error class implementation
- **BaseError**: Variable substitution and error chaining
- **EngineOptions**: Configuration options for engines
- **TransactionOptions**: Transaction-specific configuration
- **ConnectionPoolStats**: Pool monitoring metrics
