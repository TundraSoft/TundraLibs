import {
  RESTler,
  RESTlerBaseError,
  RESTlerRequest,
  RESTlerResponse,
} from '../mod.ts';
import { cryptoKey } from '../../id/mod.ts';

let auth = cryptoKey(32);
const mock = (port = 8000) => {
  const users: { id: number; email: string }[] = [{
    id: 1,
    email: 'test@email.com',
  }];
  const handler = async (req: Request) => {
    const path = new URL(req.url, 'http://localhost:8000').pathname,
      method = req.method,
      respHeaders = new Headers();
    respHeaders.set('content-type', 'application/json');
    respHeaders.set('accept', 'application/json');
    // console.log(path, method)

    if (path === '/auth' && method === 'POST') {
      // Delay response by 1s
      await new Promise((resolve) => setTimeout(resolve, 1000));
      return new Response(JSON.stringify({ token: auth }), {
        status: 200,
        headers: respHeaders,
      });
    } else if (path === '/users' && method === 'POST') {
      if (
        req.headers.has('X-Authorization') === false ||
        req.headers.get('X-Authorization') !== auth
      ) {
        // console.log(auth, req.headers.get('X-Authorization'));
        return new Response(JSON.stringify({ message: 'Unauthorized' }), {
          status: 401,
          headers: respHeaders,
        });
      } else {
        // Add the user
        const payload = await req.json(),
          id = users.length + 1;
        users.push({ id: id, email: payload.email + auth });
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
    } else {
      return new Response(JSON.stringify({ message: 'Not found' }), {
        status: 404,
        headers: respHeaders,
      });
    }
  };
  const sig = new AbortController();
  const _serv = Deno.serve({ port: port, signal: sig.signal }, handler);
  return sig;
};

class MockTest extends RESTler {
  protected _authKey: string | undefined = undefined;
  public doAuth = true;

  constructor() {
    super('mock', {
      endpointURL: 'http://localhost:8000',
      defaultHeaders: {
        'content-type': 'application/json',
        'accept': 'application/json',
      },
      _onauth: (v: Record<string, unknown>) => {
        console.log(`Auth: ${JSON.stringify(v)}`);
      },
      _onauthFailure: (req: RESTlerRequest) => {
        console.log(
          `Auth failed: ${req.endpoint.method} ${req.endpoint.path}`,
        );
      },
      _onrequest: (req: RESTlerRequest) => {
        console.log(`Request: ${req.endpoint.method} ${req.endpoint.path}`);
      },
      _ontimeout: (req: RESTlerRequest) => {
        console.log(`Timeout: ${req.endpoint.method} ${req.endpoint.path}`);
      },
      _onresponse: (
        req: RESTlerRequest,
        resp: RESTlerResponse,
        error?: RESTlerBaseError,
      ) => {
        if (error !== undefined) {
          console.log(`Error: ${error.name} ${error.message}`);
        } else {
          console.log(
            `Response: ${req.endpoint.method} ${req.endpoint.path} ${resp.status} in ${resp.timeTaken}`,
          );
        }
      },
    });
  }

  protected _authInjector(request: RESTlerRequest): void {
    // console.log('In Auth inject');
    if (request.endpoint.method === 'POST' && this._authKey) {
      if (!request.headers) {
        request.headers = {};
      }
      if (!request.headers['X-Authorization']) {
        // console.log('Injecting');
        request.headers['X-authorization'] = this._authKey;
      }
    }
  }

  protected async _authenticate(): Promise<void> {
    if (this.doAuth === true) {
      const res = await this._makeRequest<{ token: string }>({
        endpoint: this._buildEndpoint('POST', '/auth'),
      });
      this._authKey = res.body?.token;
    }
    // if (this.doAuth === true) {
    //   this._authKey = '123';
    // }
    this.emit('auth', { token: this._authKey });
  }

  async createUser(email: string): Promise<{ id: number; email: string }> {
    const res = await this._makeRequest<{ id: number; email: string }>({
      endpoint: this._buildEndpoint('POST', '/users'),
      body: { email },
    });
    return res.body as { id: number; email: string };
  }

  async listUsers(): Promise<{ id: number; email: string }[]> {
    const res = await this._makeRequest<{ id: number; email: string }[]>({
      endpoint: this._buildEndpoint('GET', '/users'),
    });
    return res.body as { id: number; email: string }[];
  }
}

// const test = new MockTest();
// const test2 = new MockTest();
// test.doAuth = true;
// test2.doAuth = true;
const server = mock();

// window.setInterval(() => auth = cryptoKey(32), 1000)
// Loop 1000 times
const a: Promise<unknown>[] = [];
for (let i = 0; i < 10; i++) {
  if (i === 3) {
    auth = cryptoKey(32);
    console.log(auth);
  }
  a.push(new MockTest().createUser(`user${i}`));
}
Promise.allSettled(a).then((v) => {
  // v.filter((v) => v.status === 'rejected').forEach((v) => console.log(`Failed: ${JSON.stringify(v)}`));
  console.log(v);
  server.abort();
});
// server.abort();
