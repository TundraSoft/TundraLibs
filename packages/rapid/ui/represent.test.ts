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
