import { STATUS_CODE, STATUS_TEXT, type StatusCode } from '$http/status';
import { parse as XMLParse, stringify as XMLStringify } from '$xml';
import * as path from '$path';
import { type EventOptionsKeys, Options } from '@tundralibs/utils';
import type {
  RESTlerEndpoint,
  RESTlerEvents,
  RESTlerMethodPayload,
  RESTlerOptions,
  RESTlerRequest,
  RESTlerRequestOptions,
  RESTlerResponse,
} from './types/mod.ts';
import {
  RESTlerConfigError,
  RESTlerError,
  RESTlerRequestError,
  RESTlerTimeoutError,
} from './errors/mod.ts';
import { ResponseBody } from './types/Response.ts';

/**
 * Abstract base class for making RESTful API calls.
 *
 * RESTler provides a foundation for implementing client libraries for REST APIs.
 * It supports various HTTP methods, content types, and both standard HTTP and Unix socket communication.
 *
 * @example
 * ```typescript
 * class MyAPIClient extends RESTler {
 *   public readonly vendor = "MyAPI";
 *
 *   constructor(options: RESTlerOptions) {
 *     super(options, { timeout: 30 });
 *   }
 *
 *   async getUser(id: string) {
 *     return this._makeRequest({
 *       path: `/users/${id}`,
 *     }, { method: 'GET' });
 *   }
 * }
 * ```
 *
 * @template O Type extending RESTlerOptions for custom configuration
 */
export abstract class RESTler<O extends RESTlerOptions = RESTlerOptions>
  extends Options<O, RESTlerEvents> {
  /**
   * Vendor identifier for the API client implementation.
   * Used in error messages and logging to identify the API provider.
   */
  public abstract readonly vendor: string;

  /** TLS configuration for secure connections */
  protected _tls?: { caCerts: string[] } | { cert: string; key: string };

  /** Default headers to include with every request */
  protected _defaultHeaders: Record<string, string> = {};

  /**
   * HTTP status codes that should be treated as authentication errors
   */
  protected _authStatus: StatusCode[] = [
    STATUS_CODE.Unauthorized,
    STATUS_CODE.Forbidden,
    STATUS_CODE.ProxyAuthRequired,
  ];

  /**
   * HTTP status codes that indicate rate limiting
   */
  protected _rateLimitStatus: StatusCode[] = [
    STATUS_CODE.TooManyRequests,
  ];

  /**
   * Creates a new RESTler instance.
   *
   * @param options - Configuration options for the REST client
   * @param defaults - Default options to apply if not specified in options
   */
  constructor(
    options: EventOptionsKeys<O>,
    defaults?: Partial<O>,
  ) {
    super(options, {
      ...{
        timeout: 10,
        contentType: 'JSON',
      },
      ...defaults,
    } as Partial<O>);
    if (this.hasOption('tls')) {
      const opt = this.getOption('tls');
      if (typeof opt === 'string') {
        this._tls = { caCerts: [Deno.readTextFileSync(opt)] };
      } else if (typeof opt === 'object') {
        this._tls = {
          cert: Deno.readTextFileSync(opt.certificate),
          key: Deno.readTextFileSync(opt.key),
        };
      }
    }
    this._defaultHeaders = this.getOption('headers') || {};
  }

  /**
   * Hook method for implementing authentication logic.
   * Subclasses should override this method to add authentication headers or perform
   * authentication requests before making the actual API call.
   *
   * @param request - The endpoint configuration
   * @param options - Request options and payload
   * @returns Void or Promise<void> if async authentication is needed
   */
  protected _authInjector(
    // deno-lint-ignore no-unused-vars
    request: RESTlerEndpoint,
    // deno-lint-ignore no-unused-vars
    options: RESTlerMethodPayload & RESTlerRequestOptions,
  ): void | Promise<void> {
    return;
  }

  /**
   * Makes a request to the specified endpoint with the given options.
   * Handles authentication, request preparation, and response parsing.
   *
   * @param endpoint - The endpoint configuration (path, baseURL, etc.)
   * @param options - Request options including method and payload
   * @returns Promise resolving to a typed response
   * @throws {RESTlerTimeoutError} If the request times out
   * @throws {RESTlerRequestError} If there's an error making the request
   * @throws {RESTlerError} For other REST-related errors
   */
  protected async _makeRequest<B extends ResponseBody>(
    endpoint: RESTlerEndpoint,
    options: RESTlerMethodPayload & RESTlerRequestOptions,
  ): Promise<RESTlerResponse<B>> {
    await this._authInjector(endpoint, options);
    const request = this._processEndpoint(endpoint, options);
    const response: RESTlerResponse<B> = {
      url: request.url,
      status: null,
      statusText: null,
      timeTaken: 0,
    };
    const start = performance.now();
    try {
      if (this.getOption('socketPath')) {
        const resp = await this._makeUnixSocketRequest(request);
        response.status = resp.status as StatusCode;
        response.statusText = STATUS_TEXT[resp.status as StatusCode] ||
          'Unknown';
        response.headers = resp.headers;
        response.body = resp.body as B;
      } else {
        const resp = await this._makeFetchRequest(request);
        response.status = resp.status as StatusCode;
        response.statusText = STATUS_TEXT[resp.status as StatusCode] ||
          'Unknown';
        response.headers = Object.fromEntries(resp.headers.entries());
        const contentType = resp.headers.get('content-type');
        const body = await resp.text();
        response.body = this._parseResponseBody<B>(body, contentType);
      }
      response.timeTaken = performance.now() - start;

      // Check for authentication failure
      if (response.status && this._authStatus.includes(response.status)) {
        this.emit('authFailure', this.vendor, request, response);
      }

      // Check for rate limiting
      if (response.status && this._rateLimitStatus.includes(response.status)) {
        // Extract rate limit information from headers
        const limit = this._extractHeaderNumber(
          response.headers,
          'x-ratelimit-limit',
          'ratelimit-limit',
        );
        const remaining = this._extractHeaderNumber(
          response.headers,
          'x-ratelimit-remaining',
          'ratelimit-remaining',
        );
        const reset = this._extractHeaderNumber(
          response.headers,
          'x-ratelimit-reset',
          'ratelimit-reset',
        );

        this.emit('rateLimit', this.vendor, limit, reset, remaining);
      }

      return response;
    } catch (error) {
      response.timeTaken = performance.now() - start;
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          response.error = new RESTlerTimeoutError(
            {
              vendor: this.vendor,
              request: request,
            },
          );
        } else if (error instanceof RESTlerError) {
          response.error = error;
        } else {
          response.error = new RESTlerRequestError(
            'Unknown error processing the request',
            {
              vendor: this.vendor,
              request: request,
            },
            error,
          );
        }
      } else {
        response.error = new RESTlerRequestError(
          'Unknown error processing the request',
          {
            vendor: this.vendor,
            request: request,
          },
        );
      }
      throw response.error;
    } finally {
      this.emit('call', this.vendor, request, response);
    }
  }

  /**
   * Extracts a numeric value from headers, checking multiple possible header names.
   * Used for extracting rate limit information from response headers.
   *
   * @param headers - Response headers
   * @param ...headerNames - Possible header names to check (case-insensitive)
   * @returns The numeric value from the header, or undefined if not found or not a number
   */
  protected _extractHeaderNumber(
    headers: Record<string, string> | undefined,
    ...headerNames: string[]
  ): number | undefined {
    if (!headers) return undefined;

    // Convert headers to lowercase for case-insensitive search
    const lowercaseHeaders: Record<string, string> = {};
    Object.entries(headers).forEach(([key, value]) => {
      lowercaseHeaders[key.toLowerCase()] = value;
    });

    // Try each header name
    for (const name of headerNames) {
      const value = lowercaseHeaders[name.toLowerCase()];
      if (value) {
        const numValue = Number(value);
        if (!isNaN(numValue)) {
          return numValue;
        }
      }
    }

    return undefined;
  }

  /**
   * Processes an endpoint configuration to create a complete request object.
   * Handles URL construction, version substitution, and header preparation.
   *
   * @param endpoint - The endpoint configuration to process
   * @param options - Request options and payload
   * @returns A complete request object ready to be executed
   * @throws {Error} If the endpoint configuration is invalid
   */
  protected _processEndpoint(
    endpoint: RESTlerEndpoint,
    options: RESTlerMethodPayload & RESTlerRequestOptions,
  ): RESTlerRequest {
    if (endpoint.baseURL && this._validateBaseURL(endpoint.baseURL) === false) {
      throw new Error('Invalid endpoint baseURL');
    }
    const version = endpoint.version || this.getOption('version') || '';
    const baseURL = endpoint.baseURL || this.getOption('baseURL');
    const headers: Record<string, string> = this._defaultHeaders;
    const port = endpoint.port || this.getOption('port');
    if (endpoint.port && !this._validatePort(endpoint.port)) {
      // Validate port!!!
      throw new Error('Invalid port');
    }
    if (endpoint.basicAuth) {
      const { username, password } = endpoint.basicAuth;
      if (!username || !password) {
        throw new Error('Basic auth requires a username and password');
      }
      headers['Authorization'] = `Basic ${btoa(`${username}:${password}`)}`; //NOSONAR
    }
    if (endpoint.bearerToken) {
      headers['Authorization'] = `Bearer ${endpoint.bearerToken}`;
    }
    if (options.headers) {
      Object.entries(options.headers).forEach(([key, value]) => {
        headers[key] = this._replaceVersion(value, version);
      });
    }
    const url = new URL(this._replaceVersion(baseURL, version));
    url.pathname = path.join(
      url.pathname,
      this._replaceVersion(endpoint.path, version),
    );
    if (endpoint.query) {
      Object.entries(endpoint.query).forEach(([key, value]) => {
        url.searchParams.set(key, this._replaceVersion(value, version));
      });
    }
    if (port) {
      url.port = port.toString();
    }
    return {
      url: url.toString(),
      headers: headers,
      timeout: options.timeout || this.getOption('timeout'),
      method: options.method,
      contentType: 'contentType' in options ? options.contentType : undefined,
      payload: 'payload' in options ? options.payload : undefined,
    } as RESTlerRequest;
  }

  /**
   * Makes a request using the fetch API.
   * Handles headers, payload formatting, and timeout settings.
   *
   * @param request - The prepared request object
   * @returns Promise resolving to a fetch Response
   */
  protected async _makeFetchRequest(
    request: RESTlerRequest,
  ): Promise<Response> {
    const headers = new Headers(request.headers);
    const abortSignal = new AbortController();
    let client: Deno.HttpClient | undefined = undefined;
    if (this._tls) {
      client = Deno.createHttpClient(this._tls);
    }
    let payload: BodyInit | undefined = undefined;
    if ('contentType' in request) {
      switch (request.contentType) {
        case 'JSON':
          payload = JSON.stringify(request.payload);
          break;
        case 'XML':
          payload = XMLStringify(request.payload as Record<string, unknown>);
          break;
        case 'BLOB':
          payload = request.payload as BodyInit;
          break;
        case 'FORM':
          // Dont set headers, let fetch set it
          headers.delete('Content-Type');
          payload = request.payload as FormData;
          break;
        case 'TEXT':
          payload = request.payload as BodyInit;
          break;
      }
    }
    const init: RequestInit & { client?: Deno.HttpClient } = {
      method: request.method,
      headers: headers,
      body: payload,
      signal: abortSignal.signal,
      cache: 'no-store',
      redirect: 'follow',
      client: client,
    };
    const timeoutId = setTimeout(() => {
      abortSignal.abort();
    }, request.timeout * 1000);
    try {
      return await fetch(request.url, init);
    } finally {
      clearTimeout(timeoutId);
      if (client) {
        client.close();
      }
    }
  }

  /**
   * Makes a request to a Unix socket.
   * Used when socketPath option is provided.
   *
   * @param request - The prepared request object
   * @returns Promise resolving to a response object
   * @throws {RESTlerRequestError} If there's an error communicating with the socket
   */
  protected async _makeUnixSocketRequest( //NOSONAR
    request: RESTlerRequest,
  ): Promise<
    { status: StatusCode; body: ResponseBody; headers: Record<string, string> }
  > {
    try {
      // Prepare request headers and body
      request.headers = request.headers || {};
      request.headers['Host'] = 'localhost';
      request.headers['Connection'] = 'close';

      let body = '';
      // Handle different content types
      if ('contentType' in request && request.payload !== undefined) {
        switch (request.contentType) {
          case 'JSON':
            body = JSON.stringify(request.payload);
            request.headers['Content-Type'] = 'application/json';
            break;
          case 'XML':
            body = XMLStringify(request.payload as Record<string, unknown>);
            request.headers['Content-Type'] = 'application/xml';
            break;
          case 'FORM':
            body = this._objectToUrlEncoded(
              request.payload as Record<string, string>,
            );
            request.headers['Content-Type'] =
              'application/x-www-form-urlencoded';
            break;
          case 'TEXT':
            body = typeof request.payload === 'string'
              ? request.payload
              : String(request.payload);
            request.headers['Content-Type'] = 'text/plain';
            break;
          default:
            body = JSON.stringify(request.payload);
            if (!request.headers['Content-Type']) {
              request.headers['Content-Type'] = 'application/json';
            }
        }
      } else if ('payload' in request && request.payload !== undefined) {
        // Default to JSON if contentType is not specified
        body = JSON.stringify(request.payload);
        if (!request.headers['Content-Type']) {
          request.headers['Content-Type'] = 'application/json';
        }
      }

      request.headers['Content-Length'] = body.length.toString();

      // Format the HTTP request
      const finalRequest = `${request.method} ${request.url} HTTP/1.1\r\n${
        Object.entries(request.headers).map(([key, val]) => `${key}: ${val}`)
          .join('\r\n')
      }\r\n\r\n${body}`;

      // Send request to socket and get response
      const resp = await this._communicateWithUnixSocket(finalRequest);

      // Parse response
      const [headerText, ...bodyParts] = resp.split('\r\n\r\n');
      if (!headerText) {
        throw new RESTlerRequestError(
          'Invalid response from Unix socket',
          { vendor: this.vendor, request: request },
        );
      }

      const headerLines = headerText.split('\r\n');
      const statusLine = headerLines[0];

      if (!statusLine) {
        throw new RESTlerRequestError(
          'Invalid response status line from Unix socket',
          { vendor: this.vendor, request: request },
        );
      }

      const statusMatch = statusLine.match(/HTTP\/\d\.\d\s+(\d+)\s+(.*)$/);
      if (!statusMatch) {
        throw new RESTlerRequestError(
          'Could not parse status code from response',
          { vendor: this.vendor, request: request },
        );
      }

      const status = parseInt(statusMatch[1]!) as StatusCode;

      const headers = headerLines.slice(1).reduce(
        (acc: Record<string, string>, currentLine) => {
          const colonIndex = currentLine.indexOf(': ');
          if (colonIndex > 0) {
            const key = currentLine.slice(0, colonIndex).trim();
            const value = currentLine.slice(colonIndex + 2).trim();
            acc[key] = value;
          }
          return acc;
        },
        {},
      );

      const rawBody = bodyParts.join('\r\n\r\n');
      const decodedResponse = this._decodeChunkedResponse(rawBody);

      const processedBody = this._parseResponseBody(
        decodedResponse,
        headers['content-type'],
      );

      return {
        headers,
        status,
        body: processedBody,
      };
    } catch (error) {
      if (error instanceof RESTlerError) {
        throw error;
      }
      throw new RESTlerRequestError(
        'Error communicating with Unix socket',
        { vendor: this.vendor, request: request },
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Handles the communication with a Unix socket.
   *
   * @param requestData - The formatted HTTP request data to send
   * @returns The raw HTTP response as a string
   * @throws {Error} If there's an error communicating with the socket
   */
  protected async _communicateWithUnixSocket(
    requestData: string,
  ): Promise<string> {
    const enc = new TextEncoder();
    const dec = new TextDecoder();

    try {
      using socket = await Deno.connect({
        transport: 'unix',
        path: this.getOption('socketPath') as string,
      });

      await socket.write(enc.encode(requestData));

      let resp = '';
      const buffer = new Uint8Array(1024);
      let bytesRead;

      while ((bytesRead = await socket.read(buffer)) !== null) {
        resp += dec.decode(buffer.subarray(0, bytesRead));
      }

      return resp;
    } catch (error) {
      throw new Error('Socket communication error: ' + error, { cause: error });
    }
  }

  /**
   * Decodes a chunked HTTP response.
   *
   * @param response - The raw response string that may be chunked
   * @returns The decoded response body
   */
  private _decodeChunkedResponse(response: string): string {
    // Check if the response is chunked by looking for chunk size indicators
    if (!/^[0-9a-f]+\r\n/i.test(response)) {
      return response; // Not chunked, return as is
    }

    const lines = response.split('\r\n');
    let body = '';

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue;

      const chunkSize = parseInt(line, 16);
      if (isNaN(chunkSize)) {
        body += line + '\r\n';
      } else if (chunkSize === 0) {
        // End of chunked response
        break;
      } else {
        i++; //NOSONAR
        if (i < lines.length) {
          body += lines[i]!.substring(0, chunkSize);
        }
      }
    }

    return body;
  }

  /**
   * Converts an object to a URL-encoded string.
   *
   * @param data - The data object to encode
   * @returns URL-encoded string
   */
  private _objectToUrlEncoded(data: Record<string, string>): string {
    return Object.entries(data)
      .map(([key, value]) =>
        `${encodeURIComponent(key)}=${encodeURIComponent(value)}`
      )
      .join('&');
  }

  /**
   * Parses a response body based on content type.
   *
   * @param body - The response body as string
   * @param contentType - Content-Type header value
   * @returns Parsed response body
   */
  protected _parseResponseBody<B extends ResponseBody>(
    body: string,
    contentType: string | null | undefined,
  ): B {
    try {
      if (!contentType || contentType === '' || contentType.includes('text')) {
        // If content type is not specified, try to parse as JSON
        try {
          return JSON.parse(body) as B;
        } catch {
          return body as unknown as B;
        }
      } else if (contentType.includes('json')) {
        return JSON.parse(body) as B;
      } else if (contentType.includes('xml')) {
        return XMLParse(body) as unknown as B;
      } else {
        // For any other content type, return as is
        return body as unknown as B;
      }
    } catch {
      // If parsing fails, return the raw decoded response
      return body as unknown as B;
    }
  }

  /**
   * Replaces {version} placeholder in a string with the provided version.
   *
   * @param param - The string containing potential version placeholders
   * @param version - Version string to insert (defaults to empty string)
   * @returns String with version placeholders replaced
   */
  protected _replaceVersion(param: string, version: string = ''): string {
    const versionRegex = /{version}/g;
    return param.replace(versionRegex, version);
  }

  /**
   * Processes and validates configuration options.
   *
   * @param key - Option key
   * @param value - Option value
   * @returns Processed option value
   * @throws {RESTlerConfigError} If the option value is invalid
   */
  protected override _processOption<K extends keyof RESTlerOptions>(
    key: K,
    value: O[K],
  ): O[K] {
    switch (key) {
      case 'baseURL':
        if (!this._validateBaseURL(value)) {
          throw new RESTlerConfigError(
            `Base URL must be a string and not empty.`,
            { vendor: this.vendor, key: key, value: value },
          );
        }
        break;
      case 'version':
        if (!this._validateVersion(value)) {
          throw new RESTlerConfigError(
            `Version must be a string.`,
            { vendor: this.vendor, key: key, value: value },
          );
        }
        break;
      case 'port':
        if (!this._validatePort(value)) {
          throw new RESTlerConfigError(
            `Port must be a number between 1 and 65535.`,
            { vendor: this.vendor, key: key, value: value },
          );
        }
        break;
      case 'timeout':
        if (!this._validateTimeout(value)) {
          throw new RESTlerConfigError(
            `Timeout must be a number greater than 0 and less than 60.`,
            { vendor: this.vendor, key: key, value: value },
          );
        }
        break;
      case 'contentType':
        if (!this._validateContentType(value)) {
          throw new RESTlerConfigError(
            `Content type must be one of: JSON, XML, FORM, TEXT, BLOB, ARRAY_BUFFER, STREAM.`,
            { vendor: this.vendor, key: key, value: value },
          );
        }
        break;
      case 'headers':
        if (!this._validateHeaders(value)) {
          throw new RESTlerConfigError(
            `Headers must be an object.`,
            { vendor: this.vendor, key: key, value: value },
          );
        }
        break;
      case 'socketPath':
        if (!this._validateSocketPath(value)) {
          throw new RESTlerConfigError(
            `Socket path must be a string and point to a valid file.`,
            { vendor: this.vendor, key: key, value: value },
          );
        }
        break;
      case 'tls':
        if (!this._validateTls(value)) {
          throw new RESTlerConfigError(
            `TLS must be a string or an object with certificate and key.`,
            { vendor: this.vendor, key: key, value: value },
          );
        }
        break;
    }
    return super._processOption(key, value) as O[K];
  }

  /**
   * Validates a baseURL option value.
   *
   * @param value - Value to validate
   * @returns Whether the value is valid
   */
  protected _validateBaseURL(
    value: unknown,
  ): value is RESTlerOptions['baseURL'] {
    if (typeof value === 'string') {
      try {
        const a = new URL(value);
        if (a.protocol !== 'http:' && a.protocol !== 'https:') {
          return false;
        }
        if (a.host === '') {
          return false;
        }
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }

  /**
   * Validates a port option value.
   *
   * @param value - Value to validate
   * @returns Whether the value is valid
   */
  protected _validatePort(value: unknown): value is RESTlerOptions['port'] {
    if (value === undefined || value === null) return true;
    return typeof value === 'number' && (value > 0 && value <= 65535);
  }

  /**
   * Validates a version option value.
   *
   * @param value - Value to validate
   * @returns Whether the value is valid
   */
  protected _validateVersion(
    value: unknown,
  ): value is RESTlerOptions['version'] {
    return (
      !value || (typeof value === 'string' && value.length > 0)
    );
  }

  /**
   * Validates a timeout option value.
   *
   * @param value - Value to validate
   * @returns Whether the value is valid
   */
  protected _validateTimeout(
    value: unknown,
  ): value is RESTlerOptions['timeout'] {
    if (value === undefined || value === null) return true;
    return (typeof value === 'number' && value >= 1 && value <= 60);
  }

  /**
   * Validates a contentType option value.
   *
   * @param value - Value to validate
   * @returns Whether the value is valid
   */
  protected _validateContentType(
    value: unknown,
  ): value is RESTlerOptions['contentType'] {
    return (
      !value || (typeof value === 'string' &&
        ['JSON', 'XML', 'FORM', 'TEXT', 'BLOB', 'ARRAY_BUFFER', 'STREAM']
          .includes(value.toUpperCase()))
    );
  }

  /**
   * Validates a headers option value.
   *
   * @param value - Value to validate
   * @returns Whether the value is valid
   */
  protected _validateHeaders(
    value: unknown,
  ): value is RESTlerOptions['headers'] {
    return (
      !value || (typeof value === 'object' && value !== null)
    );
  }

  /**
   * Validates a socketPath option value.
   *
   * @param value - Value to validate
   * @returns Whether the value is valid
   */
  protected _validateSocketPath(
    value: unknown,
  ): value is RESTlerOptions['socketPath'] {
    if (!value) {
      return true;
    }
    if (typeof value === 'string') {
      try {
        Deno.statSync(value);
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }

  /**
   * Validates a TLS option value.
   *
   * @param value - Value to validate
   * @returns Whether the value is valid
   */
  protected _validateTls(
    value: unknown,
  ): value is RESTlerOptions['tls'] {
    if (!value) {
      return true;
    }
    if (typeof value === 'string') {
      try {
        Deno.statSync(value);
        return true;
      } catch {
        return false;
      }
    }
    if (
      typeof value === 'object' && 'certificate' in value && 'key' in value &&
      typeof value.certificate === 'string' && typeof value.key === 'string'
    ) {
      try {
        Deno.statSync(value.certificate);
        Deno.statSync(value.key);
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }
}
