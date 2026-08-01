/**
 * @fileoverview {@link SyslogHandler} — ships logs to a syslog
 * daemon (rsyslog, syslog-ng, journald) in RFC 5424 wire format over
 * TCP, UDP, or a UNIX socket.
 *
 * @module
 */
import {
  connect,
  type Connection,
  type UdpSocket,
  udpSocket,
} from '@tundralibs/compat';
import { AbstractHandler, type HandlerOptions } from '../AbstractHandler.ts';
import type { SlogObject } from '../../types/SlogObject.ts';
import { SloggerConfigError, SloggerHandlerError } from '../../errors/mod.ts';
import {
  rfc5424Formatter,
  type Rfc5424Options,
} from '../../formatters/rfc5424.ts';

/**
 * Transport descriptor for {@link SyslogHandler}. TCP and UDP for
 * remote syslog daemons (rsyslog/syslog-ng on port 514, often 6514
 * with TLS), UNIX socket for the local daemon (`/dev/log` on Linux,
 * `/var/run/syslog` on macOS). UDP is the historical default (RFC
 * 3164) and still the most common rsyslog config — best-effort,
 * fire-and-forget, no acknowledgement.
 */
export type SyslogTransport =
  | { readonly type: 'tcp'; readonly host: string; readonly port: number }
  | { readonly type: 'udp'; readonly host: string; readonly port: number }
  | { readonly type: 'unix'; readonly path: string };

/**
 * Options for {@link SyslogHandler}.
 *
 * Setting a `formatter` has no effect — the wire format is fixed at
 * RFC 5424. Use {@link Rfc5424Options.appendContext} (via the
 * `rfc5424` option below) to control how the SlogObject's `context`
 * field flows into the MSG body.
 */
export type SyslogHandlerOptions =
  & Omit<HandlerOptions, 'formatter'>
  & Rfc5424Options
  & {
    transport: SyslogTransport;
    /**
     * TCP framing per RFC 6587. Ignored for UDP (one datagram per
     * record) and for UNIX sockets (no framing prefix — daemons
     * expect a trailing `\n`).
     *
     * - `'octet-count'` (default for TCP): `<length> <msg>` — binary
     *   safe; the recommended form for syslog over TCP.
     * - `'lf'` (default for UNIX socket): append `\n`. The local
     *   syslog daemon expects this on `/dev/log` etc.
     *
     * @default 'octet-count' for TCP, 'lf' for UNIX socket
     */
    framing?: 'octet-count' | 'lf';
  };

/**
 * Ship logs to a syslog daemon in RFC 5424 wire format over TCP, UDP,
 * or a UNIX socket.
 *
 * - **TCP / UNIX:** opens one persistent connection on first log; on
 *   a write failure the connection is dropped and the next log
 *   triggers a fresh connect.
 * - **UDP:** opens one sender socket on first log; fires each record
 *   as a single datagram. UDP is best-effort — no acknowledgement,
 *   no retry, no reconnect (the socket only dies if the kernel kills
 *   it). Use UDP for the classic rsyslog `*.* @host:514` config.
 *
 * There's no internal retry / queue / backoff — pair with a wrapping
 * handler if you need delivery guarantees.
 *
 * @example Local journald (Linux) via /dev/log
 * ```typescript
 * new SyslogHandler('local-syslog', {
 *   level: SyslogSeverities.DEBUG,
 *   transport: { type: 'unix', path: '/dev/log' },
 *   facility: SyslogFacilities.LOCAL0,
 *   appName: 'my-service',
 * });
 * ```
 *
 * @example Remote rsyslog over TCP
 * ```typescript
 * new SyslogHandler('remote-syslog', {
 *   level: SyslogSeverities.INFO,
 *   transport: { type: 'tcp', host: 'logs.example.com', port: 514 },
 *   facility: SyslogFacilities.LOCAL3,
 *   appName: 'api-gateway',
 *   appendContext: (ctx) => JSON.stringify(ctx),
 * });
 * ```
 *
 * @example Classic UDP rsyslog (`*.* @logs.example.com:514`)
 * ```typescript
 * new SyslogHandler('udp-syslog', {
 *   level: SyslogSeverities.INFO,
 *   transport: { type: 'udp', host: 'logs.example.com', port: 514 },
 *   facility: SyslogFacilities.LOCAL3,
 *   appName: 'api-gateway',
 * });
 * ```
 */
export class SyslogHandler extends AbstractHandler {
  public readonly mode = 'syslog';
  private readonly __transport: SyslogTransport;
  private readonly __framing: 'octet-count' | 'lf';
  private readonly __wireFormatter: ReturnType<typeof rfc5424Formatter>;
  private readonly __encoder = new TextEncoder();
  /** Stream sockets (TCP / UNIX). Mutually exclusive with `__udp`. */
  private __connection: Connection | undefined;
  /** Datagram socket (UDP). Mutually exclusive with `__connection`. */
  private __udp: UdpSocket | undefined;
  /**
   * Tracks an in-flight `connect()` / `udpSocket()` so concurrent
   * logs don't open multiple sockets while the first is still
   * negotiating.
   */
  private __connecting?: Promise<void>;
  /**
   * Serialises writes against the shared socket. `Slogger.log()`
   * dispatches `handle()` fire-and-forget, so without this two rapid
   * logs would interleave their (possibly partial) writes on the same
   * stream and desync the octet-count framing. Mirrors FileHandler's
   * `__enqueue` write-chain.
   */
  private __writeChain: Promise<void> = Promise.resolve();

  /**
   * @param name - Handler name identifier
   * @param options - Configuration options for the handler
   * @throws {SloggerConfigError} When `transport` is missing, has an
   *   unknown `type`, or its host/port/path fields are invalid.
   */
  constructor(name: string, options: SyslogHandlerOptions) {
    super(name, options as HandlerOptions);

    if (!options.transport) {
      throw new SloggerConfigError(
        'SyslogHandler requires a `transport` option',
        { key: 'transport' },
      );
    }
    if (
      options.transport.type === 'tcp' || options.transport.type === 'udp'
    ) {
      const { host, port, type } = options.transport;
      if (!host || typeof host !== 'string') {
        throw new SloggerConfigError(
          `SyslogHandler ${type} transport requires a host string`,
          { key: 'transport.host' },
        );
      }
      if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new SloggerConfigError(
          `SyslogHandler ${type} transport requires a port in 1..65535`,
          { key: 'transport.port', value: port },
        );
      }
    } else if (options.transport.type === 'unix') {
      if (
        !options.transport.path || typeof options.transport.path !== 'string'
      ) {
        throw new SloggerConfigError(
          'SyslogHandler unix transport requires a non-empty path',
          { key: 'transport.path' },
        );
      }
    } else {
      throw new SloggerConfigError(
        // deno-lint-ignore no-explicit-any
        `Unknown SyslogHandler transport: ${(options.transport as any).type}`,
        { key: 'transport.type' },
      );
    }

    this.__transport = options.transport;
    this.__framing = options.framing ??
      (options.transport.type === 'tcp' ? 'octet-count' : 'lf');
    this.__wireFormatter = rfc5424Formatter({
      facility: options.facility,
      appName: options.appName,
      hostname: options.hostname,
      procId: options.procId,
      messageId: options.messageId,
      appendContext: options.appendContext,
    });
  }

  /**
   * Returns the RFC 5424 wire string. The base `formatter` field is
   * intentionally ignored — syslog's wire shape is fixed.
   */
  protected override _format(log: SlogObject): string {
    return this.__wireFormatter(log);
  }

  protected _handle(message: string): Promise<void> {
    // Serialise through the write chain: concurrent fire-and-forget
    // logs must not interleave their writes on the shared socket.
    return this.__enqueue(() => this.__doHandle(message));
  }

  /**
   * Append `task` to the serial write chain and return a promise that
   * settles when it has run. Tasks execute one-at-a-time in enqueue
   * order; a rejected task advances the chain regardless (so one
   * failed write can't wedge every later write) while still surfacing
   * its own rejection to the caller that enqueued it.
   */
  private __enqueue(task: () => Promise<void>): Promise<void> {
    const run = this.__writeChain.then(task, task);
    this.__writeChain = run.then(() => {}, () => {});
    return run;
  }

  /**
   * Connect (if needed) and ship one record — a datagram for UDP, a
   * framed stream write for TCP / UNIX.
   *
   * @throws {SloggerHandlerError} When the stream socket accepts zero
   *   bytes while data remains (a dead peer).
   */
  private async __doHandle(message: string): Promise<void> {
    try {
      await this.__ensureConnected();
      if (this.__transport.type === 'udp') {
        if (!this.__udp) return;
        // One datagram per record. RFC 5424 over UDP carries the
        // wire string as-is — no length prefix, no LF terminator
        // (the datagram boundary IS the framing). A datagram is
        // all-or-nothing at the app layer, so no partial-write loop.
        await this.__udp.send(
          this.__encoder.encode(message),
          this.__transport.host,
          this.__transport.port,
        );
        return;
      }
      if (!this.__connection) return;
      await this.__writeAll(this.__frame(message));
    } catch (err) {
      // Drop the connection so the next call re-dials. Bubble the
      // error up — Slogger.log() attaches `.catch()` and swallows it,
      // matching every other built-in handler's failure mode.
      this.__dropConnection();
      throw err;
    }
  }

  /**
   * Write the full framed record to the stream socket, looping until
   * every byte is accepted. The socket `write()` may accept FEWER
   * bytes than offered under backpressure (the Deno `Conn.write` /
   * Writer contract); ignoring the returned count silently truncates
   * the record and desyncs octet-count framing, corrupting every
   * following frame the daemon parses. Same loop the FileHandler uses.
   *
   * @param data - The framed record bytes to write in full.
   * @throws {SloggerHandlerError} When `write()` returns zero bytes
   *   with data still pending.
   */
  private async __writeAll(data: Uint8Array): Promise<void> {
    const conn = this.__connection;
    if (!conn) return;
    let written = 0;
    while (written < data.length) {
      const n = await conn.write(data.subarray(written));
      if (n <= 0) {
        throw new SloggerHandlerError(
          'SyslogHandler write accepted zero bytes',
          { handler: this.name, transport: this.__transport.type },
        );
      }
      written += n;
    }
  }

  public override async finalize(): Promise<void> {
    // Drain the write chain BEFORE dropping the socket. Enqueuing the
    // drop as the tail task guarantees every queued record is flushed
    // first; dropping immediately (the old behaviour) left queued
    // records unflushed — lost on process exit (violating
    // Slogger.finalize()'s flush contract) or re-dialing a fresh socket
    // AFTER finalize that then leaks. See FileHandler.
    await this.__enqueue(() => {
      this.__dropConnection();
      return Promise.resolve();
    });
    await super.finalize();
  }

  private async __ensureConnected(): Promise<void> {
    if (this.__connection || this.__udp) return;
    if (this.__connecting !== undefined) {
      await this.__connecting;
      return;
    }
    this.__connecting = (async () => {
      try {
        if (this.__transport.type === 'tcp') {
          this.__connection = await connect({
            hostname: this.__transport.host,
            port: this.__transport.port,
          });
        } else if (this.__transport.type === 'udp') {
          this.__udp = await udpSocket();
        } else {
          this.__connection = await connect({
            path: this.__transport.path,
          });
        }
      } finally {
        this.__connecting = undefined;
      }
    })();
    await this.__connecting;
  }

  private __dropConnection(): void {
    if (this.__connection) {
      try {
        this.__connection.close();
      } catch {
        // Swallow close errors — the socket might already be dead.
      }
      this.__connection = undefined;
    }
    if (this.__udp) {
      try {
        this.__udp.close();
      } catch {
        // Swallow close errors — the socket might already be dead.
      }
      this.__udp = undefined;
    }
  }

  /**
   * Apply the configured framing. `'octet-count'` (RFC 6587 §3.4.1)
   * prefixes the byte length: `LEN<SP>MSG`. `'lf'` (RFC 6587 §3.4.2)
   * just appends `'\n'`.
   */
  private __frame(message: string): Uint8Array {
    if (this.__framing === 'octet-count') {
      const bytes = this.__encoder.encode(message);
      const prefix = this.__encoder.encode(`${bytes.length} `);
      const out = new Uint8Array(prefix.length + bytes.length);
      out.set(prefix, 0);
      out.set(bytes, prefix.length);
      return out;
    }
    return this.__encoder.encode(message + '\n');
  }
}
