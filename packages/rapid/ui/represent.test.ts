/**
 * @fileoverview Representation tests — the D3 decision table over
 * `app.fetch`: `rapid-swap` → fragment, else `prefer` → JSON (default)
 * or page. Deterministic by design, so the `Accept`-changes-nothing
 * case is asserted explicitly.
 * @module
 */
import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { Application } from '../Application.ts';
import { RapidError } from '../errors/mod.ts';
import { GET } from '../decorators/mod.ts';
import { Module } from '../decorators/mod.ts';
import type { RapidContextResponse, RapidTemplate } from '../types/mod.ts';
import { html, template } from './html.ts';

const make = () =>
  Application.initialize({
    name: 'represent-test',
    server: { port: 0, hostname: '127.0.0.1' },
    logger: { handlers: [] },
  });

const UserList = template<{ items: string[] }>(
  (data) => html`<ul>${data.items.map((i) => html`<li>${i}</li>`)}</ul>`,
  'UserList',
);

describe('rapid.ui.represent', () => {
  it('no swap + default prefer: JSON unchanged, but Vary: rapid-swap is stamped', async () => {
    const app = await make();
    app.get('/users', { template: UserList }, () => ({
      content: { items: ['a<b'] },
    }));
    const res = await app.fetch(new Request('http://app/users'));
    asserts.assertEquals(res.headers.get('content-type'), 'application/json');
    asserts.assertEquals(await res.json(), { items: ['a<b'] });
    asserts.assertEquals(res.headers.get('vary'), 'rapid-swap');
    await app.stop();
  });

  it('rapid-swap: the fragment, escaped, as text/html', async () => {
    const app = await make();
    app.get('/users', { template: UserList }, () => ({
      content: { items: ['a<b'] },
    }));
    const res = await app.fetch(
      new Request('http://app/users', { headers: { 'rapid-swap': '1' } }),
    );
    asserts.assertEquals(
      res.headers.get('content-type'),
      'text/html; charset=UTF-8',
    );
    asserts.assertEquals(
      await res.text(),
      '<ul><li>a&lt;b</li></ul>',
    );
    await app.stop();
  });

  it("prefer 'html': a plain navigation gets the page (no layout yet → the fragment serves as the page)", async () => {
    const app = await make();
    app.get(
      '/users',
      { template: { render: UserList, prefer: 'html' } },
      () => ({ content: { items: ['x'] } }),
    );
    const res = await app.fetch(new Request('http://app/users'));
    asserts.assertEquals(
      res.headers.get('content-type'),
      'text/html; charset=UTF-8',
    );
    asserts.assertEquals(await res.text(), '<ul><li>x</li></ul>');
    await app.stop();
  });

  it('an Accept header alone changes NOTHING — the decision is deterministic', async () => {
    const app = await make();
    app.get('/users', { template: UserList }, () => ({
      content: { items: ['x'] },
    }));
    const res = await app.fetch(
      new Request('http://app/users', { headers: { accept: 'text/html' } }),
    );
    asserts.assertEquals(res.headers.get('content-type'), 'application/json');
    await app.stop();
  });

  it('a swap keeps status and cookies; only content is replaced', async () => {
    const app = await make();
    app.post('/users', { template: UserList }, () => ({
      content: { items: ['n'] },
      status: 201,
      cookies: [{ name: 'seen', value: '1' }],
    }));
    const res = await app.fetch(
      new Request('http://app/users', {
        method: 'POST',
        headers: { 'rapid-swap': '1' },
      }),
    );
    asserts.assertEquals(res.status, 201);
    asserts.assertStringIncludes(
      res.headers.get('set-cookie') ?? '',
      'seen=1',
    );
    asserts.assertEquals(await res.text(), '<ul><li>n</li></ul>');
    await app.stop();
  });

  it('a decorated route carries its template through the module mount', async () => {
    @Module('Users')
    class Users {
      @GET('/users', { template: UserList })
      list(): RapidContextResponse {
        return { content: { items: ['ada'] } };
      }
    }
    const app = await make();
    app.module(new Users());
    const res = await app.fetch(
      new Request('http://app/users', { headers: { 'rapid-swap': '1' } }),
    );
    asserts.assertEquals(await res.text(), '<ul><li>ada</li></ul>');
    await app.stop();
  });

  it('a non-template `template` option dies at registration with RAPID_CONFIG', async () => {
    const app = await make();
    const err = asserts.assertThrows(() =>
      app.get(
        '/broken',
        { template: { oops: true } as unknown as RapidTemplate },
        () => ({ content: 'x' }),
      )
    );
    asserts.assertEquals((err as { code?: string }).code, 'RAPID_CONFIG');
    await app.stop();
  });

  it('an HTML representation of stream content is RAPID_RESPONSE_INVALID (500)', async () => {
    const app = await make();
    app.get('/stream', { template: UserList }, () => ({
      content: new ReadableStream<Uint8Array>(),
    }));
    const res = await app.fetch(
      new Request('http://app/stream', { headers: { 'rapid-swap': '1' } }),
    );
    asserts.assertEquals(res.status, 500);
    await app.stop();
  });

  it('a templated route returning null is still a 204, never a crash', async () => {
    const app = await make();
    app.get(
      '/none',
      { template: UserList },
      // deno-lint-ignore no-explicit-any -- the JS null-return contract
      () => null as any,
    );
    const res = await app.fetch(
      new Request('http://app/none', { headers: { 'rapid-swap': '1' } }),
    );
    asserts.assertEquals(res.status, 204);
    await app.stop();
  });

  it('registration guards: layout-without-template, unrecognized options, non-function handler', async () => {
    const app = await make();
    const shell = template<{ body: unknown }>((d) => html`${d.body}`, 'S');
    for (
      const register of [
        () => app.get('/a', { layout: shell }, () => ({ content: 'x' })),
        () =>
          app.get(
            '/b',
            UserList as unknown as { version?: string },
            () => ({ content: 'x' }),
          ),
        () =>
          app.get(
            '/c',
            {},
            { handle: true } as unknown as () => {
              content: string;
            },
          ),
      ]
    ) {
      const err = asserts.assertThrows(register);
      asserts.assertEquals((err as { code?: string }).code, 'RAPID_CONFIG');
    }
    await app.stop();
  });

  it('a swap redirect via ctx.redirect() carries NO location header beside rapid-redirect', async () => {
    const app = await make();
    app.get('/go2', { template: UserList }, (ctx) => ctx.redirect('/users'));
    const res = await app.fetch(
      new Request('http://app/go2', { headers: { 'rapid-swap': '1' } }),
    );
    asserts.assertEquals(res.status, 200);
    asserts.assertEquals(res.headers.get('rapid-redirect'), '/users');
    asserts.assertEquals(res.headers.get('location'), null);
    await app.stop();
  });

  it('a redirect: 302 on a navigation, 200 + rapid-redirect on a swap (D8)', async () => {
    const app = await make();
    app.get('/go', { template: UserList }, () => ({
      content: '',
      redirect: '/users',
    }));
    const nav = await app.fetch(
      new Request('http://app/go', { redirect: 'manual' }),
    );
    asserts.assertEquals(nav.status, 302);
    asserts.assertEquals(nav.headers.get('location'), '/users');

    // fetch() follows a 3xx transparently and would hand the runtime the
    // TARGET's body — so a swap gets the header form instead.
    const swap = await app.fetch(
      new Request('http://app/go', { headers: { 'rapid-swap': '1' } }),
    );
    asserts.assertEquals(swap.status, 200);
    asserts.assertEquals(swap.headers.get('rapid-redirect'), '/users');
    asserts.assertEquals(swap.headers.get('location'), null);
    asserts.assertEquals(await swap.text(), '');
    await app.stop();
  });
});

// =============================================================================
// The three tiers — core (document) ▸ module/route layout (page shape) ▸
// content — plus meta and the rapid-title swap stamp.
// =============================================================================

const Core = template<
  { body: unknown; title?: string; meta?: Record<string, string> }
>(
  (d) =>
    html`<html-doc title="${d.title ?? ''}" meta="${
      JSON.stringify(d.meta ?? {})
    }">${d.body}</html-doc>`,
  'Core',
);
const PageShape = template<{ body: unknown; title?: string }>(
  (d) => html`<shape title="${d.title ?? ''}">${d.body}</shape>`,
  'PageShape',
);

describe('rapid.ui.tiers', () => {
  const makeTiered = async () => {
    const app = await Application.initialize({
      name: 'tiers',
      server: { port: 0, hostname: '127.0.0.1' },
      logger: { handlers: [] },
      ui: { prefer: 'html', core: Core, layout: PageShape },
    });
    return app;
  };

  it('a page renders core(layout(fragment)) with the title handed to BOTH tiers', async () => {
    const app = await makeTiered();
    app.get(
      '/p',
      { template: { render: UserList, title: 'Users' } },
      () => ({ content: { items: ['a'] } }),
    );
    const out = await (await app.fetch(new Request('http://app/p'))).text();
    asserts.assertEquals(
      out,
      '<html-doc title="Users" meta="{}"><shape title="Users"><ul><li>a</li></ul></shape></html-doc>',
    );
    await app.stop();
  });

  it('layout: false goes straight into the core, even with an app default configured', async () => {
    const app = await makeTiered();
    app.get(
      '/bare',
      { template: { render: UserList, layout: false } },
      () => ({ content: { items: ['x'] } }),
    );
    const out = await (await app.fetch(new Request('http://app/bare'))).text();
    asserts.assertEquals(
      out,
      '<html-doc title="" meta="{}"><ul><li>x</li></ul></html-doc>',
    );
    await app.stop();
  });

  it('meta (record or fn-of-data) reaches the CORE only', async () => {
    const app = await makeTiered();
    app.get('/m', {
      template: {
        render: UserList,
        title: (d) => `n=${(d as { items: string[] }).items.length}`,
        meta: (d) => ({
          description: `count ${(d as { items: string[] }).items.length}`,
        }),
      },
    }, () => ({ content: { items: ['a', 'b'] } }));
    const out = await (await app.fetch(new Request('http://app/m'))).text();
    asserts.assertStringIncludes(
      out,
      'meta="{&quot;description&quot;:&quot;count 2&quot;}"',
    );
    asserts.assertStringIncludes(out, '<shape title="n=2">');
    await app.stop();
  });

  it('a swap skips both tiers and stamps rapid-title for the history module', async () => {
    const app = await makeTiered();
    app.get(
      '/p',
      { template: { render: UserList, title: 'Später & so' } },
      () => ({ content: { items: ['a'] } }),
    );
    const res = await app.fetch(
      new Request('http://app/p', { headers: { 'rapid-swap': '1' } }),
    );
    asserts.assertEquals(await res.text(), '<ul><li>a</li></ul>');
    asserts.assertEquals(
      decodeURIComponent(res.headers.get('rapid-title')!),
      'Später & so',
    );
    await app.stop();
  });

  it('the error page renders inside the CORE with "{status} {message}" as its title — module tier skipped', async () => {
    const app = await makeTiered();
    app.get('/missing', { template: UserList }, () => {
      throw new RapidError('RAPID_NOT_FOUND');
    });
    const res = await app.fetch(new Request('http://app/missing'));
    asserts.assertEquals(res.status, 404);
    const out = await res.text();
    asserts.assertStringIncludes(out, '<html-doc title="404 Not found"');
    asserts.assertEquals(out.includes('<shape'), false);
    await app.stop();
  });

  it('errorTemplates: exact status beats class beats default; status and mode join the data', async () => {
    const Exact = template<Record<string, unknown>>(
      (e) => html`<e404 mode="${String(e.mode)}"></e404>`,
      'Exact',
    );
    const ClassPage = template<Record<string, unknown>>(
      (e) => html`<e5xx status="${String(e.status)}"></e5xx>`,
      'ClassPage',
    );
    const Fallback = template<Record<string, unknown>>(
      () => html`<edefault></edefault>`,
      'Fallback',
    );
    const app = await Application.initialize({
      name: 'tiers-errors',
      server: { port: 0, hostname: '127.0.0.1' },
      logger: { handlers: [] },
      ui: {
        prefer: 'html',
        errorTemplates: { 404: Exact, '5xx': ClassPage, default: Fallback },
      },
    });
    app.get('/nf', { template: UserList }, () => {
      throw new RapidError('RAPID_NOT_FOUND');
    });
    app.get('/boom', { template: UserList }, () => {
      throw new Error('kaput');
    });
    app.get('/teapot', { template: UserList }, () => {
      throw new RapidError('RAPID_VALIDATION_FAILED');
    });
    asserts.assertEquals(
      await (await app.fetch(new Request('http://app/nf'))).text(),
      '<e404 mode="PRODUCTION"></e404>',
    );
    asserts.assertEquals(
      await (await app.fetch(new Request('http://app/boom'))).text(),
      '<e5xx status="500"></e5xx>',
    );
    // 400 has no exact and no '4xx' entry → default.
    asserts.assertEquals(
      await (await app.fetch(new Request('http://app/teapot'))).text(),
      '<edefault></edefault>',
    );
    await app.stop();
  });

  it('ui.enabled false: JSON everywhere, no runtime route, JSON errors — per replica', async () => {
    const app = await Application.initialize({
      name: 'tiers-disabled',
      server: { port: 0, hostname: '127.0.0.1' },
      logger: { handlers: [] },
      ui: { enabled: false, prefer: 'html', core: Core, layout: PageShape },
    });
    app.get(
      '/p',
      { template: { render: UserList, prefer: 'html' } },
      () => ({ content: { items: ['a'] } }),
    );
    const page = await app.fetch(new Request('http://app/p'));
    asserts.assertEquals(page.headers.get('content-type'), 'application/json');
    asserts.assertEquals(await page.json(), { items: ['a'] });
    // The swap header is ignored too — JSON unconditionally.
    const swap = await app.fetch(
      new Request('http://app/p', { headers: { 'rapid-swap': '1' } }),
    );
    asserts.assertEquals(swap.headers.get('content-type'), 'application/json');
    await swap.body?.cancel();
    const runtime = await app.fetch(new Request('http://app/__rapid/ui.js'));
    asserts.assertEquals(runtime.status, 404);
    await runtime.body?.cancel();
    await app.stop();
  });

  it('configuring twice (initialize ui + app.ui) is a loud config error', async () => {
    const app = await Application.initialize({
      name: 'tiers-double',
      server: { port: 0, hostname: '127.0.0.1' },
      logger: { handlers: [] },
      ui: { prefer: 'html' },
    });
    asserts.assertThrows(
      () => app.ui({}),
      Error,
      'already configured',
    );
    await app.stop();
  });

  it('a registry key outside the closed grammar fails at boot', async () => {
    await asserts.assertRejects(
      () =>
        Application.initialize({
          name: 'tiers-badkey',
          server: { port: 0, hostname: '127.0.0.1' },
          logger: { handlers: [] },
          ui: {
            errorTemplates: {
              '3xx': template(() => html``, 'nope'),
            } as never,
          },
        }),
      Error,
      'closed grammar',
    );
  });
});
