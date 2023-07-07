# Events

A simple class with which any class can start emitting events. Supports both
Typed and untyped events.

## Usage

```ts
// #region Typed Event
type TestEvents = {
  event1(a: string): unknown;
  event2(): boolean | Promise<boolean>;
};
class TypedEvent extends Events<TestEvents> {
  getEventCount(): number {
    return this._events.get('event1')?.size || 0;
  }
  run() {
    this.emit('event1', 'Run');
  }
  runSync() {
    this.emitSync('event1', 'RunAsync');
  }
}
const test: TypedEvent = new EventTester();
test.on('event1', 'a');

// #endregion Typed Event

// region UnTyped Event
class UnTypedEvent extends Events {
  getEventCount(): number {
    return this._events.get('event1')?.size || 0;
  }
  run() {
    this.emit('event1', 'Run');
  }
  runSync() {
    this.emitSync('event1', 'RunAsync');
  }
}
const test2: UnTypedEvent = new UnTypedEvent();
test.on('eventabc', 'a');
// #endregion UnTyped Event
```

### Methods

#### on

```ts
on(event: EventName, callback: Callback)
```

`event: EventName` - The event name in which callback is to be added

`callback: Callback` - The function to call when the event is triggered

Add a callback to the event loop

#### once

```ts
once(event: EventName, callback: Callback)
```

`event: EventName` - The event name in which callback with once tag is to be
added

`callback: Callback` - The function to call (once) when the event is triggered

Adds a callback to the event loop which will be triggered only once. This means
any callback marked as "once" will only be called one time irrespective of how
many times the event is triggered.

#### off

```ts
off(event: EventName, callback: Callback);
off(event: EventName);
off();
```

`event: EventName` - The event name

`callback: Callback` - The specific function to be removed

Remove a specific callback (if event variable _and_ callback variable is passed)
from the event loop. Remove all callbacks in for a specific event (if only event
is specified). Remove _all_ callbacks across _all_ events if no event is
specified.

#### emit

```ts
emit(
    event: EventName,
    ...args: Parameters<Callback>
  ): Promise<ReturnType<Callback>[]>
```

`@accessor - Protected`

`event: EventName` - The event to "trigger"

`...args: Parameters<Callback>` - The parameters to pass to the callback
function

This is a **protected** method.

Triggers an event passing the variables to the callback waiting for each
callback to finish execution. This will return an array of all the return values

#### emitSync

```ts
emitSync(
    event: EventName,
    ...args: Parameters<Callback>
  ): ReturnType<Callback>[]
```

`@accessor - Protected`

`event: EventName` - The event to "trigger"

`...args: Parameters<Callback>` - The parameters to pass to the callback
function

This is a **protected** method.

Triggers an event passing the variables to the callback without waiting for each
callback to finish execution. This will return an array of all the return values
(will contain promises)

## TODO

- [x] Synchronous and Asynchronous implementation
- [x] Test cases to be implemented
- [x] More elegant UnTyped event definition
- [ ] Handle errors when calling callbacks or thrown by callbacks itself
- [x] Return/Handle return values from callbacks
