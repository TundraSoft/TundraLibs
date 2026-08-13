/**
 * @fileoverview {@link TCPHandler} — write formatted log records to a
 * raw TCP destination (line-delimited or octet-counted). Same wire
 * primitive as {@link SyslogHandler} minus the RFC 5424 framing
 * opinion: caller picks the formatter (JSON line, logfmt, OTel,
 * plain text — anything that produces a string).
 *
 * Typical targets:
 *
 * - **Logstash TCP input** (5044 or 5000) — pair with `jsonFormatter`
 * - **Fluentd `in_forward` / `in_tcp`** (24224 / 5170) — pair with `jsonFormatter`
 * - **Vector** `socket` source — same
 * - Any generic line-delimited TCP log sink
 *
 * For RFC 5424 syslog use {@link SyslogHandler}; for HTTP push use
 * {@link HTTPHandler}; for UDP use … nothing yet (waiting on UDP in
 * the compat layer).
 *
 * @module
 */

import { connect, type Connection } from '@tundralibs/compat/net';
import { AbstractHandler, type HandlerOptions } from '../AbstractHandler.ts';
import { SloggerConfigError, SloggerHandlerError } from '../../errors/mod.ts';

/**
 * Options for {@link TCPHandler}.
 */
export type TCPHandlerOptions = HandlerOptions & {
  /** Remote host (DNS name or IP). */
  host: string;
  /** Remote port (1..65535). */
  port: number;
  /**
   * Framing of each record on the wire.
   *
   * - `'lf'` (default): append `'\n'`. Standard line-delimited
   *   convention used by Logstash, Fluentd, Vector, etc.
   * - `'octet-count'`: `<bytes> MSG` prefix per RFC 6587 §3.4.1.
   *   Binary-safe; pick this if your records can contain newlines.
   *
   * @default 'lf'
   */
  framing?: 'lf' | 'octet-count';
};

/**
 * Open a persistent TCP connection and write formatted log records
 * to it. Lazy connect on first log; drops the connection on write
 * failure so the next call re-dials. No retry / cap / backoff — pair
 * with a wrapping handler if you need delivery guarantees.
 *
 * @example Logstash TCP input with JSON formatting
 * ```typescript
 * new TCPHandler('logstash', {
 *   level: SyslogSeverities.INFO,
 *   host: 'logstash.internal',
 *   port: 5044,
 *   formatter: jsonFormatter,
 * });
 * ```
 *
 * @example Vector socket source with logfmt
 * ```typescript
 * new TCPHandler('vector', {
 *   level: SyslogSeverities.INFO,
 *   host: '127.0.0.1',
 *   port: 9000,
 *   formatter: logfmtFormatter(),
 * });
 * ```
 */
export class TCPHandler extends AbstractHandler {
  public readonly mode = 'tcp';
  private readonly __host: string;
  private readonly __port: number;
  private readonly __framing: 'lf' | 'octet-count';
  private readonly __encoder = new TextEncoder();
  private __connection: Connection | undefined;
  /**
   * Tracks an in-flight `connect()` so concurrent logs don't open
   * multiple sockets while the first is still negotiating.
   */
  private __connecting?: Promise<void>;
  /**
   * Serialises writes against the shared socket. `Slogger.log()`
   * dispatches `handle()` fire-and-forget, so without this two rapid
   * logs would interleave their (possibly partial) writes on the same
   * connection and desync the wire framing. Mirrors FileHandler's
   * `__enqueue` write-chain.
   */
  private __writeChain: Promise<void> = Promise.resolve();

  /**
   * @param name - Handler name identifier
   * @param options - Configuration options for the handler
   * @throws {SloggerConfigError} When `host` is not a non-empty
   *   string or `port` is not an integer in 1..65535.
   */
  constructor(name: string, options: TCPHandlerOptions) {
    super(name, options);
    if (!options.host || typeof options.host !== 'string') {
      throw new SloggerConfigError('TCPHandler requires a `host` string', {
        key: 'host',
      });
    }
    if (
      !Number.isInteger(options.port) || options.port < 1 ||
      options.port > 65535
    ) {
      throw new SloggerConfigError('TCPHandler requires a `port` in 1..65535', {
        key: 'port',
        value: options.port,
      });
    }
    this.__host = options.host;
    this.__port = options.port;
    this.__framing = options.framing ?? 'lf';
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
   * Connect (if needed) and write one framed record to the socket.
   *
   * @throws {SloggerHandlerError} When the socket accepts zero bytes
   *   while data remains (a dead peer).
   */
  private async __doHandle(message: string): Promise<void> {
    try {
      await this.__ensureConnected();
      if (!this.__connection) return;
      await this.__writeAll(this.__frame(message));
    } catch (err) {
      // Drop the connection so the next call re-dials. Bubble up —
      // Slogger.log() attaches `.catch()` and swallows, matching
      // every other built-in handler's failure mode.
      this.__dropConnection();
      throw err;
    }
  }

  /**
   * Write the full buffer, looping until every byte is accepted. The
   * socket `write()` may accept FEWER bytes than offered under
   * backpressure (the Deno `Conn.write` / Writer contract); ignoring
   * the returned count silently truncates the record and — with
   * octet-count framing — corrupts every following frame the receiver
   * parses. Same loop the FileHandler uses for its file writes.
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
          'TCPHandler write accepted zero bytes',
          { handler: this.name, host: this.__host, port: this.__port },
        );
      }
      written += n;
    }
  }

  public override async finalize(): Promise<void> {
    // Drain the write chain BEFORE dropping the connection. Enqueuing
    // the drop as the tail task guarantees every queued record is
    // flushed to the socket first; dropping immediately (the old
    // behaviour) left queued records unflushed — lost on process exit
    // (violating Slogger.finalize()'s flush contract) or re-dialing a
    // fresh socket AFTER finalize that then leaks. See FileHandler.
    await this.__enqueue(() => {
      this.__dropConnection();
      return Promise.resolve();
    });
    await super.finalize();
  }

  private async __ensureConnected(): Promise<void> {
    if (this.__connection) return;
    if (this.__connecting) {
      await this.__connecting;
      return;
    }
    this.__connecting = (async () => {
      try {
        this.__connection = await connect({
          hostname: this.__host,
          port: this.__port,
        });
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
        // Already closed / errored.
      }
      this.__connection = undefined;
    }
  }

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
