/**
 * @fileoverview Cross-runtime filesystem watching.
 *
 * Exposes a single async-iterable {@link Watcher} that emits normalized
 * {@link FsEvent}s. The runtime backends differ in fidelity — Deno's
 * `Deno.watchFs` reports distinct create / modify / remove / rename
 * kinds, while Node and Bun's `fs.watch` only distinguishes
 * `'change'` (modify) from `'rename'` (creation, deletion, *and* an
 * actual rename, all conflated). Treat `'rename'` from Node/Bun as
 * "something happened to this name" and stat the path if you need
 * detail.
 *
 * @module
 *
 * @example
 * ```ts
 * import { watch } from '@tundralibs/compat/watch';
 *
 * const w = watch('./src', { recursive: true });
 * for await (const ev of w) {
 *   console.log(ev.kind, ev.paths);
 *   if (ev.paths.some((p) => p.endsWith('.lock'))) w.close();
 * }
 * ```
 */

import { isBun, isDeno, isNode, RUNTIME } from './runtime.ts';
import { loadBuiltin } from './_runtime-globals.ts';
import { resolve } from './path.ts';

// Resolved synchronously (see {@link loadBuiltin}); a top-level
// `await import()` would async-poison every bundle compat lands in.
// Deno watches through `Deno.watchFs`, so it skips the load.
const nodeFs: typeof import('node:fs') = loadBuiltin(
  'node:fs',
  isBun || isNode,
);

// deno-lint-ignore no-explicit-any
const g = globalThis as any;

/**
 * Normalized filesystem event kind. Five buckets common across all
 * three runtimes:
 *
 * - `create` — file or directory created (Deno only emits this directly;
 *   Node/Bun report it as `rename`)
 * - `modify` — file content changed
 * - `remove` — file or directory deleted (Deno only; Node/Bun → `rename`)
 * - `rename` — entry was renamed (and on Node/Bun also created/deleted)
 * - `any` — fallback when the runtime can't classify (Deno's `other`)
 */
export type FsEventKind = 'create' | 'modify' | 'remove' | 'rename' | 'any';

/**
 * A single filesystem event. `paths` is always absolute — Node's
 * relative-filename quirk is normalized away.
 */
export type FsEvent = {
  kind: FsEventKind;
  paths: string[];
};

/**
 * Options for {@link watch}.
 */
export type WatchOptions = {
  /**
   * Watch subdirectories.
   *
   * Supported on Bun, Deno (all platforms), and Node.js ≥ 20 on Linux.
   * On older Node + Linux the underlying `fs.watch` will throw — let
   * that error surface; we don't polyfill with polling.
   */
  recursive?: boolean;
};

/**
 * Async iterable over filesystem events. Iterating with `for await`
 * pulls events as they arrive; calling {@link Watcher.close} stops the
 * iteration cleanly. Breaking out of the loop with `break` or `return`
 * also closes the watcher (via the iterator's `return()` hook).
 */
export type Watcher = AsyncIterable<FsEvent> & {
  /** Stop receiving events and release resources. Idempotent. */
  close(): void;
};

const _normalizeDenoKind = (kind: string): FsEventKind | null => {
  switch (kind) {
    case 'create':
    case 'modify':
    case 'remove':
    case 'rename':
      return kind;
    case 'any':
    case 'other':
      return 'any';
    case 'access':
      // Read-access events are noisy and rarely useful; drop them.
      return null;
    default:
      return 'any';
  }
};

const _normalizeNodeKind = (kind: 'change' | 'rename'): FsEventKind =>
  kind === 'change' ? 'modify' : 'rename';

/**
 * FIFO queue with async `next()`. Producers call `push`; the consumer
 * calls `next()` repeatedly. When `close()` is called, any pending
 * `next()` resolves with `done: true` and subsequent calls return
 * `done: true` immediately.
 */
class AsyncQueue<T> {
  __queue: T[] = [];
  __waiters: Array<(r: IteratorResult<T>) => void> = [];
  __closed = false;

  push(value: T): void {
    if (this.__closed) return;
    const waiter = this.__waiters.shift();
    if (waiter) {
      waiter({ value, done: false });
    } else {
      this.__queue.push(value);
    }
  }

  close(): void {
    if (this.__closed) return;
    this.__closed = true;
    const waiters = this.__waiters;
    this.__waiters = [];
    this.__queue = [];
    for (const w of waiters) w({ value: undefined!, done: true });
  }

  next(): Promise<IteratorResult<T>> {
    if (this.__queue.length > 0) {
      return Promise.resolve({ value: this.__queue.shift()!, done: false });
    }
    if (this.__closed) {
      return Promise.resolve({ value: undefined!, done: true });
    }
    return new Promise((resolve) => {
      this.__waiters.push(resolve);
    });
  }
}

/**
 * Convert a Node `fs.watch` filename argument (which may be a string,
 * a Uint8Array, or null for events on the watched root itself) into a
 * relative path string.
 */
const _filenameToString = (
  filename: string | Uint8Array | null,
): string => {
  if (typeof filename === 'string') return filename;
  if (filename) return new TextDecoder().decode(filename);
  return '';
};

/**
 * Common implementation for the iteration / close protocol. Subclasses
 * just push events into the shared queue and implement
 * {@link _disposeBackend} for backend-specific teardown.
 */
abstract class BaseWatcher implements Watcher {
  protected readonly _queue = new AsyncQueue<FsEvent>();
  __closed = false;

  protected abstract _disposeBackend(): void;

  close(): void {
    if (this.__closed) return;
    this.__closed = true;
    this._disposeBackend();
    this._queue.close();
  }

  [Symbol.asyncIterator](): AsyncIterator<FsEvent> {
    return {
      next: () => this._queue.next(),
      return: () => {
        this.close();
        return Promise.resolve({ value: undefined!, done: true });
      },
    };
  }
}

class DenoWatcher extends BaseWatcher {
  // deno-lint-ignore no-explicit-any
  readonly __handle: any;

  // Private; use {@link DenoWatcher.start} to construct.
  // deno-lint-ignore no-explicit-any
  private constructor(handle: any) {
    super();
    this.__handle = handle;
  }

  static start(paths: readonly string[], options: WatchOptions): DenoWatcher {
    const handle = g.Deno.watchFs(paths, {
      recursive: options.recursive ?? false,
    });
    const w = new DenoWatcher(handle);
    w.__pump();
    return w;
  }

  async __pump(): Promise<void> {
    try {
      for await (const ev of this.__handle) {
        const kind = _normalizeDenoKind(ev.kind);
        if (kind !== null) this._queue.push({ kind, paths: ev.paths });
      }
    } catch {
      // Watcher disposed underneath us — fall through to close.
    } finally {
      this._queue.close();
    }
  }

  protected override _disposeBackend(): void {
    try {
      this.__handle.close();
    } catch {
      // already closed
    }
  }
}

class NodeWatcher extends BaseWatcher {
  readonly __watchers: Array<import('node:fs').FSWatcher> = [];

  constructor(paths: readonly string[], options: WatchOptions) {
    super();
    for (const p of paths) {
      const w = nodeFs.watch(
        p,
        { recursive: options.recursive ?? false },
        (eventType: string, filename: string | Uint8Array | null) => {
          const kind = _normalizeNodeKind(eventType as 'change' | 'rename');
          const rel = _filenameToString(filename);
          const full = rel.length > 0 ? resolve(p, rel) : resolve(p);
          this._queue.push({ kind, paths: [full] });
        },
      );
      // An error on the underlying watcher (e.g. watched dir deleted)
      // makes the watcher unusable — close everything so the iterator
      // ends cleanly rather than hanging.
      w.on('error', () => this.close());
      this.__watchers.push(w);
    }
  }

  protected override _disposeBackend(): void {
    for (const w of this.__watchers) {
      try {
        w.close();
      } catch {
        // already closed
      }
    }
    this.__watchers.length = 0;
  }
}

/**
 * Watch one or more paths for filesystem changes.
 *
 * Returns an async-iterable {@link Watcher} that yields normalized
 * {@link FsEvent}s as they occur. The watcher runs until you `close()`
 * it explicitly, break out of the iteration, or the underlying handle
 * errors (e.g. the watched path is deleted).
 *
 * @param paths - Single path or array of paths to watch
 * @param options - Watch options
 * @returns A {@link Watcher} that yields events
 *
 * @throws {RangeError} When `paths` is empty
 * @throws {Error} When the runtime is unknown (no fs watching available)
 *
 * @example Watch a directory recursively
 * ```ts
 * const w = watch('./src', { recursive: true });
 * for await (const ev of w) console.log(ev.kind, ev.paths);
 * ```
 *
 * @example Watch multiple paths
 * ```ts
 * declare function rebuild(paths: string[]): void;
 *
 * const w = watch(['./pkg-a/src', './pkg-b/src']);
 * for await (const ev of w) rebuild(ev.paths);
 * ```
 */
export const watch = (
  paths: string | readonly string[],
  options: WatchOptions = {},
): Watcher => {
  const list = typeof paths === 'string' ? [paths] : paths;
  if (list.length === 0) {
    throw new RangeError('watch() requires at least one path');
  }
  /* c8 ignore start */
  if (isDeno) return DenoWatcher.start(list, options);
  /* c8 ignore stop */
  /* c8 ignore start */
  if (isBun || isNode) return new NodeWatcher(list, options);
  /* c8 ignore stop */
  throw new Error(`watch() is not supported in ${RUNTIME} runtime`);
};
