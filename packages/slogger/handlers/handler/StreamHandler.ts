/**
 * @fileoverview {@link StreamHandler} — write formatted log records
 * to any web-standard {@link WritableStream}. The most primitive
 * transport handler in the package: zero opinion about destination,
 * just plumbs strings into a stream.
 *
 * Compose with other web-streams primitives for richer behaviour:
 *
 * - **Gzipped log file** — pipe through `new CompressionStream('gzip')`:
 *   ```ts
 *   import { StreamHandler } from '@tundralibs/slogger/handlers';
 *   import { SyslogSeverities } from '@tundralibs/utils';
 *
 *   const file = await Deno.open('logs.gz', { write: true, create: true });
 *   const gzip = new CompressionStream('gzip');
 *   gzip.readable.pipeTo(file.writable);
 *   new StreamHandler('gz', {
 *     level: SyslogSeverities.INFO,
 *     stream: gzip.writable,
 *   });
 *   ```
 * - **stdout / stderr** — already a `WritableStream<Uint8Array>`:
 *   ```ts
 *   import { StreamHandler } from '@tundralibs/slogger/handlers';
 *   import { SyslogSeverities } from '@tundralibs/utils';
 *
 *   new StreamHandler('stderr', {
 *     level: SyslogSeverities.WARNING,
 *     stream: Deno.stderr.writable,
 *   });
 *   ```
 * - **In-memory capture for tests** — string sink:
 *   ```ts
 *   import { StreamHandler } from '@tundralibs/slogger/handlers';
 *   import { SyslogSeverities } from '@tundralibs/utils';
 *
 *   const chunks: string[] = [];
 *   const stream = new WritableStream<string>({ write: (c) => { chunks.push(c); } });
 *   new StreamHandler('capture', {
 *     level: SyslogSeverities.INFO,
 *     stream,
 *     useTextMode: true,
 *   });
 *   ```
 *
 * @module
 */

import { AbstractHandler, type HandlerOptions } from '../AbstractHandler.ts';
import type { SlogObject } from '../../types/SlogObject.ts';
import { SloggerConfigError } from '../../errors/mod.ts';

/** Options for {@link StreamHandler}. */
export type StreamHandlerOptions = HandlerOptions & {
  /**
   * The destination stream. Defaults to byte mode — formatted
   * records are UTF-8 encoded before being written. Pass a
   * {@link WritableStream}`<Uint8Array>` here (file, stdout, gzip,
   * network — the common case). For string sinks, set `useTextMode: true`.
   */
  // deno-lint-ignore no-explicit-any
  stream: WritableStream<any>;

  /**
   * Treat the stream as accepting `string` chunks (no UTF-8 encoding).
   * Use this for user-built `WritableStream<string>` sinks in tests
   * or for transform streams that handle their own encoding.
   *
   * @default false (byte mode — formatted record is UTF-8 encoded)
   */
  useTextMode?: boolean;

  /**
   * Per-record terminator appended to each log. Set to `''` to
   * disable. Defaults to `'\n'` so the output is NDJSON-/line-friendly.
   *
   * @default '\n'
   */
  terminator?: string;

  /**
   * When `true` (default), `finalize()` calls `writer.close()` on the
   * underlying stream. Set to `false` if the stream is shared with
   * other writers and you don't want this handler to take ownership
   * of its lifecycle — `finalize()` will then just release the writer
   * lock.
   *
   * @default true
   */
  closeOnFinalize?: boolean;
};

/**
 * Write formatted log records to any `WritableStream`. Backpressure
 * is honoured via `writer.ready` — a slow consumer slows the
 * producer rather than blowing up memory.
 */
export class StreamHandler extends AbstractHandler {
  public readonly mode = 'stream';
  // deno-lint-ignore no-explicit-any
  private readonly __stream: WritableStream<any>;
  private readonly __terminator: string;
  private readonly __closeOnFinalize: boolean;
  private readonly __useTextMode: boolean;
  // deno-lint-ignore no-explicit-any
  private __writer: WritableStreamDefaultWriter<any> | undefined;
  private readonly __encoder = new TextEncoder();

  /**
   * @param name - Handler name identifier
   * @param options - Configuration options for the handler
   * @throws {SloggerConfigError} When `stream` is not a
   *   {@link WritableStream}.
   */
  constructor(name: string, options: StreamHandlerOptions) {
    super(name, options);
    if (!options.stream || typeof options.stream.getWriter !== 'function') {
      throw new SloggerConfigError(
        'StreamHandler requires a WritableStream as `stream`',
        { key: 'stream' },
      );
    }
    this.__stream = options.stream;
    this.__terminator = options.terminator ?? '\n';
    this.__closeOnFinalize = options.closeOnFinalize ?? true;
    this.__useTextMode = options.useTextMode === true;
  }

  public override async init(): Promise<void> {
    await super.init();
    if (!this.__writer) {
      this.__writer = this.__stream.getWriter();
    }
  }

  /**
   * Wait for the writer to be acquired before formatting/writing. On the
   * declarative path `LogManager.createHandler` starts `init()` but does
   * not await it, and `Slogger.log()` dispatches `handle()`
   * fire-and-forget, so a record logged immediately after construction
   * would otherwise reach `_handle` before `init()` acquired the writer
   * and only be written AFTER `finalize()` had already resolved (lost on
   * process exit). Gates only when init was actually started (see
   * {@link _awaitInitIfStarted}), so a directly-constructed handler keeps
   * its historical lazy-init behaviour. Mirrors `FileHandler.handle`.
   */
  public override async handle(log: SlogObject): Promise<void> {
    await this._awaitInitIfStarted();
    await super.handle(log);
  }

  protected async _handle(message: string): Promise<void> {
    if (!this.__writer) await this.init();
    if (!this.__writer) return;
    const text = message + this.__terminator;
    // Honour backpressure — `ready` resolves once the underlying
    // sink has drained below its high-water mark.
    await this.__writer.ready;
    await this.__writer.write(
      this.__useTextMode ? text : this.__encoder.encode(text),
    );
  }

  public override async finalize(): Promise<void> {
    // Await init when it was started (the declarative path) so the writer
    // is acquired before we decide whether to close/release it. Without
    // this, an early `finalize()` runs while `__writer` is still undefined
    // and skips the close/releaseLock block entirely — leaking the writer
    // lock and never flushing/closing the sink. See `FileHandler.finalize`.
    await this._awaitInitIfStarted();
    if (this.__writer) {
      try {
        await this.__writer.ready;
      } catch { /* sink errored — closing below will throw too */ }
      if (this.__closeOnFinalize) {
        try {
          await this.__writer.close();
        } catch { /* already closed / errored */ }
      } else {
        try {
          this.__writer.releaseLock();
        } catch { /* already released */ }
      }
      this.__writer = undefined;
    }
    await super.finalize();
  }
}
