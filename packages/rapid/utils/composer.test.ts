/**
 * @fileoverview The composer: a page's parts run in-process under ONE
 * request, each judged by its own `access` for the page's caller and
 * rendered by its own template; deferred parts come back through one
 * `?parts=` fetch; the boot refuses what cannot run; the caps hold.
 * @module
 */
import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { Application } from '../Application.ts';
import {
  Action,
  GET,
  Module,
  paging,
  param,
  POST,
  state,
} from '../decorators/mod.ts';
import { RapidError } from '../errors/mod.ts';
import { RapidModule } from '../modules/mod.ts';
import type {
  RapidApplicationOptions,
  RapidAuthBinding,
  RapidComposeSlot,
  RapidContextPaging,
} from '../types/mod.ts';
import { html, template } from '../ui/html.ts';
import { UI_RUNTIME } from '../ui/ui.ts';
import { memoryStore } from './memoryStore.ts';
import { buildOpenApi } from './buildOpenApi.ts';

const QUIET = { logger: { handlers: [] as never[] } };

/** `x-user` names the caller; `admin` sees billing, `member` does not; `broken` breaks the store. */
const HOLDS: Record<string, readonly string[]> = {
  admin: ['Org:VIEW', 'Billing:VIEW'],
  member: ['Org:VIEW'],
};
const binding: RapidAuthBinding = {
  authenticate: (ctx) => {
    if (ctx.type !== 'HTTP') return undefined;
    const user = ctx.headers.get('x-user');
    if (user === 'broken') throw new Error('session store down');
    return user === null ? undefined : { subject: user };
  },
  authorize: (ctx, access) => {
    const subject = (ctx.auth as { subject?: string } | undefined)?.subject;
    return (HOLDS[subject ?? ''] ?? []).includes(access);
  },
};

type Dash = { title: string; parts: Record<string, RapidComposeSlot> };
const DASH = template<Dash>((d) =>
  html`<h1>${d.title}</h1>${d.parts.stats?.html}${d.parts.billing?.html}${d.parts.people?.html}${d.parts.slow?.html}`
);
const STATS = template<{ code: string; total: number }>((d) =>
  html`<b>${d.code}:${d.total}</b>`
);
const SUB = template<{ plan: string }>((d) => html`<i>${d.plan}</i>`);
const PEOPLE = template<{ code: string; page: number }>((d) =>
  html`<ul data-code="${d.code}">page ${d.page}</ul>`
);

/** How many parts ran at once, at most — what `concurrency` bounds. */
let inflight = 0;
let peak = 0;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const EVENTS = {};

class Organisations extends RapidModule<typeof EVENTS> {
  readonly name = 'Organisations';
  readonly namespace = 'org';
  protected readonly events = EVENTS;

  @GET('/orgs/:code:/stats', {
    bind: [param('code')],
    access: 'Org:VIEW',
    template: STATS,
  })
  async stats(code: string) {
    inflight++;
    peak = Math.max(peak, inflight);
    await sleep(20);
    inflight--;
    return { content: { code, total: 3 } };
  }

  @GET('/orgs/:code:', {
    bind: [param('code')],
    access: 'Org:VIEW',
    template: DASH,
    compose: {
      stats: 'org:Organisations:stats',
      billing: 'org:Billing:subscription',
      people: { action: 'org:People:list', defer: true },
      raw: 'org:Billing:plan',
    },
  })
  dashboard(code: string) {
    return { content: { title: `Dash ${code}` } };
  }

  /** The page's path param under another name, mapped onto the part's. */
  @GET('/teams/:team:', {
    bind: [param('team')],
    access: 'Org:VIEW',
    template: DASH,
    compose: {
      stats: { action: 'org:Organisations:stats', params: { code: 'team' } },
    },
  })
  team(team: string) {
    return { content: { title: team } };
  }

  /** A public page composing a guarded part — where an auth outage shows per part. */
  @GET('/public/:code:', {
    bind: [param('code')],
    template: DASH,
    compose: { stats: 'org:Organisations:stats' },
  })
  open(code: string) {
    return { content: { title: `Open ${code}` } };
  }
}

class Billing extends RapidModule<typeof EVENTS> {
  readonly name = 'Billing';
  readonly namespace = 'org';
  protected readonly events = EVENTS;

  @GET('/orgs/:code:/subscription', {
    bind: [param('code')],
    access: 'Billing:VIEW',
    template: SUB,
  })
  async subscription(_code: string) {
    inflight++;
    peak = Math.max(peak, inflight);
    await sleep(20);
    inflight--;
    return { content: { plan: 'pro' } };
  }

  @Action()
  plan() {
    return { tier: 1 };
  }

  @POST('/orgs/:code:/rename', { bind: [param('code')] })
  rename(_code: string) {
    return { content: { ok: true } };
  }
}

class People extends RapidModule<typeof EVENTS> {
  readonly name = 'People';
  readonly namespace = 'org';
  protected readonly events = EVENTS;

  @GET('/orgs/:code:/people', {
    bind: [param('code'), paging()],
    access: 'Org:VIEW',
    template: PEOPLE,
  })
  list(code: string, window: RapidContextPaging) {
    return { content: { code, page: window.page } };
  }

  @GET('/orgs/:code:/slow', { bind: [param('code')], template: SUB })
  async slow(_code: string) {
    await sleep(150);
    return { content: { plan: 'late' } };
  }
}

async function boot(
  ui: RapidApplicationOptions['ui'] = { prefer: 'html' },
  extra: (app: Application) => void = () => {},
) {
  const app = await Application.initialize({ name: 'compose', ...QUIET, ui });
  app.auth(binding);
  extra(app);
  await app.modules({ modules: [{ Organisations, Billing, People }] });
  return app;
}

const get = (app: Application, path: string, user?: string) =>
  app.fetch(
    new Request(`http://app${path}`, {
      headers: user === undefined ? {} : { 'x-user': user },
    }),
  );

const bootError = async (
  app: Application,
  path: string,
  code: string,
  fragment: string,
) => {
  const error = await asserts.assertRejects(
    async () => await get(app, path, 'admin'),
    RapidError,
  );
  asserts.assertEquals(error.code, code);
  asserts.assertStringIncludes(error.message, fragment);
};

describe('rapid.compose: first paint', () => {
  it("runs the immediate parts for the page's caller, renders each through its own template, places a one-fetch loader for the deferred ones", async () => {
    const app = await boot();
    const res = await get(app, '/orgs/acme', 'admin');
    asserts.assertEquals(res.status, 200);
    asserts.assertEquals(res.headers.get('cache-control'), 'private, no-store');
    const body = await res.text();
    asserts.assertStringIncludes(body, '<h1>Dash acme</h1>');
    asserts.assertStringIncludes(
      body,
      '<div data-part="stats" data-status="200"><b>acme:3</b></div>',
    );
    asserts.assertStringIncludes(
      body,
      '<div data-part="billing" data-status="200"><i>pro</i></div>',
    );
    asserts.assertStringIncludes(
      body,
      '<div data-part="people" data-status="202" data-action="/orgs/acme?parts=people" data-load data-compose aria-busy="true"></div>',
    );
  });

  it('a part the caller may not reach is its 403 fragment — never its content; the page still renders', async () => {
    const app = await boot();
    const body = await (await get(app, '/orgs/acme', 'member')).text();
    asserts.assertStringIncludes(body, '<b>acme:3</b>');
    asserts.assertStringIncludes(
      body,
      '<div data-part="billing" data-status="403">',
    );
    asserts.assertStringIncludes(body, 'Access denied');
    asserts.assertEquals(body.includes('pro'), false);
    // The page's own access gates everything first.
    asserts.assertEquals((await get(app, '/orgs/acme')).status, 401);
  });

  it('a part error tells its template it is a part: data.part is the slot name, and the default page renders a notice, not a page', async () => {
    const plain = await boot();
    const body = await (await get(plain, '/orgs/acme', 'member')).text();
    const billing = body.slice(body.indexOf('<div data-part="billing"'));
    asserts.assertStringIncludes(billing, 'class="rapid-error" role="status"');
    asserts.assertEquals(billing.includes('<h1'), false);

    const seen: unknown[] = [];
    const custom = await boot({
      prefer: 'html',
      errorTemplates: {
        default: template<Record<string, unknown>>((e) => {
          seen.push(e.part);
          return html`<em>${e.status}</em>`;
        }),
      },
    });
    await (await get(custom, '/orgs/acme', 'member')).body?.cancel();
    asserts.assertEquals(seen, ['billing']);
  });

  it('the JSON face carries the data envelopes: content for a reachable part, the error envelope for a denied one, 202 for a deferred one', async () => {
    const app = await boot({ prefer: 'json' });
    const body = await (await get(app, '/orgs/acme', 'member')).json() as Dash;
    asserts.assertEquals(body.parts.stats, {
      status: 200,
      content: { code: 'acme', total: 3 },
    });
    asserts.assertEquals(body.parts.raw, { status: 200, content: { tier: 1 } });
    asserts.assertEquals(body.parts.people, { status: 202, deferred: true });
    asserts.assertEquals(body.parts.billing!.status, 403);
    asserts.assertEquals(
      (body.parts.billing!.content as { code: string }).code,
      'RAPID_ACCESS_DENIED',
    );
    asserts.assertEquals(
      'plan' in (body.parts.billing!.content as object),
      false,
    );
  });

  it('params: { target: pageParam } feeds a part from a differently named path param', async () => {
    const app = await boot();
    const body = await (await get(app, '/teams/t-1', 'admin')).text();
    asserts.assertStringIncludes(body, '<b>t-1:3</b>');
  });

  it('an auth outage: a public page serves, its guarded part answers 503', async () => {
    const app = await boot();
    const res = await get(app, '/public/acme', 'broken');
    asserts.assertEquals(res.status, 200);
    asserts.assertStringIncludes(
      await res.text(),
      '<div data-part="stats" data-status="503">',
    );
  });

  it('a composed handler must reply with object content; a redirect passes through untouched', async () => {
    const app = await boot(undefined, (a) => {
      a.get(
        '/bad/:code:',
        { compose: { stats: 'org:Organisations:stats' } },
        () => ({ content: 'text' }),
      );
      a.get(
        '/go/:code:',
        { compose: { stats: 'org:Organisations:stats' } },
        (ctx) => ctx.redirect('/orgs/acme'),
      );
    });
    asserts.assertEquals((await get(app, '/bad/acme', 'admin')).status, 500);
    const res = await get(app, '/go/acme', 'admin');
    asserts.assertEquals(res.status, 302);
    asserts.assertEquals(res.headers.get('location'), '/orgs/acme');
  });
});

describe('rapid.compose: the follow-up fetch', () => {
  it('?parts=a,b answers exactly those wrappers, in declaration order, as a no-store fragment; a non-deferred part may be asked for too', async () => {
    const app = await boot();
    const res = await get(app, '/orgs/acme?parts=people,stats&page=2', 'admin');
    asserts.assertEquals(res.status, 200);
    asserts.assertStringIncludes(res.headers.get('content-type')!, 'text/html');
    asserts.assertEquals(res.headers.get('cache-control'), 'private, no-store');
    asserts.assertEquals(
      await res.text(),
      '<div data-part="stats" data-status="200"><b>acme:3</b></div>' +
        '<div data-part="people" data-status="200"><ul data-code="acme">page 2</ul></div>',
    );
    // The page's access gates the fetch too.
    asserts.assertEquals(
      (await get(app, '/orgs/acme?parts=people')).status,
      401,
    );
  });

  it('a selection outside the declared set is a 400 naming why', async () => {
    const app = await boot({ prefer: 'json' }); // errors as JSON envelopes
    const reason = async (query: string) => {
      const res = await get(app, `/orgs/acme?${query}`, 'admin');
      asserts.assertEquals(res.status, 400);
      const body = await res.json() as {
        code: string;
        details: { reason: string };
      };
      asserts.assertEquals(body.code, 'RAPID_COMPOSE_PARTS');
      return body.details.reason;
    };
    asserts.assertEquals(await reason('parts=nope'), 'unknown');
    asserts.assertEquals(await reason('parts=people,people'), 'repeated');
    asserts.assertEquals(await reason('parts='), 'empty');
    asserts.assertEquals(
      await reason('parts=people&parts=stats'),
      'repeated-query',
    );
    // Markup is what the fetch delivers — an untemplated part has none.
    asserts.assertEquals(await reason('parts=raw'), 'untemplated');
  });

  it('on the api surface the fetch is JSON data, untemplated parts included', async () => {
    const app = await Application.initialize({
      name: 'compose-api',
      ...QUIET,
      server: { api: { prefix: '/api' } },
      ui: { prefer: 'html' },
    });
    app.auth(binding);
    await app.modules({ modules: [{ Organisations, Billing, People }] });
    const body =
      await (await get(app, '/api/orgs/acme?parts=raw,stats', 'admin'))
        .json() as { parts: Record<string, RapidComposeSlot> };
    asserts.assertEquals(body.parts.raw, { status: 200, content: { tier: 1 } });
    asserts.assertEquals(body.parts.stats!.content, { code: 'acme', total: 3 });
  });
});

describe('rapid.compose: caps', () => {
  it('a part past ui.compose.timeout is a 504 wrapper carrying ONE retry loader; the retry itself carries none', async () => {
    const app = await boot(
      { prefer: 'html', compose: { timeout: 0.05 } },
      (a) => {
        a.get(
          '/late/:code:',
          { template: DASH, compose: { slow: 'org:People:slow' } },
          () => ({ content: { title: 'late' } }),
        );
      },
    );
    const first = await (await get(app, '/late/acme', 'admin')).text();
    asserts.assertStringIncludes(
      first,
      '<div data-part="slow" data-status="504" data-action="/late/acme?parts=slow&amp;retry=1" data-load data-compose aria-busy="true">',
    );
    const retry =
      await (await get(app, '/late/acme?parts=slow&retry=1', 'admin'))
        .text();
    asserts.assertStringIncludes(
      retry,
      '<div data-part="slow" data-status="504">',
    );
    asserts.assertEquals(retry.includes('data-load'), false);
  });

  it('ui.compose.concurrency bounds how many parts run at once', async () => {
    peak = 0;
    const serial = await boot({ prefer: 'html', compose: { concurrency: 1 } });
    await get(serial, '/orgs/acme', 'admin');
    asserts.assertEquals(peak, 1);
    peak = 0;
    const parallel = await boot();
    await get(parallel, '/orgs/acme', 'admin');
    asserts.assertEquals(peak, 2);
  });

  it('ui.compose is validated: positive integers and a positive timeout', async () => {
    await asserts.assertRejects(
      () =>
        Application.initialize({
          name: 'bad-caps',
          ...QUIET,
          ui: { compose: { maxParts: 0 } },
        }),
      RapidError,
      'ui: compose takes',
    );
    const app = await Application.initialize({
      name: 'caps',
      ...QUIET,
      ui: { compose: { timeout: 1 } },
    });
    asserts.assertEquals(app.composeLimits, {
      maxParts: 5,
      concurrency: 4,
      timeout: 1,
    });
  });
});

describe('rapid.compose: the boot refuses what cannot run', () => {
  it('an action no mounted module serves, or no modules at all', async () => {
    const page = () => ({ content: {} });
    const withModules = await boot(undefined, (a) => {
      a.get('/p/:code:', { compose: { x: 'org:Nope:stats' } }, page);
    });
    await bootError(
      withModules,
      '/p/acme',
      'RAPID_COMPOSE_UNKNOWN_ACTION',
      'no mounted module serves',
    );
    const bare = await Application.initialize({ name: 'bare', ...QUIET });
    bare.get('/p/:code:', { compose: { x: 'org:Organisations:stats' } }, page);
    await bootError(
      bare,
      '/p/acme',
      'RAPID_COMPOSE_UNKNOWN_ACTION',
      'no modules are mounted',
    );
  });

  it('a mutating target, an unsatisfiable param, a params key the target does not bind, a deferred part without a template, too many parts', async () => {
    const page = () => ({ content: {} });
    const cases: [string, Record<string, unknown>, string][] = [
      ['/m/:code:', { x: 'org:Billing:rename' }, 'served by POST'],
      ['/u', { x: 'org:Organisations:stats' }, "needs param 'code'"],
      ['/k/:code:', {
        x: { action: 'org:Organisations:stats', params: { nope: 'code' } },
      }, "maps param 'nope'"],
      [
        '/d/:code:',
        { x: { action: 'org:Billing:plan', defer: true } },
        'has no template',
      ],
    ];
    for (const [path, compose, fragment] of cases) {
      const app = await boot(undefined, (a) => {
        a.get(path, { compose: compose as never }, page);
      });
      await bootError(
        app,
        path.replace(':code:', 'acme'),
        'RAPID_CONFIG',
        fragment,
      );
    }
    const capped = await boot({ compose: { maxParts: 1 } }, (a) => {
      a.get('/c/:code:', {
        compose: { a: 'org:Organisations:stats', b: 'org:Organisations:stats' },
      }, page);
    });
    await bootError(
      capped,
      '/c/acme',
      'RAPID_CONFIG',
      'declares 2 parts; ui.compose.maxParts is 1',
    );
  });

  it('compose on a non-GET route, or a malformed declaration, is refused at registration', async () => {
    const app = await Application.initialize({ name: 'shape', ...QUIET });
    asserts.assertThrows(
      () =>
        app.post('/x', { compose: { a: 'org:A:b' } }, () => ({ content: {} })),
      RapidError,
      'compose is for GET routes',
    );
    asserts.assertThrows(
      () =>
        app.get('/x', { compose: { a: 42 } as never }, () => ({ content: {} })),
      RapidError,
      'compose maps slot names',
    );
  });
});

describe('rapid.compose: what the contract publishes', () => {
  it('OpenAPI carries x-compose per slot, and the client runtime knows the loader', async () => {
    const app = await boot();
    const doc = buildOpenApi(app.routes, {}) as {
      paths: Record<string, Record<string, Record<string, unknown>>>;
    };
    asserts.assertEquals(doc.paths['/orgs/{code}']!['get']!['x-compose'], {
      stats: { action: 'org:Organisations:stats' },
      billing: { action: 'org:Billing:subscription' },
      people: { action: 'org:People:list', defer: true },
      raw: { action: 'org:Billing:plan' },
    });
    asserts.assertStringIncludes(UI_RUNTIME, 'dataset.compose');
    asserts.assertStringIncludes(UI_RUNTIME, '[data-part="');
  });
});

describe('rapid.compose — part state', () => {
  /** A per-request loader the page's middleware builds once. */
  type Loader = { reads: string[] };
  const loaderOf = (value: unknown): Loader => value as Loader;
  const TILE = template<{ seen: number }>((d) => html`<p>${d.seen}</p>`);
  const BOARD = template<{ parts: Record<string, RapidComposeSlot> }>((d) =>
    html`${d.parts.a?.html}${d.parts.b?.html}`
  );

  class Tiles extends RapidModule<typeof EVENTS> {
    readonly name = 'Tiles';
    readonly namespace = 'st';
    protected readonly events = EVENTS;

    @GET('/tiles/a', { bind: [state('loader', loaderOf)], template: TILE })
    a(loader: Loader) {
      loader.reads.push('a');
      return { content: { seen: loader.reads.length } };
    }

    @GET('/tiles/b', { bind: [state('loader', loaderOf)], template: TILE })
    b(loader: Loader) {
      loader.reads.push('b');
      return { content: { seen: loader.reads.length } };
    }

    @GET('/board', {
      template: BOARD,
      compose: { a: 'st:Tiles:a', b: 'st:Tiles:b' },
    })
    board() {
      return { content: {} };
    }
  }

  it('every part sees the SAME objects the page put in ctx.state — one loader per request, shared by its tiles', async () => {
    const loaders: Loader[] = [];
    const app = await Application.initialize({
      name: 'compose-state',
      ...QUIET,
      ui: { prefer: 'html' },
    });
    app.use((ctx, next) => {
      const loader: Loader = { reads: [] };
      loaders.push(loader);
      ctx.state.loader = loader;
      return next();
    });
    await app.modules({ modules: [{ Tiles }] });
    const res = await get(app, '/board');
    asserts.assertEquals(res.status, 200);
    await res.body?.cancel();
    asserts.assertEquals(loaders.length, 1);
    asserts.assertEquals([...loaders[0]!.reads].sort(), ['a', 'b']);
  });
});

describe('rapid.compose — the handler chooses its parts', () => {
  /** A page whose handler names the parts it draws from `x-pick`. */
  const PICK = {
    stats: 'org:Organisations:stats',
    billing: 'org:Billing:subscription',
    people: { action: 'org:People:list', defer: true },
    slow: { action: 'org:People:slow', defer: true },
  };
  const picking = (app: Application) =>
    app.get('/pick/:code:', {
      access: 'Org:VIEW',
      template: DASH,
      compose: PICK,
    }, (ctx) => {
      const pick = ctx.headers.get('x-pick');
      return {
        content: { title: 'pick' },
        ...(pick === null ? {} : { compose: pick.split(',') }),
      };
    });
  const fetchAs = (app: Application, path: string, pick?: string) =>
    app.fetch(
      new Request(`http://app${path}`, {
        headers: {
          'x-user': 'admin',
          ...(pick === undefined ? {} : { 'x-pick': pick }),
        },
      }),
    );

  it('a part left out runs nothing and gets no slot; only the chosen deferred parts reach the follow-up URL', async () => {
    const app = await boot({ prefer: 'html' }, picking);
    const only = await (await fetchAs(app, '/pick/acme', 'stats')).text();
    asserts.assertStringIncludes(only, '<b>acme:3</b>');
    for (const absent of ['billing', 'people', 'slow']) {
      asserts.assertEquals(only.includes(`data-part="${absent}"`), false);
    }
    asserts.assertEquals(only.includes('data-compose'), false);

    const some = await (await fetchAs(app, '/pick/acme', 'stats,people'))
      .text();
    asserts.assertStringIncludes(some, 'parts=people"');
    asserts.assertEquals(some.includes('slow'), false);

    // Without a choice, every declared part is drawn, as before.
    const all = await (await fetchAs(app, '/pick/acme')).text();
    asserts.assertStringIncludes(all, 'data-part="billing"');
    asserts.assertStringIncludes(all, 'parts=people%2Cslow');
  });

  it('a choice only narrows: an undeclared name is RAPID_RESPONSE_INVALID, and ?parts= stays judged part by part', async () => {
    const app = await boot({ prefer: 'html' }, picking);
    const bad = await fetchAs(app, '/pick/acme', 'stats,admin');
    asserts.assertEquals(bad.status, 500);
    asserts.assertStringIncludes(await bad.text(), 'RAPID_RESPONSE_INVALID');
    // The follow-up fetch runs no handler: a part the page did not choose
    // still answers, under its own access.
    const fetched = await app.fetch(
      new Request('http://app/pick/acme?parts=billing', {
        headers: { 'x-user': 'member' },
      }),
    );
    asserts.assertStringIncludes(
      await fetched.text(),
      '<div data-part="billing" data-status="403">',
    );
  });

  it("a cached page keeps its handler's choice on a hit", async () => {
    let calls = 0;
    const app = await boot({ prefer: 'html' }, (a) => {
      a.cache(memoryStore());
      a.get('/kept/:code:', {
        template: DASH,
        compose: PICK,
        cache: { seconds: 60 },
      }, () => {
        calls++;
        return { content: { title: 'kept' }, compose: ['stats'] };
      });
    });
    for (let i = 0; i < 2; i++) {
      const body = await (await fetchAs(app, '/kept/acme')).text();
      asserts.assertEquals(
        body.includes('data-part="billing"'),
        false,
        `request ${i}`,
      );
    }
    asserts.assertEquals(calls, 1);
  });

  it('a refused part is a warn naming the part — never an error line with a stack', async () => {
    const app = await boot();
    const lines: {
      level: string;
      msg: string;
      meta: Record<string, unknown>;
    }[] = [];
    for (const log of [app.log, app.moduleRuntime!.log]) {
      for (const level of ['debug', 'info', 'warn', 'error'] as const) {
        (log as unknown as Record<string, unknown>)[level] = (
          msg: string,
          meta: Record<string, unknown> = {},
        ) => lines.push({ level, msg, meta });
      }
    }
    await (await get(app, '/orgs/acme', 'member')).body?.cancel();
    asserts.assertEquals(lines.filter((l) => l.level === 'error'), []);
    const refusal = lines.find((l) =>
      l.level === 'warn' && l.msg.includes("compose part 'billing'")
    );
    asserts.assertEquals(refusal?.meta['code'], 'RAPID_ACCESS_DENIED');
    asserts.assertEquals('stack' in (refusal?.meta ?? {}), false);
  });
});
