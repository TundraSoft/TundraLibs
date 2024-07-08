import { cryptoKey } from '../../../id/mod.ts';

export const server = (port = 8000) => {
  const users: { id: number; email: string }[] = [{
    id: 1,
    email: 'test@email.com',
  }];
  const auth = cryptoKey(32);
  const handler = async (req: Request) => {
    const path = new URL(req.url, 'http://localhost:8000').pathname,
      method = req.method,
      respHeaders = new Headers();
    respHeaders.set('content-type', 'application/json');
    respHeaders.set('accept', 'application/json');
    // console.log(path, method)

    if (path === '/auth' && method === 'POST') {
      // Delay response by 1s
      // console.log('Here');
      await new Promise((resolve) => setTimeout(resolve, 1000));
      return new Response(JSON.stringify({ token: auth }), {
        status: 200,
        headers: respHeaders,
      });
    } else if (path === '/users' && method === 'POST') {
      // console.log('Here2');
      if (
        req.headers.has('X-Authorization') === false ||
        req.headers.get('X-Authorization') !== auth
      ) {
        // console.log('Here3');
        // console.log(auth, req.headers.get('X-Authorization'));
        return new Response(JSON.stringify({ message: 'Unauthorized' }), {
          status: 401,
          headers: respHeaders,
        });
      } else {
        // console.log('Here4');
        // Add the user
        const payload = await req.json(),
          id = users.length + 1;
        users.push({ id: id, email: payload.email });
        return new Response(JSON.stringify(users[id - 1]), {
          status: 201,
          headers: respHeaders,
        });
      }
    } else if (path === '/users' && method === 'GET') {
      return new Response(JSON.stringify(users), {
        status: 200,
        headers: respHeaders,
      });
    } else if (path === '/timeout') {
      // Delay response by 1s
      await new Promise((resolve) => setTimeout(resolve, 5000));
      return new Response(JSON.stringify({ message: 'Timeout' }), {
        status: 408,
        headers: respHeaders,
      });
    } else if (path === '/unknown') {
      respHeaders.set('content-type', 'application/octet-stream');
      return new Response('{"message": "Unknown"}', {
        status: 200,
        headers: respHeaders,
      });
    } else if (path === '/unhandled') {
      respHeaders.set('content-type', 'application/octet-stream');
      return new Response('{"message": "Unknown"}', {
        status: 200,
        headers: respHeaders,
      });
    } else if (path === '/html') {
      respHeaders.set('content-type', 'text/html');
      return new Response('<html></html>', {
        status: 200,
        headers: respHeaders,
      });
    } else if (path === '/text') {
      respHeaders.set('content-type', 'text/plain');
      return new Response('Hello World', {
        status: 200,
        headers: respHeaders,
      });
    } else if (path === '/xml') {
      respHeaders.set('content-type', 'application/xml');
      return new Response('<xml></xml>', {
        status: 200,
        headers: respHeaders,
      });
    } else {
      return new Response(JSON.stringify({ message: 'Not found' }), {
        status: 404,
        headers: respHeaders,
      });
    }
  };
  const sig = new AbortController();
  const serv = Deno.serve({ port: port, signal: sig.signal }, handler);
  // return sig;
  return serv;
};

import { RESTler, RESTlerRequest } from '../../mod.ts';

export class MockTest extends RESTler {
  public authKey: string | undefined = undefined;
  public doAuth = false;

  constructor(port: number) {
    super('mock', {
      endpointURL: `http://localhost:${port}`,
      defaultHeaders: {
        'content-type': 'application/json',
        'accept': 'application/json',
      },
      // _onauth: (v: Record<string, unknown>) => {
      //   console.log(`Auth: ${JSON.stringify(v)}`);
      // },
      // _onauthFailure: (req: RESTlerRequest) => {
      //   console.log(
      //     `Auth failed: ${req.endpoint.method} ${req.endpoint.path}`,
      //   );
      // },
      // _onrequest: (req: RESTlerRequest) => {
      //   console.log(`Request: ${req.endpoint.method} ${req.endpoint.path}`);
      // },
      // _ontimeout: (req: RESTlerRequest) => {
      //   console.log(`Timeout: ${req.endpoint.method} ${req.endpoint.path}`);
      // },
      // _onresponse: (
      //   req: RESTlerRequest,
      //   resp: RESTlerResponse,
      //   error?: RESTlerBaseError,
      // ) => {
      //   if (error !== undefined) {
      //     console.log(`Error: ${error.name} ${error.message}`);
      //   } else {
      //     console.log(
      //       `Response: ${req.endpoint.method} ${req.endpoint.path} ${resp.status} in ${resp.timeTaken}`,
      //     );
      //   }
      // },
    });
  }

  protected _authInjector(request: RESTlerRequest): void {
    if (request.endpoint.path === '/unhandled') {
      throw new RangeError('Unhandled');
    }
    if (request.endpoint.method === 'POST' && this.authKey) {
      if (!request.headers) {
        request.headers = {};
      }
      if (!request.headers['X-Authorization']) {
        // console.log('Injecting');
        request.headers['X-authorization'] = this.authKey;
      }
    }
  }

  protected async _authenticate(): Promise<void> {
    if (this.doAuth === true) {
      const res = await this._makeRequest<{ token: string }>({
        endpoint: this._buildEndpoint('POST', '/auth'),
      });
      this.authKey = res.body?.token;
    }
    // if (this.doAuth === true) {
    //   this._authKey = '123';
    // }
    this.emit('auth', { token: this.authKey });
  }

  async createUser(email: string): Promise<{ id: number; email: string }> {
    // console.log('In Create User');
    const res = await this._makeRequest<{ id: number; email: string }>({
      endpoint: this._buildEndpoint('POST', '/users'),
      body: { email },
    });
    // console.log('In Create User 2');
    return res.body as { id: number; email: string };
  }

  async listUsers(): Promise<{ id: number; email: string }[]> {
    const res = await this._makeRequest<{ id: number; email: string }[]>({
      endpoint: this._buildEndpoint('GET', '/users'),
    });
    return res.body as { id: number; email: string }[];
  }

  async timeout(): Promise<void> {
    await this._makeRequest({
      endpoint: this._buildEndpoint('GET', '/timeout'),
      timeout: 1000,
    });
  }

  async unknown(): Promise<void> {
    await this._makeRequest({
      endpoint: this._buildEndpoint('GET', '/unknown'),
    });
  }

  async unhandled(): Promise<void> {
    await this._makeRequest({
      endpoint: this._buildEndpoint('GET', '/unhandled'),
    });
  }

  async html(): Promise<string> {
    return (await this._makeRequest<string>({
      endpoint: this._buildEndpoint('GET', '/html'),
    })).body as string;
  }

  async text(): Promise<string> {
    return (await this._makeRequest<string>({
      endpoint: this._buildEndpoint('GET', '/text'),
    })).body as string;
  }

  async xml(): Promise<string> {
    return (await this._makeRequest<string>({
      endpoint: this._buildEndpoint('GET', '/xml'),
    })).body as string;
  }
}
