# Utils - Events

Type-safe event emitter with protected emission and per-listener
isolation.

[← Back to Utils](../README.md)

## Overview

The Events class provides a typed event surface for classes to expose:

- **Type Safety**: the generic parameter maps event names to callback
  signatures, checked at every `on`/`_emit` site
- **Protected Emission**: only the class that owns the events can fire
  them — holders of an instance subscribe via `on`/`once`/`off` but
  cannot forge lifecycle events
- **Per-Listener Isolation**: on the fire-and-forget paths, a listener
  that throws (or an async listener that rejects) is contained and
  reported — other listeners still run, and the emitter is unaffected
- **One-Time Listeners**: `once()` auto-removes after a single fire,
  dedupes like `on()`, and is removable via `off(event, callback)`
- **Snapshot Semantics**: listeners added during an emission fire from
  the next emission

## Installation

```bash
deno add @tundralibs/utils
```

## API Reference

### Constructor

```typescript
class MyClass extends Events<T> {}
```

**Type Parameter `T`**: Object mapping event names to callback
signatures.

### Public methods (subscription)

- `on(event, callback)`: Register a listener (or an array of them);
  duplicates are no-ops
- `once(event, callback)`: Register a one-time listener; removable
  before firing with `off(event, callback)`
- `off(event, callback?)`: Remove a listener (or all listeners for the
  event when omitted)

### Protected methods (emission — for the owning class)

- `_emit(event, ...args)`: Fire-and-forget. Listeners run in
  registration order; sync throws and async rejections are routed to
  `_onListenerError`, never propagated
- `_emitSync(event, ...args)`: Awaits each listener in turn. A
  throw/rejection **propagates to the awaiting caller** and stops later
  listeners — this is the deliberate, handled emission path
- `_emitRaw(event, ...args)`: Variance-tolerant `_emit` for generic
  base classes (typed event key, `unknown[]` args)
- `_onListenerError(event, error)`: Hook receiving every contained
  listener fault; defaults to `console.error` — override to route into
  a logger

## Usage Examples

### An emitting class

```typescript
import { Events } from '@tundralibs/utils';

interface StoreEvents {
  change: (data: unknown) => void;
  error: (error: Error) => void;
}

class DataStore extends Events<StoreEvents> {
  #data: unknown;

  setData(data: unknown) {
    this.#data = data;
    this._emit('change', data); // emission is the owner's privilege
  }
}

const store = new DataStore();
store.on('change', (data) => console.log('changed:', data));
store.setData({ hello: 'world' });
```

### Awaited emission (`_emitSync`)

```typescript
class Pipeline extends Events<{ flush: () => Promise<void> }> {
  async flush() {
    // Each listener completes before the next starts; a rejection
    // surfaces HERE, where the emitter can handle it.
    await this._emitSync('flush');
  }
}
```

### Listener isolation (fire-and-forget)

```typescript
store.on('change', () => {
  throw new Error('listener bug');
});
store.on('change', () => {
  console.log('this still runs'); // isolation: one bad listener
}); //                               cannot stop the others

store.setData(1); // the throw is reported via _onListenerError
```

### Routing listener faults

```typescript
class Service extends Events<ServiceEvents> {
  protected override _onListenerError(
    event: PropertyKey,
    error: unknown,
  ): void {
    logger.error(`listener failed on '${String(event)}'`, { error });
  }
}
```

### One-time listeners

```typescript
const onReady = () => startServer();
app.once('ready', onReady);
app.off('ready', onReady); // removable by the ORIGINAL callback
```

## Best Practices

1. **Type your events** — always define an event interface
2. **Emit from the owner only** — if outside code needs to cause an
   event, expose a method that does the work and emits
3. **Use `_emitSync` when the emitter must observe failures**; use
   `_emit` when emission must never affect the emitter
4. **Clean up** — call `off()` for long-lived emitters

## Related Utilities

- [Options](Utils-Options.md) - Combines Events with options management
- [BaseError](Utils-BaseError.md) - Error handling with context

[← Back to Utils](../README.md)
