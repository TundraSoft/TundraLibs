// deno-lint-ignore-file no-explicit-any
import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { listen } from '@tundralibs/compat';
import {
  getFreePort,
  SyslogFacilities,
  SyslogSeverities,
} from '@tundralibs/utils';
import { SyslogHandler } from './SyslogHandler.ts';
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
  context: Record<string, unknown> = {},
): SlogObject => {
  const d = new Date('2026-05-11T07:16:09.121Z');
  return {
    id: 'TEST-ID-001',
    appName: 'test-app',
    hostname: 'test-host',
    level,
    levelName: SyslogSeverities[level] as any,
    context,
    message,
    date: d,
    isoDate: d.toISOString(),
    timestamp: d.getTime(),
  };
};

describe({
  name: 'slogger.handlers.SyslogHandler',
  permissions: { net: true },
  fn: () => {
    describe('constructor validation', () => {
      it('rejects missing transport', () => {
        asserts.assertThrows(
          () =>
            new SyslogHandler('s', {
              level: SyslogSeverities.INFO,
            } as any),
          Error,
          'transport',
        );
      });

      it('rejects unknown transport type', () => {
        asserts.assertThrows(
          () =>
            new SyslogHandler('s', {
              level: SyslogSeverities.INFO,
              transport: { type: 'sctp', host: 'h', port: 514 } as any,
            }),
          Error,
          'Unknown SyslogHandler transport',
        );
      });

      it('rejects udp transport missing host', () => {
        asserts.assertThrows(
          () =>
            new SyslogHandler('s', {
              level: SyslogSeverities.INFO,
              transport: { type: 'udp', host: '', port: 514 },
            }),
          Error,
          'host',
        );
      });

      it('rejects udp transport with bad port', () => {
        asserts.assertThrows(
          () =>
            new SyslogHandler('s', {
              level: SyslogSeverities.INFO,
              transport: { type: 'udp', host: '127.0.0.1', port: 0 },
            }),
          Error,
          'port',
        );
      });

      it('rejects tcp transport missing host', () => {
        asserts.assertThrows(
          () =>
            new SyslogHandler('s', {
              level: SyslogSeverities.INFO,
              transport: { type: 'tcp', host: '', port: 514 },
            }),
          Error,
          'host',
        );
      });

      it('rejects tcp transport with bad port', () => {
        asserts.assertThrows(
          () =>
            new SyslogHandler('s', {
              level: SyslogSeverities.INFO,
              transport: { type: 'tcp', host: '127.0.0.1', port: 0 },
            }),
          Error,
          'port',
        );
        asserts.assertThrows(
          () =>
            new SyslogHandler('s', {
              level: SyslogSeverities.INFO,
              transport: { type: 'tcp', host: '127.0.0.1', port: 70000 },
            }),
          Error,
          'port',
        );
      });

      it('rejects unix transport missing path', () => {
        asserts.assertThrows(
          () =>
            new SyslogHandler('s', {
              level: SyslogSeverities.INFO,
              transport: { type: 'unix', path: '' },
            }),
          Error,
          'path',
        );
      });
    });

    describe('wire format', () => {
      it('emits RFC 5424 wire frame with PRI from facility+severity', () => {
        // Use a TCP transport with octet-counted framing so we can
        // unframe it deterministically.
        const handler = new SyslogHandler('s', {
          level: SyslogSeverities.DEBUG,
          transport: { type: 'tcp', host: '127.0.0.1', port: 1 },
          facility: SyslogFacilities.LOCAL0,
          appName: 'svc',
          hostname: 'h01',
          procId: 1234,
          messageId: 'API',
        });

        // Reach _format directly — no connection required.
        const wire = (handler as any)._format(
          makeLog(SyslogSeverities.ERROR, 'something broke'),
        );
        // PRI = LOCAL0(16) * 8 + ERROR(3) = 131
        asserts.assertEquals(
          wire,
          '<131>1 2026-05-11T07:16:09.121Z h01 svc 1234 API - something broke',
        );
      });

      it('falls back to log.appName/hostname when not overridden', () => {
        const handler = new SyslogHandler('s', {
          level: SyslogSeverities.DEBUG,
          transport: { type: 'tcp', host: '127.0.0.1', port: 1 },
          facility: SyslogFacilities.USER, // 1
        });
        const wire = (handler as any)._format(
          makeLog(SyslogSeverities.INFO, 'hello'),
        );
        // PRI = USER(1) * 8 + INFO(6) = 14
        asserts.assert(
          wire.startsWith('<14>1 '),
          `expected PRI=14, got: ${wire}`,
        );
        asserts.assert(
          wire.includes(' test-host test-app '),
          `expected hostname/appName fallback, got: ${wire}`,
        );
      });

      it('appendContext renders into the MSG body', () => {
        const handler = new SyslogHandler('s', {
          level: SyslogSeverities.DEBUG,
          transport: { type: 'tcp', host: '127.0.0.1', port: 1 },
          appendContext: (ctx) => JSON.stringify(ctx),
        });
        const wire = (handler as any)._format(
          makeLog(SyslogSeverities.INFO, 'logged in', {
            userId: 42,
            ip: '10.0.0.1',
          }),
        );
        asserts.assertStringIncludes(
          wire,
          'logged in {"userId":42,"ip":"10.0.0.1"}',
        );
      });

      it('appendContext is skipped when context is empty', () => {
        const handler = new SyslogHandler('s', {
          level: SyslogSeverities.DEBUG,
          transport: { type: 'tcp', host: '127.0.0.1', port: 1 },
          appendContext: () => 'SHOULD_NOT_APPEAR',
        });
        const wire = (handler as any)._format(
          makeLog(SyslogSeverities.INFO, 'no ctx'),
        );
        asserts.assert(
          !wire.includes('SHOULD_NOT_APPEAR'),
          'appendContext fired on empty context',
        );
      });

      it('header fields with whitespace / control bytes are sanitized to `_`', () => {
        const handler = new SyslogHandler('s', {
          level: SyslogSeverities.DEBUG,
          transport: { type: 'tcp', host: '127.0.0.1', port: 1 },
          appName: 'has spaces',
          hostname: 'host\nwith\nnewlines',
        });
        const wire = (handler as any)._format(
          makeLog(SyslogSeverities.INFO, 'ok'),
        );
        asserts.assert(
          wire.includes('host_with_newlines'),
          'hostname not sanitized: ' + wire,
        );
        asserts.assert(
          wire.includes('has_spaces'),
          'appName not sanitized: ' + wire,
        );
      });
    });

    describe('live TCP — frames + reconnect', () => {
      it('writes octet-counted frames to a TCP listener', async () => {
        const port = await getFreePort({ min: 29400, max: 29999 });
        const received: Uint8Array[] = [];
        let conn: any = null;
        const listener = await listen({ port, hostname: '127.0.0.1' });

        // Accept one connection, read until close, capture bytes.
        const serverDone = (async () => {
          conn = await listener.accept();
          while (true) {
            const chunk = await conn.read();
            if (chunk === null) break;
            received.push(chunk);
          }
        })();

        const handler = new SyslogHandler('s', {
          level: SyslogSeverities.DEBUG,
          transport: { type: 'tcp', host: '127.0.0.1', port },
          facility: SyslogFacilities.LOCAL0,
          appName: 'svc',
          hostname: 'h01',
          procId: 1234,
          // framing defaults to 'octet-count' for tcp
        });

        await handler.handle(makeLog(SyslogSeverities.INFO, 'hello one'));
        await handler.handle(makeLog(SyslogSeverities.WARNING, 'hello two'));
        await handler.finalize(); // closes our connection → listener sees EOF
        await serverDone;
        listener.close();
        try {
          conn?.close();
        } catch { /* already closed */ }

        const decoded = new TextDecoder().decode(
          received.reduce<Uint8Array>(
            (a, b) => {
              const out = new Uint8Array(a.length + b.length);
              out.set(a, 0);
              out.set(b, a.length);
              return out;
            },
            new Uint8Array(0),
          ),
        );

        // Each message prefixed with `<bytes-len> `. Both messages
        // should land in the stream.
        asserts.assertStringIncludes(decoded, 'hello one');
        asserts.assertStringIncludes(decoded, 'hello two');
        // Octet-count framing — at least one decimal-length prefix
        // followed by '<134>1 ' (LOCAL0 * 8 + INFO = 134) or
        // '<132>1 ' (LOCAL0 * 8 + WARNING = 132).
        asserts.assert(
          /\d+ <13[24]>1 /.test(decoded),
          'expected octet-count framing + PRI header, got: ' + decoded,
        );
      });

      it('reconnects after the connection is dropped', async () => {
        // Tests the reconnect path by forcing `_dropConnection()` between
        // writes — i.e. simulates a fault where the handler's connection
        // becomes stale. Directly inducing a TCP failure on the wire is
        // racy (write to a closed peer can succeed silently due to OS
        // buffering); the injection approach exercises the same code
        // path deterministically.
        const port = await getFreePort({ min: 29400, max: 29999 });
        const received: Uint8Array[] = [];
        const listener = await listen({ port, hostname: '127.0.0.1' });
        let acceptCount = 0;

        // Accept up to two connections — second one is the reconnect.
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
            })().catch(() => {/* connection closed */});
          }
        })();

        const handler = new SyslogHandler('s', {
          level: SyslogSeverities.DEBUG,
          transport: { type: 'tcp', host: '127.0.0.1', port },
        });

        await handler.handle(makeLog(SyslogSeverities.INFO, 'first'));

        // Force the handler to drop its connection. Next write must
        // re-dial — the listener will see a second accept.
        // deno-lint-ignore no-explicit-any
        (handler as any).__dropConnection();

        await handler.handle(makeLog(SyslogSeverities.INFO, 'second'));
        await handler.finalize();
        // Give the accept loop a moment to register the second accept
        // (the loop will exit once acceptCount reaches 2).
        await new Promise<void>((r) => setTimeout(r, 50));
        listener.close();
        try {
          await acceptLoop;
        } catch { /* listener closed */ }

        asserts.assertEquals(
          acceptCount,
          2,
          'expected handler to open a second connection after drop',
        );
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

    describe('partial writes + serialization (octet-count framing)', () => {
      it('delivers the whole octet-counted frame when the socket accepts partial writes', async () => {
        // Regression: _handle ignored the write() byte count, so under
        // backpressure only the first chunk of the frame landed and the
        // length prefix desynced every following record.
        const handler = new SyslogHandler('s', {
          level: SyslogSeverities.DEBUG,
          transport: { type: 'tcp', host: '127.0.0.1', port: 9999 },
          facility: SyslogFacilities.LOCAL0,
          appName: 'svc',
          hostname: 'h01',
          procId: 1234,
          // framing defaults to 'octet-count' for tcp
        });
        const mock = new PartialMockConn(3);
        (handler as any).__connection = mock;

        const log = makeLog(SyslogSeverities.INFO, 'a large-ish syslog record');
        // The exact bytes the handler intends to put on the wire.
        const expected: Uint8Array = (handler as any).__frame(
          (handler as any)._format(log),
        );

        await handler.handle(log);

        const got = concat(mock.chunks);
        asserts.assertEquals(
          new TextDecoder().decode(got),
          new TextDecoder().decode(expected),
        );
        asserts.assert(
          mock.writeCalls > 1,
          'expected the write to loop over multiple partial accepts',
        );
        await handler.finalize();
        asserts.assertEquals(mock.closed, true);
      });

      it('serializes concurrent fire-and-forget writes (whole frames, in order)', async () => {
        // Regression: overlapping handle() calls both reached conn.write
        // concurrently; with the partial-write loop their chunks
        // interleaved and corrupted the octet-count framing. The write
        // chain must serialise them.
        const handler = new SyslogHandler('s', {
          level: SyslogSeverities.DEBUG,
          transport: { type: 'tcp', host: '127.0.0.1', port: 9999 },
          facility: SyslogFacilities.LOCAL0,
          appName: 'svc',
          hostname: 'h01',
          procId: 1234,
        });
        const mock = new PartialMockConn(4);
        (handler as any).__connection = mock;

        const count = 10;
        const logs: SlogObject[] = [];
        for (let i = 0; i < count; i++) {
          logs.push(
            makeLog(SyslogSeverities.INFO, `rec-${String(i).padStart(3, '0')}`),
          );
        }
        // Expected wire = each frame concatenated in enqueue order.
        const expected = concat(
          logs.map((l) =>
            (handler as any).__frame((handler as any)._format(l)) as Uint8Array
          ),
        );

        const pending = logs.map((l) => handler.handle(l)); // fire-and-forget
        await Promise.all(pending);

        const got = concat(mock.chunks);
        asserts.assertEquals(
          new TextDecoder().decode(got),
          new TextDecoder().decode(expected),
        );
        await handler.finalize();
      });
    });

    describe({
      name: 'live UDP — datagrams',
      // Uses `Deno.listenDatagram` directly to keep the test isolated
      // to this runtime; the cross-runtime path is exercised on its
      // own in `packages/compat/udp.test.ts`.
      deno: true,
      bun: false,
      node: false,
      fn: () => {
        it('fires one datagram per record at the configured host/port', async () => {
          const receiver = Deno.listenDatagram({
            transport: 'udp',
            hostname: '127.0.0.1',
            port: 0,
          });
          const port = (receiver.addr as Deno.NetAddr).port;

          const datagrams: string[] = [];
          const receiveLoop = (async () => {
            for await (const [bytes] of receiver) {
              datagrams.push(new TextDecoder().decode(bytes));
              if (datagrams.length >= 2) break;
            }
          })();

          const handler = new SyslogHandler('s', {
            level: SyslogSeverities.DEBUG,
            transport: { type: 'udp', host: '127.0.0.1', port },
            facility: SyslogFacilities.LOCAL0,
            appName: 'svc',
            hostname: 'h01',
            procId: 1234,
          });

          await handler.handle(makeLog(SyslogSeverities.INFO, 'udp one'));
          await handler.handle(makeLog(SyslogSeverities.WARNING, 'udp two'));
          await receiveLoop;
          await handler.finalize();
          receiver.close();

          asserts.assertEquals(datagrams.length, 2);
          const [first, second] = datagrams;
          asserts.assertExists(first);
          asserts.assertExists(second);
          // No framing prefix — the datagram itself is the frame.
          asserts.assert(
            first.startsWith('<134>1 '),
            'expected PRI=134 (LOCAL0 * 8 + INFO), got: ' + first,
          );
          asserts.assertStringIncludes(first, 'udp one');
          asserts.assert(
            second.startsWith('<132>1 '),
            'expected PRI=132 (LOCAL0 * 8 + WARNING), got: ' + second,
          );
          asserts.assertStringIncludes(second, 'udp two');
        });
      },
    });

    describe('finalize drains the write chain', () => {
      it('flushes queued records to the original socket before closing (no re-dial)', async () => {
        // Regression (round-3 finding 4): finalize() dropped the socket
        // immediately without draining __writeChain, so queued records
        // were left unflushed — lost on process exit, or re-dialed onto a
        // fresh socket AFTER finalize that then leaks.
        const handler = new SyslogHandler('s', {
          level: SyslogSeverities.DEBUG,
          transport: { type: 'tcp', host: '127.0.0.1', port: 9 },
          facility: SyslogFacilities.LOCAL0,
          appName: 'svc',
          hostname: 'h01',
          procId: 1234,
        });
        const mock = new PartialMockConn(1000); // whole frame per write
        (handler as any).__connection = mock; // warm connection (no real dial)

        // Fire-and-forget two logs, then finalize immediately.
        const p1 = handler.handle(makeLog(SyslogSeverities.INFO, 'alpha'));
        const p2 = handler.handle(makeLog(SyslogSeverities.INFO, 'beta'));
        await handler.finalize();
        await Promise.allSettled([p1, p2]);

        const got = new TextDecoder().decode(concat(mock.chunks));
        asserts.assertStringIncludes(got, 'alpha');
        asserts.assertStringIncludes(got, 'beta');
        asserts.assertEquals(mock.closed, true);
        asserts.assertEquals((handler as any).__connection, undefined);
      });
    });
  },
});
