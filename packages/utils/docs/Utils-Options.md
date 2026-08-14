# Utils - Options

Abstract base class combining options management with event handling.

[← Back to Utils](../README.md)

## Overview

The Options class provides a powerful foundation for classes that need:

- **Options Management**: Type-safe configuration handling
- **Default Values**: Automatic default value application
- **Event System**: Built-in Events functionality
- **Event Registration**: Constructor-based event handler setup
- **Type Safety**: Full TypeScript generic support

## Installation

```bash
deno add @tundralibs/utils
```

## API Reference

### Constructor Pattern

```typescript
import { type EventOptionKeys, Options } from '@tundralibs/utils';

type O = { host: string; port: number };
type E = { connect: () => void };

const defaults: Partial<O> = { port: 5432 };

class MyClass extends Options<O, E> {
  constructor(config: EventOptionKeys<O, E>) {
    super();
    this._setOptions(config, defaults);
  }
}
```

**`O` and `E` must be `type` aliases, not `interface`s.** Both are
constrained to `Record<string, unknown>`, and TypeScript refuses an
interface there — `Index signature for type 'string' is missing in type
'MyOptions'`. It is not a bug in this class: interfaces are open, since
declaration merging lets another file add members later, so TypeScript
will not grant them the implicit index signature that proves the shape
is a closed, string-keyed bag. A `type` alias with identical members is
closed, so it qualifies.

If the shape comes from generated code or a third-party package and you
cannot change it, intersect it:

```typescript
import { type EventOptionKeys, Options } from '@tundralibs/utils';

interface Generated {
  host: string;
  port: number;
}

type MyOptions = Generated & Record<string, unknown>;

class Client extends Options<MyOptions> {
  constructor(config: EventOptionKeys<MyOptions>) {
    super();
    this._setOptions(config, {});
  }
}
```

### Methods

- `_setOptions(options, defaults)`: Apply defaults, then options, with
  GROUP-AWARE merging: a partial plain-object group
  (`server: { port: 8080 }`) merges UNDER the group's defaults instead
  of replacing them; arrays and class instances replace wholesale; an
  explicitly-`undefined` value defers to an existing default (and still
  reaches `_processOption` when there is none, so required-option
  validation works)
- `_getOption<K>(key)`: Read one option (protected — option bags
  routinely carry credentials; expose values through purpose-built
  public getters)
- `hasOption(key)`: Check if option exists
- `_getOptions()`: Read a defensive copy of the whole bag (nested
  plain-object groups are copied too — mutating the result never
  writes into the store)
- All Events methods (`on`, `emit`, etc.)

## Usage Examples

### Basic Usage

```typescript
import { type EventOptionKeys, Options } from '@tundralibs/utils';

type DatabaseOptions = {
  host: string;
  port: number;
  ssl?: boolean;
};

type DatabaseEvents = {
  connect: () => void;
  error: (error: Error) => void;
  query: (sql: string) => void;
};

class Database extends Options<DatabaseOptions, DatabaseEvents> {
  constructor(config: EventOptionKeys<DatabaseOptions, DatabaseEvents>) {
    super();

    // Set options with defaults
    this._setOptions(config, {
      port: 5432,
      ssl: false,
    });
  }

  connect() {
    const host = this._getOption('host');
    const port = this._getOption('port');
    const ssl = this._getOption('ssl');
    console.log(`connecting to ${host}:${port} (ssl: ${ssl})`);

    // Connection logic...
    this._emit('connect');
  }

  query(sql: string) {
    this._emit('query', sql);
    // Query logic...
  }
}

// Usage
const db = new Database({
  host: 'localhost',
  _onconnect: () => console.log('Connected!'),
  _onerror: (err) => console.error('Error:', err),
  _onquery: (sql) => console.log('Query:', sql),
});
```

### With Multiple Event Handlers

```typescript
import { type EventOptionKeys, Options } from '@tundralibs/utils';

declare const writeToFile: (message: string) => void;
declare const sendToServer: (message: string) => void;

type LoggerOptions = {
  level: string;
  output: string;
};

type LoggerEvents = {
  log: (message: string) => void;
};

class Logger extends Options<LoggerOptions, LoggerEvents> {
  constructor(config: EventOptionKeys<LoggerOptions, LoggerEvents>) {
    super();
    this._setOptions(config, {
      level: 'info',
      output: 'console',
    });
  }

  log(message: string) {
    this._emit('log', message);
  }
}

const logger = new Logger({
  level: 'debug',
  _onlog: [
    (msg) => console.log(msg),
    (msg) => writeToFile(msg),
    (msg) => sendToServer(msg),
  ],
});
```

### HTTP Server Example

```typescript
import { type EventOptionKeys, Options } from '@tundralibs/utils';

type ServerOptions = {
  port: number;
  host: string;
  timeout?: number;
};

type ServerEvents = {
  start: () => void;
  stop: () => void;
  request: (req: Request) => void;
  error: (error: Error) => void;
};

class HttpServer extends Options<ServerOptions, ServerEvents> {
  constructor(config: EventOptionKeys<ServerOptions, ServerEvents>) {
    super();
    this._setOptions(config, {
      port: 3000,
      host: '0.0.0.0',
      timeout: 30000,
    });
  }

  start() {
    const port = this._getOption('port');
    const host = this._getOption('host');
    console.log(`listening on ${host}:${port}`);

    // Start server...
    this._emit('start');
  }

  handleRequest(req: Request) {
    this._emit('request', req);
  }
}

const server = new HttpServer({
  port: 8080,
  _onstart: () => console.log('Server started'),
  _onrequest: (req) => console.log('Request:', req.url),
  _onerror: (err) => console.error('Server error:', err),
});
```

### Plugin System

```typescript
import { type EventOptionKeys, Options } from '@tundralibs/utils';

type PluginOptions = {
  name: string;
  enabled?: boolean;
};

type PluginEvents = {
  load: () => void;
  unload: () => void;
  execute: (data: unknown) => void;
};

abstract class Plugin extends Options<PluginOptions, PluginEvents> {
  constructor(config: EventOptionKeys<PluginOptions, PluginEvents>) {
    super();
    this._setOptions(config, { enabled: true });
  }

  load() {
    if (this._getOption('enabled')) {
      this._emit('load');
      this.onLoad();
    }
  }

  abstract onLoad(): void;
  abstract execute(data: unknown): void;
}

class MyPlugin extends Plugin {
  onLoad() {
    console.log(`${this._getOption('name')} loaded`);
  }

  execute(data: unknown) {
    this._emit('execute', data);
    // Plugin logic...
  }
}
```

## Best Practices

1. **Defaults First**: Always provide sensible defaults
2. **Type Safety**: Define option and event interfaces
3. **Validation**: Validate options in constructor
4. **Event Naming**: Use `_on` prefix for event handlers in config

## Common Patterns

### Builder Pattern

```typescript
import { Options } from '@tundralibs/utils';

type BuilderOptions = { host: string };
type BuilderEvents = { built: () => void };

class Builder extends Options<BuilderOptions, BuilderEvents> {
  setHost(host: string) {
    this._getOption('host'); // Current value
    return this; // Chainable
  }
}
```

### Configuration Validation

```typescript
import { type EventOptionKeys, Options } from '@tundralibs/utils';

type ValidatedOptions = { port: number };
type ValidatedEvents = { start: () => void };

const defaults: Partial<ValidatedOptions> = { port: 8080 };

class ValidatedServer extends Options<ValidatedOptions, ValidatedEvents> {
  constructor(config: EventOptionKeys<ValidatedOptions, ValidatedEvents>) {
    super();
    this._setOptions(config, defaults);

    // Validate
    if (this._getOption('port') < 1024) {
      throw new Error('Port must be >= 1024');
    }
  }
}
```

## Related Utilities

- [Events](Utils-Events.md) - Event system (inherited)
- [privateObject](Utils-PrivateObject.md) - Private storage (used internally)
- [Config](Utils-Config.md) - Configuration loading

[← Back to Utils](../README.md)
