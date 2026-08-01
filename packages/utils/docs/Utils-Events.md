# Utils - Events

Type-safe event system with comprehensive async support.

[← Back to Utils](../README.md)

## Overview

The Events class provides a robust, type-safe event handling system:

- **Type Safety**: Full TypeScript generic support
- **Async Support**: Both sync and async event callbacks
- **Multiple Listeners**: Register multiple callbacks per event
- **One-Time Listeners**: Automatic cleanup after single use
- **Error Isolation**: Individual callback failures don't affect others
- **Method Chaining**: Fluent API design

## Installation

```bash
deno add @tundralibs/utils
```

## API Reference

### Constructor

```typescript
new Events<T>();
```

**Type Parameter `T`**: Object mapping event names to callback signatures

### Methods

- `on(event, callback)`: Register event listener
- `once(event, callback)`: Register one-time listener
- `off(event, callback)`: Remove event listener
- `emit(event, ...args)`: Trigger event (async)
- `emitSync(event, ...args)`: Trigger event (sync)

## Usage Examples

### Basic Event Handling

```typescript
import { Events } from '@tundralibs/utils';

interface MyEvents {
  userLogin: (user: User) => void;
  dataUpdate: (data: any[]) => void;
  error: (error: Error) => void;
}

const events = new Events<MyEvents>();

// Register listener
events.on('userLogin', (user) => {
  console.log(`Welcome ${user.name}!`);
});

// Emit event
events.emit('userLogin', currentUser);
```

### Async Event Handlers

```typescript
interface AppEvents {
  save: (data: Data) => Promise<void>;
  load: () => Promise<Data>;
}

const events = new Events<AppEvents>();

// Async handler
events.on('save', async (data) => {
  await database.save(data);
  console.log('Saved successfully');
});

// Emit and wait for all handlers
await events.emit('save', myData);
```

### One-Time Listeners

```typescript
// Runs only once, then auto-removes
events.once('ready', () => {
  console.log('App initialized');
  startServer();
});

events.emit('ready'); // Runs handler
events.emit('ready'); // Handler already removed, no effect
```

### Multiple Handlers

```typescript
events.on('click', () => console.log('Handler 1'));
events.on('click', () => console.log('Handler 2'));
events.on('click', () => console.log('Handler 3'));

events.emit('click');
// Output:
// Handler 1
// Handler 2
// Handler 3
```

### Removing Listeners

```typescript
const handler = (data: string) => console.log(data);

events.on('message', handler);
events.emit('message', 'Hello'); // Logs "Hello"

events.off('message', handler);
events.emit('message', 'World'); // No output
```

### Method Chaining

```typescript
events
  .on('start', startHandler)
  .on('stop', stopHandler)
  .on('error', errorHandler);
```

### Error Handling

```typescript
events.on('process', () => {
  throw new Error('Handler failed');
});

events.on('process', () => {
  console.log('This still runs!');
});

// Errors in individual handlers don't affect others
events.emit('process');
```

## Best Practices

1. **Type Your Events**: Always define event interfaces
2. **Use Once for Initialization**: One-time events for setup
3. **Handle Errors**: Wrap handlers in try-catch when needed
4. **Clean Up**: Call `off()` to prevent memory leaks

## Common Patterns

### Observer Pattern

```typescript
class DataStore extends Events<{ change: (data: any) => void }> {
  private data: any;

  setData(newData: any) {
    this.data = newData;
    this.emit('change', newData);
  }
}
```

### Lifecycle Events

```typescript
interface Lifecycle {
  init: () => Promise<void>;
  ready: () => void;
  shutdown: () => Promise<void>;
}

const app = new Events<Lifecycle>();

app.once('init', async () => {
  await loadConfig();
  app.emit('ready');
});
```

## Related Utilities

- [Options](Utils-Options.md) - Combines Events with options management
- [BaseError](Utils-BaseError.md) - Error handling with context

[← Back to Utils](../README.md)
