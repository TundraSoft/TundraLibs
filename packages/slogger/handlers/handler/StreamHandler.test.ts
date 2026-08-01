// deno-lint-ignore-file no-explicit-any
import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { SyslogSeverities } from '@tundralibs/utils';
import { StreamHandler } from './StreamHandler.ts';
import type { SlogObject } from '../../types/SlogObject.ts';
import { SloggerConfigError } from '../../errors/mod.ts';
import { LogManager } from '../../LogManager.ts';

const makeLog = (
  level: SyslogSeverities,
  message: string,
): SlogObject => ({
  id: `id-${message}`,
  appName: 'app',
  hostname: 'host',
  level,
  levelName: SyslogSeverities[level] as any,
  context: {},
  message,
  date: new Date('2026-05-11T00:00:00Z'),
  isoDate: '2026-05-11T00:00:00.000Z',
  timestamp: 0,
});

describe('slogger.handlers.StreamHandler', () => {
  describe('constructor validation', () => {
    it('rejects a missing stream', () => {
      asserts.assertThrows(
        () =>
          new StreamHandler('s', {
            level: SyslogSeverities.INFO,
          } as any),
        SloggerConfigError,
        'WritableStream',
      );
    });

    it('rejects a non-WritableStream', () => {
      asserts.assertThrows(
        () =>
          new StreamHandler('s', {
            level: SyslogSeverities.INFO,
            stream: { write: () => {} } as any,
          }),
        SloggerConfigError,
        'WritableStream',
      );
    });
  });

  describe('text-mode sink', () => {
    it('writes each formatted record + terminator to a string stream', async () => {
      const chunks: string[] = [];
      const stream = new WritableStream<string>({
        write: (c) => {
          chunks.push(c);
        },
      });
      const h = new StreamHandler('s', {
        level: SyslogSeverities.DEBUG,
        stream,
        useTextMode: true,
      });

      await h.handle(makeLog(SyslogSeverities.INFO, 'hello'));
      await h.handle(makeLog(SyslogSeverities.WARNING, 'second'));
      await h.finalize();

      // Each record arrives separately as `<formatted>\n`.
      asserts.assertEquals(chunks.length, 2);
      asserts.assert(chunks[0]!.endsWith('hello\n'));
      asserts.assert(chunks[1]!.endsWith('second\n'));
    });

    it('honours a custom terminator', async () => {
      const chunks: string[] = [];
      const stream = new WritableStream<string>({
        write: (c) => {
          chunks.push(c);
        },
      });
      const h = new StreamHandler('s', {
        level: SyslogSeverities.DEBUG,
        stream,
        useTextMode: true,
        terminator: '|',
      });
      await h.handle(makeLog(SyslogSeverities.INFO, 'a'));
      await h.finalize();
      asserts.assert(chunks[0]!.endsWith('a|'));
    });

    it('empty terminator emits the formatted record as-is', async () => {
      const chunks: string[] = [];
      const stream = new WritableStream<string>({
        write: (c) => {
          chunks.push(c);
        },
      });
      const h = new StreamHandler('s', {
        level: SyslogSeverities.DEBUG,
        stream,
        useTextMode: true,
        terminator: '',
      });
      await h.handle(makeLog(SyslogSeverities.INFO, 'no-terminator'));
      await h.finalize();
      asserts.assert(chunks[0]!.endsWith('no-terminator'));
      asserts.assert(!chunks[0]!.endsWith('\n'));
    });
  });

  describe('byte-mode sink (default)', () => {
    it('writes UTF-8 encoded Uint8Array chunks', async () => {
      const chunks: Uint8Array[] = [];
      const stream = new WritableStream<Uint8Array>({
        write: (c) => {
          chunks.push(c);
        },
      });
      const h = new StreamHandler('s', {
        level: SyslogSeverities.DEBUG,
        stream,
      });

      await h.handle(makeLog(SyslogSeverities.INFO, 'hello'));
      await h.finalize();
      asserts.assertEquals(chunks.length, 1);
      asserts.assert(chunks[0] instanceof Uint8Array);
      const decoded = new TextDecoder().decode(chunks[0]);
      asserts.assert(decoded.endsWith('hello\n'));
    });
  });

  describe('lifecycle', () => {
    it('init() acquires the writer; finalize() closes by default', async () => {
      let closed = false;
      const stream = new WritableStream<string>({
        write: () => {},
        close: () => {
          closed = true;
        },
      });
      const h = new StreamHandler('s', {
        level: SyslogSeverities.DEBUG,
        stream,
        useTextMode: true,
      });
      await h.handle(makeLog(SyslogSeverities.INFO, 'x'));
      await h.finalize();
      asserts.assertEquals(closed, true);
    });

    it('closeOnFinalize: false releases the lock without closing', async () => {
      let closed = false;
      const stream = new WritableStream<string>({
        write: () => {},
        close: () => {
          closed = true;
        },
      });
      const h = new StreamHandler('s', {
        level: SyslogSeverities.DEBUG,
        stream,
        useTextMode: true,
        closeOnFinalize: false,
      });
      await h.handle(makeLog(SyslogSeverities.INFO, 'x'));
      await h.finalize();
      asserts.assertEquals(closed, false);
      // The stream is still usable — we can grab a fresh writer
      // because the handler released the lock on finalize().
      const writer = stream.getWriter();
      writer.releaseLock();
    });
  });

  describe('declarative path (LogManager.createHandler init gate)', () => {
    // Regression (round-4 finding 4): the round-3 early-record / init
    // fix was wired into FileHandler only. On the declarative path
    // `LogManager.createHandler` starts init() but does NOT await it, and
    // `Slogger.log` dispatches `handle()` fire-and-forget. StreamHandler
    // did not gate on `_awaitInitIfStarted()`, so a record logged before
    // init resolved was written only AFTER `finalize()` had resolved (lost
    // on process exit), and `finalize()` ran while `__writer` was still
    // undefined — skipping close/releaseLock entirely and leaking the
    // writer lock.
    it('flushes an early fire-and-forget record and closes on finalize', async () => {
      const chunks: string[] = [];
      let closed = false;
      const stream = new WritableStream<string>({
        write: (c) => {
          chunks.push(c);
        },
        close: () => {
          closed = true;
        },
      });
      // createHandler kicks off init() but does not await it.
      const h = LogManager.createHandler('StreamHandler', 'sh-early', {
        level: SyslogSeverities.DEBUG,
        // deno-lint-ignore no-explicit-any
        stream,
        useTextMode: true,
        // deno-lint-ignore no-explicit-any
      } as any);
      // Fire-and-forget, exactly as Slogger.log dispatches.
      h.handle(makeLog(SyslogSeverities.INFO, 'EARLY')).catch(() => {});
      await h.finalize();

      // The early record must have landed before finalize resolved, and
      // the sink must have been closed (no leaked writer lock).
      asserts.assertEquals(closed, true, 'stream must be closed on finalize');
      asserts.assertEquals(chunks.length, 1, 'early record must not be lost');
      asserts.assert(chunks[0]!.endsWith('EARLY\n'));
    });

    it('releases the writer lock on finalize with closeOnFinalize: false', async () => {
      const stream = new WritableStream<string>({ write: () => {} });
      const h = LogManager.createHandler('StreamHandler', 'sh-noclose', {
        level: SyslogSeverities.DEBUG,
        // deno-lint-ignore no-explicit-any
        stream,
        useTextMode: true,
        closeOnFinalize: false,
        // deno-lint-ignore no-explicit-any
      } as any);
      h.handle(makeLog(SyslogSeverities.INFO, 'x')).catch(() => {});
      await h.finalize();
      // Settle any racing lazy-init that may still be acquiring the writer.
      await new Promise<void>((r) => setTimeout(r, 20));
      // finalize() must have released the lock — a second consumer can
      // take the stream. Before the fix the lock leaked forever.
      asserts.assertEquals(
        stream.locked,
        false,
        'writer lock must be released',
      );
      const writer = stream.getWriter();
      writer.releaseLock();
    });
  });

  describe('backpressure', () => {
    it('respects writer.ready before pushing more', async () => {
      // Build a slow sink with high-water-mark = 1 so the second
      // write blocks until the first resolves.
      const ticks: number[] = [];
      let writeCount = 0;
      const stream = new WritableStream<string>(
        {
          write: async (_chunk) => {
            const id = ++writeCount;
            ticks.push(id);
            // Slow sink — 30ms per record.
            await new Promise<void>((r) => setTimeout(r, 30));
          },
        },
        { highWaterMark: 1 },
      );

      const h = new StreamHandler('s', {
        level: SyslogSeverities.DEBUG,
        stream,
        useTextMode: true,
      });

      const start = Date.now();
      await h.handle(makeLog(SyslogSeverities.INFO, 'a'));
      await h.handle(makeLog(SyslogSeverities.INFO, 'b'));
      await h.handle(makeLog(SyslogSeverities.INFO, 'c'));
      // If backpressure works, three sequential 30ms writes take
      // at least ~60ms (first record may overlap; the second and
      // third are serialised by `ready`).
      const elapsed = Date.now() - start;
      await h.finalize();
      asserts.assert(
        elapsed >= 60,
        `expected serialised writes (~60ms+), got ${elapsed}ms`,
      );
      asserts.assertEquals(ticks, [1, 2, 3]);
    });
  });
});
