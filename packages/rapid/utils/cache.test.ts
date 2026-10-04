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
import { auth, GET, paging, param, query } from '../decorators/mod.ts';
import { RapidError } from '../errors/mod.ts';
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

const QUIET = { logger: { handlers: [] as never[] } };
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
