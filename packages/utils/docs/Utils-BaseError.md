# Utils - BaseError

Enhanced error class with context data, chaining, templating, and code snippet extraction.

[← Back to Utils](../README.md)

## Overview

BaseError extends the native Error class with powerful features for better error handling:

- **Context Data**: Attach structured data to errors
- **Error Chaining**: Link errors with cause tracking
- **Message Templating**: Variable substitution in error messages
- **Code Snippets**: Extract relevant code from stack traces
- **JSON Serialization**: Convert errors to JSON for logging
- **Root Cause Analysis**: Navigate error chains

## Installation

```bash
deno add @tundralibs/utils
```

## API Reference

### Constructor

```typescript
new BaseError<M>(message: string, context?: M, cause?: Error)
```

**Parameters:**

- `message`: Template string with `${var}` placeholders
- `context`: Object with data for template substitution
- `cause`: Optional underlying error for chaining

### Methods

- `toJson()`: Serialize error to JSON
- `getRootCause()`: Get the deepest cause in the chain
- `getCodeSnippet()`: Extract code from stack trace

## Usage Examples

### Basic Error with Context

```typescript
import { BaseError } from '@tundralibs/utils';

throw new BaseError(
  'User ${userId} not found',
  { userId: 123 },
);
// Error message: "User 123 not found"
```

### Error Chaining

```typescript
try {
  await database.connect();
} catch (err) {
  throw new BaseError(
    'Failed to initialize app',
    { component: 'database' },
    err, // Chain the original error
  );
}

// Get root cause
const rootCause = error.getRootCause();
console.log(rootCause.message); // Original database error
```

### Custom Error Classes

```typescript
interface ValidationContext {
  field: string;
  value: unknown;
  rule: string;
}

class ValidationError extends BaseError<ValidationContext> {
  protected override get _messageTemplate(): string {
    return 'Validation failed for ${field}: ${rule}';
  }
}

throw new ValidationError('', {
  field: 'email',
  value: 'invalid',
  rule: 'must be valid email address',
});
```

### Code Snippet Extraction

```typescript
const error = new BaseError('Something went wrong', { line: 42 });

const snippet = error.getCodeSnippet({
  before: 2,
  after: 2,
  syntaxHighlight: false,
});

console.log(snippet);
// Shows 2 lines before and after the error line
```

### JSON Serialization

```typescript
const error = new BaseError(
  'API request failed',
  { endpoint: '/users', status: 404 },
  new Error('Not Found'),
);

const errorJson = error.toJson();
console.log(JSON.stringify(errorJson, null, 2));
```

## Best Practices

1. **Always Provide Context**: Include relevant data for debugging
2. **Chain Errors**: Preserve original errors when re-throwing
3. **Custom Error Classes**: Create domain-specific error types
4. **Template Messages**: Use descriptive templates with context variables

## Related Utilities

- [Events](Utils-Events.md) - Emit error events
- [Options](Utils-Options.md) - Base class with error handling

[← Back to Utils](../README.md)
