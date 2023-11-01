import {
  RESTler,
  RESTlerAuthFailure,
  RESTlerOptions,
  RESTlerRequest,
} from '../mod.ts';
import {
  afterEach,
  assertEquals,
  assertThrows,
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
    const handler = async (req: Request) => {
      const path = new URL(req.url, 'http://localhost:8000').pathname,
        method = req.method,
        respHeaders = new Headers();
      respHeaders.set('content-type', 'application/json');
      respHeaders.set('accept', 'application/json');
      // console.log(path, method)

      if (path === '/auth' && method === 'POST') {
        return new Response(JSON.stringify({ token: '123' }), { status: 200 });
      } else if (path === '/users' && method === 'POST') {
        if (
          req.headers.has('X-Authorization') === false ||
          req.headers.get('X-Authorization') !== '123'
        ) {
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
    const serv = Deno.serve({ port: port, signal: sig.signal }, handler);
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

    protected _authenticate(): void {
      // console.log('In Authenticate');
      if (this.doAuth === true) {
        this._authKey = '123';
      }
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
