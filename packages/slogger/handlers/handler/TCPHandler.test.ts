// deno-lint-ignore-file no-explicit-any
import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { listen } from '@tundralibs/compat';
import { getFreePort, SyslogSeverities } from '@tundralibs/utils';
import { TCPHandler } from './TCPHandler.ts';
import { simpleFormatter } from '../../formatters/string.ts';
import type { SlogObject } from '../../types/SlogObject.ts';

/** Concatenate captured chunks into one buffer. */
const concat = (chunks: Uint8Array[]): Uint8Array =>
  chunks.reduce<Uint8Array>((a, b) => {
    const out = new Uint8Array(a.length + b.length);
    out.set(a, 0);
    out.set(b, a.length);
    return out;
  }, new Uint8Array(0));

/**
 * Mock stream connection that accepts at most `maxPerWrite` bytes per
 * `write()` call — mirroring a real socket under backpressure, whose
 * `write` may accept fewer bytes than offered. It yields to the event
 * loop mid-write so that, absent serialization, concurrent writes
 * would interleave their chunks here.
 */
class PartialMockConn {
  public readonly chunks: Uint8Array[] = [];
  public writeCalls = 0;
  public closed = false;
  constructor(private readonly __maxPerWrite: number) {}
  read(): Promise<Uint8Array | null> {
    return Promise.resolve(null);
  }
  async write(data: Uint8Array | string): Promise<number> {
    const bytes = typeof data === 'string'
      ? new TextEncoder().encode(data)
      : data;
    this.writeCalls++;
    // Yield: an unserialized concurrent write can slip in right here.
    await Promise.resolve();
    const n = Math.min(this.__maxPerWrite, bytes.length);
    this.chunks.push(bytes.slice(0, n)); // copy — subarray shares buffer
    return n;
  }
  close(): void {
    this.closed = true;
  }
}

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

describe({
  name: 'slogger.handlers.TCPHandler',
  permissions: { net: true },
  fn: () => {
    describe('constructor validation', () => {
      it('rejects missing host', () => {
        asserts.assertThrows(
          () =>
            new TCPHandler('t', {
              level: SyslogSeverities.INFO,
              port: 9000,
            } as any),
          Error,
          'host',
        );
      });

      it('rejects empty host', () => {
        asserts.assertThrows(
          () =>
            new TCPHandler('t', {
              level: SyslogSeverities.INFO,
              host: '',
              port: 9000,
            }),
          Error,
          'host',
        );
      });

      it('rejects bad ports', () => {
        for (const port of [0, -1, 70000, 1.5, NaN]) {
          asserts.assertThrows(
            () =>
              new TCPHandler('t', {
                level: SyslogSeverities.INFO,
                host: 'x',
                port,
              } as any),
            Error,
            'port',
          );
        }
      });
    });

    describe('framing', () => {
      it('LF framing (default) appends \\n per record', async () => {
        const port = await getFreePort({ min: 29500, max: 29999 });
        const listener = await listen({ port, hostname: '127.0.0.1' });
        const received: Uint8Array[] = [];
        const accepted = (async () => {
          const c = await listener.accept();
          while (true) {
            const chunk = await c.read();
            if (chunk === null) break;
            received.push(chunk);
          }
          c.close();
        })();

        const h = new TCPHandler('t', {
          level: SyslogSeverities.DEBUG,
          host: '127.0.0.1',
          port,
        });
        await h.handle(makeLog(SyslogSeverities.INFO, 'one'));
        await h.handle(makeLog(SyslogSeverities.INFO, 'two'));
        await h.finalize();
        await accepted;
        listener.close();

        const decoded = new TextDecoder().decode(
          received.reduce<Uint8Array>((a, b) => {
            const out = new Uint8Array(a.length + b.length);
            out.set(a, 0);
            out.set(b, a.length);
            return out;
          }, new Uint8Array(0)),
        );
        // Default standardFormat applied to each log; LF-framed.
        asserts.assertStringIncludes(decoded, 'one\n');
        asserts.assertStringIncludes(decoded, 'two\n');
        const lines = decoded.split('\n').filter((l) => l);
        asserts.assertEquals(lines.length, 2);
      });

      it('octet-count framing prefixes byte length', async () => {
        const port = await getFreePort({ min: 29500, max: 29999 });
        const listener = await listen({ port, hostname: '127.0.0.1' });
        const received: Uint8Array[] = [];
        const accepted = (async () => {
          const c = await listener.accept();
          while (true) {
            const chunk = await c.read();
            if (chunk === null) break;
            received.push(chunk);
          }
          c.close();
        })();

        const h = new TCPHandler('t', {
          level: SyslogSeverities.DEBUG,
          host: '127.0.0.1',
          port,
          framing: 'octet-count',
        });
        await h.handle(makeLog(SyslogSeverities.INFO, 'hello'));
        await h.finalize();
        await accepted;
        listener.close();

        const decoded = new TextDecoder().decode(
          received.reduce<Uint8Array>((a, b) => {
            const out = new Uint8Array(a.length + b.length);
            out.set(a, 0);
            out.set(b, a.length);
            return out;
          }, new Uint8Array(0)),
        );
        // Format: `<bytes> MSG`
        asserts.assert(
          /^\d+ /.test(decoded),
          'expected leading byte count, got: ' + decoded,
        );
        asserts.assertStringIncludes(decoded, 'hello');
      });
    });

    describe('reconnect', () => {
      it('reconnects after the connection is dropped', async () => {
        const port = await getFreePort({ min: 29500, max: 29999 });
        const listener = await listen({ port, hostname: '127.0.0.1' });
        let acceptCount = 0;
        const received: Uint8Array[] = [];
        const acceptLoop = (async () => {
          while (acceptCount < 2) {
            const c = await listener.accept();
            acceptCount++;
            (async () => {
              while (true) {
                const chunk = await c.read();
                if (chunk === null) break;
                received.push(chunk);
              }
              c.close();
            })().catch(() => {/* */});
          }
        })();

        const h = new TCPHandler('t', {
          level: SyslogSeverities.DEBUG,
          host: '127.0.0.1',
          port,
        });
        await h.handle(makeLog(SyslogSeverities.INFO, 'first'));
        (h as any).__dropConnection();
        await h.handle(makeLog(SyslogSeverities.INFO, 'second'));
        await h.finalize();
        await new Promise<void>((r) => setTimeout(r, 50));
        listener.close();
        try {
          await acceptLoop;
        } catch { /* listener closed */ }

        asserts.assertEquals(acceptCount, 2);
        const decoded = new TextDecoder().decode(
          received.reduce<Uint8Array>((a, b) => {
            const out = new Uint8Array(a.length + b.length);
            out.set(a, 0);
            out.set(b, a.length);
            return out;
          }, new Uint8Array(0)),
        );
        asserts.assertStringIncludes(decoded, 'first');
        asserts.assertStringIncludes(decoded, 'second');
      });
    });

    describe('partial writes + serialization', () => {
      it('delivers the whole record when the socket accepts partial writes', async () => {
        // Regression: _handle ignored the write() byte count, so under
        // backpressure only the first chunk landed and the rest was
        // silently dropped — truncating the record on the wire.
        const h = new TCPHandler('t', {
          level: SyslogSeverities.DEBUG,
          host: '127.0.0.1',
          port: 9999,
          formatter: simpleFormatter('${message}'),
        });
        const mock = new PartialMockConn(3); // 3 bytes accepted per write
        (h as any).__connection = mock;

        await h.handle(makeLog(SyslogSeverities.INFO, 'hello-world-1234'));

        const got = new TextDecoder().decode(concat(mock.chunks));
        asserts.assertEquals(got, 'hello-world-1234\n');
        asserts.assert(
          mock.writeCalls > 1,
          'expected the write to loop over multiple partial accepts',
        );
        await h.finalize();
        asserts.assertEquals(mock.closed, true);
      });

      it('serializes concurrent fire-and-forget writes (whole, non-interleaved, in order)', async () => {
        // Regression: two overlapping handle() calls both reached
        // conn.write concurrently; with the partial-write loop their
        // chunks interleaved and desynced the stream. The write chain
        // must serialise them so each record arrives whole and in order.
        const h = new TCPHandler('t', {
          level: SyslogSeverities.DEBUG,
          host: '127.0.0.1',
          port: 9999,
          formatter: simpleFormatter('${message}'),
        });
        const mock = new PartialMockConn(4);
        (h as any).__connection = mock;

        const count = 12;
        const expected: string[] = [];
        const pending: Array<Promise<void>> = [];
        for (let i = 0; i < count; i++) {
          const line = `line-${String(i).padStart(4, '0')}`;
          expected.push(line);
          // Fire-and-forget, exactly how Slogger.log() dispatches.
          pending.push(h.handle(makeLog(SyslogSeverities.INFO, line)));
        }
        await Promise.all(pending);

        const got = new TextDecoder().decode(concat(mock.chunks));
        const lines = got.split('\n').filter((l) => l.length > 0);
        // Each record intact, present once, and in enqueue order — any
        // interleaving or truncation breaks this exact-array equality.
        asserts.assertEquals(lines, expected);
        await h.finalize();
      });
    });

    describe('finalize drains the write chain', () => {
      it('flushes queued records to the original socket before closing (no re-dial)', async () => {
        // Regression (round-3 finding 4): finalize() dropped the
        // connection immediately without draining __writeChain, so
        // queued records were left unflushed — lost on process exit, or
        // re-dialed onto a fresh socket AFTER finalize that then leaks.
        const h = new TCPHandler('t', {
          level: SyslogSeverities.DEBUG,
          host: '127.0.0.1',
          port: 9, // discard port — never dialed on the fixed path
          formatter: simpleFormatter('${message}'),
        });
        const mock = new PartialMockConn(1000); // accept a whole record per write
        (h as any).__connection = mock; // warm connection (no real dial)

        // Fire-and-forget two logs (exactly how Slogger.log dispatches),
        // then finalize immediately.
        const p1 = h.handle(makeLog(SyslogSeverities.INFO, 'alpha'));
        const p2 = h.handle(makeLog(SyslogSeverities.INFO, 'beta'));
        await h.finalize();
        await Promise.allSettled([p1, p2]);

        const got = new TextDecoder().decode(concat(mock.chunks));
        // Both records reached the ORIGINAL socket before it closed.
        asserts.assertStringIncludes(got, 'alpha');
        asserts.assertStringIncludes(got, 'beta');
        asserts.assertEquals(mock.closed, true);
        // No fresh socket left open post-finalize.
        asserts.assertEquals((h as any).__connection, undefined);
      });
    });
  },
});
