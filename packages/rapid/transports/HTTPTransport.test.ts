/**
 * @fileoverview HTTPTransport — the DEV-only response contract: a
 * parse-capable declared `response` schema is enforced against the
 * return-channel reply in DEVELOPMENT and never touched in PRODUCTION.
 * @module
 */
import { describe, it } from '@tundralibs/compat/test';
import * as asserts from '@std/asserts';
import { Application } from '../Application.ts';
import { compress } from '../middlewares/mod.ts';
import { makeTempDir, removeDir, writeFile } from '@tundralibs/compat/file';

const make = (mode: 'DEVELOPMENT' | 'PRODUCTION') =>
  Application.initialize({
    name: 'response-contract',
    mode,
    server: { port: 0, hostname: '127.0.0.1' },
    logger: { handlers: [] },
  });

/**
 * A guardian-shaped schema double: counts `parse` calls, optionally
 * fails with a `leafErrors()`-carrying error (what the recognizer reads).
 */
const schemaDouble = (outcome: 'pass' | 'fail' | 'transform') => {
  const calls = { parse: 0 };
  return {
    calls,
    schema: {
      parse(value: unknown): unknown {
        calls.parse++;
        if (outcome === 'fail') {
          const err = new Error('shape mismatch') as Error & {
            leafErrors: () => unknown[];
          };
          err.leafErrors = () => [
            { path: ['total'], error: { message: 'must be a number' } },
          ];
          throw err;
        }
        return outcome === 'transform' ? { swapped: true } : value;
      },
      toOpenAPI: () => ({ type: 'object' }),
    },
  };
};

describe('rapid.HTTPTransport response contract', () => {
  it('DEVELOPMENT: a failing reply becomes RAPID_RESPONSE_INVALID (500) with the field detail', async () => {
    const app = await make('DEVELOPMENT');
    const { schema } = schemaDouble('fail');
    app.get('/x', { openapi: { response: schema } }, () => ({
      content: { total: 'NaN' },
    }));
    const res = await app.fetch(new Request('http://app/x'));
    asserts.assertEquals(res.status, 500);
    const body = await res.json();
    asserts.assertEquals(body.code, 'RAPID_RESPONSE_INVALID');
    asserts.assertEquals(body.details.fields, { total: 'must be a number' });
    await app.stop();
  });

  it('DEVELOPMENT: a passing reply goes out unchanged — enforce-only, a transforming parse never rewrites it', async () => {
    const app = await make('DEVELOPMENT');
    const { schema, calls } = schemaDouble('transform');
    app.get('/x', { openapi: { response: schema } }, () => ({
      content: { total: 3 },
    }));
    const res = await app.fetch(new Request('http://app/x'));
    asserts.assertEquals(res.status, 200);
    asserts.assertEquals(await res.json(), { total: 3 }); // NOT { swapped }
    asserts.assertEquals(calls.parse, 1);
    await app.stop();
  });

  it('PRODUCTION: the parse never runs', async () => {
    const app = await make('PRODUCTION');
    const { schema, calls } = schemaDouble('fail');
    app.get('/x', { openapi: { response: schema } }, () => ({
      content: { total: 'NaN' },
    }));
    const res = await app.fetch(new Request('http://app/x'));
    asserts.assertEquals(res.status, 200);
    await res.body?.cancel();
    asserts.assertEquals(calls.parse, 0);
    await app.stop();
  });

  it('skips non-success shapes: error status, redirect, and a no-body reply', async () => {
    const app = await make('DEVELOPMENT');
    const { schema, calls } = schemaDouble('fail');
    const openapi = { response: schema };
    app.get('/error', { openapi }, () => ({
      status: 404,
      content: { missing: true },
    }));
    app.get('/redirect', { openapi }, () => ({
      content: '',
      redirect: '/elsewhere',
    }));
    app.get('/none', { openapi }, () => {}); // void → 204, nothing to check
    for (const path of ['/error', '/redirect', '/none']) {
      await (await app.fetch(new Request(`http://app${path}`))).body?.cancel();
    }
    asserts.assertEquals(calls.parse, 0);
    await app.stop();
  });

  it('an emitter-only response schema (no parse) stays documentation-only', async () => {
    const app = await make('DEVELOPMENT');
    app.get(
      '/x',
      { openapi: { response: { toOpenAPI: () => ({ type: 'object' }) } } },
      () => ({ content: { anything: 'goes' } }),
    );
    const res = await app.fetch(new Request('http://app/x'));
    asserts.assertEquals(res.status, 200);
    await res.body?.cancel();
    await app.stop();
  });

  it('an async parse is awaited — its rejection is the same 500', async () => {
    const app = await make('DEVELOPMENT');
    app.get('/x', {
      openapi: {
        response: {
          parse: (value: unknown) =>
            (value as { ok: boolean }).ok
              ? Promise.resolve(value)
              : Promise.reject(new Error('async says no')),
        },
      },
    }, () => ({ content: { ok: false } }));
    const res = await app.fetch(new Request('http://app/x'));
    asserts.assertEquals(res.status, 500);
    const body = await res.json();
    asserts.assertEquals(body.code, 'RAPID_RESPONSE_INVALID');
    asserts.assertEquals(body.details.reason, 'async says no');
    await app.stop();
  });
});

// =============================================================================
// The request SURFACE — server.api hosts/prefix, ui.enabled, and what each
// changes: representation, the api route table, redirects, idempotency.
// =============================================================================

import {
  makeTempDirSync,
  removeSync,
  writeTextFile,
} from '@tundralibs/compat/file';
import { join } from '@tundralibs/compat/path';
import { openapi } from '../endpoints/mod.ts';
import { RapidError } from '../errors/mod.ts';
import { idempotency } from '../middlewares/mod.ts';
import { client } from '../testing/mod.ts';
import type {
  RapidApplicationServerOptions,
  RapidUiConfigOptions,
  RapidUiTemplateOptions,
} from '../types/mod.ts';
import { html, template } from '../ui/html.ts';

const List = template<{ items: string[] }>(
  (d) => html`<ul>${d.items.map((i) => html`<li>${i}</li>`)}</ul>`,
  'List',
);

const surfaceApp = (
  server: RapidApplicationServerOptions = {},
  ui?: RapidUiConfigOptions & RapidUiTemplateOptions,
) =>
  Application.initialize({
    name: 'surface',
    server: {
      port: 0,
      hostname: '127.0.0.1',
      api: { hosts: ['api.example.test'], prefix: '/api' },
      ...server,
    },
    logger: { handlers: [] },
    ...(ui !== undefined ? { ui } : {}),
  });

/** Register the three route natures every surface test reasons about. */
const threeRoutes = (app: Application) => {
  app.get('/users', (ctx) => ({
    content: { surface: ctx.surface, basePath: ctx.basePath, path: ctx.path },
  }));
  app.get('/list', { template: { render: List, prefer: 'json' } }, () => ({
    content: { items: ['x'] },
  }));
  app.get('/page', { template: { render: List, prefer: 'html' } }, () => ({
    content: { items: ['y'] },
  }));
};

const envelope = async (res: Response) => {
  const body = await res.json() as Record<string, unknown>;
  delete body.requestId;
  return {
    status: res.status,
    type: res.headers.get('content-type'),
    vary: res.headers.get('vary'),
    body,
  };
};

describe('rapid.http.surface', () => {
  it('prefix mode: the prefix is stripped, the surface and basePath are on the context', async () => {
    const app = await surfaceApp();
    threeRoutes(app);
    const api = await app.fetch(new Request('http://example.test/api/users'));
    asserts.assertEquals(await api.json(), {
      surface: 'api',
      basePath: '/api',
      path: '/users',
    });
    const ui = await app.fetch(new Request('http://example.test/users'));
    asserts.assertEquals(await ui.json(), {
      surface: 'ui',
      basePath: '',
      path: '/users',
    });
    // `/apix` is not under `/api`; `/api/` alone routes `/` (a miss here).
    const near = await app.fetch(new Request('http://example.test/apix/users'));
    asserts.assertEquals(near.status, 404);
    await near.body?.cancel();
    await app.stop();
  });

  it('host mode: the api host is the api surface — case, trailing dot and punycode normalised', async () => {
    const app = await surfaceApp({
      api: { hosts: ['API.example.test.', 'bücher.test'] },
    });
    threeRoutes(app);
    for (
      const origin of [
        'http://api.example.test',
        'http://API.EXAMPLE.TEST',
        'http://api.example.test.',
        'http://xn--bcher-kva.test',
        'http://api.example.test:8443',
      ]
    ) {
      const res = await app.fetch(new Request(`${origin}/users`));
      asserts.assertEquals((await res.json()).surface, 'api', origin);
    }
    const ui = await app.fetch(new Request('http://example.test/users'));
    asserts.assertEquals((await ui.json()).surface, 'ui');
    await app.stop();
  });

  it('x-forwarded-host is honoured only with trustForwardedHost AND trustProxy', async () => {
    const headers = { 'x-forwarded-host': 'api.example.test' };
    // trustProxy alone: a client-set header must NOT pick the surface.
    const untrusted = await surfaceApp({ trustProxy: true });
    threeRoutes(untrusted);
    const spoofed = await untrusted.fetch(
      new Request('http://example.test/users', { headers }),
    );
    asserts.assertEquals((await spoofed.json()).surface, 'ui');
    await untrusted.stop();

    const trusted = await surfaceApp({
      trustProxy: true,
      api: {
        hosts: ['api.example.test'],
        prefix: '/api',
        trustForwardedHost: true,
      },
    });
    threeRoutes(trusted);
    const forwarded = await trusted.fetch(
      new Request('http://example.test/users', { headers }),
    );
    asserts.assertEquals((await forwarded.json()).surface, 'api');
    await trusted.stop();
  });

  it('the api surface: pages are a byte-identical 404, API-first templates are JSON with no Vary, swaps are ignored', async () => {
    const app = await surfaceApp();
    threeRoutes(app);
    const page = await envelope(
      await app.fetch(new Request('http://example.test/api/page')),
    );
    const missing = await envelope(
      await app.fetch(new Request('http://example.test/api/nope')),
    );
    asserts.assertEquals(page, missing);
    asserts.assertEquals(page.status, 404);

    const list = await app.fetch(
      new Request('http://example.test/api/list', {
        headers: { 'rapid-swap': '1' },
      }),
    );
    asserts.assertEquals(list.headers.get('content-type'), 'application/json');
    asserts.assertEquals(list.headers.get('vary'), null);
    asserts.assertEquals(await list.json(), { items: ['x'] });

    // The same routes on the ui surface keep their full behaviour.
    const uiPage = await app.fetch(new Request('http://example.test/page'));
    asserts.assertEquals(uiPage.status, 200);
    asserts.assertStringIncludes(await uiPage.text(), '<li>y</li>');
    const uiSwap = await app.fetch(
      new Request('http://example.test/list', {
        headers: { 'rapid-swap': '1' },
      }),
    );
    asserts.assertEquals(await uiSwap.text(), '<ul><li>x</li></ul>');
    await app.stop();
  });

  it('a hidden page is a TRUE no-match: its route middleware never runs and 405/OPTIONS do not list it', async () => {
    const app = await surfaceApp({ methodNotAllowed: true });
    const ran: string[] = [];
    app.get(
      '/page',
      { template: { render: List, prefer: 'html' } },
      async (ctx, next) => {
        ran.push(ctx.surface);
        await next();
      },
      () => ({ content: { items: [] } }),
    );
    const api = await app.fetch(new Request('http://example.test/api/page'));
    asserts.assertEquals(api.status, 404);
    await api.body?.cancel();
    asserts.assertEquals(ran, []);

    const post = await app.fetch(
      new Request('http://example.test/api/page', { method: 'POST' }),
    );
    asserts.assertEquals(post.status, 404);
    asserts.assertEquals(post.headers.get('allow'), null);
    await post.body?.cancel();
    const options = await app.fetch(
      new Request('http://example.test/api/page', { method: 'OPTIONS' }),
    );
    asserts.assertEquals(options.status, 404);
    await options.body?.cancel();

    // On the ui surface the path exists: 405 + Allow, and the middleware ran.
    const uiPost = await app.fetch(
      new Request('http://example.test/page', { method: 'POST' }),
    );
    asserts.assertEquals(uiPost.status, 405);
    asserts.assertEquals(uiPost.headers.get('allow'), 'GET, HEAD, OPTIONS');
    await uiPost.body?.cancel();
    await (await app.fetch(new Request('http://example.test/page'))).text();
    asserts.assertEquals(ran, ['ui']);
    await app.stop();
  });

  it('static files and the UI runtime route do not exist on the api surface', async () => {
    const dir = makeTempDirSync({ prefix: 'rapid-surface-' });
    await writeTextFile(join(dir, 'a.txt'), 'asset');
    try {
      const app = await surfaceApp({ static: { '/pub': { root: dir } } }, {});
      const served = await app.fetch(
        new Request('http://example.test/pub/a.txt'),
      );
      asserts.assertEquals(await served.text(), 'asset');
      const hidden = await app.fetch(
        new Request('http://example.test/api/pub/a.txt'),
      );
      asserts.assertEquals(hidden.status, 404);
      await hidden.body?.cancel();
      const byHost = await app.fetch(
        new Request('http://api.example.test/pub/a.txt'),
      );
      asserts.assertEquals(byHost.status, 404);
      await byHost.body?.cancel();

      const runtime = await app.fetch(
        new Request('http://example.test/__rapid/ui.js'),
      );
      asserts.assertEquals(runtime.status, 200);
      asserts.assertStringIncludes(await runtime.text(), 'rapid-swap');
      const apiRuntime = await app.fetch(
        new Request('http://api.example.test/__rapid/ui.js'),
      );
      asserts.assertEquals(apiRuntime.status, 404);
      await apiRuntime.body?.cancel();
      await app.stop();
    } finally {
      removeSync(dir);
    }
  });

  it('the api prefix comes off BEFORE a path-mode version segment', async () => {
    const app = await surfaceApp({ versioning: { mode: 'path' } });
    app.get('/users', { version: 'v1' }, (ctx) => ({
      content: { path: ctx.path, basePath: ctx.basePath },
    }));
    const res = await app.fetch(
      new Request('http://example.test/api/v1/users'),
    );
    asserts.assertEquals(await res.json(), {
      path: '/users',
      basePath: '/api',
    });
    const byHost = await app.fetch(
      new Request('http://api.example.test/v1/users'),
    );
    asserts.assertEquals(await byHost.json(), { path: '/users', basePath: '' });
    await app.stop();
  });

  it('a template-less route in a pages-first app keeps JSON errors; a page still gets the HTML error', async () => {
    const app = await Application.initialize({
      name: 'surface-b1',
      server: { port: 0, hostname: '127.0.0.1' },
      logger: { handlers: [] },
      ui: { prefer: 'html' },
    });
    const boom = () => {
      throw new RapidError('RAPID_NOT_FOUND', { message: 'gone' });
    };
    app.get('/bare', boom);
    app.get('/page', { template: List }, boom);
    const bare = await app.fetch(new Request('http://example.test/bare'));
    asserts.assertEquals(bare.status, 404);
    asserts.assertEquals(bare.headers.get('content-type'), 'application/json');
    await bare.body?.cancel();
    const page = await app.fetch(new Request('http://example.test/page'));
    asserts.assertEquals(page.status, 404);
    asserts.assertEquals(
      page.headers.get('content-type'),
      'text/html; charset=UTF-8',
    );
    await page.body?.cancel();
    await app.stop();
  });

  it('redirects are never rewritten; ctx.href() is the explicit opt-in; scheme-relative targets are refused', async () => {
    const app = await surfaceApp();
    app.get('/plain', () => ({ content: '', redirect: '/posts' }));
    app.get('/rel', (ctx) => ctx.redirect(ctx.href('/posts')));
    app.get('/abs', (ctx) => ({
      content: { href: ctx.href('https://example.test/x') },
    }));
    app.get('/evil', () => ({ content: '', redirect: '//evil.example' }));
    app.get('/evil2', (ctx) => ctx.redirect('/\\evil.example'));
    app.get('/evil3', () => ({ content: '', redirect: '/\t/evil.example' }));
    app.get('/evil4', (ctx) => ctx.redirect(' //evil.example'));

    const plain = await app.fetch(
      new Request('http://example.test/api/plain', { redirect: 'manual' }),
    );
    asserts.assertEquals(plain.headers.get('location'), '/posts');
    await plain.body?.cancel();
    const rel = await app.fetch(
      new Request('http://example.test/api/rel', { redirect: 'manual' }),
    );
    asserts.assertEquals(rel.headers.get('location'), '/api/posts');
    await rel.body?.cancel();
    const uiRel = await app.fetch(
      new Request('http://example.test/rel', { redirect: 'manual' }),
    );
    asserts.assertEquals(uiRel.headers.get('location'), '/posts');
    await uiRel.body?.cancel();
    const abs = await app.fetch(new Request('http://example.test/api/abs'));
    asserts.assertEquals(await abs.json(), { href: 'https://example.test/x' });

    // `/\t/host` and `' //host'`: the WHATWG parser strips the tab / the
    // leading space BEFORE parsing, so a leading-character regex would pass
    // both and the browser would land cross-origin.
    for (const path of ['/evil', '/evil2', '/evil3', '/evil4']) {
      const res = await app.fetch(
        new Request(`http://example.test${path}`, { redirect: 'manual' }),
      );
      asserts.assertEquals(res.status, 500, path);
      asserts.assertEquals(res.headers.get('location'), null, path);
      await res.body?.cancel();
    }
    await app.stop();

    // The SWAP path (a UI app, `rapid-swap` request) never reaches the
    // response setter — it must refuse the same targets before stamping
    // the redirect header, or a BYO client following `HX-Redirect`
    // verbatim is an open redirect.
    const Core = template<{ body: unknown }>(
      (d) => html`<main>${d.body as string}</main>`,
      'Core',
    );
    const uiApp = await surfaceApp({}, { core: Core });
    // Only a TEMPLATED route is represented (and so swap-redirected).
    uiApp.get('/plain', { template: List }, () => ({
      content: { items: [] },
      redirect: '/posts',
    }));
    uiApp.get('/evil', { template: List }, () => ({
      content: { items: [] },
      redirect: '//evil.example',
    }));
    const swapOk = await uiApp.fetch(
      new Request('http://example.test/plain', {
        headers: { 'rapid-swap': '1' },
      }),
    );
    asserts.assertEquals(swapOk.status, 200);
    asserts.assertEquals(swapOk.headers.get('rapid-redirect'), '/posts');
    await swapOk.body?.cancel();
    const swapEvil = await uiApp.fetch(
      new Request('http://example.test/evil', {
        headers: { 'rapid-swap': '1' },
      }),
    );
    asserts.assertEquals(swapEvil.status, 500);
    asserts.assertEquals(swapEvil.headers.get('rapid-redirect'), null);
    await swapEvil.body?.cancel();
    await uiApp.stop();
  });

  it('idempotency keys are per surface — a ui replay never answers the api', async () => {
    const app = await surfaceApp();
    app.use(idempotency({ scope: false }));
    app.post('/echo', (ctx) => ({ content: { surface: ctx.surface } }));
    const post = (url: string) =>
      app.fetch(
        new Request(url, {
          method: 'POST',
          headers: { 'idempotency-key': 'k1' },
        }),
      );
    const ui = await post('http://example.test/echo');
    asserts.assertEquals(await ui.json(), { surface: 'ui' });
    const api = await post('http://example.test/api/echo');
    asserts.assertEquals(api.headers.get('idempotency-replayed'), null);
    asserts.assertEquals(await api.json(), { surface: 'api' });
    const replay = await post('http://example.test/api/echo');
    asserts.assertEquals(replay.headers.get('idempotency-replayed'), 'true');
    asserts.assertEquals(await replay.json(), { surface: 'api' });
    await app.stop();
  });

  it('OpenAPI omits pages when an api surface exists, and lists a page as text/html only otherwise', async () => {
    const withApi = await surfaceApp();
    threeRoutes(withApi);
    withApi.get('/openapi.json', openapi({ expose: 'ALL' }));
    const doc = await (await withApi.fetch(
      new Request('http://example.test/openapi.json'),
    )).json();
    asserts.assertEquals(Object.keys(doc.paths).sort(), [
      '/list',
      '/openapi.json',
      '/users',
    ]);
    asserts.assertEquals(
      Object.keys(doc.paths['/list'].get.responses['200'].content),
      ['application/json', 'text/html'],
    );
    await withApi.stop();

    const plain = await Application.initialize({
      name: 'surface-openapi',
      server: { port: 0, hostname: '127.0.0.1' },
      logger: { handlers: [] },
      ui: {},
    });
    threeRoutes(plain);
    plain.get('/openapi.json', openapi({ expose: 'ALL' }));
    const doc2 = await (await plain.fetch(
      new Request('http://example.test/openapi.json'),
    )).json();
    asserts.assert('/page' in doc2.paths);
    asserts.assert(!('/__rapid/ui.js' in doc2.paths));
    asserts.assertEquals(
      Object.keys(doc2.paths['/page'].get.responses['200'].content),
      ['text/html'],
    );
    await plain.stop();
  });

  it('the test client addresses a host', async () => {
    const app = await surfaceApp();
    threeRoutes(app);
    const c = client(app);
    asserts.assertEquals((await c.get('/page')).status, 200);
    asserts.assertEquals(
      (await c.get('/page', { host: 'api.example.test' })).status,
      404,
    );
    asserts.assertEquals(
      (await c.get('/users', { host: 'api.example.test' })).body,
      { surface: 'api', basePath: '', path: '/users' },
    );
    await app.stop();
  });

  it('a malformed server.api fails the boot', async () => {
    await asserts.assertRejects(
      () => surfaceApp({ api: { prefix: 'api' } }),
      RapidError,
      'server.api.prefix',
    );
    await asserts.assertRejects(
      () => surfaceApp({ api: { hosts: ['http://x'] } }),
      RapidError,
      'server.api.hosts',
    );
  });
});

describe('rapid HTTPTransport — headers.* stamps', () => {
  const spin = (headers?: Record<string, unknown>) =>
    Application.initialize({
      name: 'stamps',
      server: { port: 0 },
      logger: { handlers: [] },
      ...(headers === undefined ? {} : { headers }),
    });

  it('echoes the request id under headers.requestId and every requestIdEcho name, and times every response', async () => {
    const app = await spin({
      requestId: 'x-trace',
      requestIdEcho: ['x-correlation-id'],
    });
    app.get('/ok', () => ({ content: 'ok' }));
    app.get('/boom', () => {
      throw new Error('kaboom');
    });
    const ok = await app.fetch(
      new Request('http://app/ok', { headers: { 'x-trace': 'edge-7' } }),
    );
    await ok.text();
    asserts.assertEquals(ok.headers.get('x-trace'), 'edge-7');
    asserts.assertEquals(ok.headers.get('x-correlation-id'), 'edge-7');
    asserts.assertEquals(ok.headers.get('x-request-id'), null);
    asserts.assertMatch(ok.headers.get('x-response-time')!, /^\d+ms$/);
    for (const path of ['/boom', '/missing']) {
      const r = await app.fetch(new Request(`http://app${path}`));
      await r.text();
      asserts.assert(r.headers.get('x-trace'));
      asserts.assertEquals(
        r.headers.get('x-correlation-id'),
        r.headers.get('x-trace'),
      );
      asserts.assertMatch(r.headers.get('x-response-time')!, /^\d+ms$/);
    }
  });

  it('headers.responseTime: false omits the timing; a custom name renames it', async () => {
    const off = await spin({ responseTime: false });
    off.get('/ok', () => ({ content: 'ok' }));
    const r = await off.fetch(new Request('http://app/ok'));
    await r.text();
    asserts.assertEquals(r.headers.get('x-response-time'), null);
    const renamed = await spin({ responseTime: 'server-timing-ms' });
    renamed.get('/ok', () => ({ content: 'ok' }));
    const r2 = await renamed.fetch(new Request('http://app/ok'));
    await r2.text();
    asserts.assertMatch(r2.headers.get('server-timing-ms')!, /^\d+ms$/);
    asserts.assertEquals(r2.headers.get('x-response-time'), null);
  });

  it('rejects an illegal echo or timing header name at boot', async () => {
    for (
      const headers of [{ requestIdEcho: ['bad name'] }, {
        responseTime: 'x:y',
      }]
    ) {
      const err = await asserts.assertRejects(() => spin(headers), RapidError);
      asserts.assertEquals(err.code, 'RAPID_CONFIG');
    }
  });
});

describe("rapid.http — a disclosure envelope replaces the committed body's framing", () => {
  it("a throw after ctx.serve() ships JSON with JSON headers, never the file's type/length", async () => {
    const dir = await makeTempDir();
    const file = `${dir}/big.bin`;
    await writeFile(file, new Uint8Array(4096).fill(120));
    const app = await make('PRODUCTION');
    app.get('/file', async (_ctx, next) => {
      await next();
      throw new Error('boom');
    }, (ctx) => ctx.serve(file));
    try {
      const res = await app.fetch(new Request('http://app/file'));
      const body = await res.text();
      asserts.assertEquals(res.status, 500);
      asserts.assertEquals(res.headers.get('content-type'), 'application/json');
      asserts.assertEquals(res.headers.get('content-length'), null);
      asserts.assertEquals(res.headers.get('etag'), null);
      asserts.assertEquals(JSON.parse(body).code, 'RAPID_UNHANDLED');
    } finally {
      await app.stop();
      await removeDir(dir, { recursive: true });
    }
  });

  it('a throw after compress() ran drops the stale content-encoding', async () => {
    const app = await make('PRODUCTION');
    app.use(async (_ctx, next) => {
      await next();
      throw new Error('boom');
    });
    app.use(compress({ threshold: 1 }));
    app.get('/big', () => ({ content: { text: 'x'.repeat(2048) } }));
    try {
      const res = await app.fetch(
        new Request('http://app/big', {
          headers: { 'accept-encoding': 'gzip' },
        }),
      );
      asserts.assertEquals(res.status, 500);
      asserts.assertEquals(res.headers.get('content-encoding'), null);
      asserts.assertEquals((await res.json()).code, 'RAPID_UNHANDLED');
    } finally {
      await app.stop();
    }
  });

  it('a transform that re-sets a DIFFERENT body drops a handler-stated content-length; the same body keeps it', async () => {
    const app = await make('PRODUCTION');
    app.get(
      '/swap',
      async (ctx, next) => {
        await next();
        ctx.response = { content: 'short' };
      },
      () => ({
        content: 'a much longer body',
        headers: { 'content-length': '18' },
      }),
    );
    app.get(
      '/same',
      async (ctx, next) => {
        await next();
        ctx.response = { ...ctx.response!, status: 202 };
      },
      () => ({
        content: 'a much longer body',
        headers: { 'content-length': '18' },
      }),
    );
    try {
      const swapped = await app.fetch(new Request('http://app/swap'));
      asserts.assertEquals(swapped.headers.get('content-length'), null);
      asserts.assertEquals(await swapped.text(), 'short');
      const same = await app.fetch(new Request('http://app/same'));
      asserts.assertEquals(same.status, 202);
      asserts.assertEquals(same.headers.get('content-length'), '18');
      await same.body?.cancel();
    } finally {
      await app.stop();
    }
  });
});
