/**
 * @fileoverview Tests for the client generator: the generated client is
 * written to disk, imported, and driven against the application it was
 * generated from.
 * @module
 */
import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { isDeno } from '@tundralibs/compat/runtime';
import { makeDir, removeDir, writeTextFile } from '@tundralibs/compat/file';
import { Guardian } from '@tundralibs/guardian';
import { Application } from '../../Application.ts';
import {
  GET,
  Module,
  param,
  payload,
  POST,
  query,
} from '../../decorators/mod.ts';
import {
  assembleOpenApi,
  mountedSecuritySchemes,
  openapi,
} from '../../endpoints/openapi.ts';
import { RapidError } from '../../errors/mod.ts';
import type { RapidContextResponse } from '../../types/mod.ts';
import { generateSdk } from './generateSdk.ts';

const UUID = '6f1c2f6e-8a57-4a39-9d1b-3f6a0c9a2b11';

const User = Guardian.object({
  id: Guardian.string().uuid(),
  name: Guardian.string().minLength(2),
  role: Guardian.enum(['admin', 'user'] as const),
});
const NewUser = Guardian.object({
  name: Guardian.string().minLength(2),
  role: Guardian.enum(['admin', 'user'] as const),
});
const Search = Guardian.object({
  role: Guardian.enum(['admin', 'user'] as const).optional(),
});

@Module('Users', { prefix: '/users' })
class Users {
  @GET('/', { bind: [query(Search)], response: Guardian.array(User) })
  list(search: { role?: 'admin' | 'user' }): RapidContextResponse {
    return {
      content: [{ id: UUID, name: 'Ada', role: search.role ?? 'user' }],
    };
  }

  @GET('/:id:', {
    bind: [param('id', Guardian.string().uuid())],
    response: User,
  })
  find(id: string): RapidContextResponse {
    throw new RapidError('RAPID_NOT_FOUND', { details: { id } });
  }

  @POST('/', { bind: [payload(NewUser)], response: User })
  create(body: { name: string; role: 'admin' | 'user' }): RapidContextResponse {
    return { content: { id: UUID, ...body } };
  }
}

@Module('Vault', { prefix: '/vault' })
class Vault {
  @GET('/token', { security: ['bearerAuth'] })
  token(): RapidContextResponse {
    return { content: {} };
  }

  @GET('/keys', { security: ['headerKey', 'queryKey', 'cookieKey'] })
  keys(): RapidContextResponse {
    return { content: {} };
  }
}

type Fetch = typeof globalThis.fetch;
type Failure = {
  code: string;
  transient: boolean;
  getContextValue(key: string): unknown;
};
type Client = {
  usersList(query?: { role?: string }): Promise<unknown>;
  usersFind(id: string): Promise<unknown>;
  usersCreate(body: unknown): Promise<unknown>;
  vaultToken(): Promise<unknown>;
  vaultKeys(): Promise<unknown>;
};

let builds = 0;

/** Generate into the package tree (so bare specifiers resolve), import, and bind to `fetch`. */
async function build(
  app: Application,
  fetch: Fetch,
): Promise<{
  client: Client;
  connect: (auth: Record<string, unknown>) => Client;
  entry: string;
  dispose: () => Promise<void>;
}> {
  const dir = new URL(`./tmp/sdk-${Date.now()}-${++builds}/`, import.meta.url);
  const sdk = generateSdk(
    assembleOpenApi(
      app,
      { securitySchemes: mountedSecuritySchemes(app) },
      new Map(),
      '',
    ),
    { name: 'Demo' },
  );
  await makeDir(dir.pathname, { recursive: true });
  for (const [file, source] of Object.entries(sdk.files)) {
    await writeTextFile(new URL(file, dir).pathname, source);
  }
  const mod = await import(new URL('mod.ts', dir).href) as {
    Demo: new (options: { baseURL: string; auth?: unknown }) => Client;
  };
  // `_fetch` is RESTler's protected transport seam.
  class Bound extends mod.Demo {
    constructor(auth?: Record<string, unknown>) {
      super({ baseURL: 'http://rapid.test', auth });
      (this as unknown as { _fetch: Fetch })._fetch = fetch;
    }
  }
  return {
    client: new Bound(),
    connect: (auth) => new Bound(auth),
    entry: new URL('mod.ts', dir).pathname,
    dispose: () =>
      removeDir(new URL('./tmp/', import.meta.url).pathname, {
        recursive: true,
      }),
  };
}

const failure = async (call: Promise<unknown>): Promise<Failure> => {
  try {
    await call;
  } catch (error) {
    return error as Failure;
  }
  throw new asserts.AssertionError('expected the call to reject');
};

describe('rapid.cli sdk generateSdk', () => {
  it('the generated client validates arguments, calls the app, and maps its replies and errors', async () => {
    const app = await Application.initialize({
      name: 'sdk-demo',
      logger: { handlers: [] },
    });
    app.module(new Users());
    const sent: string[] = [];
    const { client, entry, dispose } = await build(app, async (input, init) => {
      const request = new Request(input as string, init);
      sent.push(`${request.method} ${new URL(request.url).search}`);
      return await app.fetch(request);
    });
    try {
      // Body argument → validated → sent → reply validated.
      asserts.assertEquals(
        await client.usersCreate({ name: 'Ada', role: 'admin' }),
        { id: UUID, name: 'Ada', role: 'admin' },
      );
      // Query argument reaches the route as a query string.
      asserts.assertEquals(await client.usersList({ role: 'admin' }), [
        { id: UUID, name: 'Ada', role: 'admin' },
      ]);
      asserts.assertEquals(sent, ['POST ', 'GET ?role=admin']);

      // Invalid arguments never reach the network.
      for (
        const call of [
          client.usersCreate({ name: 'A', role: 'admin' }),
          client.usersList({ role: 'root' }),
          client.usersFind('not-a-uuid'),
        ]
      ) {
        asserts.assertEquals((await failure(call)).code, 'REQUEST_INVALID');
      }
      asserts.assertEquals(sent.length, 2);

      // The server's error envelope becomes the client's error class.
      const missing = await failure(client.usersFind(UUID));
      asserts.assertEquals(missing.code, 'RAPID_NOT_FOUND');
      asserts.assertEquals(missing.transient, false);
      asserts.assertEquals(missing.getContextValue('status'), 404);
      asserts.assertEquals(missing.getContextValue('details'), { id: UUID });

      // The generated source is TypeScript a consumer compiles: it must
      // type-check. Deno is the one lane with a checker to hand.
      if (isDeno) {
        const check = await new Deno.Command(Deno.execPath(), {
          args: ['check', entry],
          stderr: 'piped',
        }).output();
        asserts.assert(check.success, new TextDecoder().decode(check.stderr));
      }
    } finally {
      await dispose();
      await app.stop();
    }
  });

  it('a reply that breaks the declared schema, an unknown error code and a 503 are each told apart', async () => {
    const app = await Application.initialize({
      name: 'sdk-demo',
      logger: { handlers: [] },
    });
    app.module(new Users());
    let reply: [number, unknown] = [200, {}];
    const { client, dispose } = await build(
      app,
      () => Promise.resolve(Response.json(reply[1], { status: reply[0] })),
    );
    try {
      reply = [200, [{ id: 'not-a-uuid', name: 'Ada', role: 'user' }]];
      asserts.assertEquals(
        (await failure(client.usersList())).code,
        'RESPONSE_INVALID',
      );

      reply = [409, { code: 'ORDER_LOCKED', message: 'locked' }];
      const unknown = await failure(client.usersList());
      asserts.assertEquals(unknown.code, 'UNKNOWN_ERROR');
      asserts.assertEquals(
        unknown.getContextValue('originalCode'),
        'ORDER_LOCKED',
      );

      reply = [503, 'upstream down'];
      const down = await failure(client.usersList());
      asserts.assertEquals(down.code, 'UNKNOWN_ERROR');
      asserts.assertEquals(down.transient, true);
    } finally {
      await dispose();
      await app.stop();
    }
  });

  it('the auth option carries the schemes the routes require, and each credential goes where its scheme declares', async () => {
    const app = await Application.initialize({
      name: 'sdk-auth',
      logger: { handlers: [] },
    });
    app.module(new Vault());
    app.get(
      '/openapi.json',
      openapi({
        securitySchemes: {
          headerKey: { type: 'apiKey', in: 'header', name: 'x-api-key' },
          queryKey: { type: 'apiKey', in: 'query', name: 'key' },
          cookieKey: { type: 'apiKey', in: 'cookie', name: 'sid' },
        },
      }),
    );
    const sent: Record<string, string | null>[] = [];
    const { connect, entry, dispose } = await build(
      app,
      async (input, init) => {
        const request = new Request(input as string, init);
        sent.push({
          authorization: request.headers.get('authorization'),
          key: request.headers.get('x-api-key'),
          cookie: request.headers.get('cookie'),
          search: new URL(request.url).search,
        });
        return await app.fetch(request);
      },
    );
    try {
      await connect({ type: 'BEARER', token: 't0k' }).vaultToken();
      await connect({
        type: 'CUSTOM',
        headerKey: 'h',
        queryKey: 'q',
        cookieKey: 'c d',
      }).vaultKeys();
      asserts.assertEquals(sent, [
        { authorization: 'BEARER t0k', key: null, cookie: null, search: '' },
        {
          authorization: null,
          key: 'h',
          cookie: 'sid=c%20d',
          search: '?key=q',
        },
      ]);

      // The option is narrowed to the declared schemes: BASIC is not one.
      if (isDeno) {
        const use = entry.replace(/mod\.ts$/, 'use.ts');
        await writeTextFile(
          use,
          [
            `import { Demo } from './mod.ts';`,
            `new Demo({ baseURL: 'http://x', auth: { type: 'CUSTOM', queryKey: 'q' } });`,
            `// @ts-expect-error BASIC is not a declared scheme`,
            `new Demo({ baseURL: 'http://x', auth: { type: 'BASIC', username: 'u', password: 'p' } });`,
          ].join('\n'),
        );
        const check = await new Deno.Command(Deno.execPath(), {
          args: ['check', use],
          stderr: 'piped',
        }).output();
        asserts.assert(check.success, new TextDecoder().decode(check.stderr));
      }
    } finally {
      await dispose();
      await app.stop();
    }
  });

  it("notes a required scheme the client cannot send, and keeps RESTler's own auth option when no route requires one", () => {
    const get = (security: string[]) => ({
      get: {
        responses: { '200': { content: { 'application/json': {} } } },
        security: security.map((name) => ({ [name]: [] })),
      },
    });
    const sdk = generateSdk({
      paths: { '/a': get(['partnerKey']), '/b': get(['digest']) },
      components: {
        securitySchemes: { digest: { type: 'http', scheme: 'digest' } },
      },
    }, { name: 'Api' });
    asserts.assertEquals(sdk.notes, [
      'security scheme "partnerKey" is not declared to openapi() or docs(): the client cannot send it',
      'security scheme "digest" uses HTTP digest: the client cannot send it',
    ]);
    asserts.assertStringIncludes(
      sdk.files['Api.ts'] ?? '',
      'export type ApiOptions = RESTlerOptions;',
    );
    asserts.assertThrows(
      () =>
        generateSdk({
          paths: { '/a': get(['type']) },
          components: {
            securitySchemes: {
              type: { type: 'apiKey', in: 'header', name: 'x-key' },
            },
          },
        }),
      Error,
      'rename the scheme',
    );
  });

  it('skips an HTML-only operation, names an operation without an id from its route, and refuses a name clash', () => {
    const ok = (type: string) => ({
      responses: { '200': { content: { [type]: { schema: {} } } } },
    });
    const sdk = generateSdk({
      info: { title: 'shop api' },
      paths: {
        '/page': { get: ok('text/html') },
        '/orders/{id}': { get: ok('application/json') },
      },
    });
    asserts.assertEquals(sdk.skipped, ['GET /page: answers HTML only']);
    asserts.assertEquals(sdk.methods, ['getOrdersId']);
    asserts.assert('ShopApi.ts' in sdk.files);
    asserts.assertThrows(
      () =>
        generateSdk({
          paths: {
            '/a': { get: { ...ok('application/json'), operationId: 'x' } },
            '/b': { get: { ...ok('application/json'), operationId: 'x' } },
          },
        }),
      Error,
      'give the route an operationId',
    );
  });
});
