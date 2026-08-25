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

```typescript ignore
new BaseError<M>(message: string, context?: M, cause?: Error)
```

**Parameters:**

- `message`: Template string with `${var}` placeholders
- `context`: Object with data for template substitution
- `cause`: Optional underlying error for chaining

**`M` must be a `type` alias, not an `interface`.** It is constrained to
`Record<string, unknown>`, and an interface will not satisfy that —
`Index signature for type 'string' is missing in type 'MyContext'`.
Interfaces are open, since declaration merging lets another file add
members later, so TypeScript withholds the implicit index signature; a
`type` alias with the same members is closed and qualifies. For a shape
you cannot change, intersect it:

```typescript
import { BaseError } from '@tundralibs/utils';

interface Generated {
  requestId: string;
}

type MyContext = Generated & Record<string, unknown>;

class RequestError extends BaseError<MyContext> {}

throw new RequestError('Request ${requestId} failed', { requestId: 'r-1' });
```

### Methods

- `getContextValue(key)`: Strongly-typed read of one `context` entry
- `toJSON()`: Serialize to a plain `BaseErrorJson` object — `message` is
  the pre-template text (after `${var}` substitution, before
  `_messageTemplate` wrapping), `formattedMessage` mirrors
  `error.message`; a `BaseError` cause nests recursively, a plain
  `Error` cause becomes a `"Name: message"` string
- `getRootCause()`: Walk `cause` chains and return the deepest error
- `getCodeSnippet(contextLines?)`: Read the throw site from the stack
  trace and return `±contextLines` lines of source (default `3`),
  walking into a `BaseError` cause first so the deepest frame is shown

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
import { BaseError } from '@tundralibs/utils';

declare const database: { connect(): Promise<void> };

const initialize = async () => {
  try {
    await database.connect();
  } catch (err) {
    throw new BaseError(
      'Failed to initialize app',
      { component: 'database' },
      err as Error, // Chain the original error
    );
  }
};

try {
  await initialize();
} catch (error) {
  // Get root cause
  const rootCause = (error as BaseError).getRootCause();
  console.log(rootCause.message); // Original database error
}
```

### Custom Error Classes

```typescript
import { BaseError } from '@tundralibs/utils';

type ValidationContext = {
  field: string;
  value: unknown;
  rule: string;
};

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
import { BaseError } from '@tundralibs/utils';

const error = new BaseError('Something went wrong', { component: 'auth' });

const snippet = error.getCodeSnippet(2); // 2 lines of context each side
console.log(snippet);
// >    41 | ...
// >    42 | const error = new BaseError(...)
// >    43 | ...
```

> `getCodeSnippet()` reads the source file named in the stack trace off
> disk — it needs a real filesystem. On Cloudflare Workers or in a
> browser that read fails; rather than throwing, the method catches the
> failure and returns a human-readable string (`'Could not fetch code
> snippet: ...'`) instead. It never throws, so it's always safe to log
> unconditionally, but on those two runtimes the returned string carries
> no code — check for that prefix before relying on the content.

### JSON Serialization

```typescript
import { BaseError } from '@tundralibs/utils';

const error = new BaseError(
  'API request failed',
  { endpoint: '/users', status: 404 },
  new Error('Not Found'),
);

const errorJson = error.toJSON();
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
