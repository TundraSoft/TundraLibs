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
- [Logfmt Formatter](#logfmt-formatter)
- [RFC 5424 Formatter](#rfc-5424-formatter)
- [OpenTelemetry Formatter](#opentelemetry-formatter)
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

| Formatter  | Output Format                                         | Use Case                         | Bun | Deno | Node.js |
| ---------- | ----------------------------------------------------- | -------------------------------- | --- | ---- | ------- |
| standard   | `[isoDate] [LEVEL] message`                           | General purpose                  | ✅  | ✅   | ✅      |
| detailed   | `isoDate [LEVEL] [AppName] [hostname] message`        | Development                      | ✅  | ✅   | ✅      |
| compact    | `LEVEL [HH:mm:ss] message` (UTC time)                 | Minimal output                   | ✅  | ✅   | ✅      |
| minimalist | `message`                                             | Ultra-minimal                    | ✅  | ✅   | ✅      |
| keyValue   | `level=LEVEL app=AppName message="message" key=value` | Log parsers                      | ✅  | ✅   | ✅      |
| json       | Structured JSON object                                | Machine processing               | ✅  | ✅   | ✅      |
| prettyJson | Indented JSON (2-space)                               | Console / interactive debugging  | ✅  | ✅   | ✅      |
| logfmt     | `key=value key2="quoted"` (logfmt)                    | Heroku Logplex, Splunk, Promtail | ✅  | ✅   | ✅      |
| otelLog    | OpenTelemetry log-record JSON                         | OTel collectors                  | ✅  | ✅   | ✅      |
| masking    | Wraps other formatters with data redaction            | Security                         | ✅  | ✅   | ✅      |

`rfc5424Formatter` (RFC 5424 syslog wire format) is not registered by
name — pass it directly as a `formatter` function. See
[RFC 5424 Formatter](#rfc-5424-formatter).

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
  "date": "2024-01-15T10:30:00.000Z",  // Date, serialized to ISO by the replacer
  "isoDate": "2024-01-15T10:30:00.000Z", // ISO 8601 timestamp (same instant as `date`)
  "timestamp": 1705312200000           // Unix timestamp (ms)
}
```

> `date` and `isoDate` are the same instant in two shapes — `date` is
> the `SlogObject`'s `Date` field (JSON has no Date type, so the
> replacer serializes it to an ISO string, same as `isoDate`);
> `isoDate` is already a string on the record. Real field order also
> puts `levelName` before `level` and `date`/`isoDate` after
> `context`/`message`, not in declaration order — object key order in
> the actual JSON follows insertion order in `Slogger.log()`, not the
> `SlogObject` type's declaration order.
>
> **A raw `Error` object in `context` serializes to `{}`.**
> `Error.prototype.message`/`.stack` are non-enumerable, and
> `JSON.stringify` (what this formatter, `logfmtFormatter`, and
> `otelLogFormatter` all use) only serializes own enumerable
> properties. Extract the fields you want —
> `{ error: error.message, stack: error.stack }` — instead of passing
> `{ error }`.

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

## Logfmt Formatter

Renders a record as `key=value key2="quoted value" key3=42` — the
structured-but-human-readable line format used widely in the Go
ecosystem (Heroku Logplex, Splunk Observability, Datadog log parsing,
Promtail/Loki ingestion). Nested context is flattened to dot-path keys
(`{user:{id:1}}` → `user.id=1`); arrays render as JSON literals.

### Usage

```typescript
import {
  logfmtFormatter,
  Slogger,
  SyslogSeverities,
} from '@tundralibs/slogger';

const logger = new Slogger({
  appName: 'api',
  level: SyslogSeverities.INFO,
  handlers: [{
    name: 'console',
    type: 'ConsoleHandler',
    level: SyslogSeverities.INFO,
    formatter: logfmtFormatter(), // or the registered name: 'logfmt'
  }],
});

logger.info('user logged in', { userId: 42, ip: '10.0.0.1' });
// Output: ts=<isoDate> level=info app=api host=<hostname> msg="user logged in" userId=42 ip=10.0.0.1
```

### Options

```typescript
interface LogfmtOptions {
  envelopeOrder?: ReadonlyArray<
    'ts' | 'level' | 'app' | 'host' | 'msg' | 'id' | 'context'
  >; // default: ['ts','level','app','host','msg','context']
  useNumericLevel?: boolean; // level=6 instead of level=info (default: false)
  useEpochTimestamp?: boolean; // ts=<ms> instead of an ISO string (default: false)
}
```

> **Values are quoted/escaped against logfmt injection.** A context
> key or value containing a space, `"`, `=`, or a control byte is
> quoted and escaped — otherwise an attacker-controlled value could
> split the line or inject extra `k=v` pairs into what a downstream
> parser reads as separate fields.

## RFC 5424 Formatter

Produces one RFC 5424 syslog frame per record:
`<PRI>1 TIMESTAMP HOSTNAME APP-NAME PROCID MSGID STRUCTURED-DATA MSG`
(`PRI = facility * 8 + severity`; absent fields are the NILVALUE `-`).
This is what `SyslogHandler` uses internally — see
[Handlers → Syslog Handler](../handlers/Slogger-Handlers.md#syslog-handler)
— but it's exported standalone so any handler (file, HTTP, a raw
`TCPHandler`, …) can emit RFC 5424-framed lines.

### Usage

```typescript
import {
  rfc5424Formatter,
  Slogger,
  SyslogSeverities,
} from '@tundralibs/slogger';
// Needs a separate install: deno add @tundralibs/utils
import { SyslogFacilities } from '@tundralibs/utils';

const logger = new Slogger({
  appName: 'my-app',
  level: SyslogSeverities.INFO,
  handlers: [{
    name: 'console',
    type: 'ConsoleHandler',
    level: SyslogSeverities.INFO,
    formatter: rfc5424Formatter({
      facility: SyslogFacilities.LOCAL0,
      messageId: 'API',
    }),
  }],
});

logger.info('user logged in');
// Output: <134>1 <isoDate> <hostname> my-app <pid> API - user logged in
```

### Options

- `facility` (`SyslogFacilities` | number) - RFC 5424 facility code
  0-23 (default: `USER` = 1).
- `appName`, `hostname` - override the `SlogObject`'s own fields; RFC
  5424 caps APP-NAME at 48 and HOSTNAME at 255 printable-ASCII octets
  (truncated, not rejected, if longer).
- `procId` (string | number) - defaults to the current process PID
  (or `-` where unavailable); capped at 128 octets.
- `messageId` (string) - names the kind of message (e.g. `'AUDIT'`);
  capped at 32 octets; NILVALUE `-` when omitted.
- `appendContext` (`(context) => string`) - MSG is `log.message` alone
  by default and `context` is dropped; pass a function to render
  context into the message tail (the STRUCTURED-DATA slot itself is
  intentionally left as NILVALUE — populating it needs a registered
  SD-ID enterprise number, out of scope here).

> **MSG is sanitised against embedded control bytes, including `\n`.**
> Without this, a `'\n<134>1 ...'` substring in an attacker-controlled
> message could forge a second syslog record once framed with a
> trailing newline (the UNIX-socket default). Sanitisation is applied
> unconditionally, so it protects every framing mode, not just the
> vulnerable one.

## OpenTelemetry Formatter

Renders a record as an OpenTelemetry log-record JSON line —
`timeUnixNano`/`severityNumber`/`severityText`/`body`/`attributes`/`resource`
— ready for HTTP push to an OTel collector's `/v1/logs`, or any
aggregator that consumes OTel logs as NDJSON.

### Usage

```typescript
import {
  otelLogFormatter,
  Slogger,
  SyslogSeverities,
} from '@tundralibs/slogger';

const logger = new Slogger({
  appName: 'orders',
  level: SyslogSeverities.INFO,
  handlers: [{
    name: 'otel',
    type: 'ConsoleHandler', // an HTTPHandler to a collector in production
    level: SyslogSeverities.INFO,
    formatter: otelLogFormatter({
      resource: { 'deployment.environment': 'prod' },
    }),
  }],
});

logger.info('user signed in', { userId: 'u_42', plan: 'pro' });
// Output: {"timeUnixNano":"<ms>000000","severityNumber":9,"severityText":"INFO",
//          "body":"user signed in","attributes":{"userId":"u_42","plan":"pro"},
//          "resource":{"service.name":"orders","host.name":"<hostname>","deployment.environment":"prod"}}
```

### Severity Mapping

| Syslog        | SeverityNumber | severityText |
| ------------- | -------------- | ------------ |
| DEBUG (7)     | 5              | DEBUG        |
| INFO (6)      | 9              | INFO         |
| NOTICE (5)    | 10             | INFO2        |
| WARNING (4)   | 13             | WARN         |
| ERROR (3)     | 17             | ERROR        |
| CRITICAL (2)  | 18             | ERROR2       |
| ALERT (1)     | 21             | FATAL        |
| EMERGENCY (0) | 22             | FATAL2       |

### Options

- `resource` (`Record<string, unknown>`) - extra `resource` attributes
  merged with the auto-derived `service.name` (from `appName`) and
  `host.name` (from `hostname`); caller-supplied keys win on collision.
- `traceFields` (`{traceId?, spanId?, traceFlags?}` | `null`) -
  override which `context` keys get hoisted to top-level `traceId` /
  `spanId` / `traceFlags` fields (default:
  `{traceId:'traceId', spanId:'spanId', traceFlags:'traceFlags'}`);
  pass `null` to disable hoisting.

For the full request/trace correlation story — wiring `contextProvider`

- `ambient` + `tracer` so `traceId`/`spanId` land in `context` in the
  first place — see
  [Slogger-Correlation](../docs/Slogger-Correlation.md).

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
// Output: [timestamp] [INFO] Contact u**************m for support
//
// PARTIAL masks the WHOLE matched span (first + last character of the
// entire "user@example.com" match, not just the local part before
// `@`) — the strategy has no notion of email structure. standardFormat
// has no appName in its template, so "App:" never appears either.
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
  date: Date; // The record's instant, as a Date
  timestamp: number; // Unix timestamp (ms) — same instant as `date`
  isoDate: string; // ISO 8601 timestamp — same instant as `date`
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
