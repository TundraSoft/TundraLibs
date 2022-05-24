import { HeaderFunction, RESTlerConfig, RESTOptions } from "./types.ts";

export default class RESTler {
  protected _baseURI: string;
  protected _timeout = 5000;
  protected _customHeaders!: Record<string, string> | HeaderFunction;

  constructor(config: RESTlerConfig) {
    this._baseURI = config.baseURI;
    if (config.timeout) {
      this._timeout = config.timeout;
    }
    if (config.customHeaders) {
      this._customHeaders = config.customHeaders;
    }
    //   customHeaders?: Record<string, string> | headerFunction,
    // timeout: number,
    // referrer?: string,
  }

  /**
   * get
   * Perform a GET request (typed)
   *
   * @param path string The path to make the get request to
   * @param options Partia<RESTOptions> options for the request
   * @returns Promise<Return> returns the typed output of GET request
   */
  async get<Return>(
    path: string,
    options?: Partial<RESTOptions>,
  ): Promise<Return>;

  /**
   * get
   * Perform a GET request
   *
   * @param path string The path to make the get request to
   * @param options Partia<RESTOptions> options for the request
   * @returns Promise<unknown> returns the typed output of GET request
   */
  async get(path: string, options?: Partial<RESTOptions>): Promise<unknown> {
    const opt: RESTOptions = {
      ...{
        method: "GET",
        timeout: this._timeout,
      },
      ...options,
    };
    // Force method
    opt.method = "GET";
    return (await this._fetch(path, opt)) as unknown;
  }

  /**
   * post
   * Perform a POST request (typed)
   *
   * @param path string The path to make the POST request to
   * @param options Partial<RESTOptions> options for the request
   * @returns Promise<Return> return the typed output for POST request
   */
  async post<Return>(
    path: string,
    options?: Partial<RESTOptions>,
  ): Promise<Return>;

  /**
   * post
   * Perform a POST request
   *
   * @param path string The path to make the POST request to
   * @param options Partial<RESTOptions> options for the request
   * @returns Promise<unknown> return the output for POST request
   */
  async post(path: string, options?: Partial<RESTOptions>): Promise<unknown> {
    const opt: RESTOptions = {
      ...{
        method: "POST",
        timeout: this._timeout,
      },
      ...options,
    };
    // Force method
    opt.method = "POST";
    return (await this._fetch(path, opt)) as unknown;
  }

  /**
   * put
   * Make a PUT request (typed)
   *
   * @param path string The path to make the PUT request
   * @param options Partial<RESTOptions> options for the request
   * @return Promise<Return> return the output
   */
  async put<Return>(
    path: string,
    options?: Partial<RESTOptions>,
  ): Promise<Return>;

  /**
   * put
   * Make a PUT request
   * @param path string The path to make the PUT request
   * @param options Partial<RESTOptions> options for the request
   * @return Promise<unknown> return the output
   */
  async put(path: string, options?: Partial<RESTOptions>): Promise<unknown> {
    const opt: RESTOptions = {
      ...{
        method: "PUT",
        timeout: this._timeout,
      },
      ...options,
    };
    // Force method
    opt.method = "PUT";
    return (await this._fetch(path, opt)) as unknown;
  }

  /**
   * patch
   * Makes a PATCH request (typed)
   *
   * @param path string The path to make the PATCH request
   * @param options Partial<RESTOptions> options for the request
   * @return Promise<Return> return the output
   */
  async patch<Return>(
    path: string,
    options?: Partial<RESTOptions>,
  ): Promise<Return>;

  /**
   * patch
   * Makes a PATCH request
   *
   * @param path string The path to make the PATCH request
   * @param options Partial<RESTOptions> options for the request
   * @return Promise<unknown> return the output
   */
  async patch(path: string, options?: Partial<RESTOptions>): Promise<unknown> {
    const opt: RESTOptions = {
      ...{
        method: "PATCH",
        timeout: this._timeout,
      },
      ...options,
    };
    // Force method
    opt.method = "PATCH";
    return (await this._fetch(path, opt)) as unknown;
  }

  /**
   * delete
   * Makes a delete request (typed)
   *
   * @param path string The path to make the DELETE request
   * @param options Partial<RESTOptions> options for the request
   * @return Promise<Return> return the output
   */
  async delete<Return>(
    path: string,
    options?: Partial<RESTOptions>,
  ): Promise<Return>;

  /**
   * delete
   * Makes a delete request
   *
   * @param path string The path to make the DELETE request
   * @param options Partial<RESTOptions> options for the request
   * @return Promise<unknown> return the output
   */
  async delete(path: string, options?: Partial<RESTOptions>): Promise<unknown> {
    const opt: RESTOptions = {
      ...{
        method: "DELETE",
        timeout: this._timeout,
      },
      ...options,
    };
    // Force method
    opt.method = "DELETE";
    return (await this._fetch(path, opt)) as unknown;
  }

  /**
   * options
   * Make a OPTIONS request (typed)
   *
   * @param path string The path to make the OPTIONS request
   * @param options Partial<RESTOptions> options for the request
   * @return Promise<Return> return the output
   */
  async options<Return>(
    path: string,
    options?: Partial<RESTOptions>,
  ): Promise<Return>;

  /**
   * options
   * Make a OPTIONS request
   *
   * @param path string The path to make the OPTIONS request
   * @param options Partial<RESTOptions> options for the request
   * @return Promise<unknown> return the output
   */
  async options(
    path: string,
    options?: Partial<RESTOptions>,
  ): Promise<unknown> {
    const opt: RESTOptions = {
      ...{
        method: "OPTIONS",
        timeout: this._timeout,
      },
      ...options,
    };
    // Force method
    opt.method = "OPTIONS";
    return (await this._fetch(path, opt)) as unknown;
  }

  /**
   * head
   * Make a HEAD request (typed)
   *
   * @param path string The path to make the HEAD request
   * @param options Partial<RESTOptions> options for the request
   * @return Promise<Return> return the output
   */
  async head<Return>(
    path: string,
    options?: Partial<RESTOptions>,
  ): Promise<Return>;

  /**
   * head
   * Make a HEAD request
   *
   * @param path string The path to make the HEAD request
   * @param options Partial<RESTOptions> options for the request
   * @return Promise<unknown> return the output
   */
  async head(path: string, options?: Partial<RESTOptions>): Promise<unknown> {
    const opt: RESTOptions = {
      ...{
        method: "HEAD",
        timeout: this._timeout,
      },
      ...options,
    };
    // Force method
    opt.method = "HEAD";
    return (await this._fetch(path, opt)) as unknown;
  }

  /**
   * _fetch
   * Make the actual request (typed)
   *
   * @param path string the Path to make the request to
   * @param options RESTOptions options for the request
   * @returns Promise<T>
   */
  protected async _fetch<T>(path: string, options: RESTOptions): Promise<T>;

  /**
   * _fetch
   * Make the actual request
   *
   * @param path string the Path to make the request to
   * @param options RESTOptions options for the request
   * @returns Promise<T>
   */
  protected async _fetch(
    path: string,
    options: RESTOptions,
  ): Promise<Record<string, unknown> | Array<Record<string, unknown>>> {
    const url: URL = new URL(path, this._baseURI);
    if (options.searchParams) {
      options.searchParams.forEach((value, key) =>
        url.searchParams.append(key, value)
      );
    }
    // Ok, now headers
    //#region Headers
    let head: Headers;
    // Add custom headers
    if (this._customHeaders) {
      if (typeof this._customHeaders === "function") {
        head = new Headers(this._customHeaders());
      } else {
        head = new Headers(this._customHeaders);
      }
    } else {
      head = new Headers();
    }
    // Add request headers
    if (options.headers) {
      options.headers.forEach((value, key) => head.append(key, value));
    }
    //#endregion Headers
    //#region Authentication

    //#endregion Authentication
    const op = await fetch(url.toString(), {
      headers: head,
      method: options.method,
      body: options.body,
    });
    // Parse body
    return await op.json();
  }
}
