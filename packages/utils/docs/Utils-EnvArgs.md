# Utils - envArgs

Environment variable and configuration loader with .env file and Docker secrets support.

[← Back to Utils](../README.md)

## Overview

envArgs provides secure, flexible loading of environment variables from multiple sources:

- **System Environment**: Access system env variables
- **.env Files**: Parse .env files with quote handling
- **Docker Secrets**: Load secrets from /run/secrets
- **Permission-Aware**: Respects Deno permission model
- **Immutable**: Returns frozen objects for security

## Installation

```bash
deno add @tundralibs/utils
```

## API Reference

### `envArgs(envFile?: string, enableSecrets?: boolean): PrivateObject<Record<string, string>>`

Loads environment variables from multiple sources.

**Parameters:**

- `envFile`: Path to .env file (optional)
- `enableSecrets`: Enable Docker secrets loading (default: false)

**Returns:** Immutable object with environment variables

## Usage Examples

### Basic Usage

```typescript
import { envArgs } from '@tundralibs/utils';

const env = envArgs();

// Access variables
const dbHost = env.get('DB_HOST') ?? 'localhost';
const apiKey = env.get('API_KEY');

// Check existence
if (env.has('DEBUG')) {
  console.log('Debug mode enabled');
}
```

### Loading .env File

**.env:**

```env
DB_HOST=localhost
DB_PORT=5432
API_KEY="secret-key-with-spaces"
DEBUG=true
MULTI_LINE="line1
line2"
```

**TypeScript:**

```typescript
import { envArgs } from '@tundralibs/utils';

const config = envArgs('./config/.env');

const dbConfig = {
  host: config.get('DB_HOST'),
  port: parseInt(config.get('DB_PORT') ?? '5432'),
  apiKey: config.get('API_KEY'),
};
```

### Docker Secrets

```typescript
import { envArgs } from '@tundralibs/utils';

// Enable Docker secrets loading from /run/secrets/
const env = envArgs(undefined, true);

const dbPassword = env.get('db_password'); // From /run/secrets/db_password
```

### Iterating Variables

```typescript
import { envArgs } from '@tundralibs/utils';

const env = envArgs();

// Get all keys
const keys = env.keys();

// Iterate over all variables
env.forEach((key, value) => {
  if (key.startsWith('API_')) {
    console.log(`${key}: ${value}`);
  }
});
```

## .env File Format

```env
# Comments are ignored
KEY=value
QUOTED="value with spaces"
EMPTY=
MULTILINE="line1
line2"
```

## Best Practices

1. **Use Defaults**: Provide fallback values with `??` operator
2. **Type Conversion**: Parse numbers and booleans explicitly
3. **Validation**: Check required variables at startup
4. **Security**: Never log sensitive values

## Related Utilities

- [Config](Utils-Config.md) - Multi-format configuration loader
- [privateObject](Utils-PrivateObject.md) - Secure data encapsulation

[← Back to Utils](../README.md)
