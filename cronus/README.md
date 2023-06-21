# Cronus

Crond implementation in deno. Has the ability to schedule tasks using cron 
syntax and it runs in the backgroud executing the tasks at the specified time.

## Limitations
### Schedule
Currently supports only upto minute scheduling, i.e run every minute. There is 
no plan to allow support for seconds.

Additionally supports only 5 format syntax, i.e:

```bash
* * * * *
| | | | |- Day of week
| | | |- Month
| | |- Day of Month
| |- Hour
|- Minute
```

- Day of week - Supports *, 0-6 (0 is sunday, 6 is sat), Short name of day (SUN, MON, TUE etc), List of days (1,3,5 or MON,WED,FRI) and */2 (every 2 days)
- Month - Supports *, 1-12, Short name of month (JAN, FEB, MAR), List (1,2,3 or JAN,FEB,MAR) and */2 (every 2 months)
- Day of Month - Supports *, 1-31, List (1,2,3 etc) and */2 (every 2nd day of month). *NOTE* - Will not check if the day exists in a month example 30th Feb
- Hour - Supports *, 0-23, List(0, 1, 2) and */3 (every 3 hrs)
- Minute - Supports *, 0-59, List(0, 1, 2) and */5 (every 5 min)

## Usage

```ts
// #region Typed Event

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
