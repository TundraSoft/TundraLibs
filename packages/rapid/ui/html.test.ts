/**
 * @fileoverview Tests for the UI rendering primitives — escaping is the
 * security boundary, so the XSS payload case and the impersonation
 * guard are the load-bearing assertions.
 * @module
 */
import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { html, htmlDocument, raw, render, template } from './html.ts';
import { withQuery } from './withQuery.ts';
import type { RapidView } from '../types/mod.ts';

describe('rapid.ui.html', () => {
  it('escapes every interpolated value — the XSS payload never survives', () => {
    const payload = `<script>alert('x')</script>&"`;
    asserts.assertEquals(
      render(html`<p>${payload}</p>`),
      '<p>&lt;script&gt;alert(&#39;x&#39;)&lt;/script&gt;&amp;&quot;</p>',
    );
  });

  it('nested Html composes without double-escaping; arrays join with nothing', () => {
    const items = ['a<b', 'c'];
    asserts.assertEquals(
      render(html`<ul>${items.map((i) => html`<li>${i}</li>`)}</ul>`),
      '<ul><li>a&lt;b</li><li>c</li></ul>',
    );
  });

  it("null / undefined / false render as '' — so `cond && html` works; other primitives stringify", () => {
    asserts.assertEquals(
      render(html`[${null}${undefined}${false}]`),
      '[]',
    );
    asserts.assertEquals(render(html`${0} ${true}`), '0 true');
  });

  it('raw() is the only unescaped path', () => {
    const markup = '<b>bold</b>';
    asserts.assertEquals(render(html`${raw(markup)}`), markup);
    asserts.assertEquals(render(html`${markup}`), '&lt;b&gt;bold&lt;/b&gt;');
  });

  it('an object literal cannot impersonate Html — symbol brand, not a string key', () => {
    // The shape an attacker could smuggle through a JSON body: JSON can
    // carry string keys, never a symbol, so this must be escaped like
    // any other value.
    const fake = { __value: '<script>boom()</script>' };
    // Stringified + escaped like any other value — the payload is inert.
    asserts.assertEquals(render(html`${fake}`), '[object Object]');
  });

  it('template() pairs a name with the pure render fn; view is optional to the author', () => {
    const UserList = template<{ names: string[] }>(
      (data) => html`<ul>${data.names.map((n) => html`<li>${n}</li>`)}</ul>`,
      'UserList',
    );
    asserts.assertEquals(UserList.name, 'UserList');
    asserts.assertEquals(
      render(UserList.render({ names: ['ada'] }, {
        requestId: 'r1',
        runtimePath: '/__rapid/ui.js',
        path: '/',
        asset: (p: string) => p,
        query: {},
      })),
      '<ul><li>ada</li></ul>',
    );
    // Name defaults to '' — mount-time diagnostics use the route path.
    asserts.assertEquals(template(() => html``).name, '');
  });

  it('template<D, Extra> types the projection fields without casts', () => {
    const T = template<{ n: number }, { user?: { name: string } }>(
      (data, view) => html`${data.n}:${view.user?.name}`,
      'T',
    );
    const view = {
      requestId: 'r',
      runtimePath: '/__rapid/ui.js',
      path: '/',
      asset: (p: string) => p,
      query: {},
      user: { name: 'Ada' },
    } as RapidView;
    asserts.assertEquals(render(T.render({ n: 1 }, view)), '1:Ada');
  });

  it('htmlDocument emits a standards-mode document with an escaped title', () => {
    const out = render(htmlDocument({
      title: 'A <b>title</b>',
      head: html`<style>b{}</style>`,
      body: html`<main>hi</main>`,
    }));
    asserts.assert(out.startsWith('<!doctype html><html lang="en">'));
    asserts.assertStringIncludes(out, '<meta charset="utf-8">');
    asserts.assertStringIncludes(out, 'name="viewport"');
    asserts.assertStringIncludes(
      out,
      '<title>A &lt;b&gt;title&lt;/b&gt;</title>',
    );
    asserts.assertStringIncludes(out, '<style>b{}</style></head>');
    asserts.assertStringIncludes(out, '<body><main>hi</main></body></html>');
  });

  it('withQuery merges, overrides, deletes, and encodes', () => {
    asserts.assertEquals(
      withQuery('/posts', { tag: 'news', page: '2' }, { page: 3 }),
      '/posts?tag=news&page=3',
    );
    asserts.assertEquals(
      withQuery('/posts', { tag: 'a b' }, {}),
      '/posts?tag=a+b',
    );
    asserts.assertEquals(
      withQuery('/posts', { tag: 'x' }, { tag: undefined }),
      '/posts',
    );
    // A path already carrying a query joins it as the LOWEST layer —
    // never a literal second '?'.
    asserts.assertEquals(
      withQuery('/posts?x=1', { y: '2' }, { z: 3 }),
      '/posts?x=1&y=2&z=3',
    );
    asserts.assertEquals(
      withQuery('/posts?x=1', { x: '9' }, { x: undefined }),
      '/posts',
    );
  });
});
