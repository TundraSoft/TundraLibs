import { fetch } from '@tundralibs/compat/fetch';
import { hasPermissionSync } from '@tundralibs/compat/permissions';
import { jsonFormatter } from '../../formatters/mod.ts';
import type { SlogObject } from '../../types/SlogObject.ts';
import { AbstractHandler, type HandlerOptions } from '../AbstractHandler.ts';
import { SloggerConfigError, SloggerHandlerError } from '../../errors/mod.ts';

/**
 * Configuration options for the HTTP handler
 * @property url - Target URL for sending log messages
 * @property method - HTTP method to use (POST or PUT)
 * @property batchSize - Number of log messages to batch before sending
 * @property headers - Additional HTTP headers to include in requests
 * @property maxBufferSize - Cap on the in-memory queue (see below)
 */
export type HTTPHandlerOptions = HandlerOptions & {
  url: string;
  method: 'POST' | 'PUT';
  headers?: Record<string, string>;
  batchSize: number;
  /**
   * Maximum number of formatted log records held in the in-memory
   * queue (pending batch + retry backlog). Failed batches are
   * re-queued for retry; without a cap, a persistently failing
   * endpoint would grow the queue until the process runs out of
   * memory. When the queue would exceed this cap, the OLDEST records
   * are dropped first and {@link HTTPHandler.droppedLogCount} is
   * incremented by the number dropped.
   *
   * Must be a positive integer >= `batchSize`.
   *
   * @default 10_000
   */
  maxBufferSize?: number;
};

/**
 * HTTP Handler for sending log messages to a remote endpoint
 *
 * This handler batches log messages and sends them as JSON to a specified
 * HTTP endpoint. It's useful for centralized logging systems or log aggregation.
 *
 * Failed batches are retained and retried on the next flush, but the
 * queue is bounded by {@link HTTPHandlerOptions.maxBufferSize}
 * (default 10 000 records, drop-oldest) so an unreachable endpoint
 * degrades to bounded data loss instead of unbounded memory growth.
 */
export class HTTPHandler extends AbstractHandler {
  /** Runtime discriminator for this handler kind. */
  public readonly mode = 'http';

  /** Default cap on the in-memory queue, in log records. */
  private static readonly DEFAULT_MAX_BUFFER_SIZE = 10_000;

  private readonly __url: string;
  /**
   * `__url` with any userinfo credentials stripped, for use in error
   * messages and error context. The real `__url` (credentials intact)
   * is still what the `fetch` targets — only the surfaced/logged form
   * is redacted so a `user:token@host` URL can't leak into logs.
   */
  private readonly __safeUrl: string;
  /**
   * The `user:token` userinfo of the configured URL, if any — scrubbed
   * from surfaced error text (see {@link __scrub}). A chained `fetch`
   * error can echo the whole credentialed URL in its own message, so
   * redacting only `__url` isn't enough.
   */
  private readonly __urlUserinfo: string;
  private readonly __method: 'POST' | 'PUT';
  private readonly __batchSize: number;
  private readonly __headers: Record<string, string>;
  private readonly __maxBufferSize: number;
  /** Records dropped (oldest-first) to keep the queue under the cap. */
  private __droppedLogCount: number = 0;

  /**
   * Formatted records awaiting delivery — the batch still filling up,
   * plus any failed batch restored ahead of it for retry. Bounded by
   * `maxBufferSize`, drop-oldest.
   */
  protected _logs: Array<string> = [];

  /**
   * Serialises batch sends. Unlike file/socket handlers this class has
   * no per-write chain, so two batch-triggered `_sendLogs()` calls (or
   * a send racing `finalize()`) could overlap: their snapshot-and-clear
   * of `_logs` would interleave, and `finalize()` could resolve while an
   * earlier batch is still in flight — the record then lost on process
   * exit or stranded in a finalized handler's queue. Every send is
   * appended to this chain so they run strictly one-at-a-time and
   * `finalize()` can drain them.
   */
  private __sendChain: Promise<void> = Promise.resolve();

  /**
   * Creates a new HTTP handler instance
   *
   * @param options - Configuration options for the handler
   * @throws {SloggerConfigError} When `url` is missing/invalid, net
   *   permission for its host is denied, `method` is not POST/PUT,
   *   `batchSize` is not a positive integer, `headers` is not an
   *   object, or `maxBufferSize` is not a positive integer >=
   *   `batchSize`.
   */
  constructor(name: string, options: HTTPHandlerOptions) {
    options.formatter = options.formatter ?? jsonFormatter;
    options.headers = options.headers ?? {};
    super(name, options);

    // Validate URL
    if (!options.url || typeof options.url !== 'string') {
      throw new SloggerConfigError('HTTPHandler requires a valid URL string', {
        key: 'url',
      });
    }
    // Compute the credential-redacted form up front so EVERY error path
    // below surfaces the safe URL, never the raw `user:token@host` one.
    // The setup errors (invalid URL, permission denied) are the ones an
    // app is most likely to log/report at startup, so leaking the raw
    // URL in their message/context would be the very leak the redaction
    // is meant to prevent.
    const safeUrl = HTTPHandler.__redactUrl(options.url);
    try {
      new URL(options.url); // Will throw if URL is invalid
    } catch {
      throw new SloggerConfigError(
        `Invalid URL provided to HTTPHandler: ${safeUrl}`,
        { key: 'url', value: safeUrl },
      );
    }
    this.__url = options.url;
    this.__safeUrl = safeUrl;
    this.__urlUserinfo = HTTPHandler.__extractUserinfo(options.url);
    const host = new URL(this.__url).host;
    const permCheck = hasPermissionSync({ name: 'net', host });
    if (permCheck === false) {
      throw new SloggerConfigError(
        `Permission denied for network access to ${host}`,
        { key: 'url', value: safeUrl },
      );
    }
    // Validate method
    if (!options.method || !['POST', 'PUT'].includes(options.method)) {
      throw new SloggerConfigError(
        'HTTPHandler requires a valid HTTP method (POST or PUT)',
        { key: 'method', value: options.method },
      );
    }
    this.__method = options.method;

    // Validate batchSize
    const batchSize = options.batchSize ?? 1;
    if (!Number.isInteger(batchSize) || batchSize < 1) {
      throw new SloggerConfigError(
        'HTTPHandler batchSize must be a positive integer',
        { key: 'batchSize', value: options.batchSize },
      );
    }
    this.__batchSize = batchSize;

    // Validate headers
    if (options.headers && typeof options.headers !== 'object') {
      throw new SloggerConfigError(
        'HTTPHandler headers must be a valid object if provided',
        { key: 'headers' },
      );
    }
    this.__headers = options.headers ?? {};

    // Validate maxBufferSize (queue cap — see HTTPHandlerOptions).
    const maxBufferSize = options.maxBufferSize ??
      HTTPHandler.DEFAULT_MAX_BUFFER_SIZE;
    if (!Number.isInteger(maxBufferSize) || maxBufferSize < 1) {
      throw new SloggerConfigError(
        'HTTPHandler maxBufferSize must be a positive integer',
        { key: 'maxBufferSize', value: options.maxBufferSize },
      );
    }
    if (maxBufferSize < batchSize) {
      throw new SloggerConfigError(
        'HTTPHandler maxBufferSize must be greater than or equal to batchSize',
        { key: 'maxBufferSize', value: options.maxBufferSize },
      );
    }
    this.__maxBufferSize = maxBufferSize;
  }

  /**
   * Total number of log records dropped (oldest-first) because the
   * in-memory queue exceeded
   * {@link HTTPHandlerOptions.maxBufferSize}. Monotonic for the
   * lifetime of the handler; a non-zero value means the endpoint
   * could not keep up (or was down) long enough to overflow the cap.
   */
  public get droppedLogCount(): number {
    return this.__droppedLogCount;
  }

  /**
   * Finalizes the handler by sending any remaining logs
   * and calling the parent finalize method
   *
   * @throws {SloggerHandlerError} When the final flush fails; the
   *   un-sent batch stays queued (capped) in case the caller retries.
   */
  public override async finalize(): Promise<void> {
    // Drain any in-flight send first, THEN flush whatever remains, both
    // on the serial send chain. Awaiting the chain guarantees a batch
    // already mid-flight completes before finalize resolves — otherwise
    // a process exit right after `await logger.finalize()` (the
    // documented guaranteed-flush path) would abort it and lose the
    // record.
    await this.__enqueueSend(() => this._sendLogs());
    await super.finalize();
  }

  /**
   * Append a send `task` to the serial chain and return a promise that
   * settles when it has run. Tasks execute one-at-a-time in enqueue
   * order; a rejected task advances the chain regardless (so one failed
   * send can't wedge every later send) while still surfacing its own
   * rejection to the caller that enqueued it. Mirrors the write-chain
   * pattern used by the file / socket handlers.
   */
  private __enqueueSend(task: () => Promise<void>): Promise<void> {
    const run = this.__sendChain.then(task, task);
    this.__sendChain = run.then(() => {}, () => {});
    return run;
  }

  /**
   * Formats a log object into a string using the configured formatter
   *
   * @param log - The log object to format
   * @returns Formatted log message string
   */
  protected override _format(log: SlogObject): string {
    return this.formatter(log);
  }

  /**
   * Handles a log message by adding it to the batch queue
   * and sending the batch if it reaches the configured size
   *
   * @param message - The formatted log message
   * @throws {SloggerHandlerError} When the flush triggered by
   *   reaching `batchSize` fails (see {@link _sendLogs}).
   */
  protected async _handle(message: string): Promise<void> {
    this._logs.push(message);
    this.__enforceBufferCap();
    if (this._logs.length >= this.__batchSize) {
      // Serialise through the send chain so concurrent fire-and-forget
      // logs don't overlap their snapshot-and-clear of `_logs`, and so
      // `finalize()` can drain an in-flight batch.
      await this.__enqueueSend(() => this._sendLogs());
    }
  }

  /**
   * Sends batched log messages to the configured HTTP endpoint.
   *
   * The batch is only removed from the queue once the request
   * succeeds (network resolves AND the response is a 2xx). On a
   * network error or a non-2xx status the un-sent entries are
   * prepended back onto the queue so they are retried on the next
   * flush / `finalize()` instead of being silently dropped. The
   * restored queue is still subject to the `maxBufferSize` cap
   * (drop-oldest), so repeated failures cannot grow it unboundedly.
   *
   * @throws {SloggerHandlerError} When the request fails (network
   *   error or non-2xx response). The batch is preserved for retry
   *   (capped) before the throw; a network-level cause is chained on
   *   `cause`.
   */
  protected async _sendLogs(): Promise<void> {
    if (this._logs.length === 0) {
      return;
    }
    // Snapshot the batch but DON'T clear the queue yet — only on
    // confirmed success. New logs appended while the fetch is in
    // flight stay queued behind the batch on failure.
    const batch = this._logs;
    this._logs = [];
    const body = JSON.stringify(batch);
    const headers = new Headers({ 'Content-Type': 'application/json' });
    for (const [key, value] of Object.entries(this.__headers)) {
      headers.set(key, value);
    }
    try {
      const response = await fetch(this.__url, {
        method: this.__method,
        headers: headers,
        body,
      });
      if (!response.ok) {
        // Consume the body so the connection can be released, then
        // surface the failure (batch already restored below).
        await response.body?.cancel();
        throw new SloggerHandlerError(
          `HTTPHandler request to ${this.__safeUrl} failed with status ${response.status}`,
          { handler: this.name, url: this.__safeUrl, status: response.status },
        );
      }
      // Success — release any unconsumed response body.
      await response.body?.cancel();
    } catch (error) {
      // Restore the un-sent batch ahead of anything queued since, so
      // the next flush retries it rather than losing it — then apply
      // the cap so a persistently failing endpoint stays bounded.
      this._logs = batch.concat(this._logs);
      this.__enforceBufferCap();
      if (error instanceof SloggerHandlerError) {
        throw error;
      }
      throw new SloggerHandlerError(
        this.__scrub(
          `HTTPHandler request to ${this.__safeUrl} failed: ${
            error instanceof Error ? error.message : String(error)
          }`,
        ),
        { handler: this.name, url: this.__safeUrl },
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Remove any userinfo credentials that leaked into `text` — both the
   * raw credentialed URL (which a chained `fetch` error can echo in its
   * own message) and the bare `user:token` userinfo. A no-op when the
   * configured URL carries no credentials.
   *
   * @param text - The message about to be surfaced in an error.
   * @returns The message with credentials redacted.
   */
  private __scrub(text: string): string {
    if (!this.__urlUserinfo) {
      return text;
    }
    return text
      .replaceAll(this.__url, this.__safeUrl)
      .replaceAll(this.__urlUserinfo, '[redacted]');
  }

  /**
   * Strip any userinfo (`user:password@`) from `url` for safe display
   * in error messages and context. Returns the input unchanged when it
   * carries no credentials or can't be parsed.
   *
   * @param url - The configured target URL.
   * @returns The URL with credentials removed.
   */
  private static __redactUrl(url: string): string {
    try {
      const parsed = new URL(url);
      if (!parsed.username && !parsed.password) {
        return url;
      }
      parsed.username = '';
      parsed.password = '';
      return parsed.toString();
    } catch {
      // Unparseable URL (the invalid-URL constructor branch): `new URL`
      // failed, so fall back to a best-effort regex scrub of any
      // `//user:pass@` userinfo. Without this an invalid-but-credentialed
      // URL would leak verbatim into the SloggerConfigError.
      return url.replace(/(\/\/)[^/@\s]+@/, '$1[redacted]@');
    }
  }

  /**
   * Extract the `user:token` userinfo from `url`, or `''` when it has
   * no credentials or can't be parsed.
   *
   * @param url - The configured target URL.
   * @returns The userinfo substring, or an empty string.
   */
  private static __extractUserinfo(url: string): string {
    try {
      const parsed = new URL(url);
      if (!parsed.username && !parsed.password) {
        return '';
      }
      return parsed.password
        ? `${parsed.username}:${parsed.password}`
        : parsed.username;
    } catch {
      return '';
    }
  }

  /**
   * Drop-oldest enforcement of the `maxBufferSize` cap. Called after
   * every queue growth (new log pushed, failed batch restored).
   * Oldest records are the least likely to still matter by the time
   * the endpoint recovers, and dropping from the head preserves the
   * newest data; every drop is counted in {@link droppedLogCount}.
   */
  private __enforceBufferCap(): void {
    const overflow = this._logs.length - this.__maxBufferSize;
    if (overflow > 0) {
      this._logs.splice(0, overflow);
      this.__droppedLogCount += overflow;
    }
  }
}
