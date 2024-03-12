# Syslog

Provides a simple utility class which can parse and standardize Syslog
formatted messages. It supports both RFC-5432 and RFC-3164 (parsing). It
can also convert syslog messages to a standard JSON structure or custom
string structure.

## Usage

```ts
import { parse, Syslog } from './syslog/mod.ts';

// To parse a syslog message use parse function
const log = parse(
  '<165>1 2022-01-01T00:00:00.000Z localhost myApp 123 12345 [ABC@1234 key="value"] Test message',
);
console.log(log.message); // Test message

// Create new log
const log2 = Syslog();
console.log(log2.version); // '1'
console.log(log2.dateTime); // The date value
log2.message = 'Hi there'; // Setting the message
```

### Functions

#### parse

#### stringify

#### Syslog

### Types

#### SyslogObject

## Notes

- RFC 3164 support is partial and there are some known issues:
  - [ ] Date value support is limited. Needs to be improved
