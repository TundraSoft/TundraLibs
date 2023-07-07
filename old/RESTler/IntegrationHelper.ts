import { path } from '../dependencies.ts';
import { Options } from '../options/mod.ts';
import { IntegrationTimeout } from './IntegrationError.ts';
import type {
  IntegrationEvents,
  IntegrationOptions,
  RequestOptions,
  ResponseObject,
} from './types/mod.ts';
// import { ResponseBody } from './types/ResponseObject.ts';

export abstract class IntegrationHelper<
  T extends IntegrationOptions,
> extends Options<T, IntegrationEvents> {
  protected _defaultHeaders = new Headers();
  declare protected _name: string;

  constructor(options: Partial<T>) {
    const def: Partial<IntegrationOptions> = {
      // timeout: 60000,
      timeout: options.timeout || 60000,
    };
    super(options, def as Partial<T>);
    if (this._options?.onError) {
      this.on('error', this._options.onError);
    }
    if (this._options?.onRequest) {
      this.on('request', this._options.onRequest);
    }
    if (this._options?.onResponse) {
      this.on('response', this._options.onResponse);
    }
    if (this._options?.onTimeout) {
      this.on('timeout', this._options.onTimeout);
    }
    if (this._options?.log) {
      this.on('log', this._options?.log);
    }
  }

  protected _makeEndpoint(
    endPoint: string,
    searchParams?: URLSearchParams,
  ): string {
    const url = new URL(
      path.posix.join(this._getOption('endpointURL'), endPoint),
    );
    if (searchParams) {
      searchParams.sort();
      url.search = searchParams.toString();
    }
    return url.toString();
  }

  protected _makeRequest<RequestBody, ResponseBody>(
    request: RequestOptions<RequestBody>,
    isFormData?: boolean,
  ): Promise<ResponseBody>;

  protected async _makeRequest<
    RequestBody = Record<string, unknown>,
    ResponseBody = Record<string, unknown>,
  >(
    request: RequestOptions<RequestBody>,
    isFormData = false,
  ): Promise<ResponseBody> {
    if (request.headers === undefined) {
      request.headers = new Headers();
    }

    this._defaultHeaders.forEach((value, key) => {
      request.headers?.set(key, value);
    });
    // Pre-flight checks
    await this._preRequest<RequestBody>(request);
    if (request.body instanceof FormData) {
      isFormData = true;
    }
    const url = this._makeEndpoint(request.endPoint, request.searchParams),
      controller = new AbortController(),
      options = {
        method: request.method,
        headers: request.headers,
        body: request.body
          ? isFormData ? request.body : JSON.stringify(request.body)
          : undefined,
        signal: controller.signal,
      };

    // Call pre-request event
    this.emit('request', {
      endPoint: url,
      method: options.method,
      headers: options.headers,
      body: request.body,
    });
    const start = performance.now();
    try {
      const timeout = setTimeout(
          () => controller.abort(),
          this._getOption('timeout'),
        ),
        resp = await fetch(url, options as RequestInit);
      clearTimeout(timeout);
      const respObj: ResponseObject<ResponseBody> = {
          endpoint: request.endPoint,
          url: url,
          status: resp.status,
          headers: resp.headers,
          body: undefined,
        },
        respClone = resp.clone();
      try {
        const retval = await this._parseResponse<
          RequestBody,
          ResponseBody
        >(
          resp,
          request,
        );
        respObj.body = retval as unknown as ResponseBody;
        return retval;
      } catch (e) {
        const body = await respClone.json();
        respObj.body = body;
        throw e;
      } finally {
        const stop = performance.now();
        this.emit('response', respObj, {
          endPoint: url,
          method: options.method,
          headers: options.headers,
          body: request.body,
        });
        this.emit(
          'log',
          {
            endPoint: url,
            method: options.method,
            headers: options.headers,
            body: request.body,
          },
          respObj,
          stop - start,
          false,
        );
      }
    } catch (e) {
      if (controller.signal.aborted) {
        const stop = performance.now();
        await this.emit(
          'log',
          {
            endPoint: url,
            method: options.method,
            headers: options.headers,
            body: request.body,
          },
          undefined,
          stop - start,
          true,
        );

        throw new IntegrationTimeout(
          this._name,
          this._getOption('timeout'),
          request.endPoint,
        );
      } else {
        // Some other error occured
        throw e;
      }
    }
  }

  protected _preRequest<RequestBody>(
    request: RequestOptions<RequestBody>,
  ): void;

  protected _preRequest<RequestBody = Record<string, unknown>>(
    // deno-lint-ignore no-unused-vars
    request: RequestOptions<RequestBody>,
  ): void {}

  // protected _postResponse<RequestBody>(response: Response, request: RequestOptions<RequestBody>): void;

  // // deno-lint-ignore no-unused-vars
  // protected _postResponse<RequestBody = Record<string, unknown>>(response: Response, request: RequestOptions<RequestBody>): void {}

  protected abstract _parseResponse<RequestBody, ResponseBody>(
    response: Response,
    request: RequestOptions<RequestBody>,
  ): Promise<ResponseBody>;

  protected abstract _parseResponse<
    RequestBody = Record<string, unknown>,
    ResponseBody = Record<string, unknown>,
  >(
    response: Response,
    request: RequestOptions<RequestBody>,
  ): Promise<ResponseBody>;
}
