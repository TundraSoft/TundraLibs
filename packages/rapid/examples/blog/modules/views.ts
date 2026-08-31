/**
 * The blog's HTML templates — pure `(data, view) => Html` functions,
 * styled as a GUIDES LIBRARY: a dark hero, category eyebrows, level +
 * reading-time metadata, and FUNCTIONAL level chips (each chip is a
 * `data-swap="outer"` fragment swap of the whole `#library` region —
 * built with `withQuery`, filtered server-side by the same `/posts`
 * route that serves JSON). The reader pane + live comments mechanics
 * are unchanged underneath the new coat.
 *
 * Seed-data convention (see main.ts): `tags = [category, level,
 * 'NN min']` — the templates read positions; a real app would model
 * columns.
 *
 * @module
 */

import {
  html,
  type Html,
  htmlDocument,
  template,
  withQuery,
} from '../../../ui/mod.ts';
import type { RapidContextPaging, RapidView } from '../../../types/mod.ts';
import type { Comment, Post } from '../types.ts';

const CATEGORY_LABELS: Record<string, string> = {
  psychology: 'Money psychology & behaviour',
  banking: 'Banking & payments',
  economy: 'Economy & macro',
};

const LEVELS = ['all', 'beginner', 'intermediate', 'advanced'];

const eyebrow = (post: Post): Html =>
  html`<span class="eyebrow">${
    CATEGORY_LABELS[post.tags[0] ?? ''] ?? 'Guide'
  }</span>`;

const meta = (post: Post): Html =>
  html`<span class="meta">
    <span class="level level-${post.tags[1] ?? 'beginner'}">${
    post.tags[1] ?? 'beginner'
  }</span>${post.tags[2] ? html` · ${post.tags[2]}` : ''}
  </span>`;

/**
 * A post's comments — the fragment `GET /posts/:id:/comments` renders on
 * a swap. Newest first; the first row wears the arrival glow.
 */
export const CommentsView = template<{ rows: Comment[]; total: number }>(
  (data) =>
    html`<h3>
      Comments <span class="count">${data.total}</span>
    </h3>
    ${
      data.rows.length === 0
        ? html`<p class="meta">Nothing yet — the fake commenters are typing…</p>`
        : html`<ul class="comments">${
          // Rows arrive newest-first from the route's DESC window.
          data.rows.map((c, i) =>
            html`<li class="comment" style="--i:${i}">
              <b>${c.author}</b>
              <time>${new Date(c.createdAt).toLocaleTimeString()}</time>
              <p>${c.body}</p>
            </li>`
          )
        }</ul>`
    }`,
  'CommentsView',
);

/**
 * One guide, full — the detail fragment `GET /posts/:id:` renders on a
 * swap. Carries its comments slot; blog.js chains a second
 * `rapid.swap()` into it and the live channel keeps it fresh.
 */
export const PostDetailView = template<Post>((post) =>
  html`<article class="post">
    ${eyebrow(post)}
    <h2>${post.title}</h2>
    <p>${meta(post)}</p>
    <p class="body">${post.body}</p>
    <div id="comments" data-post="${post.id}">
      <p class="meta">Loading comments…</p>
    </div>
  </article>`, 'PostDetailView');

/**
 * The library — level chips + guide cards + the reader pane, rooted at
 * `#library` so a chip's `data-swap="outer"` replaces the WHOLE region
 * (no nesting; the runtime fires `rapid:swapped` on the replacement).
 * Serves BOTH registrations of `Posts.list()`: API-first `GET /posts`
 * and the page `GET /posts/ui`.
 */
export const PostListView = template<{
  rows: Post[];
  total: number;
  paging: RapidContextPaging;
  level?: string;
}>((data, view) => {
  const active = data.level ?? 'all';
  return html`<div class="library" id="library">
    <nav class="chips">${
    LEVELS.map((level) =>
      html`<button
          class="chip${level === active ? ' chip-on' : ''}"
          data-action="${
        // view.query as the base keeps any OTHER params (page, sort)
        // across a chip switch — withQuery's documented layering.
        withQuery('/posts', view.query, {
          level: level === 'all' ? undefined : level,
        })
      }"
          data-target="#library"
          data-swap="outer"
        >${level === 'all' ? 'All levels' : level}</button>`
    )
  }
      <span class="tally">${data.total} guide${
    data.total === 1 ? '' : 's'
  }</span>
    </nav>
    <div class="shelves">
      <section class="list">
        <ul class="guides">${
    data.rows.map((post, i) =>
      html`<li class="guide" style="--i:${i}">
            ${eyebrow(post)}
            <button data-action="/posts/${post.id}" data-target="#post-detail">
              ${post.title}
            </button>
            <p class="blurb">${post.body}</p>
            ${meta(post)}
          </li>`
    )
  }</ul>
      </section>
      <section class="reader">
        <div id="post-detail">
          <p class="placeholder">
            Open a guide — its comments stream in live.
          </p>
        </div>
      </section>
    </div>
  </div>`;
}, 'PostListView');

/**
 * The nav data BOTH chromes render — computed server-side by the app's
 * `ui.view` projection from `ctx.auth` (permission-based navigation:
 * the backend sends different menu items per caller; templates never
 * decide access, they just render what crossed the projection).
 */
export type BlogView = {
  user?: { username: string };
  menu: readonly { label: string; href: string }[];
};

/** One menu bar, chrome-agnostic — items are whatever the projection sent. */
const menuBar = (view: RapidView<BlogView>): Html =>
  html`<nav class="menu">${
    view.menu.map((item) => html`<a href="${item.href}">${item.label}</a>`)
  }</nav>`;

/**
 * The CORE — the document tier: head (fingerprinted stylesheet via
 * `view.asset()`, per-page `meta`), the toast slot, and the three
 * scripts. Chrome lives in the tier-2 layouts below; every page —
 * public, admin, and the 404 — renders inside this one document.
 */
export const BlogCore = template<
  { body: Html; title?: string; meta?: Readonly<Record<string, string>> }
>((data, view) =>
  htmlDocument({
    title: data.title ?? 'The Library — a rAPId demo',
    meta: data.meta,
    head: html`<link rel="stylesheet" href="${view.asset('/public/blog.css')}">`,
    body: html`${data.body}
    <div id="toast"></div>
    <script src="${view.runtimePath}"></script>
    <script src="/__rapid/live.js"></script>
    <script src="/public/blog.js"></script>`,
  }), 'BlogCore');

/**
 * PUBLIC chrome — the Posts module's tier-2 layout (`@Module({ layout })`):
 * the library hero + the projection-fed menu. An anonymous visitor sees
 * the public items; a signed-in author's menu gains Admin — same
 * template, different data.
 */
export const PublicChrome = template<{ body: Html; title?: string }, BlogView>(
  (data, view) =>
    html`<header class="hero">
      <span class="kicker">The library</span>
      <h1>Money, explained slowly. <em>Wander freely.</em></h1>
      <p>
        a rAPId demo — the same routes serve JSON and HTML, comments
        stream over the websocket · education only
        <span id="live" class="live"><i></i> LIVE</span>
      </p>
      ${menuBar(view)}
    </header>
    <main>${data.body}</main>`,
  'PublicChrome',
);

/**
 * ADMIN chrome — a DIFFERENT page shape under the same core, attached
 * route-level (`layout: AdminChrome` on /admin/ui): a compact bar naming
 * the caller (`view.user` — the projection again) instead of the hero.
 */
export const AdminChrome = template<{ body: Html; title?: string }, BlogView>(
  (data, view) =>
    html`<header class="adminbar">
      <b>Admin</b>
      <span class="who">${view.user?.username ?? 'anonymous'}</span>
      ${menuBar(view)}
    </header>
    <main>${data.body}</main>`,
  'AdminChrome',
);

/** The admin summary page — same data the /admin/summary API serves. */
export const AdminSummaryView = template<
  { posts: number; you: { username?: string; roles?: string[] } }
>((data) =>
  html`<div class="stat-cards">
    <div class="card"><div class="n">${data.posts}</div><p>guides on the shelf</p></div>
    <div class="card"><div class="n">${data.you.roles?.length ?? 0}</div>
      <p>roles on ${data.you.username ?? 'you'} (${
    data.you.roles?.join(', ') ?? '—'
  })</p></div>
  </div>`, 'AdminSummaryView');

/**
 * The 404 page — `ui.errorTemplates[404]`. Renders inside the CORE
 * (module tier skipped), so it keeps the site's document and css.
 */
export const NotFoundView = template<Record<string, unknown>>((e) =>
  html`<div class="notfound">
    <h2>That shelf is empty.</h2>
    <p>${String(e.message ?? 'Not found')} · request ${
    String(e.requestId ?? '')
  }</p>
    <p><a href="/posts/ui">Back to the library</a></p>
  </div>`, 'NotFoundView');
