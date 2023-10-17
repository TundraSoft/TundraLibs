import { path } from '../dependencies.ts';

import { Options } from '../options/mod.ts';
import type { OptionKeys } from '../options/mod.ts';
import type { RESTlerOptions, RESTlerEvents, RESTlerRequestObject, RESTlerResponseObject } from './types/mod.ts';

export abstract class RESTler<
  O extends RESTlerOptions,
> extends Options<O, RESTlerEvents> {
  protected _name: string;
  // protected _authCounter = 0; -- This is not needed as the counter is per request
  
  constructor(name: string, config: OptionKeys<O, RESTlerEvents>) {
    const def: Partial<O> = {
      timeout: 30000,
      maxAuthTries: 1, 
    } as Partial<O>;
    super(config, def);
    this._name = name.trim().toLowerCase();
  }

  protected _makeEndpoint(endPoint: string, searchParams?: Record<string, string>, version?: string) {
    // If version is defined or provided here, add it to endpoint string
    console.log(this._getOption('version'));
    if(version !== undefined || this._hasOption('version')) {
      endPoint = `${version || this._getOption('version')}/${endPoint}`;
    }
    const url = new URL(
      path.posix.join(this._getOption('endpointURL'), endPoint),
    );
    if (searchParams) {
      const sp = new URLSearchParams(searchParams);
      sp.sort();
      url.search = sp.toString();
    }
    return url.toString();
  }

  protected async _makeRequest<Request extends Record<string, unknown> = Record<string, unknown>, Response extends Record<string, unknown> = Record<string, unknown>>(request: RESTlerRequestObject<Request>): Promise<RESTlerResponseObject<Response>>{
    // Inject auth here
    this._authInjector(request);
    const endpoint = this._makeEndpoint(request.endpoint, request.searchParams, request.version), 
      headers = {...{}, ...this._getOption('defaultHeaders'), ...request.headers };
    return {
      endpoint: endpoint,
      headers,
      body: {} as Response, 
      status: 200
    }
  }

  protected async _parseResponse<Response extends Record<string, unknown> = Record<string, unknown>>(response: RESTlerResponseObject<Response>): Promise<RESTlerResponseObject<Response>> {
    
  }

  //#region Override these methods
  protected _authInjector(request: RESTlerRequestObject): void {
    // Do nothing
  }

  protected _authHandler(): void {
    // Do nothing
  }
  //#endregion

}




type TestOptions = RESTlerOptions & {
  test: string;
}

class Test extends RESTler<TestOptions> {
  constructor() {
    super('test', {
      endpointURL: 'https://www.google.com',
      test: 'df', 
      version: 'v0',
      defaultHeaders: {
        "sdf": "asdfsdf"
      }
    });
  }

  async test() {
    console.log(this._makeEndpoint('test', {test: 'test'}, 'v1'))
    console.log(this._makeEndpoint('test', {test: 'test'}, 'v3'))
    console.log(this._makeEndpoint('test',{test: 'test'}))
    console.log(await this._makeRequest({endpoint: 'test', method: 'GET', searchParams: {test: 'test'}}));
    console.log(await this._makeRequest({endpoint: 'test', method: 'GET', searchParams: {test: 'test'}, headers: {test: 'test'}}));
  }
}

const a = new Test();
a.test();