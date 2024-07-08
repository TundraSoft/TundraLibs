/// <reference lib="deno.unstable" />

import { path, semver, type StatusCode, XMLParse } from '../dependencies.ts';
import { HTTPMethods } from '../utils/mod.ts';
import { Options } from '../options/mod.ts';
import type { OptionKeys } from '../options/mod.ts';
import type {
  RESTlerEndpoint,
  RESTlerEvents,
  RESTlerOptions,
  RESTlerRequest,
  RESTlerResponse,
  RESTlerResponseBody,
  RESTlerResponseHandler,
} from './types/mod.ts';

import {
  RESTlerAuthFailure,
  RESTlerBaseError,
  RESTlerTimeoutError,
  RESTlerUnhandledError,
  RESTlerUnsupportedContentType,
} from './errors/mod.ts';

/**
 * The base class for all RESTler classes. This class is not meant to be
 * instantiated directly. Instead, it is meant to be extended by other classes
 * that implement the RESTler interface.
 *
 * @typeParam O - The type of the options object
 */
export abstract class RESTler<
  O extends RESTlerOptions = RESTlerOptions,
> extends Options<O, RESTlerEvents> {
  protected _name: string;
  protected _defaultHeaders: Record<string, string>;
  protected _authStatus = [401, 403, 407];
  protected _authInitiated = false;
  protected _socketConnection: Deno.UnixConn | undefined;

  /**
   * Creates an instance of RESTler.
   *
   * @param name string - The name of the RESTler instance
   * @param config OptionKeys<O, RESTlerEvents> - The options object
   */
  constructor(
    name: string,
    config: OptionKeys<O, RESTlerEvents>,
    defaults?: Partial<O>,
  ) {
    const def: Partial<O> = {
      timeout: 30000,
      isUnixSocket: false,
    } as Partial<O>;
    super(config, { ...def, ...defaults });
    this._name = name.trim();
    this._defaultHeaders = this._getOption('defaultHeaders') || {};
  }

  /**
   * Gets the name of the RESTler instance
   */
  get name(): string {
    return this._name;
  }
  /**
   * Helper method to build the RESTlerEndpoint object
   *
   * @param method HTTPMethod - The HTTP Method
   * @param location string - The URL path string
   * @param searchParams Record<string, string> - The URL search params. We do not use URLSearchParams to keep logging easy
   * @param version string - The API version. If not mentioned, defaults to the version provided in the options
   * @returns RESTlerEndpoint - The RESTlerEndpoint object
   */
  protected _buildEndpoint(
    method: HTTPMethods,
    location: string,
    searchParams?: Record<string, string>,
    version?: string,
  ): RESTlerEndpoint {
    const endpoint: RESTlerEndpoint = {
      method: method,
      baseURL: this._getOption('endpointURL'),
      path: location,
      version: version || this._getOption('version'),
    };
    if (searchParams) {
      endpoint.searchParams = searchParams;
    }
    return endpoint;
  }

  /**
   * Creates the URL string from the RESTlerEndpoint object
   *
   * @param endpoint RESTlerEndpoint - The RESTlerEndpoint object
   * @returns string The URL string
   */
  protected _makeURL(endpoint: RESTlerEndpoint): string {
    const url = new URL(
      path.join(endpoint.baseURL, endpoint.version || '', endpoint.path),
    );
    if (endpoint.searchParams) {
      const sp = new URLSearchParams(endpoint.searchParams);
      sp.sort();
      url.search = sp.toString();
    }
    return url.toString();
  }

  /**
   * Makes the API call basis configuration provided. It injects default headers,
   * performs auth injection and if auth fails (401), retries the request after trying
   * authentication
   *
   * @param options RESTlerRequest - The RESTlerRequest object
   * @returns RESTlerResponse - The RESTlerResponse object
   */
  protected async _makeRequest<
    RespBody extends RESTlerResponseBody = RESTlerResponseBody,
  >(
    request: RESTlerRequest,
    processResponse?: RESTlerResponseHandler,
  ): Promise<RESTlerResponse<RespBody>> {
    if (processResponse === undefined) {
      processResponse = this._processResponse.bind(this);
    }
    Object.assign(request.endpoint, {
      baseURL: request.endpoint.baseURL ?? this._getOption('endpointURL'),
      version: this._getOption('version'),
    });
    // Assign headers
    request.headers = { ...this._defaultHeaders, ...request.headers };
    // Create the URL
    const resp: RESTlerResponse<RespBody> = {
      endpoint: request.endpoint as RESTlerEndpoint,
      headers: {},
      status: 200,
      authFailure: false,
      timeTaken: 0,
    };
    let finalError: RESTlerBaseError | undefined;
    this.emit('request', request);
    // We now attempt to make the request, if it fails, we retry once
    const start = performance.now();
    try {
      if (this._getOption('isUnixSocket') === false) {
        const interimResp = await this.__doRequest(request);
        resp.timeTaken = performance.now() - start;
        resp.status = interimResp.status as StatusCode;
        resp.headers = Object.fromEntries(interimResp.headers.entries());
        // Call the response handler
        resp.body = await this._handleResponse<RespBody>(
          request.endpoint as RESTlerEndpoint,
          interimResp,
        );
      } else {
        const interimResp = await this.__makeSocketRequest<RespBody>(request);
        resp.timeTaken = performance.now() - start;
        resp.status = interimResp.status as StatusCode;
        resp.headers = interimResp.headers;
        // Call the response handler
        resp.body = interimResp.body;
      }
      // Check if it is an auth failure
      resp.authFailure = this._authStatus.includes(resp.status);
      if (resp.authFailure) {
        throw new RESTlerAuthFailure(
          resp.endpoint,
        );
      }
      return await processResponse(resp);
    } catch (e) {
      resp.timeTaken = performance.now() - start;
      if (e.name === 'AbortError') {
        // Emit timeout event
        this.emit('timeout', request);
        finalError = new RESTlerTimeoutError(
          this._getOption('timeout') as number,
          request.endpoint as RESTlerEndpoint,
        );
      } else if (e instanceof RESTlerAuthFailure) {
        // Emit authFailure event
        this.emit('authFailure', request);
        // We do not re-attempt for any error other than auth failure
        if (this._authInitiated === false) {
          this._authInitiated = true;
          try {
            await this._authenticate(request);
            // Retry the request
            return await this._makeRequest<RespBody>(request);
          } finally {
            this._authInitiated = false;
          }
        }
        finalError = e;
      } else if (!(e instanceof RESTlerBaseError)) {
        finalError = new RESTlerUnhandledError(
          e.message,
          request.endpoint as RESTlerEndpoint,
          e,
        );
      } else {
        finalError = e;
      }
      // Emit error event
      throw finalError;
    } finally {
      // We set the authInitiated flag to false here to prevent perpetual loop
      this._authInitiated = false;
      this.emit('response', request, resp as RESTlerResponse, finalError);
    }
  }

  //#region Override these methods
  /**
   * Handles the response object and returns the body
   *
   * @remarks
   * This method takes care of parsing the response body and returning it. Do not
   * override unless you know what you are doing.
   *
   * @param endpoint RESTlerEndpoint - The RESTlerEndpoint object
   * @param response Response - The response object
   * @returns RespBody - The response body
   */
  protected async _handleResponse<
    RespBody extends RESTlerResponseBody = Record<string, unknown>,
  >(
    endpoint: RESTlerEndpoint,
    response: Response,
  ): Promise<RespBody> {
    try {
      const contentType = response.headers.get('content-type');
      if (!contentType) {
        const resp = await response.text();
        try {
          return JSON.parse(resp) as RespBody;
        } catch {
          return resp as unknown as RespBody;
        }
      } else if (
        contentType.includes('application/json') || contentType.includes('json')
      ) {
        return await response.json() as RespBody;
      } else if (
        contentType.includes('text/xml') ||
        contentType.includes('application/xml') ||
        contentType.includes('xml') ||
        contentType.includes('application/soap+xml')
      ) {
        return XMLParse(await response.text()) as unknown as RespBody;
      } else if (contentType.includes('text')) {
        const t = await response.text();
        try {
          return JSON.parse(t) as RespBody;
        } catch {
          return t as unknown as RespBody;
        }
      } else {
        // Ensure we discard the body
        throw new RESTlerUnsupportedContentType(
          contentType,
          endpoint,
        );
      }
    } finally {
      if (response.bodyUsed === false) {
        response.body?.cancel();
      }
    }
  }

  /**
   * Handles the response object and handles all sorts of errors
   *
   * @remarks
   * This method takes care of processing of the response after the content type of the response is handled.
   * It can be used to handle all sorts of errors
   * @param response RESTlerResponse<RespBody> - The RESTlerResponse<RespBody> object
   * @param response Response - The response object
   * @returns void
   */
  protected _processResponse<
    RespBody extends RESTlerResponseBody = RESTlerResponseBody,
  >(
    response: RESTlerResponse<RespBody>,
  ): RESTlerResponse<RespBody> | Promise<RESTlerResponse<RespBody>> {
    return response;
  }

  /**
   * The method that injects authentication into the request. This method is meant
   * to be overridden by the child classes.
   *
   * @remarks
   * This method is meant to be overridden by the child classes.
   *
   * @param request RESTlerRequest - The RESTlerRequest object
   */
  protected _authInjector(
    // deno-lint-ignore no-unused-vars
    request: RESTlerRequest,
  ): void | Promise<void> {
    // Do nothing
  }

  /**
   * The method that performs authentication. This method is meant to be overridden
   * by the child classes.
   *
   * @remarks
   * This method is meant to be overridden by the child classes. **NOTE** You need to emit 'auth' event here!!!
   * @param request RESTlerRequest - The RESTlerRequest object
   */
  protected _authenticate(_request: RESTlerRequest): void | Promise<void> {
    // Do nothing
    this.emit('auth', {});
  }

  /**
   * _stringifyBody
   *
   * A helper method that converts the body object into a string. Override this in implementation to either
   * handle other content types or to handle other body types
   *
   * @param body The body object
   * @returns string The strigified body
   */
  protected _stringifyBody(
    body: Record<string, unknown> | Record<string, unknown>[],
  ): string {
    return JSON.stringify(body);
  }

  protected _makeRequestBody(
    body: FormData | string | Record<string, unknown> | Record<
      string,
      unknown
    >[],
  ): string | FormData {
    if (body instanceof FormData) {
      return body;
    } else if (typeof body === 'string') {
      return body;
    } else {
      return this._stringifyBody(body);
    }
  }

  //#endregion Override these methods
  //#region Private methods
  // Templorarily make this protected.
  protected _httpClientOptions(): Deno.HttpClient | undefined {
    if (this._hasOption('certChain') || this._hasOption('certKey')) {
      // @Version check - Remove later on
      const ver = semver.parse(Deno.version.deno);
      if (semver.lessThan(ver, semver.parse('1.41.0'))) {
        const cert: Record<string, string | undefined> = {};
        cert.certChain = this._getOption('certChain');
        cert.privateKey = this._getOption('certKey');
        return Deno.createHttpClient(cert);
      } else {
        const cert: Record<string, string | undefined> = {};
        cert.cert = this._getOption('certChain');
        cert.key = this._getOption('certKey');
        return Deno.createHttpClient(cert);
      }
    }
    return undefined;
  }

  private async __doRequest(request: RESTlerRequest): Promise<Response> {
    await this._authInjector(request);
    const endpoint = this._makeURL(request.endpoint as RESTlerEndpoint),
      controller = new AbortController(),
      timeout = setTimeout(
        () => controller.abort(),
        request.timeout || this._getOption('timeout'),
      );
    if (request.body instanceof FormData) {
      // Remove content-type header for FormData
      const h = new Headers(request.headers || {});
      h.delete('content-type');
      request.headers = Object.fromEntries(h.entries());
    }
    const fetchOptions: RequestInit & { client?: Deno.HttpClient } = {
      method: request.endpoint.method,
      headers: request.headers,
      signal: controller.signal,
      body: request.body ? this._makeRequestBody(request.body) : undefined,
      client: this._httpClientOptions(),
    };
    try {
      return await fetch(endpoint, fetchOptions);
    } finally {
      clearTimeout(timeout);
      if (fetchOptions.client) {
        fetchOptions.client.close();
      }
    }
  }

  private async __makeSocketRequest<
    RespBody extends RESTlerResponseBody = RESTlerResponseBody,
  >(request: RESTlerRequest): Promise<RESTlerResponse<RespBody>> {
    await this._authInjector(request);
    request.endpoint.baseURL = 'http://localhost/';
    if (!request.headers) {
      request.headers = {};
    }
    request.headers['Host'] = 'localhost';
    request.headers['Connection'] = 'close';
    if (request.headers['Content-Type'] === undefined) {
      request.headers['Content-Type'] = 'application/json';
    }
    const endpoint = this._makeURL(request.endpoint as RESTlerEndpoint);
    const body = request.body ? JSON.stringify(request.body) : '';
    request.headers['Content-Length'] = body.length.toString();
    const finalRequest = `${request.endpoint.method} ${endpoint} HTTP/1.1\r\n${
      Object.entries(request.headers).map(([key, val]) => `${key}: ${val}`)
        .join(
          '\r\n',
        )
    }\r\n\r\n${body}`;
    const enc = new TextEncoder();
    const dec = new TextDecoder();
    using socket = await Deno.connect({
      transport: 'unix',
      path: this._getOption('endpointURL'),
    });
    await socket.write(enc.encode(finalRequest));
    let response = '';
    const buffer = new Uint8Array(1024);
    let bytesRead;
    while ((bytesRead = await socket.read(buffer)) !== null) {
      response += dec.decode(buffer.subarray(0, bytesRead));
    }
    // Convert to RESTler Response object
    const [headerText, ...bodyParts] = response.split('\r\n\r\n');
    const headerLines = headerText.split('\r\n');
    const statusLine = headerLines[0];
    return {
      endpoint: request.endpoint as RESTlerEndpoint,
      headers: (headerLines.slice(1).reduce(
        (acc: Record<string, string>, currentLine) => {
          const [key, value] = currentLine.split(': ');
          acc[key.trim()] = value.trim();
          return acc;
        },
        {},
      )),
      status: parseInt(statusLine.split(' ')[1]) as StatusCode,
      authFailure: false,
      timeTaken: 0,
      body: this.__decodeChunkedResponse(bodyParts.join('\r\n')) as RespBody,
    };
  }

  private __decodeChunkedResponse(response: string): Record<string, unknown> {
    const lines = response.split('\r\n');
    let body = '';
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const chunkSize = parseInt(line, 16);
      if (isNaN(chunkSize)) {
        body += line + '\r\n';
      } else {
        i++;
        body += lines[i].substring(0, chunkSize);
      }
    }
    try {
      return JSON.parse(body);
    } catch (_e) {
      return body as unknown as Record<string, unknown>;
    }
  }
}
