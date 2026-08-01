# Utils - syslog

RFC 3164 and RFC 5424 syslog message parser and generator.

[← Back to Utils](../README.md)

## Overview

The syslog utility provides comprehensive support for syslog message handling:

- **RFC 3164**: Legacy syslog format parsing
- **RFC 5424**: Modern syslog with structured data
- **Auto-Detection**: Automatic format identification
- **Name Resolution**: Facility and severity name lookup
- **Structured Data**: Full SD-ID and SD-PARAM support
- **Validation**: Built-in format checking

## Installation

```bash
deno add @tundralibs/utils
```

## API Reference

### Enums

#### SyslogSeverities

- `EMERGENCY = 0` - System unusable
- `ALERT = 1` - Immediate action required
- `CRITICAL = 2` - Critical conditions
- `ERROR = 3` - Error conditions
- `WARNING = 4` - Warning conditions
- `NOTICE = 5` - Normal but significant
- `INFO = 6` - Informational
- `DEBUG = 7` - Debug messages

#### SyslogFacilities

- `KERN = 0` - Kernel messages
- `USER = 1` - User-level messages
- `MAIL = 2` - Mail system
- `DAEMON = 3` - System daemons
- `AUTH = 4` - Security/authorization
- `SYSLOG = 5` - Syslog internal
- `LPR = 6` - Line printer subsystem
- `NEWS = 7` - Network news
- `UUCP = 8` - UUCP subsystem
- `CRON = 9` - Clock daemon
- `AUTHPRIV = 10` - Security/authorization (private)
- `FTP = 11` - FTP daemon
- `LOCAL0-LOCAL7 = 16-23` - Local use

### Functions

#### `parse(log: string): SyslogObject`

Parses a syslog message string. Auto-detects RFC 3164 and RFC 5424.

**Returns:** `SyslogObject` with parsed fields

#### `stringify(logObj: Omit<SyslogObject, 'facilityName' | 'severityName'>): string`

Generates an RFC 5424 syslog message string. There is no format
parameter — `stringify` always emits RFC 5424.

## Usage Examples

### Basic RFC 3164 Parsing

```typescript
import { parse } from '@tundralibs/utils';

const message = '<34>Oct 11 22:14:15 mymachine su: john changed user';
const parsed = parse(message);

console.log(parsed.facilityName); // 'AUTH'
console.log(parsed.severityName); // 'INFO'
console.log(parsed.hostname); // 'mymachine'
console.log(parsed.appName); // 'su'
console.log(parsed.message); // 'john changed user'
```

### RFC 5424 with Structured Data

```typescript
const message =
  '<165>1 2003-08-24T05:14:15.000003-07:00 192.0.2.1 myproc 8710 - [exampleSDID@32473 iut="3" eventSource="Application"] A message';

const parsed = parse(message);

console.log(parsed.timestamp); // Date object
console.log(parsed.hostname); // '192.0.2.1'
console.log(parsed.appName); // 'myproc'
console.log(parsed.processId); // 8710 (a number)
console.log(parsed.structuredData);
// {
//   'exampleSDID@32473': {
//     iut: '3',
//     eventSource: 'Application'
//   }
// }
```

### Severity and Facility Filtering

```typescript
import { parse, SyslogFacilities, SyslogSeverities } from '@tundralibs/utils';

const messages = [
  '<34>Oct 11 22:14:15 host1 app: info message',
  '<27>Oct 11 22:14:16 host2 app: error message',
  '<19>Oct 11 22:14:17 host3 app: critical message',
];

const errors = messages
  .map(parse)
  .filter((msg) => msg.severity <= SyslogSeverities.ERROR);

console.log(errors.length); // 2 (error and critical)
```

### Generate Syslog Message

```typescript
import {
  stringify,
  SyslogFacilities,
  SyslogSeverities,
} from '@tundralibs/utils';

const message = {
  facility: SyslogFacilities.USER,
  severity: SyslogSeverities.INFO,
  timestamp: new Date('2024-02-04T10:30:00.000Z'),
  hostname: 'myserver',
  appName: 'myapp',
  processId: 12345,
  message: 'Application started',
};

const syslogString = stringify(message);
console.log(syslogString);
// <14>1 2024-02-04T10:30:00.000Z myserver myapp 12345 - - Application started
```

### Log Aggregation

```typescript
class SyslogAggregator {
  private logs: SyslogObject[] = [];

  addLog(rawMessage: string) {
    const parsed = parse(rawMessage);
    this.logs.push(parsed);
  }

  getErrorLogs() {
    return this.logs.filter((log) => log.severity <= SyslogSeverities.ERROR);
  }

  getLogsByHost(hostname: string) {
    return this.logs.filter((log) => log.hostname === hostname);
  }

  getLogsByApp(appName: string) {
    return this.logs.filter((log) => log.appName === appName);
  }
}
```

### Security Event Monitoring

```typescript
import { parse, SyslogFacilities } from '@tundralibs/utils';

function monitorSecurityEvents(message: string) {
  const parsed = parse(message);

  if (
    parsed.facility === SyslogFacilities.AUTH ||
    parsed.facility === SyslogFacilities.AUTHPRIV
  ) {
    if (parsed.message.includes('failed')) {
      alertSecurityTeam(parsed);
    }
  }
}
```

### Structured Data Parsing

```typescript
const message =
  '<165>1 2024-02-04T10:30:00Z host app 123 - [origin@123 ip="192.168.1.1" user="admin"][meta@456 action="login" status="success"] User logged in';

const parsed = parse(message);

// Access structured data
const origin = parsed.structuredData?.['origin@123'];
console.log(origin?.ip); // "192.168.1.1"
console.log(origin?.user); // "admin"

const meta = parsed.structuredData?.['meta@456'];
console.log(meta?.action); // "login"
console.log(meta?.status); // "success"
```

### Log File Processing

```typescript
import { parse } from '@tundralibs/utils';

async function processLogFile(path: string) {
  const content = await Deno.readTextFile(path);
  const lines = content.split('\n');

  const stats = {
    total: 0,
    byFacility: new Map<string, number>(),
    bySeverity: new Map<string, number>(),
  };

  for (const line of lines) {
    if (!line.trim()) continue;

    try {
      const parsed = parse(line);
      stats.total++;

      const facilityCount = stats.byFacility.get(parsed.facilityName) || 0;
      stats.byFacility.set(parsed.facilityName, facilityCount + 1);

      const severityCount = stats.bySeverity.get(parsed.severityName) || 0;
      stats.bySeverity.set(parsed.severityName, severityCount + 1);
    } catch (error) {
      console.error('Failed to parse:', line);
    }
  }

  return stats;
}
```

## Best Practices

1. **Validate Input**: Always wrap parse() in try-catch
2. **Use Constants**: Use enum values instead of numbers
3. **Structured Data**: Leverage SD for rich context
4. **Timezone Aware**: Handle timestamp timezones properly

## Message Format

### RFC 3164 Format

```
<PRI>TIMESTAMP HOSTNAME APP[PID]: MESSAGE
```

### RFC 5424 Format

```
<PRI>VERSION TIMESTAMP HOSTNAME APP PROCID MSGID STRUCTURED-DATA MESSAGE
```

`STRUCTURED-DATA` is mandatory: it is either one or more `[SD-ELEMENT]`s or the
nil value `-`.

## RFC 5424 Compliance & Log-Injection Safety

- **Nil structured data (`-`)**: `stringify` always emits the `STRUCTURED-DATA`
  field — the nil value `-` when no structured data is present — so compliant
  receivers do not mistake the first message token for the SD field. On the
  parse side, a leading nil `-` SD marker is consumed and never leaks into
  `message`.
- **Brackets in the message**: Only structured data at the front of the
  SD/MESSAGE portion is parsed as SD. Bracketed text inside the free-text
  message (`[ERROR]`, `user [bob]`, array dumps) is preserved verbatim in
  `message` rather than being treated as (and stripped as) structured data.
- **Injection-safe generation**: `stringify` escapes SD parameter values per
  RFC 5424 §6.3.3 (`"`, `\`, `]`) and sanitizes SD-IDs, parameter names, and
  the header fields (hostname, appName, messageId) to their allowed character
  sets. Disallowed bytes (SP, CR/LF, other control bytes, DEL) are **replaced
  with `_`** rather than deleted, and a header field left empty by sanitization
  folds to the nil value `-`. Because no field can collapse to an empty token,
  attacker-controlled content cannot break out of a structured-data element,
  shift header-field parsing, or forge additional records on line-delimited
  transports.

## Priority Calculation

Priority (PRI) = (Facility × 8) + Severity

```typescript
const priority = (facility * 8) + severity;
// Example: (USER=1 * 8) + INFO=6 = 14
```

## Related Utilities

- [BaseError](Utils-BaseError.md) - Error handling
- [Events](Utils-Events.md) - Event-based log processing

[← Back to Utils](../README.md)
