# Slogger Security

Security best practices and data protection features.

![Deno](https://img.shields.io/badge/Deno-000000?logo=deno)
![Bun](https://img.shields.io/badge/Bun-f9f1e1?logo=bun)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)

## Table of Contents

- [Security Overview](#security-overview)
- [Data Masking](#data-masking)
- [Sensitive Field Detection](#sensitive-field-detection)
- [Pattern-Based Masking](#pattern-based-masking)
- [Best Practices](#best-practices)
- [Compliance](#compliance)

## Security Overview

Slogger provides multiple layers of security for sensitive data:

- **Automatic masking** - Built-in sensitive field detection
- **Pattern matching** - Regex-based data redaction
- **Configurable strategies** - Full or partial masking
- **Multiple formatters** - Different security per handler

## Data Masking

The masking formatter wraps other formatters to redact sensitive data.

### Basic Usage

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
    name: 'secure-logs',
    type: 'FileHandler',
    level: SyslogSeverities.INFO,
    directory: './logs',
    filenameTemplate: 'app.log',
    formatter: maskingFormatter({
      strategy: MaskingStrategy.PARTIAL,
      sensitiveFields: ['password', 'apiKey', 'token'],
      baseFormatter: jsonFormatter,
    }),
  }],
});

logger.info('User login', {
  username: 'john_doe',
  password: 'secret123', // Will be masked
  apiKey: 'sk-1234567890', // Will be masked
});

// Output: {"username":"john_doe","password":"***","apiKey":"***"}
```

### Masking Strategies

#### FULL Strategy

Completely redacts sensitive values:

```typescript
import { maskingFormatter, MaskingStrategy } from '@tundralibs/slogger';

maskingFormatter({
  strategy: MaskingStrategy.FULL,
  sensitiveFields: ['password', 'token'],
});

// Input: { password: 'MySecret123' }
// Output: { password: '***' }
```

#### PARTIAL Strategy

Shows first and last characters:

```typescript
import { maskingFormatter, MaskingStrategy } from '@tundralibs/slogger';

maskingFormatter({
  strategy: MaskingStrategy.PARTIAL,
  sensitiveFields: ['email', 'phone'],
});

// Input: { email: 'user@example.com' }
// Output: { email: 'u***@example.com' }

// Input: { phone: '555-123-4567' }
// Output: { phone: '5***7' }
```

## Sensitive Field Detection

### Matching Semantics

Matching is **head-anchored** and **case-insensitive**: a configured
field name masks a context key only when the name sits at the **end
(head)** of the key. A term that appears at the _start_ or _middle_ of a
compound — as a qualifier, not the head — never matches. This one rule
is what lets `apiKey` mask while `sortKey` and `creditCardBrand` do not,
and it is the type of the key's _head noun_ that decides whether the
value is treated as a secret (`authToken` **is** a token; `tokenBucket`
**is** a bucket).

A key is masked when a configured name matches it in any of these
head-anchored ways:

1. **Whole key** — the key equals the name (`password` masks
   `password`/`PASSWORD`). Applies to every configured name.
2. **Component suffix** — split both the key and the name into word
   components on camelCase humps and `_` / `-` / `.` / whitespace; the
   name matches when its components are the **trailing** components of
   the key. So `authToken` masks `session_auth_token`/`x-auth-token`,
   and `apiKey` masks `userApiKey`/`awsApiKey`/`x-api-key` — but neither
   masks `tokenBucket` or `sortKey`, whose heads are `bucket`/`key`.
3. **Concatenation suffix** — for names of **4 or more characters**,
   with all separators stripped, the name is a literal suffix of the
   stripped key **that begins at a word boundary of the key**. This
   catches run-together spellings that have no hump to split on —
   `authToken` masks `authtoken`/`AUTHTOKEN`, `password` masks
   `dbpassword` — the forms produced by lowercasing HTTP header names or
   a database folding unquoted identifiers. The word-boundary condition
   keeps a compound term from latching onto the tail of an unrelated
   word: `androidToken` and `validToken` both strip to strings ending in
   `idtoken`, but that `id` is mid-word (the tail of `android`/`valid`),
   so neither is masked as `idToken`.

Because all three tiers anchor to the head, a sensitive term used only
as a **qualifier** is left untouched and its scalar type is preserved (a
number stays a number, a boolean stays a boolean — no silent
coercion). None of the following are masked by the defaults:

| Not masked (qualifier position / generic head / unrelated word)                                                                                                       | Related term |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| `creditCardBrand`, `creditCardLast4`                                                                                                                                  | `creditCard` |
| `tokenBucket`, `nextTokenCount`, `tokenizer`, `pageToken`, `nextPageToken`, `nextToken`, `continuationToken`, `resetToken`, `csrfToken`, `androidToken`, `validToken` | `token`      |
| `passwordHash`, `passwordLength`, `passwordless`                                                                                                                      | `password`   |
| `secretary`                                                                                                                                                           | `secret`     |
| `sortKey`, `cacheKey`, `partitionKey`, `rowKey`, `primaryKey`, `keyMetrics`, `keyboard`, `monkey`                                                                     | `key`        |
| `authUrl`, `authMethod`, `author`                                                                                                                                     | `auth`       |
| `isPrivate`, `privateIp`, `privateer`                                                                                                                                 | `private`    |
| `spinner`, `pinboard`                                                                                                                                                 | `pin`        |

Two distinct reasons a key stays visible appear above: a term used as a
**qualifier** (not the head) — `tokenBucket`, `nextTokenCount` — and a
term that **is** the head but is one of the **whole-key-only generic
words** (`key`, `token`, `auth`, `private`, `pin`) — `sortKey`,
`pageToken`, `nextPageToken`, `continuationToken`, `csrfToken`,
`resetToken`. The latter are ubiquitous pagination cursors and
anti-forgery / reset tokens; masking them would break downstream jobs
that resume from a logged cursor, so `token` (like `key`) never
head-matches on its own. Their scalar type is preserved, and only the
**enumerated** `*Token`/`*Key` secrets (below) are masked.

**The bare generic words `key`, `token`, `auth`, `private` and `pin` are
further restricted to whole-key matching only** (tiers 2 and 3 skip
them). They are the head of far too many benign compounds (`sortKey`,
`cacheKey`, `pageToken`, `nextPageToken`, `continuationToken`, `authUrl`,
`isPrivate`) to head-match safely. A real secret compound that ends in
one of these generic heads is therefore **not** caught by the generic
word alone — it is caught only when the **specific compound is itself a
configured field**. The defaults enumerate the common crypto-key and
token compounds:

- `*Key`: `apiKey`, `secretKey`, `privateKey`, `encryptionKey`,
  `accessKey`, `sessionKey`, `signingKey`, `masterKey`, `sharedKey`,
  `hmacKey`
- `*Token`: `authToken`, `accessToken`, `refreshToken`, `sessionToken`,
  `apiToken`, `bearerToken`, `idToken`

so `userApiKey`, `awsAccessKey`, `rotatedSigningKey`, `x-auth-token`,
`session_auth_token`, `awsAccessToken`, etc. are caught by
component-suffix matching (and their run-together spellings — `authtoken`
— by concatenation-suffix matching). A `*Key`/`*Token` whose qualifier
is **not** one of these (e.g. `symmetricKey`, `deployKey`, `webhookKey`,
`webhookToken`, `pageToken`, `csrfToken`) is intentionally left visible —
add it to `sensitiveFields` if you need it masked.

#### Limitations (by design)

Head-anchoring is a deliberate trade-off — it makes masking predictable
and non-coercive, at the cost of two cases you must opt into explicitly:

- **Qualifier-position secrets are not masked.** A field whose _head_
  names a container rather than the secret is left visible even when its
  value is arguably sensitive: `passwordHash` (head `hash`),
  `passwordConfirm` (head `confirm`), `tokenExpiry` (head `expiry`).
  Prefer head-first names (`confirmPassword`, not `passwordConfirm`), or
  add the exact key to `sensitiveFields`. The alternative — matching a
  term in any position — is what previously over-masked benign metadata
  like `passwordLength: 12` and coerced its type, so it is not the
  default.
- **Run-together words only match as a real suffix.** `secretary`
  (starts with `secret`) and `tokenizer` (starts with `token`) are
  correctly left alone; only a true tail like `authtoken` is masked.

### Copy Semantics (never lose a record)

The masking formatter copies the log record with a mask-aware walk
instead of `structuredClone`, so a context containing functions,
symbols, or class instances can never crash the formatter (and
therefore never silently drop a record). Plain objects, arrays, and
`Date`s are copied; class instances are copied as plain records of
their own enumerable properties (nested sensitive keys still get
masked); functions and symbols pass through by reference (JSON-based
base formatters omit them); cyclic references are replaced with the
string `'[Circular]'`. The original log object is never mutated.

### Default Sensitive Fields

Slogger automatically masks these common fields:

```typescript
const defaultSensitiveFields = [
  'password',
  'passwd',
  'passphrase',
  'secret',
  'clientSecret',
  'client_secret',
  'credential',
  'credentials',
  'token', // whole-key only
  'jwt',
  'authToken',
  'auth_token',
  'accessToken',
  'access_token',
  'refreshToken',
  'refresh_token',
  'sessionToken',
  'session_token',
  'bearerToken',
  'bearer_token',
  'idToken',
  'id_token',
  'apiKey',
  'api_key',
  'apiToken',
  'api_token',
  'auth', // whole-key only
  'authorization',
  'key', // whole-key only
  'secretKey',
  'privateKey',
  'private_key',
  'encryptionKey',
  'encryption_key',
  'accessKey',
  'sessionKey',
  'signingKey',
  'masterKey',
  'sharedKey',
  'hmacKey',
  'private', // whole-key only
  'pin', // whole-key only
  'otp',
  'cvv',
  'ssn',
  'creditCard',
  'credit_card',
  'cardNumber',
  'card_number',
];
```

### Custom Sensitive Fields

Add application-specific sensitive fields:

```typescript
import { maskingFormatter } from '@tundralibs/slogger';

maskingFormatter({
  sensitiveFields: [
    // Default fields (included automatically)
    'password',
    'token',

    // Custom application fields
    'internalId',
    'customerKey',
    'sessionToken',
    'privateKey',
    'symmetricKey',
  ],
});
```

### Nested Field Masking

Masking works recursively on nested objects:

```typescript
import type { Slogger } from '@tundralibs/slogger';

declare const logger: Slogger;

logger.info('User profile', {
  user: {
    id: '123',
    name: 'John Doe',
    credentials: {
      password: 'secret', // Masked
      apiKey: 'key123', // Masked
    },
  },
  metadata: {
    token: 'bearer-token', // Masked
  },
});

// Output: All nested sensitive fields are masked
```

## Pattern-Based Masking

Use regex patterns to mask specific data formats.

### Email Addresses

```typescript
import {
  jsonFormatter,
  maskingFormatter,
  type Slogger,
} from '@tundralibs/slogger';

declare const logger: Slogger;

maskingFormatter({
  sensitivePatterns: [
    /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
  ],
  baseFormatter: jsonFormatter,
});

logger.info('Contact support at support@example.com');
// Output: Contact support at s***@example.com
```

### Credit Card Numbers

```typescript
import { maskingFormatter, type Slogger } from '@tundralibs/slogger';

declare const logger: Slogger;

maskingFormatter({
  sensitivePatterns: [
    /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g,
  ],
});

logger.info('Payment', { card: '4532-1234-5678-9010' });
// Output: { card: '4***0' }
```

### Phone Numbers (US)

```typescript
import { maskingFormatter, type Slogger } from '@tundralibs/slogger';

declare const logger: Slogger;

maskingFormatter({
  sensitivePatterns: [
    /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g,
  ],
});

logger.info('Call 555-123-4567 for help');
// Output: Call 5***7 for help
```

### Social Security Numbers (US)

```typescript
import { maskingFormatter, type Slogger } from '@tundralibs/slogger';

declare const logger: Slogger;

maskingFormatter({
  sensitivePatterns: [
    /\b\d{3}-\d{2}-\d{4}\b/g,
  ],
});

logger.info('SSN: 123-45-6789');
// Output: SSN: ***
```

### IP Addresses

```typescript
import { maskingFormatter, type Slogger } from '@tundralibs/slogger';

declare const logger: Slogger;

maskingFormatter({
  sensitivePatterns: [
    /\b(?:\d{1,3}\.){3}\d{1,3}\b/g, // IPv4
  ],
});

logger.info('Connection from 192.168.1.100');
// Output: Connection from 1***0
```

### API Keys

```typescript
import { maskingFormatter } from '@tundralibs/slogger';

maskingFormatter({
  sensitivePatterns: [
    /\bsk-[a-zA-Z0-9]{32,}\b/g, // Stripe-style
    /\bgh[ps]_[A-Za-z0-9_]{36}\b/g, // GitHub
    /\bAKIA[0-9A-Z]{16}\b/g, // AWS
  ],
});
```

## Best Practices

### 1. Always Mask Passwords

```typescript ignore
// ❌ Never log passwords unmasked
logger.error('Login failed', { username, password });

// ✅ Use masking formatter
const logger = new Slogger({
  appName: 'App',
  level: SyslogSeverities.INFO,
  handlers: [{
    name: 'secure',
    type: 'FileHandler',
    level: SyslogSeverities.INFO,
    formatter: maskingFormatter({
      sensitiveFields: ['password'],
      baseFormatter: jsonFormatter,
    }),
  }],
});
```

### 2. Separate Security Levels

Different masking per environment:

```typescript
import {
  jsonFormatter,
  maskingFormatter,
  MaskingStrategy,
  Slogger,
  standardFormat,
  SyslogSeverities,
} from '@tundralibs/slogger';

const isDev = Deno.env.get('ENV') === 'development';

const logger = new Slogger({
  appName: 'App',
  level: SyslogSeverities.INFO,
  handlers: [
    {
      name: 'console',
      type: 'ConsoleHandler',
      level: SyslogSeverities.INFO,
      formatter: isDev
        ? 'detailed' // No masking in dev
        : maskingFormatter({ // Mask in production
          strategy: MaskingStrategy.PARTIAL,
          sensitiveFields: ['password', 'token'],
          baseFormatter: standardFormat,
        }),
    },
    {
      name: 'file',
      type: 'FileHandler',
      level: SyslogSeverities.INFO,
      directory: './logs',
      filenameTemplate: 'app.log',
      formatter: maskingFormatter({ // Always mask files
        strategy: MaskingStrategy.FULL,
        sensitiveFields: ['password', 'token', 'apiKey'],
        baseFormatter: jsonFormatter,
      }),
    },
  ],
});
```

### 3. Mask External API Keys

```typescript
import { maskingFormatter } from '@tundralibs/slogger';

maskingFormatter({
  sensitiveFields: [
    'apiKey',
    'stripeKey',
    'twilioToken',
    'sendgridKey',
    'awsAccessKey',
    'awsSecretKey',
  ],
  sensitivePatterns: [
    /\bsk_live_[a-zA-Z0-9]{32}\b/g, // Stripe live keys
    /\brk_live_[a-zA-Z0-9]{32}\b/g, // Stripe restricted keys
  ],
});
```

### 4. Mask PII (Personally Identifiable Information)

```typescript
import { maskingFormatter } from '@tundralibs/slogger';

maskingFormatter({
  sensitiveFields: [
    'email',
    'phone',
    'ssn',
    'socialSecurity',
    'address',
    'dateOfBirth',
    'passport',
    'driverLicense',
  ],
  sensitivePatterns: [
    /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, // Email
    /\b\d{3}-\d{2}-\d{4}\b/g, // SSN
    /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, // Phone
  ],
});
```

### 5. Sanitize User Input

```typescript ignore
// ❌ Don't log raw user input
logger.info('User submitted', {
  rawInput: request.body, // May contain sensitive data
});

// ✅ Log sanitized input with masking
logger.info('User submitted', {
  fields: Object.keys(request.body),
  count: Object.keys(request.body).length,
});

// Or use masking as a safety net
const logger = new Slogger({
  handlers: [{
    formatter: maskingFormatter({
      sensitivePatterns: [
        // Pattern to match common injection attempts
        /(\b(SELECT|INSERT|UPDATE|DELETE|DROP)\b)/gi,
      ],
    }),
  }],
});
```

### 6. Separate Sensitive and Non-Sensitive Logs

```typescript
import {
  jsonFormatter,
  maskingFormatter,
  MaskingStrategy,
  Slogger,
  SyslogSeverities,
} from '@tundralibs/slogger';

declare const userId: string;
declare const action: string;
declare const sensitiveAction: string;

const logger = new Slogger({
  appName: 'App',
  level: SyslogSeverities.INFO,
  handlers: [
    {
      name: 'public-logs',
      type: 'FileHandler',
      level: SyslogSeverities.INFO,
      directory: './logs',
      filenameTemplate: 'public.log',
      formatter: maskingFormatter({
        strategy: MaskingStrategy.FULL,
        baseFormatter: jsonFormatter,
      }),
    },
    {
      name: 'audit-logs',
      type: 'FileHandler',
      level: SyslogSeverities.WARNING,
      directory: './secure-logs',
      filenameTemplate: 'audit.log',
      formatter: 'json', // No masking for audit
    },
  ],
});

// Use appropriate handler based on sensitivity
logger.info('Public event', { userId, action });
logger.warning('Audit event', { userId, sensitiveAction });
```

### 7. Review Logs Regularly

Implement log review processes:

```typescript ignore
// JSON logs are easier to analyze programmatically
{
  name: 'reviewable',
  type: 'FileHandler',
  level: SyslogSeverities.INFO,
  formatter: 'json',
}
```

Use tools to scan for accidentally logged sensitive data:

```bash
# Search for potential leaked secrets in logs
grep -E "(password|secret|api_key)" logs/*.log

# Scan for email patterns
grep -E "[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}" logs/*.log
```

## Compliance

### GDPR Compliance

For GDPR compliance, mask all PII:

```typescript
import {
  jsonFormatter,
  maskingFormatter,
  MaskingStrategy,
  Slogger,
  SyslogSeverities,
} from '@tundralibs/slogger';

const gdprLogger = new Slogger({
  appName: 'GDPR-Compliant-App',
  level: SyslogSeverities.INFO,
  handlers: [{
    name: 'gdpr-logs',
    type: 'FileHandler',
    level: SyslogSeverities.INFO,
    directory: './logs',
    filenameTemplate: 'app.log',
    formatter: maskingFormatter({
      strategy: MaskingStrategy.FULL,
      sensitiveFields: [
        // Personal data
        'email',
        'phone',
        'name',
        'firstName',
        'lastName',
        'address',
        'city',
        'postalCode',
        'country',
        'ip',
        'ipAddress',

        // Sensitive personal data
        'ssn',
        'passport',
        'nationalId',
        'dateOfBirth',
        'age',

        // Financial data
        'creditCard',
        'bankAccount',
        'iban',

        // Authentication
        'password',
        'token',
        'apiKey',
      ],
      sensitivePatterns: [
        /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
        /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
      ],
      baseFormatter: jsonFormatter,
    }),
  }],
});
```

### PCI DSS Compliance

For payment card data:

```typescript
import {
  jsonFormatter,
  maskingFormatter,
  MaskingStrategy,
  Slogger,
  SyslogSeverities,
} from '@tundralibs/slogger';

const pciLogger = new Slogger({
  appName: 'PCI-Compliant-App',
  level: SyslogSeverities.INFO,
  handlers: [{
    name: 'pci-logs',
    type: 'FileHandler',
    level: SyslogSeverities.INFO,
    formatter: maskingFormatter({
      strategy: MaskingStrategy.FULL,
      sensitiveFields: [
        'creditCard',
        'cardNumber',
        'cvv',
        'cvv2',
        'cvc',
        'expiryDate',
        'cardholderName',
      ],
      sensitivePatterns: [
        // Credit card numbers
        /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g,
        // CVV
        /\b\d{3,4}\b/g,
      ],
      baseFormatter: jsonFormatter,
    }),
  }],
});

// ❌ Never log full card data
pciLogger.info('Payment processed', {
  cardNumber: '4532-1234-5678-9010', // Masked
  amount: 99.99,
});

// ✅ Log only last 4 digits manually
pciLogger.info('Payment processed', {
  cardLast4: '9010', // Safe to log
  amount: 99.99,
});
```

### HIPAA Compliance

For healthcare data:

```typescript
import {
  jsonFormatter,
  maskingFormatter,
  MaskingStrategy,
  Slogger,
  SyslogSeverities,
} from '@tundralibs/slogger';

const hipaaLogger = new Slogger({
  appName: 'HIPAA-Compliant-App',
  level: SyslogSeverities.INFO,
  handlers: [{
    name: 'hipaa-logs',
    type: 'FileHandler',
    level: SyslogSeverities.INFO,
    directory: '/var/log/secure',
    filenameTemplate: 'app.log',
    formatter: maskingFormatter({
      strategy: MaskingStrategy.FULL,
      sensitiveFields: [
        // PHI (Protected Health Information)
        'patientName',
        'patientId',
        'medicalRecordNumber',
        'ssn',
        'dateOfBirth',
        'address',
        'email',
        'phone',
        'diagnosis',
        'medication',
        'labResults',
      ],
      baseFormatter: jsonFormatter,
    }),
  }],
});
```

## Production Security Checklist

- [ ] Enable masking formatter on all handlers
- [ ] Configure sensitive fields for your domain
- [ ] Add custom patterns for specific data formats
- [ ] Use FULL masking for production file logs
- [ ] Use PARTIAL masking for development console
- [ ] Separate audit logs from application logs
- [ ] Review logs regularly for leaks
- [ ] Restrict log file permissions (chmod 600)
- [ ] Encrypt logs at rest
- [ ] Use TLS for HTTP handler endpoints
- [ ] Implement log retention policies
- [ ] Document what data is logged

## Related Documentation

- [Formatters](../formatters/Slogger-Formatters.md) - Masking formatter details
- [Configuration](Slogger-Configuration.md) - Configuration guide
- [Examples](Slogger-Examples.md) - Usage examples

---

[← Back to Slogger](../README.md)
