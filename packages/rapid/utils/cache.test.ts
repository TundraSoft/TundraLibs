/**
 * @fileoverview The route cache: a GET's data reply stored under
 * route · surface · params (+ key binders) in the bound store, looked up
 * AFTER access, shared between a composed part and a direct visit; the
 * key must cover what the handler reads; the boot refuses a cache with no
 * store.
 * @module
 */
import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { Application } from '../Application.ts';
import type { HTTPContext } from '../context/HTTPContext.ts';
import {
  auth,
  cookie,
  GET,
  header,
  paging,
  param,
  query,
  state,
} from '../decorators/mod.ts';
import { RapidError } from '../errors/mod.ts';
import { getSession, session } from '../middlewares/session.ts';
import { RapidModule } from '../modules/mod.ts';
import type {
  RapidAuthBinding,
  RapidCacheStore,
  RapidComposeSlot,
  RapidContextPaging,
} from '../types/mod.ts';
import { html, template } from '../ui/html.ts';
import { formatAccessReport } from '../cli/commands/access.ts';
import { buildOpenApi } from './buildOpenApi.ts';
import { memoryStore } from './memoryStore.ts';

const QUIET = {
  logger: { handlers: [] as never[] },
  server: { requireResponse: false },
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const binding: RapidAuthBinding = {
  authenticate: (ctx) =>
    ctx.type === 'HTTP' && ctx.headers.get('x-user') !== null
      ? { subject: ctx.headers.get('x-user') }
      : undefined,
  authorize: (ctx) =>
    (ctx.auth as { subject?: string } | undefined)?.subject === 'admin',
};

async function boot(
  mode: 'DEVELOPMENT' | 'PRODUCTION' = 'PRODUCTION',
  store: RapidCacheStore | null = memoryStore(), // null: bind nothing
) {
  const app = await Application.initialize({ name: 'cache', mode, ...QUIET });
  app.auth(binding);
  if (store !== null) app.cache(store);
  return app;
}

const get = (app: Application, path: string, user?: string) =>
  app.fetch(
    new Request(`http://app${path}`, {
      headers: user === undefined ? {} : { 'x-user': user },
    }),
  );

describe('rapid.cache: memoryStore()', () => {
  it('reads what it wrote until the seconds pass, evicts the oldest past max, invalidates one key or a prefix', async () => {
    const store = memoryStore({ max: 2 });
    await store.write('rapid:a:1', 1, 0.05);
    asserts.assertEquals(await store.read('rapid:a:1'), 1);
    await sleep(70);
    asserts.assertEquals(await store.read('rapid:a:1'), undefined);
    await store.write('rapid:a:1', 1, 60);
    await store.write('rapid:a:2', 2, 60);
    await store.write('rapid:b:1', 3, 60); // past max: the oldest goes
    asserts.assertEquals(await store.read('rapid:a:1'), undefined);
    asserts.assertEquals(await store.read('rapid:a:2'), 2);
    await store.invalidate('rapid:a:2');
    asserts.assertEquals(await store.read('rapid:a:2'), undefined);
    await store.write('rapid:b:2', 4, 60);
    await store.invalidate({ prefix: 'rapid:b:' });
    asserts.assertEquals(await store.read('rapid:b:1'), undefined);
    asserts.assertEquals(await store.read('rapid:b:2'), undefined);
  });
});

describe('rapid.cache: a cached route', () => {
  it('serves the stored reply for the same route · surface · params, runs the handler again for other params or after invalidateCache()', async () => {
    const app = await boot();
    let runs = 0;
    app.get('/items/:id:', { cache: { seconds: 60 } }, (ctx) => {
      runs++;
      return { content: { id: ctx.params.id, runs } };
    });
    asserts.assertEquals(await (await get(app, '/items/1')).json(), {
      id: '1',
      runs: 1,
    });
    asserts.assertEquals(await (await get(app, '/items/1')).json(), {
      id: '1',
      runs: 1,
    });
    asserts.assertEquals((await (await get(app, '/items/2')).json()).runs, 2);
    await app.invalidateCache('GET /items/:id:');
    asserts.assertEquals((await (await get(app, '/items/1')).json()).runs, 3);
  });

  it("access runs first: a denied caller never reaches the store, and the admin's entry is never served to anyone else", async () => {
    const app = await boot();
    let runs = 0;
    app.get('/secret/:id:', { access: 'Admin', cache: { seconds: 60 } }, () => {
      runs++;
      return { content: { secret: 'x' } };
    });
    asserts.assertEquals((await get(app, '/secret/1', 'admin')).status, 200);
    const denied = await get(app, '/secret/1', 'member');
    asserts.assertEquals(denied.status, 403);
    asserts.assertEquals((await denied.text()).includes('"x"'), false);
    asserts.assertEquals((await get(app, '/secret/1')).status, 401);
    asserts.assertEquals(runs, 1);
  });

  it('key binders split entries: query() per filter set, auth() per identity; the api surface is its own entry', async () => {
    const app = await Application.initialize({
      name: 'cache-keys',
      mode: 'PRODUCTION',
      ...QUIET,
      server: { api: { prefix: '/api' } },
    });
    app.auth(binding);
    app.cache(memoryStore());
    let runs = 0;
    app.get(
      '/list',
      { cache: { seconds: 60, key: [query(), auth()] } },
      (ctx) => {
        runs++;
        return {
          content: {
            runs,
            filters: ctx.args.query.filters,
            who: (ctx.auth as { subject?: string } | undefined)?.subject ??
              null,
          },
        };
      },
    );
    const runsOf = async (path: string, user?: string) =>
      (await (await get(app, path, user)).json() as { runs: number }).runs;
    asserts.assertEquals(await runsOf('/list'), 1);
    asserts.assertEquals(await runsOf('/list'), 1);
    asserts.assertEquals(await runsOf('/list?name=ada'), 2);
    asserts.assertEquals(await runsOf('/list?name=ada'), 2);
    asserts.assertEquals(await runsOf('/list', 'admin'), 3);
    asserts.assertEquals(await runsOf('/list', 'admin'), 3);
    asserts.assertEquals(await runsOf('/api/list'), 4);
  });

  it('a handler reading a channel the key does not carry is served uncached — a warning in PRODUCTION, a RAPID_CONFIG in DEVELOPMENT', async () => {
    let runs = 0;
    const leaky = (app: Application) =>
      app.get('/page', { cache: { seconds: 60 } }, (ctx) => {
        runs++;
        return { content: { page: ctx.args.paging.page, runs } };
      });
    const prod = await boot('PRODUCTION');
    leaky(prod);
    asserts.assertEquals((await (await get(prod, '/page')).json()).runs, 1);
    asserts.assertEquals((await (await get(prod, '/page')).json()).runs, 2);
    const dev = await boot('DEVELOPMENT');
    leaky(dev);
    const res = await get(dev, '/page');
    asserts.assertEquals(res.status, 500);
    asserts.assertEquals((await res.json()).code, 'RAPID_CONFIG');
  });

  it('a raw read of a state key this request set needs state(key) in the key — an app-wide state value does not', async () => {
    const shared = { region: 'eu' };
    const tenantApp = async (
      mode: 'DEVELOPMENT' | 'PRODUCTION',
      key: readonly ReturnType<typeof state>[] = [],
    ) => {
      const app = await Application.initialize(
        { name: 'cache-state', mode, ...QUIET },
        { shared, org: null as string | null },
      );
      app.cache(memoryStore());
      // A reach middleware: the tenant comes from the request.
      app.use((ctx, next) => {
        if (ctx.type === 'HTTP') ctx.state.org = ctx.headers.get('x-org');
        return next();
      });
      let runs = 0;
      app.get('/rows', { cache: { seconds: 60, key } }, (ctx) => {
        runs++;
        return {
          content: {
            org: ctx.state.org,
            region: ctx.state.shared.region,
            runs,
          },
        };
      });
      const as = async (org: string) =>
        await (await app.fetch(
          new Request('http://app/rows', { headers: { 'x-org': org } }),
        )).json();
      return { app, as };
    };

    // Unkeyed: never one tenant's rows for another — uncached in PRODUCTION.
    const prod = await tenantApp('PRODUCTION');
    asserts.assertEquals((await prod.as('acme')).org, 'acme');
    asserts.assertEquals((await prod.as('globex')).org, 'globex');
    const dev = await tenantApp('DEVELOPMENT');
    const refused = await dev.app.fetch(
      new Request('http://app/rows', { headers: { 'x-org': 'acme' } }),
    );
    asserts.assertEquals(refused.status, 500);
    asserts.assertStringIncludes(
      (await refused.json()).message,
      "state('org')",
    );

    // Keyed by the tenant: cached per tenant, and the shared value is fine.
    const keyed = await tenantApp('DEVELOPMENT', [state('org')]);
    asserts.assertEquals(await keyed.as('acme'), {
      org: 'acme',
      region: 'eu',
      runs: 1,
    });
    asserts.assertEquals((await keyed.as('globex')).runs, 2);
    asserts.assertEquals((await keyed.as('acme')).runs, 1);
  });

  it('requests that miss one key together share one run — and a run that stores nothing is shared with no one', async () => {
    const app = await boot();
    const runs = { kept: 0, gone: 0 };
    app.get('/kept', { cache: { seconds: 60 } }, async () => {
      const n = ++runs.kept;
      await sleep(20);
      return { content: { n } };
    });
    app.get('/gone', { cache: { seconds: 60 } }, async () => {
      const n = ++runs.gone;
      await sleep(20);
      return { status: 404, content: { n } };
    });
    const together = (path: string) =>
      Promise.all(Array.from({ length: 20 }, () => get(app, path)));
    const kept = await together('/kept');
    asserts.assertEquals(runs.kept, 1);
    for (const res of kept) asserts.assertEquals(await res.json(), { n: 1 });
    const gone = await together('/gone');
    asserts.assertEquals(runs.gone, 20);
    asserts.assertEquals(
      (await Promise.all(gone.map((res) => res.json()))).map((b) => b.n).sort(
        (x, y) => x - y,
      ),
      Array.from({ length: 20 }, (_, i) => i + 1),
    );
  });

  it('only a 2xx data reply without cookies is stored', async () => {
    const app = await boot();
    const runs = { miss: 0, redirect: 0, cookie: 0 };
    app.get('/miss', { cache: { seconds: 60 } }, () => {
      runs.miss++;
      return { status: 404, content: { gone: true } };
    });
    app.get('/go', { cache: { seconds: 60 } }, (ctx) => {
      runs.redirect++;
      return ctx.redirect('/miss');
    });
    app.get('/cookie', { cache: { seconds: 60 } }, () => {
      runs.cookie++;
      return { content: { ok: true }, cookies: [{ name: 'seen', value: '1' }] };
    });
    for (const path of ['/miss', '/go', '/cookie']) {
      await get(app, path);
      await get(app, path);
    }
    asserts.assertEquals(runs, { miss: 2, redirect: 2, cookie: 2 });
  });

  it('a store that throws is a miss on read and a logged failure on write — the reply still goes out', async () => {
    const broken: RapidCacheStore = {
      read: () => {
        throw new Error('down');
      },
      write: () => {
        throw new Error('down');
      },
      invalidate: () => {},
    };
    const app = await boot('PRODUCTION', broken);
    app.get(
      '/x',
      { cache: { seconds: 60 } },
      () => ({ content: { ok: true } }),
    );
    asserts.assertEquals(await (await get(app, '/x')).json(), { ok: true });
  });
});

const STATS = template<{ code: string; n: number }>((d) =>
  html`<b>${d.code}:${d.n}</b>`
);
const PAGE = template<{ parts: Record<string, RapidComposeSlot> }>((d) =>
  html`<main>${d.parts.stats?.html}</main>`
);
let statsRuns = 0;

class Stats extends RapidModule {
  readonly name = 'Stats';
  readonly namespace = 'org';
  protected readonly events = {};

  @GET('/orgs/:code:/stats', {
    bind: [param('code')],
    template: STATS,
    cache: { seconds: 60 },
  })
  stats(code: string) {
    statsRuns++;
    return { content: { code, n: statsRuns } };
  }

  @GET('/orgs/:code:', {
    bind: [param('code')],
    template: PAGE,
    compose: { stats: 'org:Stats:stats' },
  })
  page(_code: string) {
    return { content: {} };
  }
}

class Leaky extends RapidModule {
  readonly name = 'Leaky';
  readonly namespace = 'org';
  protected readonly events = {};

  @GET('/people/:code:', {
    bind: [param('code'), paging()],
    cache: { seconds: 60 },
  })
  list(code: string, window: RapidContextPaging) {
    return { content: { code, page: window.page } };
  }
}

describe('rapid.cache: modules and composition', () => {
  it("a composed part inherits its route's cache, and a direct visit shares the entry", async () => {
    statsRuns = 0;
    const app = await Application.initialize({
      name: 'cache-compose',
      mode: 'PRODUCTION',
      ...QUIET,
      ui: { prefer: 'html' },
    });
    app.auth(binding);
    app.cache(memoryStore());
    await app.modules({ modules: [{ Stats }] });
    asserts.assertStringIncludes(
      await (await get(app, '/orgs/acme')).text(),
      '<b>acme:1</b>',
    );
    asserts.assertStringIncludes(
      await (await get(app, '/orgs/acme')).text(),
      '<b>acme:1</b>',
    );
    asserts.assertStringIncludes(
      await (await get(app, '/orgs/acme/stats')).text(),
      '<b>acme:1</b>',
    );
    asserts.assertStringIncludes(
      await (await get(app, '/orgs/other/stats')).text(),
      '<b>other:2</b>',
    );
    await app.invalidateCache('org:Stats:stats');
    asserts.assertStringIncludes(
      await (await get(app, '/orgs/acme')).text(),
      '<b>acme:3</b>',
    );
  });

  it('a decorated route whose binders read what the key does not carry fails at mount', async () => {
    const app = await boot();
    const error = await asserts.assertRejects(
      () => app.modules({ modules: [{ Leaky }] }),
      RapidError,
    );
    asserts.assertEquals(error.code, 'RAPID_CONFIG');
    asserts.assertStringIncludes(error.message, 'add paging() to key');
  });
});

describe('rapid.cache: the declaration and the store', () => {
  it('cache on a non-GET route, bad seconds and a non-key binder are refused at registration', async () => {
    const app = await boot();
    const refused = (fn: () => unknown, fragment: string) => {
      const error = asserts.assertThrows(fn, RapidError);
      asserts.assertEquals(error.code, 'RAPID_CONFIG');
      asserts.assertStringIncludes(error.message, fragment);
    };
    const handler = () => ({ content: {} });
    refused(
      () => app.post('/w', { cache: { seconds: 1 } }, handler),
      'cache is for GET routes',
    );
    refused(
      () => app.get('/s', { cache: { seconds: 0 } }, handler),
      'positive number of seconds',
    );
    refused(
      () =>
        app.get('/k', { cache: { seconds: 1, key: [param('x')] } }, handler),
      'cache.key takes',
    );
  });

  it('a route declaring cache with no store fails the boot; app.cache() binds once and checks the shape', async () => {
    const app = await boot('PRODUCTION', null);
    app.get('/x', { cache: { seconds: 1 } }, () => ({ content: {} }));
    const error = await asserts.assertRejects(
      async () => await get(app, '/x'),
      RapidError,
    );
    asserts.assertEquals(error.code, 'RAPID_CACHE_UNBOUND');
    await asserts.assertRejects(
      () => app.invalidateCache('GET /x'),
      RapidError,
      'needs a cache store',
    );
    app.cache(memoryStore());
    asserts.assertThrows(
      () => app.cache(memoryStore()),
      RapidError,
      'binds once',
    );
    const other = await Application.initialize({ name: 'shape', ...QUIET });
    asserts.assertThrows(
      () => other.cache({ read: () => undefined } as never),
      RapidError,
      'takes { read, write, invalidate }',
    );
  });

  it('the audit and OpenAPI show the cache policy', async () => {
    const app = await boot();
    app.get(
      '/items/:id:',
      { cache: { seconds: 30, key: [query()] } },
      () => ({ content: {} }),
    );
    const row = app.accessReport().find((r) => r.action === 'GET /items/:id:')!;
    asserts.assertEquals(row.cache, '30s +query');
    asserts.assertStringIncludes(
      formatAccessReport([row]),
      'GET /items/:id:  public  cache 30s +query',
    );
    const doc = buildOpenApi(app.routes, {}) as {
      paths: Record<string, Record<string, Record<string, unknown>>>;
    };
    asserts.assertEquals(doc.paths['/items/{id}']!['get']!['x-cache'], 30);
  });
});

class Vault extends RapidModule {
  readonly name = 'Vault';
  readonly namespace = 'org';
  protected readonly events = {};
  static runs = 0;
  static down = false;

  @GET('/vault/:code:/secret', {
    bind: [param('code')],
    template: STATS,
    cache: { seconds: 60 },
    access: 'Admin',
  })
  secret(code: string) {
    Vault.runs++;
    return { content: { code: `secret-${code}`, n: 1 } };
  }

  @GET('/vault/:code:/health', {
    bind: [param('code')],
    template: STATS,
    cache: { seconds: 60 },
  })
  health(code: string) {
    Vault.runs++;
    return Vault.down
      ? { status: 503, content: { code: 'down', n: 0 } }
      : { content: { code, n: Vault.runs } };
  }

  @GET('/vault/:code:', {
    bind: [param('code')],
    template: template<{ parts: Record<string, RapidComposeSlot> }>((d) =>
      html`<main>${d.parts.secret?.html}${d.parts.health?.html}</main>`
    ),
    compose: { secret: 'org:Vault:secret', health: 'org:Vault:health' },
  })
  page(_code: string) {
    return { content: {} };
  }
}

describe('rapid.cache: what a stored reply may reach', () => {
  const vault = async (mode: 'DEVELOPMENT' | 'PRODUCTION' = 'PRODUCTION') => {
    Vault.runs = 0;
    Vault.down = false;
    const app = await Application.initialize({
      name: 'cache-vault',
      mode,
      ...QUIET,
      ui: { prefer: 'html' },
    });
    app.auth(binding);
    app.cache(memoryStore());
    await app.modules({ modules: [{ Vault }] });
    return app;
  };
  const text = async (app: Application, path: string, user?: string) =>
    await (await get(app, path, user)).text();

  it("a composed part's stored reply is reached only by a caller its access lets through", async () => {
    const app = await vault();
    asserts.assertStringIncludes(
      await text(app, '/vault/acme', 'admin'),
      '<b>secret-acme:1</b>',
    );
    for (const [user, status] of [['member', 403], [undefined, 401]] as const) {
      const page = await text(app, '/vault/acme', user);
      asserts.assertStringIncludes(
        page,
        `data-part="secret" data-status="${status}"`,
      );
      asserts.assertEquals(page.includes('secret-acme'), false);
    }
    // The admin still reads the stored tile: neither method ran again.
    const runs = Vault.runs;
    asserts.assertStringIncludes(
      await text(app, '/vault/acme', 'admin'),
      '<b>secret-acme:1</b>',
    );
    asserts.assertEquals(Vault.runs, runs);
  });

  it('a part stores only what a direct visit would, and the two share the entry in both directions', async () => {
    const app = await vault('DEVELOPMENT');
    // Direct visit first: stored, and the page then reads that entry.
    asserts.assertStringIncludes(await text(app, '/vault/a/health'), 'a:1');
    asserts.assertStringIncludes(
      await text(app, '/vault/a', 'admin'),
      'data-part="health" data-status="200"><b>a:1</b>',
    );
    // A 503 from the part is shown but never stored.
    Vault.down = true;
    asserts.assertStringIncludes(await text(app, '/vault/b', 'admin'), 'down');
    Vault.down = false;
    asserts.assertEquals((await get(app, '/vault/b/health')).status, 200);
  });

  it('a session read in a cached handler needs the session cookie in the key, though the session was loaded before the handler ran', async () => {
    for (const mode of ['PRODUCTION', 'DEVELOPMENT'] as const) {
      const app = await Application.initialize({
        name: 'cache-session',
        mode,
        secret: 'x'.repeat(40),
        ...QUIET,
      });
      app.preAuth(session());
      app.auth({
        authenticate: async (ctx) => {
          const user = (await getSession(ctx))?.get('user');
          return user === undefined ? undefined : { subject: user };
        },
        authorize: () => true,
      });
      app.cache(memoryStore());
      app.get('/login/:user:', async (ctx) => {
        (await getSession(ctx))!.set('user', ctx.args.params.user);
        return { content: {} };
      });
      const me = async (ctx: HTTPContext) => ({
        content: { me: (await getSession(ctx))?.get('user') },
      });
      app.get('/me', { cache: { seconds: 60 } }, me);
      app.get(
        '/me/keyed',
        { cache: { seconds: 60, key: [cookie('sid')] } },
        me,
      );
      const as = async (user: string, path: string) => {
        const login = await app.fetch(new Request(`http://app/login/${user}`));
        const sid = login.headers.getSetCookie().map((c) => c.split(';')[0])
          .join('; ');
        return await app.fetch(
          new Request(`http://app${path}`, { headers: { cookie: sid } }),
        );
      };
      await as('alice', '/me');
      const bob = await as('bob', '/me');
      if (mode === 'PRODUCTION') {
        asserts.assertEquals(await bob.json(), { me: 'bob' });
      } else {
        asserts.assertStringIncludes(
          (await bob.json()).message,
          "cookie('sid')",
        );
      }
      await as('alice', '/me/keyed');
      asserts.assertEquals(await (await as('bob', '/me/keyed')).json(), {
        me: 'bob',
      });
    }
  });

  it('reads through ctx.url and ctx.request are seen, and a header or cookie is covered by name, not by any binder of its kind', async () => {
    const app = await boot();
    const who = (via: 'headers' | 'request') => (c: HTTPContext) => {
      return {
        content: {
          who: (via === 'headers' ? c.headers : c.request.headers).get('x-who'),
          q: new URL(via === 'headers' ? c.url : c.request.url).searchParams
            .get('q'),
        },
      };
    };
    app.get('/a', { cache: { seconds: 60 } }, who('headers'));
    app.get('/b', { cache: { seconds: 60 } }, who('request'));
    // A header binder for ANOTHER header, and query(), are in the key.
    app.get(
      '/c',
      { cache: { seconds: 60, key: [header('accept-language'), query()] } },
      who('headers'),
    );
    app.get(
      '/d',
      { cache: { seconds: 60, key: [header('X-Who'), query()] } },
      who('headers'),
    );
    const ask = async (path: string, name: string) =>
      await (await app.fetch(
        new Request(`http://app${path}?q=${name}`, {
          headers: { 'x-who': name },
        }),
      )).json();
    for (const path of ['/a', '/b', '/c', '/d']) {
      await ask(path, 'alice');
      asserts.assertEquals(await ask(path, 'bob'), { who: 'bob', q: 'bob' });
    }

    class Token extends RapidModule {
      readonly name = 'Token';
      readonly namespace = 'org';
      protected readonly events = {};
      @GET('/token', {
        bind: [header('authorization')],
        cache: { seconds: 60, key: [header('accept-language')] },
      })
      token(value: string | null) {
        return { content: { value } };
      }
    }
    const error = await asserts.assertRejects(
      async () => (await boot()).modules({ modules: [{ Token }] }),
      RapidError,
    );
    asserts.assertStringIncludes(error.message, "header('authorization')");
  });

  it('two versions of one path never share an entry, HEAD shares its GET entry, and one invalidation drops them all', async () => {
    const app = await Application.initialize({
      name: 'cache-versions',
      mode: 'PRODUCTION',
      ...QUIET,
      server: { versioning: { mode: 'path' } },
    });
    app.cache(memoryStore());
    let runs = 0;
    for (const version of ['v1', 'v2']) {
      app.get('/v', { version, cache: { seconds: 60 } }, () => ({
        content: `${version}:${++runs}`,
      }));
    }
    const ask = async (path: string, method = 'GET') => {
      const reply = await app.fetch(
        new Request(`http://app${path}`, { method }),
      );
      return method === 'GET'
        ? await reply.text()
        : reply.headers.get('content-length');
    };
    asserts.assertEquals(await ask('/v1/v'), 'v1:1');
    asserts.assertEquals(await ask('/v2/v'), 'v2:2');
    asserts.assertEquals(await ask('/v1/v', 'HEAD'), '4');
    asserts.assertEquals(runs, 2);
    await app.invalidateCache('GET /v');
    asserts.assertEquals(await ask('/v2/v'), 'v2:3');
    asserts.assertEquals(await ask('/v1/v'), 'v1:4');
  });

  it("a hit replays the reply's headers and those the handler set on the context", async () => {
    const app = await boot();
    app.get('/csv', { cache: { seconds: 60 } }, (ctx) => {
      ctx.setHeader('x-rows', '2');
      return { content: 'a,b', headers: { 'content-type': 'text/csv' } };
    });
    for (const _ of [1, 2]) {
      const reply = await get(app, '/csv');
      asserts.assertEquals(reply.headers.get('content-type'), 'text/csv');
      asserts.assertEquals(reply.headers.get('x-rows'), '2');
    }
  });

  it('a BigInt in a key value is keyed, not a 500', async () => {
    const app = await Application.initialize({
      name: 'cache-bigint',
      mode: 'PRODUCTION',
      ...QUIET,
    });
    app.auth({
      authenticate: (ctx) =>
        ctx.type === 'HTTP'
          ? { grants: BigInt(ctx.headers.get('x-grants') ?? '0') }
          : undefined,
      authorize: () => true,
    });
    app.cache(memoryStore());
    let runs = 0;
    app.get('/g', { cache: { seconds: 60, key: [auth()] } }, () => ({
      content: { runs: ++runs },
    }));
    const ask = async (grants: string) =>
      await (await app.fetch(
        new Request('http://app/g', { headers: { 'x-grants': grants } }),
      )).json();
    asserts.assertEquals(await ask('1'), { runs: 1 });
    asserts.assertEquals(await ask('1'), { runs: 1 });
    asserts.assertEquals(await ask('2'), { runs: 2 });
  });
});
