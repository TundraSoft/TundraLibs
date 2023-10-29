import { HTTPMethods, path } from '../dependencies.ts';

import { Options } from '../options/mod.ts';
import type { OptionKeys } from '../options/mod.ts';
import type {
  RESTlerEndpoint,
  RESTlerEvents,
  RESTlerOptions,
  RESTlerRequest,
  RESTlerRequestBody,
  RESTlerResponse,
  RESTlerResponseBody,
} from './types/mod.ts';

import {
  RESTlerAuthFailure,
  RESTlerBaseError,
  RESTlerTimeoutError,
  RESTlerUnknownError,
  RESTlerUnsupportedContentType,
} from './errors/mod.ts';
export abstract class RESTler<
  O extends RESTlerOptions,
> extends Options<O, RESTlerEvents> {
  protected _name: string;
  protected _defaultHeaders: Record<string, string>;

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
    // Inject auth here
    this._authInjector(request);

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
    let resp: RESTlerResponse<RespBody>,
      authCounter = 0;
    this.emit('request', request as RESTlerRequest);

    // Emit the request event. We do it only once per request
    this.emit('request', request as RESTlerRequest);
    while (authCounter <= maxAuthTries) {
      try {
        const start = performance.now(),
          timeout = setTimeout(
            () => controller.abort(),
            this._getOption('timeout'),
          ),
          interimResp = await fetch(endpoint, fetchOptions);

        clearTimeout(timeout);
        const type = (interimResp.headers.get('content-type') as string)
          .toLowerCase();
        let body;
        if (type?.startsWith('application/json')) {
          body = await interimResp.json();
        } else if (type?.startsWith('text/plain')) {
          body = await interimResp.text();
        } else if (type?.startsWith('application/octet-stream')) {
          body = await interimResp.blob();
        } else {
          throw new RESTlerUnsupportedContentType(
            this._name,
            type,
            request.endpoint as RESTlerEndpoint,
          );
        }
        resp = {
          endpoint: request.endpoint as RESTlerEndpoint,
          headers: Object.fromEntries(interimResp.headers.entries()),
          status: interimResp.status,
          authFailure: (interimResp.status === 401) ? true : false,
          body,
        };

        await this._handleResponse(request, resp);
        const end = performance.now();

        if (resp.authFailure) {
          ++authCounter;
          await this._authenticate();
          continue;
        }
        // Emit response event
        this.emit(
          'response',
          request as RESTlerRequest,
          resp as RESTlerResponse,
        );
        return resp;
      } catch (e) {
        // Handle error
        if (e.name === 'AbortError') {
          // Emit timeout event
          this.emit('timeout');
          throw new RESTlerTimeoutError(
            this._name,
            this._getOption('timeout') as number,
            request.endpoint as RESTlerEndpoint,
          );
        } else if (e instanceof RESTlerAuthFailure) {
          // Emit authFailure event
          this.emit('authFailure');
        } else if (!(e instanceof RESTlerBaseError)) {
          throw new RESTlerUnknownError(
            this._name,
            e.message,
            request.endpoint as RESTlerEndpoint,
          );
        }
        // Emit error event
        this.emit('error');
        throw e;
      }
    }
    // If we've exited the while loop, we've exhausted auth retries.
    throw new RESTlerAuthFailure(
      this._name,
      request.endpoint as RESTlerEndpoint,
    );
  }

  protected async _handleResponse<
    RespBody extends RESTlerResponseBody = Record<string, unknown>,
  >(
    request: RESTlerRequest,
    response: RESTlerResponse<RespBody>,
  ): Promise<void> {
  }

  //#region Override these methods
  protected _authInjector(
    request: RESTlerRequest,
  ): void {
    // Do nothing
  }

  protected async _authenticate(): Promise<void> {
    // Do nothing
  }
  //#endregion
}
