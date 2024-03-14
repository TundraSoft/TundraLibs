/// <reference lib="deno.unstable" />

import { HTTPMethods, path, semver, XMLParse } from '../dependencies.ts';

import { Options } from '../options/mod.ts';
import type { OptionKeys } from '../options/mod.ts';
import type {
  RESTlerEndpoint,
  RESTlerEvents,
  RESTlerOptions,
  RESTlerRequest,
  RESTlerResponse,
  RESTlerResponseBody,
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
  // protected _customClient: HTTPClient | undefined;
  protected _authStatus = [401, 403, 407];
  protected _authInitiated = false;

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
  ): Promise<RESTlerResponse<RespBody>> {
    Object.assign(request.endpoint, {
      baseURL: request.endpoint.baseURL ?? this._getOption('endpointURL'),
      version: this._getOption('version'),
    });
    // Assign headers
    request.headers = { ...this._defaultHeaders, ...request.headers };

    // Create the URL
    const endpoint = this._makeURL(request.endpoint as RESTlerEndpoint),
      resp: RESTlerResponse<RespBody> = {
        endpoint: request.endpoint as RESTlerEndpoint,
        headers: {},
        status: 200,
        authFailure: false,
        timeTaken: 0,
      };
    let finalError: RESTlerBaseError | undefined;
    this.emit('request', request as RESTlerRequest);
    // We now attempt to make the request, if it fails, we retry once
    const start = performance.now();
    const controller = new AbortController(),
      timeout = setTimeout(
        () => controller.abort(),
        this._getOption('timeout'),
      );
    try {
      await this._authInjector(request);
      const fetchOptions: RequestInit & { client?: Deno.HttpClient } = {
        method: request.endpoint.method,
        headers: request.headers,
        signal: controller.signal,
        body: (request.body === undefined)
          ? undefined
          : (request.body instanceof FormData ||
              typeof request.body === 'string')
          ? request.body
          : this._stringifyBody(request.body),
      };
      if (this._hasOption('certChain') || this._hasOption('certKey')) {
        // @Version check - Remove later on
        const ver = semver.parse(Deno.version.deno);
        if (semver.lt(ver, semver.parse('1.41.0'))) {
          // Stupi hack to pass linting
          fetchOptions.client = Deno.createHttpClient(
            JSON.parse(JSON.stringify({
              certChain: this._getOption('certChain'),
              privateKey: this._getOption('certKey'),
            })),
          );
        } else {
          fetchOptions.client = Deno.createHttpClient({
            cert: this._getOption('certChain'),
            key: this._getOption('certKey'),
          });
        }
      }
      // if (this._customClient !== undefined) {
      //   fetchOptions.client = this._customClient;
      // }
      const interimResp = await fetch(endpoint, fetchOptions);
      clearTimeout(timeout);
      if (this._hasOption('certChain') || this._hasOption('certKey')) {
        fetchOptions.client?.close();
      }
      resp.timeTaken = performance.now() - start;
      resp.status = interimResp.status;
      resp.headers = Object.fromEntries(interimResp.headers.entries());
      // Call the response handler
      resp.body = await this._handleResponse<RespBody>(
        request.endpoint as RESTlerEndpoint,
        interimResp,
      );
      // Check if it is an auth failure
      resp.authFailure = (this._authStatus.includes(interimResp.status))
        ? true
        : false;
      if (resp.authFailure) {
        throw new RESTlerAuthFailure(
          resp.endpoint as RESTlerEndpoint,
        );
      }
      return await this._processResponse(resp);
      // return resp;
    } catch (e) {
      if (timeout) {
        clearTimeout(timeout);
      }
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
          } catch (_e2) {
            // Dont do anything
          } finally {
            this._authInitiated = false;
          }
        }
        finalError = e;
      } else if (!(e instanceof RESTlerBaseError)) {
        finalError = new RESTlerUnhandledError(
          e.message,
          request.endpoint as RESTlerEndpoint,
        );
      } else {
        // We are not getting the instance type as RESTlerBaseError, instead of that, we are getting the VendorNameBaseError, due to which the finalError's type is undefined
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
      // if (this._authStatus.includes(response.status)) {
      //   response.body?.cancel();
      //   throw new RESTlerAuthFailure(
      //     this._name,
      //     endpoint as RESTlerEndpoint,
      //   );
      // }
      const contentType = response.headers.get('content-type');
      // @TODO: Handle other content types, Add support for auto detection of content type
      if (!contentType) {
        throw new RESTlerUnsupportedContentType(
          'N/A',
          endpoint as RESTlerEndpoint,
        );
      }
      if (contentType.includes('json')) {
        return await response.json() as RespBody;
      } else if (
        contentType.includes('text/xml') ||
        contentType.includes('application/xml')
      ) {
        return XMLParse(await response.text()) as unknown as RespBody;
      } else if (contentType.includes('text')) {
        return await response.text() as unknown as RespBody;
        // } else if (contentType.includes('text/html')) {
        //   return await response.text() as unknown as RespBody;
        // } else if (contentType.includes('application/octet-stream')) {
        //   return await response.blob() as unknown as RespBody;
        // } else if (contentType.includes('multipart/form-data')) {
        //   return await response.formData() as unknown as RespBody;
      } else {
        // Ensure we discard the body
        throw new RESTlerUnsupportedContentType(
          contentType,
          endpoint as RESTlerEndpoint,
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
  //#endregion
}
