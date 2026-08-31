/**
 * @fileoverview Tests for `app.ui()` — layout resolution (route → module
 * → app), the app-wide `prefer`, the view projection's safe-by-
 * construction default, the served runtime, `errorTemplate`, and the
 * runtime source's pinned invariants (no DOM runner in CI — the string
 * is asserted directly, the honest limit).
 * @module
 */
import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { Application } from '../Application.ts';
import { GET, Module } from '../decorators/mod.ts';
import { authenticate } from '../middlewares/auth.ts';
import type {
  RapidContextResponse,
  RapidTemplate,
  RapidView,
} from '../types/mod.ts';
import { html, template } from './html.ts';
import { UI_LIVE, UI_LIVE_ETAG } from './live.ts';
import { UI_RUNTIME, UI_RUNTIME_ETAG } from './ui.ts';

const make = () =>
  Application.initialize({
    name: 'ui-test',
    server: { port: 0, hostname: '127.0.0.1' },
    logger: { handlers: [] },
  });

const Item = template<{ name: string }>(
  (data) => html`<p>${data.name}</p>`,
  'Item',
);
const Shell = template<{ body: unknown }>(
  (data) => html`<main>${data.body}</main>`,
  'Shell',
);
const ModShell = template<{ body: unknown }>(
  (data) => html`<section>${data.body}</section>`,
  'ModShell',
);
const RouteShell = template<{ body: unknown }>(
  (data) => html`<article>${data.body}</article>`,
  'RouteShell',
);

describe('rapid.ui.app', () => {
  it('layout resolution: route wins over module wins over app; a swap gets the bare fragment', async () => {
    @Module('Pages', { layout: ModShell })
    class Pages {
      @GET('/route-layout', {
        template: { render: Item, layout: RouteShell, prefer: 'html' },
      })
      a(): RapidContextResponse {
        return { content: { name: 'r' } };
      }
      @GET('/module-layout', { template: { render: Item, prefer: 'html' } })
      b(): RapidContextResponse {
        return { content: { name: 'm' } };
      }
    }
    const app = await make();
    app.ui({ layout: Shell });
    app.module(new Pages());
    app.get(
      '/app-layout',
      { template: { render: Item, prefer: 'html' } },
      () => ({ content: { name: 'a' } }),
    );

    const body = async (path: string, swap = false) =>
      await (await app.fetch(
        new Request(
          `http://app${path}`,
          swap ? { headers: { 'rapid-swap': '1' } } : {},
        ),
      )).text();

    asserts.assertEquals(
      await body('/route-layout'),
      '<article><p>r</p></article>',
    );
    asserts.assertEquals(
      await body('/module-layout'),
      '<section><p>m</p></section>',
    );
    asserts.assertEquals(await body('/app-layout'), '<main><p>a</p></main>');
    // A swap never wraps — the fragment is the whole body.
    asserts.assertEquals(await body('/route-layout', true), '<p>r</p>');
    await app.stop();
  });

  it("app-wide prefer 'html' makes plain routes pages; a route's 'json' overrides back", async () => {
    const app = await make();
    app.ui({ prefer: 'html' });
    app.get('/page', { template: Item }, () => ({
      content: { name: 'p' },
    }));
    app.get(
      '/api',
      { template: { render: Item, prefer: 'json' } },
      () => ({ content: { name: 'x' } }),
    );
    asserts.assertEquals(
      await (await app.fetch(new Request('http://app/page'))).text(),
      '<p>p</p>',
    );
    asserts.assertEquals(
      (await app.fetch(new Request('http://app/api'))).headers.get(
        'content-type',
      ),
      'application/json',
    );
    await app.stop();
  });

  it('the view bag: auth NEVER leaks by default; the projection names what crosses; frozen', async () => {
    const seen: RapidView[] = [];
    const Spy = template<unknown>((_data, view) => {
      seen.push(view);
      return html`ok`;
    }, 'Spy');

    const app = await make();
    app.ui({
      view: (ctx) => ({
        user: ctx.auth !== undefined
          ? { id: (ctx.auth as { id: string }).id }
          : undefined,
      }),
    });
    app.use(authenticate({
      verify: (t) => (t === 'tok' ? { id: 'u1', role: 'admin' } : null),
    }));
    app.get('/spy', { template: Spy }, () => ({ content: {} }));

    await app.fetch(
      new Request('http://app/spy?b=2&a=1', {
        headers: { 'rapid-swap': '1', authorization: 'Bearer tok' },
      }),
    );
    const view = seen[0]! as RapidView & {
      user?: { id: string; role?: string };
    };
    asserts.assertEquals(view.user, { id: 'u1' });
    // The projection named `id` — `role` (and the rest of ctx.auth)
    // never crossed.
    asserts.assertEquals(view.user?.role, undefined);
    asserts.assertEquals(view.path, '/spy');
    asserts.assertEquals(view.query, { b: '2', a: '1' });
    asserts.assert(Object.isFrozen(view));
    await app.stop();
  });

  it('serves the runtime with a strong content ETag, revalidate caching, and a 304', async () => {
    const app = await make();
    app.ui({});
    const res = await app.fetch(new Request('http://app/__rapid/ui.js'));
    asserts.assertEquals(
      res.headers.get('content-type'),
      'text/javascript; charset=UTF-8',
    );
    asserts.assertEquals(res.headers.get('etag'), UI_RUNTIME_ETAG);
    // no-cache (NOT immutable): the path is constant, so an immutable
    // entry would outlive a package upgrade and serve a stale runtime;
    // revalidation is a 304 when unchanged.
    asserts.assertEquals(res.headers.get('cache-control'), 'no-cache');
    asserts.assertEquals(await res.text(), UI_RUNTIME);

    const revalidated = await app.fetch(
      new Request('http://app/__rapid/ui.js', {
        headers: { 'if-none-match': UI_RUNTIME_ETAG },
      }),
    );
    asserts.assertEquals(revalidated.status, 304);
    await app.stop();
  });

  it('errorTemplate renders HTML errors only when the representation resolves HTML', async () => {
    const Err = template<Record<string, unknown>>(
      (data) => html`<b>${String(data.code)}</b>`,
      'Err',
    );
    const app = await make();
    app.ui({ errorTemplate: Err, prefer: 'html' });
    app.get('/boom', { template: Item }, () => {
      throw new Error('kaput');
    });

    // Navigation on an app preferring html → themed HTML error, status kept.
    const page = await app.fetch(new Request('http://app/boom'));
    asserts.assertEquals(page.status, 500);
    asserts.assertEquals(
      page.headers.get('content-type'),
      'text/html; charset=UTF-8',
    );
    // PRODUCTION disclosure: the opaque code, never the raw message.
    const bodyText = await page.text();
    asserts.assertStringIncludes(bodyText, '<b>');
    asserts.assertEquals(bodyText.includes('kaput'), false);

    await app.stop();
  });

  it('HTML errors carry Vary, and a THROWING errorTemplate falls back to the JSON envelope (never a 204)', async () => {
    const Err = template<Record<string, unknown>>(
      (data) => html`<b>${String(data.code)}</b>`,
      'Err',
    );
    const app = await make();
    app.ui({ errorTemplate: Err, prefer: 'html' });
    app.get('/boom', { template: Item }, () => {
      throw new Error('kaput');
    });
    const page = await app.fetch(new Request('http://app/boom'));
    // The error representation varies by the swap header like every
    // success representation — a heuristically-cacheable 404/500 must
    // say so.
    asserts.assertStringIncludes(
      (page.headers.get('vary') ?? '').toLowerCase(),
      'rapid-swap',
    );

    const Bomb = template<Record<string, unknown>>(() => {
      throw new Error('template exploded');
    }, 'Bomb');
    const app2 = await make();
    app2.ui({ errorTemplate: Bomb, prefer: 'html' });
    app2.get('/boom', { template: Item }, () => {
      throw new Error('kaput');
    });
    const res = await app2.fetch(new Request('http://app2/boom'));
    asserts.assertEquals(res.status, 500);
    asserts.assertEquals(res.headers.get('content-type'), 'application/json');
    asserts.assertEquals(
      typeof (await res.json() as { code?: string }).code,
      'string',
    );
    await app.stop();
    await app2.stop();
  });

  it('the layout receives the route template title (string and data-derived)', async () => {
    const Titled = template<{ body: unknown; title?: string }>(
      (data) => html`<title>${data.title ?? 'untitled'}</title>${data.body}`,
      'Titled',
    );
    const app = await make();
    app.ui({ layout: Titled });
    app.get(
      '/static-title',
      { template: { render: Item, prefer: 'html', title: 'Hello' } },
      () => ({ content: { name: 'x' } }),
    );
    app.get(
      '/data-title',
      {
        template: {
          render: Item,
          prefer: 'html',
          title: (data) => `Post: ${(data as { name: string }).name}`,
        },
      },
      () => ({ content: { name: 'Ada' } }),
    );
    asserts.assertStringIncludes(
      await (await app.fetch(new Request('http://app/static-title'))).text(),
      '<title>Hello</title>',
    );
    asserts.assertStringIncludes(
      await (await app.fetch(new Request('http://app/data-title'))).text(),
      '<title>Post: Ada</title>',
    );
    await app.stop();
  });

  it('ctx.routeTemplate is frozen — a handler cannot retarget the route', async () => {
    const app = await make();
    app.get('/frozen', { template: Item }, (ctx) => {
      asserts.assert(Object.isFrozen(ctx.routeTemplate));
      asserts.assertThrows(() => {
        (ctx.routeTemplate as { prefer?: string }).prefer = 'html';
      });
      return { content: { name: 'ok' } };
    });
    const res = await app.fetch(new Request('http://app/frozen'));
    asserts.assertEquals(res.status, 200);
    await app.stop();
  });

  it('app.ui() after the first fetch() is RAPID_CONFIG — never a half-applied state', async () => {
    const app = await make();
    app.get('/x', () => ({ content: 'ok' }));
    await app.fetch(new Request('http://app/x'));
    const err = asserts.assertThrows(() => app.ui({}));
    asserts.assertEquals((err as { code?: string }).code, 'RAPID_CONFIG');
    await app.stop();
  });

  it('a non-Html template return is a loud RAPID_RESPONSE_INVALID, not a silent 204', async () => {
    const Broken = template<unknown>(
      () => '<p>plain string</p>' as never,
      'Broken',
    );
    const app = await make();
    app.get('/broken', { template: Broken }, () => ({ content: {} }));
    const res = await app.fetch(
      new Request('http://app/broken', { headers: { 'rapid-swap': '1' } }),
    );
    asserts.assertEquals(res.status, 500);
    await app.stop();
  });

  it("a reply's own vary header is MERGED with the swap names, not clobbering them", async () => {
    const app = await make();
    app.get(
      '/v',
      { template: { render: Item, prefer: 'html' } },
      () => ({ content: { name: 'x' }, headers: { vary: 'Accept' } }),
    );
    const vary = (await app.fetch(new Request('http://app/v'))).headers.get(
      'vary',
    ) ?? '';
    asserts.assertStringIncludes(vary, 'Accept');
    asserts.assertStringIncludes(vary.toLowerCase(), 'rapid-swap');
    await app.stop();
  });

  it('without errorTemplate (or off-HTML), the JSON envelope is unchanged', async () => {
    const app = await make();
    app.ui({});
    app.get('/boom', { template: Item }, () => {
      throw new Error('kaput');
    });
    const res = await app.fetch(new Request('http://app/boom'));
    asserts.assertEquals(res.status, 500);
    asserts.assertEquals(res.headers.get('content-type'), 'application/json');
    await app.stop();
  });

  it('a second app.ui() call and a bogus layout both die with RAPID_CONFIG', async () => {
    const app = await make();
    app.ui({});
    const twice = asserts.assertThrows(() => app.ui({}));
    asserts.assertEquals((twice as { code?: string }).code, 'RAPID_CONFIG');

    const app2 = await make();
    const bogus = asserts.assertThrows(() =>
      app2.ui({ layout: { nope: 1 } as unknown as RapidTemplate<never> })
    );
    asserts.assertEquals((bogus as { code?: string }).code, 'RAPID_CONFIG');
    await app.stop();
    await app2.stop();
  });

  it('htmx interop: swapHeader + swapUnless + redirectHeader drive the same routes', async () => {
    const app = await make();
    app.ui({
      swapHeader: 'hx-request',
      swapUnless: ['hx-boosted', 'hx-history-restore-request'],
      redirectHeader: 'HX-Redirect',
    });
    app.get('/frag', { template: Item }, () => ({ content: { name: 'f' } }));
    app.get('/go', { template: Item }, () => ({
      content: '',
      redirect: '/frag',
    }));

    // An htmx fragment request swaps.
    const frag = await app.fetch(
      new Request('http://app/frag', { headers: { 'hx-request': 'true' } }),
    );
    asserts.assertEquals(await frag.text(), '<p>f</p>');
    // Vary covers the whole decision surface.
    const vary = (frag.headers.get('vary') ?? '').toLowerCase();
    for (
      const name of ['hx-request', 'hx-boosted', 'hx-history-restore-request']
    ) {
      asserts.assertStringIncludes(vary, name);
    }
    // The old default no longer selects the fragment...
    const renamed = await app.fetch(
      new Request('http://app/frag', { headers: { 'rapid-swap': '1' } }),
    );
    asserts.assertEquals(
      renamed.headers.get('content-type'),
      'application/json',
    );
    // ...and a BOOSTED navigation is NOT a swap (htmx expects the page).
    const boosted = await app.fetch(
      new Request('http://app/frag', {
        headers: { 'hx-request': 'true', 'hx-boosted': 'true' },
      }),
    );
    asserts.assertEquals(
      boosted.headers.get('content-type'),
      'application/json',
    );
    // The swap-side redirect rides the renamed header — htmx honours
    // HX-Redirect natively.
    const red = await app.fetch(
      new Request('http://app/go', { headers: { 'hx-request': 'true' } }),
    );
    asserts.assertEquals(red.status, 200);
    asserts.assertEquals(red.headers.get('hx-redirect'), '/frag');
    await app.stop();
  });

  it('an invalid swapHeader name dies with RAPID_CONFIG', async () => {
    const app = await make();
    const err = asserts.assertThrows(() => app.ui({ swapHeader: 'bad name' }));
    asserts.assertEquals((err as { code?: string }).code, 'RAPID_CONFIG');
    await app.stop();
  });

  it('ctx.isSwap mirrors the representer decision, config included', async () => {
    const seen: boolean[] = [];
    const app = await make();
    app.ui({ swapHeader: 'hx-request', swapUnless: ['hx-boosted'] });
    app.get('/probe', (ctx) => {
      seen.push(ctx.isSwap);
      return { content: 'ok' };
    });
    await app.fetch(new Request('http://app/probe'));
    await app.fetch(
      new Request('http://app/probe', { headers: { 'hx-request': 'true' } }),
    );
    await app.fetch(
      new Request('http://app/probe', {
        headers: { 'hx-request': 'true', 'hx-boosted': 'true' },
      }),
    );
    // The OLD default header must not count under the renamed config.
    await app.fetch(
      new Request('http://app/probe', { headers: { 'rapid-swap': '1' } }),
    );
    asserts.assertEquals(seen, [false, true, false, false]);
    await app.stop();
  });

  it('a throwing template surfaces as RAPID_TEMPLATE_RENDER naming the template (DEVELOPMENT)', async () => {
    const Bomb = template<unknown>(() => {
      throw new Error('mismatch');
    }, 'BombView');
    const app = await Application.initialize({
      name: 'ui-test-dev',
      mode: 'DEVELOPMENT',
      server: { port: 0, hostname: '127.0.0.1' },
      logger: { handlers: [] },
    });
    app.get('/boom', { template: Bomb }, () => ({ content: {} }));
    const res = await app.fetch(
      new Request('http://app/boom', { headers: { 'rapid-swap': '1' } }),
    );
    asserts.assertEquals(res.status, 500);
    const body = await res.json() as {
      code: string;
      details?: { template?: string };
    };
    asserts.assertEquals(body.code, 'RAPID_TEMPLATE_RENDER');
    asserts.assertEquals(body.details?.template, 'BombView');
    await app.stop();
  });

  it('DEVELOPMENT + app.ui() with no errorTemplate: HTML requests get the built-in error fragment; PRODUCTION keeps JSON', async () => {
    const dev = await Application.initialize({
      name: 'ui-dev-overlay',
      mode: 'DEVELOPMENT',
      server: { port: 0, hostname: '127.0.0.1' },
      logger: { handlers: [] },
    });
    dev.ui({});
    dev.get('/boom', { template: Item }, () => {
      throw new Error('kaput');
    });
    const swap = await dev.fetch(
      new Request('http://dev/boom', { headers: { 'rapid-swap': '1' } }),
    );
    asserts.assertEquals(swap.status, 500);
    asserts.assertEquals(
      swap.headers.get('content-type'),
      'text/html; charset=UTF-8',
    );
    asserts.assertStringIncludes(await swap.text(), 'rapid-error');

    const prod = await make(); // default mode: PRODUCTION
    prod.ui({});
    prod.get('/boom', { template: Item }, () => {
      throw new Error('kaput');
    });
    const res = await prod.fetch(
      new Request('http://prod/boom', { headers: { 'rapid-swap': '1' } }),
    );
    asserts.assertEquals(res.headers.get('content-type'), 'application/json');
    await dev.stop();
    await prod.stop();
  });

  it('app.ui({ live: true }) serves the live bridge with the same caching contract', async () => {
    const app = await make();
    app.ui({ live: true });
    const res = await app.fetch(new Request('http://app/__rapid/live.js'));
    asserts.assertEquals(
      res.headers.get('content-type'),
      'text/javascript; charset=UTF-8',
    );
    asserts.assertEquals(res.headers.get('etag'), UI_LIVE_ETAG);
    asserts.assertEquals(res.headers.get('cache-control'), 'no-cache');
    asserts.assertEquals(await res.text(), UI_LIVE);
    const revalidated = await app.fetch(
      new Request('http://app/__rapid/live.js', {
        headers: { 'if-none-match': `W/${UI_LIVE_ETAG}, "other"` },
      }),
    );
    asserts.assertEquals(revalidated.status, 304);
    asserts.assertEquals(revalidated.headers.get('etag'), UI_LIVE_ETAG);
    // Off by default — no route.
    const app2 = await make();
    app2.ui({});
    asserts.assertEquals(
      (await app2.fetch(new Request('http://app2/__rapid/live.js'))).status,
      404,
    );
    await app.stop();
    await app2.stop();
  });

  it('the live-bridge source keeps its pinned invariants', () => {
    new Function(UI_LIVE);
    // Merge-preserving global — either load order keeps both APIs.
    asserts.assertStringIncludes(
      UI_LIVE,
      'window.rapid = Object.freeze(Object.assign({}, window.rapid,',
    );
    asserts.assertStringIncludes(
      UI_RUNTIME,
      'window.rapid = Object.freeze(Object.assign({}, window.rapid,',
    );
    // The rpc wire frames + the events it dispatches.
    asserts.assertStringIncludes(UI_LIVE, "type: 'sub'");
    asserts.assertStringIncludes(UI_LIVE, "'rapid:push'");
    asserts.assertStringIncludes(UI_LIVE, "'rapid:live'");
    // Capped reconnect backoff — with the timer TRACKED, so
    // disconnect() can cancel a queued reconnect instead of letting it
    // resurrect the socket.
    asserts.assertStringIncludes(UI_LIVE, 'timer = setTimeout(open, delay)');
    asserts.assertStringIncludes(UI_LIVE, 'Math.min(delay * 1.5, 15000)');
    asserts.assertStringIncludes(UI_LIVE, 'clearTimeout(timer)');
    // open() is idempotent (never stacks a duplicate socket) and the
    // second copy of a double-loaded script bails out.
    asserts.assertStringIncludes(
      UI_LIVE,
      'if (!wanted || (ws && ws.readyState <= 1)) return;',
    );
    asserts.assertStringIncludes(
      UI_LIVE,
      'if (window.rapid && window.rapid.live) return;',
    );
    // The socket path default + its <body data-live-path> override.
    asserts.assertStringIncludes(UI_LIVE, "cfg.livePath || '/ws'");
    // A refused subscribe is surfaced, not swallowed.
    asserts.assertStringIncludes(UI_LIVE, 'subscribe refused');
  });

  it('the runtime source keeps its pinned invariants', () => {
    // The emitted string must PARSE — substring pins alone would pass a
    // template-escaping regression that breaks the script's syntax.
    new Function(UI_RUNTIME);
    // No inline handlers — CSP `script-src 'self'` must suffice. The
    // attribute shape (on…="…") is the hazard; a variable merely
    // CONTAINING "on…" (controller) is not.
    asserts.assertEquals(/\son\w+\s*=\s*["']/.test(UI_RUNTIME), false);
    // The exact header names (as overridable defaults) the server
    // contract reads/writes.
    asserts.assertStringIncludes(UI_RUNTIME, "cfg.swapHeader || 'rapid-swap'");
    asserts.assertStringIncludes(UI_RUNTIME, "[SWAP_HEADER] = '1'");
    asserts.assertStringIncludes(
      UI_RUNTIME,
      "cfg.redirectHeader || 'rapid-redirect'",
    );
    asserts.assertStringIncludes(UI_RUNTIME, "'x-csrf-token'");
    // The same-origin redirect guard.
    asserts.assertStringIncludes(
      UI_RUNTIME,
      'dest.origin === location.origin',
    );
    // The default csrf cookie name.
    asserts.assertStringIncludes(UI_RUNTIME, "'csrf'");
    // View Transitions progressive enhancement — with the animation
    // promises OBSERVED (a hidden document rejects them per swap; an
    // unobserved ready/finished would spam unhandled rejections) —
    // + focus restore + refresh's GET-only source memory.
    asserts.assertStringIncludes(UI_RUNTIME, 'doc.startViewTransition');
    asserts.assertStringIncludes(UI_RUNTIME, 'transition.ready.catch');
    asserts.assertStringIncludes(UI_RUNTIME, 'transition.finished.catch');
    asserts.assertStringIncludes(UI_RUNTIME, 'focusId');
    asserts.assertStringIncludes(UI_RUNTIME, "init.method === 'GET'");
    asserts.assertStringIncludes(UI_RUNTIME, 'refresh: (target) =>');
    // Request hygiene: last-write-wins abort, modifier-click and
    // inner-link carve-outs, the submitter joining multipart posts, and
    // the never-swap-non-HTML guard.
    asserts.assertStringIncludes(UI_RUNTIME, 'previous.abort()');
    asserts.assertStringIncludes(
      UI_RUNTIME,
      'e.metaKey || e.ctrlKey || e.shiftKey || e.altKey',
    );
    asserts.assertStringIncludes(UI_RUNTIME, "closest('a[href]')");
    asserts.assertStringIncludes(UI_RUNTIME, 'new FormData(form, submitter)');
    asserts.assertStringIncludes(UI_RUNTIME, "indexOf('text/html') !== 0");
    // The inflight entry outlives the BODY read — deleted at the
    // headers phase, a newer request would find nothing to abort while
    // the older still streams, and stale content would land LAST.
    asserts.assertStringIncludes(
      UI_RUNTIME,
      'if (inflight.get(target) === controller) inflight.delete(target)',
    );
    asserts.assertStringIncludes(UI_RUNTIME, 'controller.signal.aborted');
    // The two-function public API, frozen — app code swaps without
    // fake clicks.
    asserts.assertStringIncludes(UI_RUNTIME, 'window.rapid = Object.freeze(');
    // rapid:swapped carries the full swap identity — url, method, the
    // EFFECTIVE swap mode, and the server-stamped title when present —
    // so listeners (and the history module) never re-derive it.
    asserts.assertStringIncludes(UI_RUNTIME, "swap: opts.swap || 'replace'");
    asserts.assertStringIncludes(
      UI_RUNTIME,
      "res.headers.get('rapid-title')",
    );
    asserts.assertStringIncludes(UI_RUNTIME, 'decodeURIComponent(title)');
    asserts.assertStringIncludes(
      UI_RUNTIME,
      "emit(swapped, 'rapid:swapped', detail)",
    );
  });
});
