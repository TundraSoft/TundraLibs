# Slogger Formatters

Log formatters for structured and human-readable output.

![Deno](https://img.shields.io/badge/Deno-000000?logo=deno)
![Bun](https://img.shields.io/badge/Bun-f9f1e1?logo=bun)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)

## Table of Contents

- [Overview](#overview)
- [Formatter Types](#formatter-types)
- [String Formatters](#string-formatters)
- [JSON Formatter](#json-formatter)
- [Masking Formatter](#masking-formatter)
- [Custom Formatters](#custom-formatters)
- [Examples](#examples)

## Overview

Formatters convert log objects into strings for output. Slogger provides multiple built-in formatters optimized for different use cases:

- **String formatters** - Human-readable text output
- **JSON formatter** - Structured JSON for machine processing
- **Masking formatter** - Automatic sensitive data redaction
- **Custom formatters** - Extensible formatter system

## Formatter Types

| Formatter  | Output Format                                         | Use Case           | Bun | Deno | Node.js |
| ---------- | ----------------------------------------------------- | ------------------ | --- | ---- | ------- |
| standard   | `[isoDate] [LEVEL] message`                           | General purpose    | ✅  | ✅   | ✅      |
| detailed   | `isoDate [LEVEL] [AppName] [hostname] message`        | Development        | ✅  | ✅   | ✅      |
| compact    | `LEVEL [HH:mm:ss] message` (UTC time)                 | Minimal output     | ✅  | ✅   | ✅      |
| minimalist | `message`                                             | Ultra-minimal      | ✅  | ✅   | ✅      |
| keyValue   | `level=LEVEL app=AppName message="message" key=value` | Log parsers        | ✅  | ✅   | ✅      |
| json       | Structured JSON object                                | Machine processing | ✅  | ✅   | ✅      |
| masking    | Wraps other formatters with data redaction            | Security           | ✅  | ✅   | ✅      |

## String Formatters

Human-readable text formatters for console and file output.

### Standard Format

General-purpose format with timestamp, level, and message.

**Format:** `[${isoDate}] [${levelName}] ${message}`

```typescript
import { Slogger, SyslogSeverities } from '@tundralibs/slogger';

const logger = new Slogger({
  appName: 'MyApp',
  level: SyslogSeverities.INFO,
  handlers: [{
    name: 'console',
    type: 'ConsoleHandler',
    level: SyslogSeverities.INFO,
    formatter: 'standard',
  }],
});

logger.info('User logged in', { userId: '123' });
// Output: [2024-01-15T10:30:00.000Z] [INFO] User logged in
```

### Detailed Format

Extended format with timestamp, level, app name, and hostname.

**Format:** `${isoDate} [${levelName}] [${appName}] [${hostname}] ${message}`

```typescript
import { detailedFormat, Slogger, SyslogSeverities } from '@tundralibs/slogger';

const logger = new Slogger({
  appName: 'MyApp',
  level: SyslogSeverities.INFO,
  handlers: [{
    name: 'console',
    type: 'ConsoleHandler',
    level: SyslogSeverities.INFO,
    formatter: detailedFormat,
  }],
});

logger.info('Request processed', { method: 'GET', path: '/api/users' });
// Output: 2024-01-15T10:30:00.000Z [INFO] [MyApp] [my-hostname] Request processed
```

### Compact Format

Minimal format with level, a time-only stamp (UTC `HH:mm:ss`, sliced
from the record's ISO timestamp), and the message.

**Format:** `LEVEL [HH:mm:ss] message`

```typescript
import { compactFormat, Slogger, SyslogSeverities } from '@tundralibs/slogger';

const logger = new Slogger({
  appName: 'MyApp',
  level: SyslogSeverities.INFO,
  handlers: [{
    name: 'console',
    type: 'ConsoleHandler',
    level: SyslogSeverities.INFO,
    formatter: compactFormat,
  }],
});

logger.info('Server started');
// Output: INFO [15:20:30] Server started
```

### Minimalist Format

Ultra-minimal format with only the message.

**Format:** `message`

```typescript
import {
  minimalistFormat,
  Slogger,
  SyslogSeverities,
} from '@tundralibs/slogger';

const logger = new Slogger({
  appName: 'MyApp',
  level: SyslogSeverities.INFO,
  handlers: [{
    name: 'console',
    type: 'ConsoleHandler',
    level: SyslogSeverities.INFO,
    formatter: minimalistFormat,
  }],
});

logger.info('Application ready');
// Output: Application ready
```

### Key-Value Format

Parseable key-value format for log aggregation systems.

**Format:** `level=LEVEL app=AppName message="message" key1=value1 key2=value2`

```typescript
import { keyValueFormat, Slogger, SyslogSeverities } from '@tundralibs/slogger';

const logger = new Slogger({
  appName: 'MyApp',
  level: SyslogSeverities.INFO,
  handlers: [{
    name: 'console',
    type: 'ConsoleHandler',
    level: SyslogSeverities.INFO,
    formatter: keyValueFormat,
  }],
});

logger.info('User action', {
  userId: '123',
  action: 'login',
  ip: '192.168.1.1',
});
// Output: level=INFO app=MyApp message="User action" userId=123 action=login ip=192.168.1.1
```

### Using String Formatters

All string formatters can be referenced by name or imported directly:

```typescript
import {
  compactFormat,
  detailedFormat,
  keyValueFormat,
  minimalistFormat,
  standardFormat,
  SyslogSeverities,
} from '@tundralibs/slogger';

// By name
handlers: [{
  name: 'console',
  type: 'ConsoleHandler',
  level: SyslogSeverities.INFO,
  formatter: 'standard',
}];

// By import
handlers: [{
  name: 'console',
  type: 'ConsoleHandler',
  level: SyslogSeverities.INFO,
  formatter: detailedFormat,
}];
```

## JSON Formatter

Structured JSON output for machine processing and log aggregation.

### Output Structure

```typescript ignore
{
  "id": "01HKQR2TPXXXXXXXXXXXXXXX",  // ULID
  "appName": "MyApp",
  "hostname": "my-server",
  "level": 6,                          // Numeric syslog level
  "levelName": "INFO",                 // Human-readable level
  "message": "User logged in",
  "context": {                         // Optional context object
    "userId": "123",
    "ip": "192.168.1.1"
  },
  "timestamp": 1705312200000,          // Unix timestamp (ms)
  "isoDate": "2024-01-15T10:30:00.000Z" // ISO 8601 timestamp
}
```

### Usage

```typescript
import { jsonFormatter, Slogger, SyslogSeverities } from '@tundralibs/slogger';

const logger = new Slogger({
  appName: 'MyApp',
  level: SyslogSeverities.INFO,
  handlers: [{
    name: 'file',
    type: 'FileHandler',
    level: SyslogSeverities.INFO,
    directory: './logs',
    filenameTemplate: 'app.log',
    formatter: 'json', // By name
  }],
});

logger.info('API request', {
  method: 'GET',
  path: '/api/users',
  responseTime: 45,
});
```

### Features

- Consistent structure across all logs
- ISO 8601 timestamps for compatibility
- Numeric and string severity levels
- Automatic context serialization
- ULID for unique log identification

## Masking Formatter

Wraps other formatters to automatically redact sensitive data.

### Configuration

```typescript
import {
  jsonFormatter,
  maskingFormatter,
  MaskingStrategy,
  Slogger,
  SyslogSeverities,
} from '@tundralibs/slogger';

const logger = new Slogger({
  appName: 'SecureApp',
  level: SyslogSeverities.INFO,
  handlers: [{
    name: 'console',
    type: 'ConsoleHandler',
    level: SyslogSeverities.INFO,
    formatter: maskingFormatter({
      strategy: MaskingStrategy.PARTIAL,
      maskChar: '*',
      sensitiveFields: ['password', 'apiKey', 'token', 'secret'],
      sensitivePatterns: [
        /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, // Email
        /\b\d{3}-\d{2}-\d{4}\b/g, // SSN
      ],
      baseFormatter: jsonFormatter,
    }),
  }],
});
```

### Masking Strategies

#### FULL Strategy

Completely redacts sensitive values.

```typescript
import {
  jsonFormatter,
  maskingFormatter,
  MaskingStrategy,
} from '@tundralibs/slogger/formatters';
import type { Slogger } from '@tundralibs/slogger';

declare const logger: Slogger;

maskingFormatter({
  strategy: MaskingStrategy.FULL,
  sensitiveFields: ['password', 'apiKey'],
  baseFormatter: jsonFormatter,
});

logger.info('User authenticated', {
  username: 'john',
  password: 'secret123',
  apiKey: 'sk-1234567890abcdef',
});

// Output: {"username":"john","password":"***","apiKey":"***"}
```

#### PARTIAL Strategy

Partially masks sensitive values, showing some characters.

```typescript
import {
  jsonFormatter,
  maskingFormatter,
  MaskingStrategy,
} from '@tundralibs/slogger/formatters';
import type { Slogger } from '@tundralibs/slogger';

declare const logger: Slogger;

maskingFormatter({
  strategy: MaskingStrategy.PARTIAL,
  sensitiveFields: ['email', 'phone'],
  baseFormatter: jsonFormatter,
});

logger.info('User registered', {
  email: 'user@example.com',
  phone: '555-123-4567',
});

// Output: {"email":"u***@example.com","phone":"5***7"}
```

#### PREFIX Strategy

Shows the first few characters of the value and masks the rest. The number
of characters kept is set by `visibleChars` (default 4); if the value is
shorter than that, the whole value is shown. Useful for keeping a
recognisable leading fragment of an identifier while hiding the remainder.

```typescript
import {
  jsonFormatter,
  maskingFormatter,
  MaskingStrategy,
} from '@tundralibs/slogger/formatters';
import type { Slogger } from '@tundralibs/slogger';

declare const logger: Slogger;

maskingFormatter({
  strategy: MaskingStrategy.PREFIX,
  visibleChars: 4,
  sensitiveFields: ['apiKey'],
  baseFormatter: jsonFormatter,
});

logger.info('Request signed', {
  apiKey: 'sk-1234567890abcdef',
});

// Shows the first 4 characters ("sk-1"), masks the rest.
// Output: {"apiKey":"sk-1***"}
```

#### SUFFIX Strategy

Masks the leading characters and shows the last few. The number of trailing
characters kept is set by `visibleChars` (default 4); if the value is
shorter than that, the whole value is shown. Handy for surfacing the last
digits of a card or account number while hiding the rest.

```typescript
import {
  jsonFormatter,
  maskingFormatter,
  MaskingStrategy,
} from '@tundralibs/slogger/formatters';
import type { Slogger } from '@tundralibs/slogger';

declare const logger: Slogger;

maskingFormatter({
  strategy: MaskingStrategy.SUFFIX,
  visibleChars: 4,
  sensitiveFields: ['cardNumber'],
  baseFormatter: jsonFormatter,
});

logger.info('Payment processed', {
  cardNumber: '4111111111111234',
});

// Masks all but the last 4 characters ("1234").
// Output: {"cardNumber":"***1234"}
```

### Options

```typescript
import { MaskingStrategy } from '@tundralibs/slogger/formatters';
import type { SloggerFormatter } from '@tundralibs/slogger/types';

interface MaskingFormatterOptions {
  strategy?: MaskingStrategy; // FULL, PARTIAL, PREFIX or SUFFIX (default: FULL)
  maskChar?: string; // Character for masking (default: '*')
  visibleChars?: number; // Chars shown for PREFIX/SUFFIX (default: 4)
  sensitiveFields?: string[]; // Field names to mask
  sensitivePatterns?: RegExp[]; // Regex patterns to match and mask
  baseFormatter?: SloggerFormatter; // Underlying formatter
}
```

### Default Sensitive Fields

When you do not pass `sensitiveFields`, the masking formatter applies a
built-in list covering the password family (`password`, `passwd`,
`passphrase`, `pass`, `pwd`), secrets and credentials (`secret`,
`clientSecret`, `credential`), tokens (`token`, `authToken`,
`accessToken`, `refreshToken`, …), crypto keys (`apiKey`, `secretKey`,
`privateKey`, …) and PII/financial fields (`ssn`, `cvv`, `creditCard`,
`cardNumber`).

**The full list lives in one place:
[Security → Default Sensitive Fields](../docs/Slogger-Security.md#default-sensitive-fields).**
It is not repeated here — a list maintained in two documents drifts, and
a stale copy of a security default is worse than no copy, because it
tells you a field is redacted when it is not.

Note that `sensitiveFields` **replaces** the defaults rather than adding
to them; include the defaults you still want.

Matching is **head-anchored** and case-insensitive: a field name masks a
context key only when it names the key's **end (head)** — via a whole-key
match, a camelCase / `_`-`-`-`.` word-component suffix, or (for names of 4+
characters) a concatenation suffix that begins at a word boundary. So
`apiKey` masks `userApiKey`/`x-api-key`/`apikey` while `sortKey` and
`creditCardBrand` are left untouched. The bare generic words `token`,
`key`, `auth`, `private`, `pin`, `pass` and `pwd` match **only** as a
whole key, so benign compounds that merely end in one of them —
`sortKey`, `pageToken`, `nextPageToken`, `continuationToken`, `csrfToken`,
`authUrl`, `isPrivate`, `bypass`, `compass` — are left untouched; the
real secret `*Token`/`*Key` compounds (`authToken`, `accessToken`,
`refreshToken`, `sessionToken`, `apiToken`, `bearerToken`, `idToken`;
`apiKey`, `secretKey`, `privateKey`, …) are enumerated as their own
default fields instead, and are themselves head-anchored (so `authToken`
masks `session_auth_token`/`authtoken` but `androidToken`/`pageToken`
stay visible). See
[Security → Matching Semantics](../docs/Slogger-Security.md#matching-semantics)
for the full contract.

Masking a field name is not the same as masking a value inside the
message string — an email address in the message text is caught by
`sensitivePatterns`, not by this list.

### Custom Patterns

Define regex patterns to mask values matching specific formats:

```typescript
import {
  jsonFormatter,
  maskingFormatter,
} from '@tundralibs/slogger/formatters';

maskingFormatter({
  sensitivePatterns: [
    // Email addresses
    /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
    // Credit card numbers
    /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g,
    // US phone numbers
    /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g,
    // US SSN
    /\b\d{3}-\d{2}-\d{4}\b/g,
    // API keys (example pattern)
    /\bsk-[a-zA-Z0-9]{32,}\b/g,
  ],
  baseFormatter: jsonFormatter,
});
```

### Examples

#### Basic Masking

```typescript
import {
  jsonFormatter,
  maskingFormatter,
  MaskingStrategy,
  Slogger,
  SyslogSeverities,
} from '@tundralibs/slogger';

const logger = new Slogger({
  appName: 'App',
  level: SyslogSeverities.INFO,
  handlers: [{
    name: 'secure',
    type: 'FileHandler',
    level: SyslogSeverities.INFO,
    directory: './logs',
    filenameTemplate: 'secure.log',
    formatter: maskingFormatter({
      strategy: MaskingStrategy.FULL,
      sensitiveFields: ['password', 'token'],
      baseFormatter: jsonFormatter,
    }),
  }],
});

logger.info('Login attempt', {
  username: 'john_doe',
  password: 'mySecretPassword',
  token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
});

// Logged: {"username":"john_doe","password":"***","token":"***"}
```

#### Email Masking

```typescript
import {
  jsonFormatter,
  maskingFormatter,
  MaskingStrategy,
  Slogger,
  standardFormat,
  SyslogSeverities,
} from '@tundralibs/slogger';

const logger = new Slogger({
  appName: 'App',
  level: SyslogSeverities.INFO,
  handlers: [{
    name: 'console',
    type: 'ConsoleHandler',
    level: SyslogSeverities.INFO,
    formatter: maskingFormatter({
      strategy: MaskingStrategy.PARTIAL,
      sensitivePatterns: [
        /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
      ],
      baseFormatter: standardFormat,
    }),
  }],
});

logger.info('Contact user@example.com for support');
// Output: [timestamp] INFO App: Contact u***@example.com for support
```

#### Production Security Setup

```typescript
import {
  jsonFormatter,
  maskingFormatter,
  MaskingStrategy,
  Slogger,
  SyslogSeverities,
} from '@tundralibs/slogger';

const logger = new Slogger({
  appName: 'ProdApp',
  level: SyslogSeverities.INFO,
  handlers: [{
    name: 'secure-logs',
    type: 'FileHandler',
    level: SyslogSeverities.INFO,
    directory: './logs',
    filenameTemplate: 'app.log',
    formatter: maskingFormatter({
      strategy: MaskingStrategy.PARTIAL,
      maskChar: '█',
      sensitiveFields: [
        'password',
        'apiKey',
        'api_key',
        'token',
        'accessToken',
        'refreshToken',
        'secret',
        'creditCard',
        'ssn',
        'socialSecurity',
        'bankAccount',
      ],
      sensitivePatterns: [
        /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
        /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g,
        /\b\d{3}-\d{2}-\d{4}\b/g,
      ],
      baseFormatter: jsonFormatter,
    }),
  }],
});
```

## Custom Formatters

Create custom formatters for specialized output formats.

### Formatter Signature

```typescript
import type { SlogObject } from '@tundralibs/slogger';

type SloggerFormatter = (log: SlogObject) => string;
```

### SlogObject Structure

```typescript
interface SlogObject {
  id: string; // ULID
  appName: string; // Application name
  hostname: string; // System hostname
  level: number; // Numeric severity (0-7)
  levelName: string; // String severity
  message: string; // Log message
  context?: Record<string, unknown>; // Optional context
  timestamp: number; // Unix timestamp (ms)
  isoDate: string; // ISO 8601 timestamp
}
```

### Example: Custom CSV Formatter

```typescript
import { Slogger, SyslogSeverities } from '@tundralibs/slogger';
import type { SlogObject } from '@tundralibs/slogger';

function csvFormatter(log: SlogObject): string {
  return [
    log.isoDate,
    log.levelName,
    log.appName,
    log.hostname,
    `"${log.message.replace(/"/g, '""')}"`,
    JSON.stringify(log.context || {}),
  ].join(',');
}

const logger = new Slogger({
  appName: 'MyApp',
  level: SyslogSeverities.INFO,
  handlers: [{
    name: 'csv-file',
    type: 'FileHandler',
    level: SyslogSeverities.INFO,
    directory: './logs',
    filenameTemplate: 'app.csv',
    formatter: csvFormatter,
  }],
});
```

### Example: Custom Colored Console Formatter

```typescript
import { Slogger, SyslogSeverities } from '@tundralibs/slogger';

import type { SlogObject } from '@tundralibs/slogger';

const colors = {
  EMERGENCY: '\x1b[41m', // Red background
  ALERT: '\x1b[35m', // Magenta
  CRITICAL: '\x1b[31m', // Red
  ERROR: '\x1b[31m', // Red
  WARNING: '\x1b[33m', // Yellow
  NOTICE: '\x1b[36m', // Cyan
  INFO: '\x1b[32m', // Green
  DEBUG: '\x1b[90m', // Gray
  RESET: '\x1b[0m',
};

function coloredFormatter(log: SlogObject): string {
  const color = colors[log.levelName] || colors.RESET;
  return `${color}[${log.levelName}]${colors.RESET} ${log.message}`;
}

const logger = new Slogger({
  appName: 'MyApp',
  level: SyslogSeverities.DEBUG,
  handlers: [{
    name: 'console',
    type: 'ConsoleHandler',
    level: SyslogSeverities.INFO,
    formatter: coloredFormatter,
  }],
});
```

### Example: Template Formatter

```typescript
import { Slogger, SyslogSeverities } from '@tundralibs/slogger';

import type { SlogObject } from '@tundralibs/slogger';

function templateFormatter(template: string) {
  return (log: SlogObject): string => {
    return template
      .replace('{{timestamp}}', log.isoDate)
      .replace('{{level}}', log.levelName)
      .replace('{{app}}', log.appName)
      .replace('{{host}}', log.hostname)
      .replace('{{message}}', log.message)
      .replace('{{context}}', JSON.stringify(log.context || {}));
  };
}

const customTemplate = '{{timestamp}} | {{level}} | {{app}} | {{message}}';

const logger = new Slogger({
  appName: 'MyApp',
  level: SyslogSeverities.INFO,
  handlers: [{
    name: 'console',
    type: 'ConsoleHandler',
    level: SyslogSeverities.INFO,
    formatter: templateFormatter(customTemplate),
  }],
});
```

### Registering Custom Formatters

```typescript
import {
  LogManager,
  Slogger,
  type SloggerFormatter,
  SyslogSeverities,
} from '@tundralibs/slogger';

declare const csvFormatter: SloggerFormatter;
declare const coloredFormatter: SloggerFormatter;

LogManager.addFormatter('csv', csvFormatter);
LogManager.addFormatter('colored', coloredFormatter);

// Use by name
const logger = new Slogger({
  appName: 'MyApp',
  level: SyslogSeverities.INFO,
  handlers: [{
    name: 'console',
    type: 'ConsoleHandler',
    level: SyslogSeverities.INFO,
    formatter: 'csv', // Reference by registered name
  }],
});
```

## Examples

### Multiple Formatters for Different Handlers

```typescript
import {
  detailedFormat,
  jsonFormatter,
  Slogger,
  SyslogSeverities,
} from '@tundralibs/slogger';

const logger = new Slogger({
  appName: 'MultiFormat',
  level: SyslogSeverities.DEBUG,
  handlers: [
    {
      name: 'console',
      type: 'ConsoleHandler',
      level: SyslogSeverities.DEBUG,
      formatter: detailedFormat, // Human-readable for console
    },
    {
      name: 'file',
      type: 'FileHandler',
      level: SyslogSeverities.INFO,
      directory: './logs',
      filenameTemplate: 'app.log',
      formatter: jsonFormatter, // Structured for file
    },
  ],
});
```

### Combining Masking with Other Formatters

```typescript
import {
  detailedFormat,
  jsonFormatter,
  Slogger,
  SyslogSeverities,
} from '@tundralibs/slogger';

import { maskingFormatter, MaskingStrategy } from '@tundralibs/slogger';

const logger = new Slogger({
  appName: 'SecureApp',
  level: SyslogSeverities.INFO,
  handlers: [
    {
      name: 'public-console',
      type: 'ConsoleHandler',
      level: SyslogSeverities.INFO,
      formatter: maskingFormatter({
        strategy: MaskingStrategy.PARTIAL,
        sensitiveFields: ['password', 'token'],
        baseFormatter: detailedFormat,
      }),
    },
    {
      name: 'secure-file',
      type: 'FileHandler',
      level: SyslogSeverities.INFO,
      directory: './secure-logs',
      filenameTemplate: 'app.log',
      formatter: maskingFormatter({
        strategy: MaskingStrategy.FULL,
        sensitiveFields: ['password', 'token', 'apiKey'],
        baseFormatter: jsonFormatter,
      }),
    },
  ],
});
```

## Related Documentation

- [Handlers](../handlers/Slogger-Handlers.md) - Available log handlers
- [Configuration](../docs/Slogger-Configuration.md) - Complete configuration guide
- [Security](../docs/Slogger-Security.md) - Security best practices
- [Examples](../docs/Slogger-Examples.md) - More usage examples

---

[← Back to Slogger](../README.md)
