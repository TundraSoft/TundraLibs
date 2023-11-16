import { RESTler, RESTlerRequest } from '../mod.ts';
import { cryptoKey } from '../../id/mod.ts';
import {
  afterEach,
  assertEquals,
  beforeEach,
  describe,
  it,
} from '../../dev.dependencies.ts';

describe(`[library='RESTler' mode='mock example']`, () => {
  const mock = (port = 8000) => {
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
    public doAuth = false;

    constructor() {
      super('mock', {
        endpointURL: 'http://localhost:8000',
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

  let test: MockTest;
  let server: ReturnType<typeof mock>;

  beforeEach(() => {
    server = mock();
    test = new MockTest();
  });

  afterEach(() => {
    server.abort();
  });

  it('should list all users', async () => {
    const userd = await test.listUsers();
    assertEquals(userd.length, 1);
  });

  it('authentication must work', async () => {
    test.doAuth = true;
    const user = await test.createUser('test@example.com');
    assertEquals(user.email, 'test@example.com');
  });

  it('should throw auth error', async () => {
    try {
      await test.createUser('dsfsdf');
    } catch (e) {
      assertEquals(e.name, 'RESTlerAuthFailure');
    }
  });
});
