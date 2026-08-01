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
class MyClass extends Options<O, E> {
  constructor(config: EventOptionKeys<O, E>) {
    super();
    this._setOptions(config, defaults);
  }
}
```

### Methods

- `_setOptions(options, defaults)`: Set options with defaults
- `getOption<K>(key)`: Get option value
- `hasOption(key)`: Check if option exists
- `getOptions()`: Get all current options as an object
- All Events methods (`on`, `emit`, etc.)

## Usage Examples

### Basic Usage

```typescript
import { EventOptionKeys, Options } from '@tundralibs/utils';

interface DatabaseOptions {
  host: string;
  port: number;
  ssl?: boolean;
}

interface DatabaseEvents {
  connect: () => void;
  error: (error: Error) => void;
  query: (sql: string) => void;
}

class Database extends Options<DatabaseOptions, DatabaseEvents> {
  constructor(config: EventOptionKeys<DatabaseOptions, DatabaseEvents>) {
    super();

    // Set options with defaults
    this._setOptions(config, {
      port: 5432,
      ssl: false,
    });
  }

  async connect() {
    const host = this.getOption('host');
    const port = this.getOption('port');
    const ssl = this.getOption('ssl');

    // Connection logic...
    this.emit('connect');
  }

  async query(sql: string) {
    this.emit('query', sql);
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
interface LoggerOptions {
  level: string;
  output: string;
}

interface LoggerEvents {
  log: (message: string) => void;
}

class Logger extends Options<LoggerOptions, LoggerEvents> {
  constructor(config: EventOptionKeys<LoggerOptions, LoggerEvents>) {
    super();
    this._setOptions(config, {
      level: 'info',
      output: 'console',
    });
  }

  log(message: string) {
    this.emit('log', message);
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
interface ServerOptions {
  port: number;
  host: string;
  timeout?: number;
}

interface ServerEvents {
  start: () => void;
  stop: () => void;
  request: (req: Request) => void;
  error: (error: Error) => void;
}

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
    const port = this.getOption('port');
    const host = this.getOption('host');

    // Start server...
    this.emit('start');
  }

  handleRequest(req: Request) {
    this.emit('request', req);
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
interface PluginOptions {
  name: string;
  enabled?: boolean;
}

interface PluginEvents {
  load: () => void;
  unload: () => void;
  execute: (data: any) => void;
}

abstract class Plugin extends Options<PluginOptions, PluginEvents> {
  constructor(config: EventOptionKeys<PluginOptions, PluginEvents>) {
    super();
    this._setOptions(config, { enabled: true });
  }

  load() {
    if (this.getOption('enabled')) {
      this.emit('load');
      this.onLoad();
    }
  }

  abstract onLoad(): void;
  abstract execute(data: any): void;
}

class MyPlugin extends Plugin {
  onLoad() {
    console.log(`${this.getOption('name')} loaded`);
  }

  execute(data: any) {
    this.emit('execute', data);
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
class Builder extends Options<BuilderOptions, BuilderEvents> {
  setHost(host: string) {
    this.getOption('host'); // Current value
    return this; // Chainable
  }
}
```

### Configuration Validation

```typescript
constructor(config: EventOptionKeys<Options, Events>) {
  super();
  this._setOptions(config, defaults);
  
  // Validate
  if (this.getOption('port') < 1024) {
    throw new Error('Port must be >= 1024');
  }
}
```

## Related Utilities

- [Events](Utils-Events.md) - Event system (inherited)
- [privateObject](Utils-PrivateObject.md) - Private storage (used internally)
- [Config](Utils-Config.md) - Configuration loading

[← Back to Utils](../README.md)
