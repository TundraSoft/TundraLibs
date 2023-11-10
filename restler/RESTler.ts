import { HTTPMethods, path } from '../dependencies.ts';

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
  protected _authStatus = [401, 403, 407];

  /**
   * Creates an instance of RESTler.
   *
   * @param name string - The name of the RESTler instance
   * @param config OptionKeys<O, RESTlerEvents> - The options object
   */
  constructor(name: string, config: OptionKeys<O, RESTlerEvents>) {
    const def: Partial<O> = {
      timeout: 30000,
      maxAuthTries: 1,
    } as Partial<O>;
    super(config, def);
    this._name = name.trim();
    this._defaultHeaders = this._getOption('defaultHeaders') || {};
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
    RespBody extends RESTlerResponseBody = Record<string, unknown>,
  >(
    request: RESTlerRequest,
  ): Promise<RESTlerResponse<RespBody>> {
    Object.assign(request.endpoint, {
      baseURL: this._getOption('endpointURL'),
      version: this._getOption('version'),
    });
    request.headers = { ...this._defaultHeaders, ...request.headers };

    const endpoint = this._makeURL(request.endpoint as RESTlerEndpoint),
      controller = new AbortController(),
      fetchOptions: RequestInit = {
        method: request.endpoint.method,
        headers: request.headers,
        signal: controller.signal,
        body: (request.body instanceof FormData)
          ? request.body
          : JSON.stringify(request.body),
      },
      maxAuthTries = this._getOption('maxAuthTries') as number;
    // The response object, technically can be const but we override it like a moron so its not
    const resp: RESTlerResponse<RespBody> = {
      endpoint: request.endpoint as RESTlerEndpoint,
      headers: {},
      status: 200,
      authFailure: false,
      body: {} as RespBody,
      timeTaken: 0, 
    };
    let authCounter = 0;
    let finalError: RESTlerBaseError | undefined;
    this.emit('request', request as RESTlerRequest);
    while (authCounter <= maxAuthTries) {
      const start = performance.now();
      try {
        // Inject auth here
        this._authInjector(request);
        const timeout = setTimeout(
            () => controller.abort(),
            this._getOption('timeout'),
          ),
          interimResp = await fetch(endpoint, fetchOptions);
        resp.status = interimResp.status;
        resp.headers = Object.fromEntries(interimResp.headers.entries());
        resp.authFailure = (this._authStatus.includes(interimResp.status))
          ? true
          : false;

        clearTimeout(timeout);
        try {
          resp.body = await this._handleResponse<RespBody>(
            request.endpoint as RESTlerEndpoint,
            interimResp,
          );
        } catch (e) {
          // Hack to ensure we discard the body.
          if (interimResp.bodyUsed === false) {
            await interimResp.body?.cancel();
          }
          if (e instanceof RESTlerAuthFailure) {
            resp.authFailure = true;
          } else if (!(e instanceof RESTlerBaseError)) {
            throw new RESTlerUnhandledError(
              this._name,
              e.message,
              request.endpoint as RESTlerEndpoint,
            );
          } else {
            throw e;
          }
        }
        const end = performance.now();
        resp.timeTaken = end - start;
        if (resp.authFailure) {
          ++authCounter;
          await this._authenticate();
          continue;
        }
        // Emit response event
        // this.emit(
        //   'response',
        //   request as RESTlerRequest,
        //   resp as RESTlerResponse,
        // );
        return resp;
      } catch (e) {
        // Handle error
        resp.timeTaken = performance.now() - start;
        if (e.name === 'AbortError') {
          // Emit timeout event
          this.emit('timeout', request);
          finalError = new RESTlerTimeoutError(
            this._name,
            this._getOption('timeout') as number,
            request.endpoint as RESTlerEndpoint,
          );
        } else if (e instanceof RESTlerAuthFailure) {
          // Emit authFailure event
          this.emit('authFailure', request);
          finalError = e;
        } else if (!(e instanceof RESTlerBaseError)) {
          finalError = new RESTlerUnhandledError(
            this._name,
            e.message,
            request.endpoint as RESTlerEndpoint,
          );
        }
        // Emit error event
        throw finalError;
      } finally {
        this.emit('response', request, resp as RESTlerResponse, finalError);
      }
    }
    // If we've exited the while loop, we've exhausted auth retries.
    this.emit('authFailure', request);
    throw new RESTlerAuthFailure(
      this._name,
      request.endpoint as RESTlerEndpoint,
    );
  }

  /**
   * Handles the response object and returns the body
   *
   * @remarks
   * This method should be overriden by child class if the response need
   * special handling or to handle authentication failures
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
    if (this._authStatus.includes(response.status)) {
      throw new RESTlerAuthFailure(
        this._name,
        endpoint as RESTlerEndpoint,
      );
    }
    const contentType = response.headers.get('content-type');
    if (!contentType) {
      throw new RESTlerUnsupportedContentType(
        this._name,
        'N/A',
        endpoint as RESTlerEndpoint,
      );
    }
    if (contentType.includes('application/json')) {
      return await response.json() as RespBody;
    } else if (contentType.includes('text/plain')) {
      return await response.text() as unknown as RespBody;
    } else if (contentType.includes('text/html')) {
      return await response.text() as unknown as RespBody;
    } else if (contentType.includes('application/octet-stream')) {
      return await response.blob() as unknown as RespBody;
      // } else if (contentType.includes('multipart/form-data')) {
      //   return await response.formData() as unknown as RespBody;
    } else {
      throw new RESTlerUnsupportedContentType(
        this._name,
        contentType,
        endpoint as RESTlerEndpoint,
      );
    }
  }

  //#region Override these methods
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
   */
  protected _authenticate(): void | Promise<void> {
    // Do nothing
    this.emit('auth', {});
  }
  //#endregion
}
