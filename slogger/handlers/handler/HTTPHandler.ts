import { jsonFormatter } from '../../formatters/mod.ts';
import type { SlogObject } from '../../types/Object.ts';
import { AbstractHandler, type HandlerOptions } from '../AbstractHandler.ts';

/**
 * Configuration options for the HTTP handler
 * @property url - Target URL for sending log messages
 * @property method - HTTP method to use (POST, PUT, or PATCH)
 * @property batchSize - Number of log messages to batch before sending
 * @property headers - Additional HTTP headers to include in requests
 */
export type HTTPHandlerOptions = HandlerOptions & {
  url: string;
  method: 'POST' | 'PUT';
  headers?: Record<string, string>;
  batchSize: number;
};

/**
 * HTTP Handler for sending log messages to a remote endpoint
 *
 * This handler batches log messages and sends them as JSON to a specified
 * HTTP endpoint. It's useful for centralized logging systems or log aggregation.
 */
export class HTTPHandler extends AbstractHandler {
  public readonly mode = 'http';
  private _url: string;
  private _method: 'POST' | 'PUT' | 'PATCH';
  private _batchSize: number;
  private _headers: Record<string, string>;

  protected _logs: Array<string> = [];

  /**
   * Creates a new HTTP handler instance
   *
   * @param options - Configuration options for the handler
   * @throws Error if any of the required options are invalid
   */
  constructor(name: string, options: HTTPHandlerOptions) {
    options.formatter = options.formatter ?? jsonFormatter;
    options.headers = options.headers ?? {};
    super(name, options);

    // Validate URL
    if (!options.url || typeof options.url !== 'string') {
      throw new Error('HTTPHandler requires a valid URL string');
    }
    try {
      new URL(options.url); // Will throw if URL is invalid
    } catch (_e) {
      throw new Error(`Invalid URL provided to HTTPHandler: ${options.url}`);
    }
    this._url = options.url;
    const host = new URL(this._url).host;
    const r = Deno.permissions.requestSync({
      name: 'net',
      host: host,
    });
    if (r.state === 'denied') {
      throw new Error(
        `Permission denied for network access to ${host}`,
      );
    }

    // Validate method
    if (!options.method || !['POST', 'PUT'].includes(options.method)) {
      throw new Error(
        'HTTPHandler requires a valid HTTP method (POST or PUT)',
      );
    }
    this._method = options.method;

    // Validate batchSize
    const batchSize = options.batchSize ?? 1;
    if (!Number.isInteger(batchSize) || batchSize < 1) {
      throw new Error('HTTPHandler batchSize must be a positive integer');
    }
    this._batchSize = batchSize;

    // Validate headers
    if (options.headers && typeof options.headers !== 'object') {
      throw new Error('HTTPHandler headers must be a valid object if provided');
    }
    this._headers = options.headers ?? {};
  }

  /**
   * Finalizes the handler by sending any remaining logs
   * and calling the parent finalize method
   */
  public override async finalize(): Promise<void> {
    await this._sendLogs();
    await super.finalize();
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
   */
  protected async _handle(message: string): Promise<void> {
    this._logs.push(message);
    if (this._logs.length >= this._batchSize) {
      await this._sendLogs();
    }
  }

  /**
   * Sends batched log messages to the configured HTTP endpoint
   * Clears the log queue after sending
   */
  protected async _sendLogs(): Promise<void> {
    if (this._logs.length === 0) {
      return;
    }
    const body = JSON.stringify(this._logs);
    this._logs = [];
    const headers = new Headers({ 'Content-Type': 'application/json' });
    for (const [key, value] of Object.entries(this._headers)) {
      headers.set(key, value);
    }
    await fetch(this._url, {
      method: this._method,
      headers: headers,
      body,
    });
  }
}
