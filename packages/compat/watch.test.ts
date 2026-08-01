/**
 * @fileoverview Tests for watch().
 *
 * Covers shape (empty-path rejection, watcher protocol) plus a few
 * real-filesystem scenarios in a temp directory: creation events,
 * `close()` ending iteration, and breaking out of a `for await` loop
 * triggering cleanup. The fidelity of event kinds is asserted softly
 * because Node and Bun's `fs.watch` collapses create/delete/rename
 * into a single `'rename'` bucket — we only assert that *some* event
 * arrives.
 */

import { describe, it } from './test.ts';
import { type FsEvent, watch } from './watch.ts';
import { makeTempDir, remove, writeTextFile } from './file.ts';
import * as asserts from '@std/asserts';

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Wait for the first event from a watcher with a timeout. Returns the
 * event or `null` on timeout.
 */
const firstEvent = async (
  w: AsyncIterable<FsEvent>,
  timeoutMs: number,
): Promise<FsEvent | null> => {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), timeoutMs);
  });
  const iter = w[Symbol.asyncIterator]();
  const first = iter.next().then((r) => (r.done ? null : r.value));
  const result = await Promise.race([first, timeout]);
  if (timer !== null) clearTimeout(timer);
  return result;
};

/** Drain an async iterable until it ends. */
const drain = async (w: AsyncIterable<FsEvent>): Promise<void> => {
  const iter = w[Symbol.asyncIterator]();
  while (true) {
    const { done } = await iter.next();
    if (done) return;
  }
};

describe({
  name: 'compat.watch',
  fn: () => {
    describe('argument validation', () => {
      it('should throw RangeError on empty paths array', () => {
        asserts.assertThrows(
          () => watch([]),
          RangeError,
          'at least one path',
        );
      });
    });

    describe('Watcher protocol', () => {
      it('should expose close() and Symbol.asyncIterator', async () => {
        const dir = await makeTempDir({ prefix: 'compat_watch_proto_' });
        try {
          const w = watch(dir);
          try {
            asserts.assertStrictEquals(typeof w.close, 'function');
            asserts.assert(
              typeof (w as AsyncIterable<FsEvent>)[Symbol.asyncIterator] ===
                'function',
              'watcher must implement Symbol.asyncIterator',
            );
          } finally {
            w.close();
          }
        } finally {
          await remove(dir);
        }
      });

      it('close() should be idempotent', async () => {
        const dir = await makeTempDir({ prefix: 'compat_watch_close_' });
        try {
          const w = watch(dir);
          w.close();
          w.close();
          w.close();
          // No assertion — just shouldn't throw or hang.
        } finally {
          await remove(dir);
        }
      });

      it('close() should end an in-flight async iteration', async () => {
        const dir = await makeTempDir({ prefix: 'compat_watch_endit_' });
        try {
          const w = watch(dir);
          const drained = drain(w);
          setTimeout(() => w.close(), 50);
          await drained;
          // If this test returns, the iterator ended cleanly.
        } finally {
          await remove(dir);
        }
      });

      it('iterator return() should close the watcher', async () => {
        const dir = await makeTempDir({ prefix: 'compat_watch_break_' });
        try {
          const w = watch(dir);
          const iter = w[Symbol.asyncIterator]();
          // Manually call return() — the same path `for await ... break`
          // takes when the consumer abandons the loop.
          asserts.assert(typeof iter.return === 'function');
          const r = await iter.return();
          asserts.assertStrictEquals(r.done, true);
          // Subsequent close() must still be a no-op.
          w.close();
        } finally {
          await remove(dir);
        }
      });
    });

    describe('event delivery', () => {
      it('should deliver an event when a file is created', async () => {
        const dir = await makeTempDir({ prefix: 'compat_watch_create_' });
        try {
          const w = watch(dir);
          // Give the underlying watcher a moment to register.
          await sleep(50);
          const writePromise = writeTextFile(`${dir}/created.txt`, 'hello');
          const ev = await firstEvent(w, 3000);
          await writePromise;
          w.close();
          asserts.assert(ev !== null, 'expected an event within 3s');
          asserts.assert(
            Array.isArray(ev.paths) && ev.paths.length > 0,
            'event should carry at least one path',
          );
          // Note: path-content checks would over-specify. macOS FSEvents
          // can deliver coarse-grained paths (the watched dir itself, or
          // even an unrelated sibling) when changes happen near
          // each other in time. We assert the event arrived and has a
          // sensible shape; kind fidelity is checked separately.
        } finally {
          await remove(dir);
        }
      });

      it('event kind should be one of the normalized values', async () => {
        const dir = await makeTempDir({ prefix: 'compat_watch_kind_' });
        try {
          const w = watch(dir);
          await sleep(50);
          const writePromise = writeTextFile(`${dir}/kind.txt`, 'abc');
          const ev = await firstEvent(w, 3000);
          await writePromise;
          w.close();
          asserts.assert(ev !== null, 'expected an event within 3s');
          const validKinds: ReadonlyArray<FsEvent['kind']> = [
            'create',
            'modify',
            'remove',
            'rename',
            'any',
          ];
          asserts.assert(
            validKinds.includes(ev.kind),
            `kind ${JSON.stringify(ev.kind)} is not in the normalized set`,
          );
        } finally {
          await remove(dir);
        }
      });
    });
  },
});
