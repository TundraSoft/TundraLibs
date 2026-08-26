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
} from '../../ui/mod.ts';
import type { RapidContextPaging } from '../../types/mod.ts';
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
 * The page shell — set module-wide via `@Module({ layout })`. The dark
 * library hero (with the LIVE badge), the toast slot, and the three
 * scripts (swap runtime via `view.runtimePath`, the live bridge, and
 * the app's own blog.js).
 */
export const BlogShell = template<{ body: Html; title?: string }>((
  data,
  view,
) =>
  htmlDocument({
    title: data.title ?? 'The Library — a rAPId demo',
    head: html`<style>
      * { box-sizing: border-box; }
      body { margin: 0; background: #f4f1e9; color: #221f1a;
             font-family: Georgia, 'Iowan Old Style', 'Times New Roman', serif; }
      main { max-width: 66rem; margin: 0 auto; padding: 0 1.5rem 3rem; }
      @keyframes rise { from { opacity: 0; transform: translateY(10px); }
                        to { opacity: 1; transform: none; } }
      @keyframes ping { 0% { box-shadow: 0 0 0 0 rgb(134 197 111 / .5); }
                        100% { box-shadow: 0 0 0 8px rgb(134 197 111 / 0); } }
      @keyframes glow { from { background: #fdf0d5; } to { background: #fff; } }

      header.hero { background: linear-gradient(160deg, #17301f, #2a5138);
        color: #f4f1e9; text-align: center; padding: 3.2rem 1.5rem 2.6rem;
        margin-bottom: 2rem; animation: rise .5s ease-out both; }
      .hero .kicker { font: 600 .72rem system-ui, sans-serif;
        letter-spacing: .35em; text-transform: uppercase; color: #c8a24d; }
      .hero h1 { margin: .5rem auto .4rem; font-size: 2.9rem; max-width: 34rem;
        line-height: 1.15; font-weight: 700; }
      .hero h1 em { color: #d8b76a; }
      .hero p { margin: 0; color: #cfd8c8; font: .95rem system-ui, sans-serif; }
      .live { display: inline-flex; align-items: center; gap: .4rem;
        font: 600 .68rem system-ui, sans-serif; letter-spacing: .12em;
        color: #9fb3a0; border: 1px solid #4a6b52; border-radius: 999px;
        padding: .25rem .7rem; vertical-align: middle; margin-left: .6rem; }
      .live i { width: .5rem; height: .5rem; border-radius: 50%;
        background: #74856f; }
      .live.on { color: #a9e08b; border-color: #6f9a5d; }
      .live.on i { background: #86c56f; animation: ping 1.6s ease-out infinite; }

      .chips { display: flex; align-items: center; gap: .5rem;
        flex-wrap: wrap; margin-bottom: 1.4rem; }
      .chip { border: 1px solid #d9d2c0; background: #fff; color: #221f1a;
        border-radius: 999px; padding: .4rem 1rem; cursor: pointer;
        font: .85rem system-ui, sans-serif; text-transform: capitalize;
        transition: border-color .2s, background .2s; }
      .chip:hover { border-color: #2a5138; }
      .chip-on { background: #17301f; color: #f4f1e9; border-color: #17301f; }
      .tally { margin-left: auto; color: #98917f;
        font: .8rem system-ui, sans-serif; }

      .shelves { display: grid; gap: 2rem;
        grid-template-columns: minmax(19rem, 5fr) 7fr; }
      @media (max-width: 46rem) { .shelves { grid-template-columns: 1fr; } }

      ul.guides { list-style: none; padding: 0; margin: 0; }
      .guide { background: #fff; border: 1px solid #e6e0d1;
        border-radius: 14px; padding: 1.1rem 1.3rem; margin-bottom: 1rem;
        animation: rise .45s cubic-bezier(.2, .7, .3, 1) both;
        animation-delay: calc(var(--i, 0) * 60ms); }
      .eyebrow { display: block; font: 700 .62rem system-ui, sans-serif;
        letter-spacing: .22em; text-transform: uppercase; color: #8a6d2f;
        margin-bottom: .35rem; }
      .guide button { background: none; border: 0; padding: 0;
        font: 700 1.12rem inherit; font-family: inherit; color: #221f1a;
        cursor: pointer; text-align: left; line-height: 1.3;
        background-image: linear-gradient(#8a3b24, #8a3b24);
        background-size: 0% 2px; background-position: 0 100%;
        background-repeat: no-repeat; transition: background-size .25s; }
      .guide button:hover { background-size: 100% 2px; color: #8a3b24; }
      .blurb { margin: .45rem 0 .5rem; color: #55503f; font-size: .92rem;
        line-height: 1.5; }
      .meta { color: #98917f; font: .78rem system-ui, sans-serif; }
      .level { border-radius: 999px; padding: .1rem .55rem;
        text-transform: capitalize; font-weight: 600; }
      .level-beginner { background: #e7f4e4; color: #2f6b3a; }
      .level-intermediate { background: #fdf0d5; color: #8a6014; }
      .level-advanced { background: #f6e3dc; color: #8a3b24; }

      .placeholder { color: #b3ac9a; font-style: italic;
        border: 1px dashed #d9d2c0; border-radius: 14px;
        padding: 3rem 1.5rem; text-align: center; }
      article.post { background: #fff; border: 1px solid #e6e0d1;
        border-radius: 14px; padding: 1.6rem 1.9rem;
        box-shadow: 0 10px 28px rgb(23 48 31 / .08);
        animation: rise .45s cubic-bezier(.2, .7, .3, 1) both; }
      article.post h2 { margin: .2rem 0 .4rem; font-size: 1.75rem;
        line-height: 1.2; }
      article.post .body { line-height: 1.7; font-size: 1.05rem; }

      #comments { margin-top: 1.5rem; border-top: 1px solid #e6e0d1;
        padding-top: .8rem; }
      #comments h3 { margin: 0 0 .5rem; font-size: 1rem; }
      #comments .count { background: #17301f; color: #f4f1e9;
        border-radius: 999px; font: 600 .7rem system-ui, sans-serif;
        padding: .1rem .5rem; vertical-align: 2px; }
      ul.comments { list-style: none; padding: 0; margin: 0; }
      .comment { padding: .6rem .8rem; border-radius: 8px;
        animation: rise .4s ease-out both;
        animation-delay: calc(var(--i, 0) * 50ms); }
      .comment:first-child { animation: rise .4s ease-out both,
        glow 2.5s ease-out both; }
      .comment b { font-family: system-ui, sans-serif; font-size: .85rem; }
      .comment time { color: #b3ac9a; font: .72rem system-ui, sans-serif;
        margin-left: .5rem; }
      .comment p { margin: .2rem 0 0; }

      #toast { position: fixed; bottom: 1.2rem; right: 1.2rem;
        background: #17301f; color: #f4f1e9; border-radius: 10px;
        padding: .7rem 1.1rem; font: .85rem system-ui, sans-serif;
        opacity: 0; transform: translateY(12px); pointer-events: none;
        transition: opacity .3s, transform .3s; max-width: 22rem; }
      #toast.show { opacity: 1; transform: none; }
    </style>`,
    body: html`<header class="hero">
      <span class="kicker">The library</span>
      <h1>Money, explained slowly. <em>Wander freely.</em></h1>
      <p>
        a rAPId demo — the same routes serve JSON and HTML, comments
        stream over the websocket · education only
        <span id="live" class="live"><i></i> LIVE</span>
      </p>
    </header>
    <main>${data.body}</main>
    <div id="toast"></div>
    <script src="${view.runtimePath}"></script>
    <script src="/__rapid/live.js"></script>
    <script src="/public/blog.js"></script>`,
  }), 'BlogShell');
