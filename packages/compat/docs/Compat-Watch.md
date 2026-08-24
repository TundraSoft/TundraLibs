# Compat-Watch

Cross-runtime filesystem watching with a single async-iterable API
and normalized event kinds.

![Deno](https://img.shields.io/badge/Deno-000000?logo=deno)
![Bun](https://img.shields.io/badge/Bun-f9f1e1?logo=bun)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)

## Table of Contents

- [Overview](#overview)
- [Installation](#installation)
- [API Reference](#api-reference)
- [Event Fidelity](#event-fidelity)
- [Recursive Watching](#recursive-watching)
- [Examples](#examples)

## Overview

`watch()` returns an async-iterable `Watcher` that emits normalized
`FsEvent`s. The runtime backends differ in fidelity — Deno's
`Deno.watchFs` reports distinct create / modify / remove / rename
kinds, while Node and Bun's `fs.watch` only distinguishes `'change'`
(modify) from `'rename'` (creation, deletion, _and_ an actual rename,
all conflated). On Node/Bun treat `'rename'` as "something happened
to this name" and stat the path if you need detail.

### Features

| Feature                   | Bun | Deno | Node.js |
| ------------------------- | --- | ---- | ------- |
| Watch single path         | ✅  | ✅   | ✅      |
| Watch multiple paths      | ✅  | ✅   | ✅      |
| Recursive                 | ✅  | ✅   | ✅\*    |
| Distinct create/modify/rm | ❌  | ✅   | ❌      |
| Async-iterable Watcher    | ✅  | ✅   | ✅      |
| Idempotent close          | ✅  | ✅   | ✅      |

\* Node.js requires version 20+ for recursive watching on Linux. On
older Node + Linux, the underlying `fs.watch` will throw — we don't
polyfill with polling.

## Installation

**Deno:**

```bash
deno add @tundralibs/compat
```

**Bun:**

```bash
bunx jsr add @tundralibs/compat
```

**Node.js:**

```bash
npx jsr add @tundralibs/compat
```

## API Reference

```typescript ignore
type FsEventKind = 'create' | 'modify' | 'remove' | 'rename' | 'any';

type FsEvent = {
  kind: FsEventKind;
  paths: string[]; // always absolute
};

type WatchOptions = {
  recursive?: boolean; // default false
};

interface Watcher extends AsyncIterable<FsEvent> {
  close(): void; // idempotent
}

function watch(
  paths: string | readonly string[],
  options?: WatchOptions,
): Watcher;
```

### Lifecycle

- Construct via `watch(paths, opts)` — the underlying watcher is
  registered immediately.
- Iterate with `for await` to receive events as they arrive.
- Call `close()` to stop. Pending iteration ends with `done: true`;
  subsequent `close()` calls are no-ops.
- Breaking out of `for await` (via `break` / `return`) calls
  `close()` automatically through the iterator's `return()` hook.
- An underlying error (e.g. the watched directory is removed)
  triggers `close()` and the iterator ends.

### Errors

- `RangeError` — when `paths` is an empty array
- `UnsupportedRuntimeError` — on a runtime with no fs-watching backend
  (Workers, browsers). Exported from `@tundralibs/compat`, not from
  `@tundralibs/compat/watch` — import it from the root specifier to
  `instanceof`-check it.
- The underlying runtime API may throw synchronously if a path
  doesn't exist or isn't accessible — those errors propagate
  unchanged from `watch()`.

```typescript
import { watch } from '@tundralibs/compat/watch';
import { UnsupportedRuntimeError } from '@tundralibs/compat';

try {
  const w = watch('./src');
  for await (const ev of w) console.log(ev.kind, ev.paths);
} catch (error) {
  if (error instanceof UnsupportedRuntimeError) {
    console.warn('No filesystem watching on this runtime:', error.message);
  } else {
    throw error;
  }
}
```

## Event Fidelity

Different runtimes expose different levels of detail.

| Native event  | Deno     | Node / Bun  |
| ------------- | -------- | ----------- |
| File created  | `create` | `rename`    |
| File modified | `modify` | `modify`    |
| File deleted  | `remove` | `rename`    |
| File renamed  | `rename` | `rename`    |
| Access only   | dropped  | not emitted |
| Other         | `any`    | not emitted |

Practical implications:

- **On Deno** you can act differently for create vs delete vs rename.
- **On Node/Bun** you cannot distinguish create from delete from rename
  using event kind alone. If you need that, `stat()` the path
  yourself when you receive a `'rename'` event.
- `'access'` events are dropped on Deno (they are noisy and rarely
  useful). Node and Bun never emit them in the first place.

## Recursive Watching

Pass `{ recursive: true }` to watch subdirectories:

```typescript
import { watch } from '@tundralibs/compat/watch';

const w = watch('./src', { recursive: true });
```

| Runtime   | Linux | macOS | Windows |
| --------- | ----- | ----- | ------- |
| Deno      | ✅    | ✅    | ✅      |
| Bun       | ✅    | ✅    | ✅      |
| Node ≥ 20 | ✅    | ✅    | ✅      |
| Node < 20 | ❌    | ✅    | ✅      |

On older Node + Linux, `fs.watch({ recursive: true })` throws. We let
that error surface rather than silently falling back to polling
(which has its own correctness and performance pitfalls).

## Examples

### Hot-reload on source change

```typescript
import { watch } from '@tundralibs/compat/watch';

declare function rebuild(): Promise<void>;

const w = watch('./src', { recursive: true });
for await (const ev of w) {
  if (ev.paths.some((p) => p.endsWith('.ts'))) {
    await rebuild();
  }
}
```

### Watching multiple paths

```typescript
import { watch } from '@tundralibs/compat/watch';

const w = watch(['./packages/a/src', './packages/b/src'], {
  recursive: true,
});
for await (const ev of w) {
  console.log(ev.kind, ev.paths);
}
```

### Stop watching on a sentinel file

```typescript
import { watch } from '@tundralibs/compat/watch';

const w = watch('./pids');
for await (const ev of w) {
  if (ev.paths.some((p) => p.endsWith('SHUTDOWN'))) {
    w.close(); // ends the loop
  }
}
```

### Disambiguating rename events on Node/Bun

```typescript
import { stat } from '@tundralibs/compat/file';
import { watch } from '@tundralibs/compat/watch';

const w = watch('./uploads');
for await (const ev of w) {
  if (ev.kind !== 'rename') continue;
  for (const p of ev.paths) {
    try {
      const info = await stat(p);
      console.log(info.isFile ? 'created/replaced:' : 'dir touched:', p);
    } catch {
      console.log('removed:', p);
    }
  }
}
```

On Deno you'd just match on `ev.kind === 'create' | 'remove' | 'rename'`
directly.

### Manual iteration (when `for await` doesn't fit)

```typescript
import { watch } from '@tundralibs/compat/watch';

const w = watch('./data');
const iter = w[Symbol.asyncIterator]();

const first = await iter.next();
if (!first.done) console.log('first event:', first.value);

w.close();
```
