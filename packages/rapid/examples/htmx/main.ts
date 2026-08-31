/**
 * The BRING-YOUR-OWN-CLIENT demo: the exact same server model as every
 * other example — templated routes, fragment/page/JSON off one header,
 * `Vary` stamped — driven by [htmx](https://htmx.org) instead of the
 * bundled runtime. The whole adaptation is the `ui` options below:
 *
 *   swapHeader:     'hx-request'   htmx sends HX-Request on every request
 *   swapUnless:     hx-boosted + history restore — htmx sends its marker
 *                   on boosted NAVIGATIONS too, where it expects a PAGE
 *   redirectHeader: 'HX-Redirect'  htmx performs a full navigation on it
 *
 * No rapid client script is served to the page; htmx's idioms replace
 * app.js wholesale — and the contrasts are the lesson:
 *
 *   - Multi-region updates are SERVER-side here (`hx-swap-oob`: one
 *     response carries extra fragments addressed by id), where the
 *     bundled runtime chains client-side off `rapid:swapped`.
 *   - Polling is declarative (`hx-trigger="every 8s"` keeps the tallies
 *     fresh across tabs), where the bundled runtime leaves timers to
 *     app JS and offers the live channel instead.
 *   - `hx-boost` on the About link proves `swapUnless`: the boosted
 *     navigation carries HX-Request yet still receives the full PAGE.
 *   - "Start over" returns a reply `redirect` — on this swap it becomes
 *     `200` + `HX-Redirect`, which htmx follows natively (D8).
 *
 * A lunch poll: vote, watch the bars move in every open tab, suggest a
 * dish (validation errors are the form's OWN 200-state), start over.
 *
 * The same routes are an API — no HX-Request, no HTML:
 *
 * ```bash
 * curl -s localhost:8003/poll | jq                     # tallies (JSON)
 * curl -s -X POST localhost:8003/poll/vote/Ramen | jq
 * curl -s -X POST localhost:8003/poll/suggest -H 'content-type: application/json' \
 *   -d '{"dish":"Bibimbap"}' | jq
 * ```
 *
 * Run (from the repo root — htmx itself loads from unpkg, so the DEMO
 * page needs the network once; the server does not):
 *
 * ```bash
 * deno run -A packages/rapid/examples/htmx/main.ts
 * ```
 *
 * @module
 */

import { Application, RapidError } from '@tundralibs/rapid';
import {
  html,
  type Html,
  htmlDocument,
  raw,
  template,
} from '@tundralibs/rapid/ui';

// ── state: the poll, in memory ───────────────────────────────────────
const votes = new Map<string, number>([
  ['Tacos', 4],
  ['Ramen', 6],
  ['Dosa', 5],
]);
const total = () => [...votes.values()].reduce((a, b) => a + b, 0);

// ── templates ────────────────────────────────────────────────────────

/**
 * The tallies. `oob: true` renders the SAME section with
 * `hx-swap-oob="outerHTML"` — htmx then applies it by id no matter what
 * the request targeted: the server decides which regions a response
 * updates (contrast: the bundled runtime keeps that choice in app JS).
 * The section also refreshes ITSELF every 8s (`hx-trigger`), so votes
 * from other tabs (or curl) appear without any socket.
 */
const PollView = template<{ tallies: [string, number][]; oob?: boolean }>(
  (data) => {
    const max = Math.max(1, ...data.tallies.map(([, n]) => n));
    return html`<section id="results"
    ${data.oob ? raw('hx-swap-oob="outerHTML" ') : ''}hx-get="/poll"
    hx-trigger="every 8s" hx-swap="outerHTML">
    <ul>${
      data.tallies.map(([dish, count]) =>
        html`<li>
        <button hx-post="/poll/vote/${dish}" hx-target="#results"
          hx-swap="outerHTML">+1</button>
        <span class="dish">${dish}</span>
        <span class="bar" style="--w:${
          Math.round((count / max) * 100)
        }%"><i></i></span>
        <span class="n">${count}</span>
      </li>`
      )
    }</ul>
  </section>`;
  },
  'PollView',
);

/** The header badge a vote/suggest response ALSO updates, out-of-band. */
const TotalBadge = template<{ total: number; oob?: boolean }>((data) =>
  html`<span id="total"${
    data.oob ? raw(' hx-swap-oob="outerHTML"') : ''
  }>${data.total} votes</span>`, 'TotalBadge');

/**
 * A vote's response: the tallies for the button's own target, PLUS the
 * badge out-of-band — ONE response, two regions.
 */
const VoteView = template<{ tallies: [string, number][]; total: number }>(
  (data, view) =>
    html`${PollView.render({ tallies: data.tallies }, view)}${
      TotalBadge.render({ total: data.total, oob: true }, view)
    }`,
  'VoteView',
);

/**
 * The suggest form — outerHTML self-swap, errors as the union's OWN
 * 200-state (values kept). Success carries the refreshed tallies AND
 * badge out-of-band, so one POST updates three regions server-side.
 */
type SuggestData =
  | { state: 'clean' }
  | { state: 'error'; message: string; value: string }
  | { state: 'added'; tallies: [string, number][]; total: number };
const SuggestView = template<SuggestData>((data, view) =>
  html`<form id="suggest" hx-post="/poll/suggest" hx-target="#suggest"
    hx-swap="outerHTML">
    <input name="dish" placeholder="Suggest a dish…" autocomplete="off"
      value="${data.state === 'error' ? data.value : ''}">
    <button type="submit">Add it</button>
    ${data.state === 'error' ? html`<p class="err">${data.message}</p>` : ''}
    ${data.state === 'added' ? html`<p class="okay">On the ballot.</p>` : ''}
  </form>${
    data.state === 'added'
      ? html`${PollView.render({ tallies: data.tallies, oob: true }, view)}${
        TotalBadge.render({ total: data.total, oob: true }, view)
      }`
      : ''
  }`, 'SuggestView');

const AboutView = template<Record<never, never>>(() =>
  html`<article class="about">
    <h2>What just happened</h2>
    <p>
      That link was <code>hx-boost</code>ed — htmx sent its
      <code>HX-Request</code> marker, yet the server returned this full
      PAGE, because <code>swapUnless: ['hx-boosted', …]</code> names the
      headers that cancel the fragment decision. Address-bar visits land
      here identically.
    </p>
    <p><a href="/poll/ui" hx-boost="true">← Back to lunch</a></p>
  </article>`, 'AboutView');

/** The page — poll + form composed; htmx loaded from unpkg (pinned+SRI). */
const PageView = template<{ tallies: [string, number][]; total: number }>(
  (data, view) =>
    html`<header>
    <h1>Lunch, decided</h1>
    ${TotalBadge.render({ total: data.total }, view)}
  </header>
  ${PollView.render({ tallies: data.tallies }, view)}
  ${SuggestView.render({ state: 'clean' }, view)}
  <footer>
    <a href="/poll/about" hx-boost="true">How the boosted page works</a>
    <button hx-post="/poll/reset" class="ghost">Start over</button>
  </footer>`,
  'PageView',
);

const Shell = template<{ body: Html; title?: string }>((data) =>
  htmlDocument({
    title: data.title ?? 'Lunch, decided — rapid × htmx',
    head: html`${
      raw(
        '<script src="https://unpkg.com/htmx.org@2.0.4/dist/htmx.min.js" ' +
          'integrity="sha384-HGfztofotfshcF7+8n44JQL2oJmowVChPTg48S+jvZoztPfvwD79OC/LTtG6dMp+" ' +
          'crossorigin="anonymous"></script>',
      )
    }<style>
      * { box-sizing: border-box; }
      body { margin: 0; background: #fbf7f0; color: #2b2620;
             font: 16px/1.5 system-ui, sans-serif; }
      main { max-width: 30rem; margin: 0 auto; padding: 2.5rem 1.2rem; }
      header { display: flex; align-items: baseline; gap: .8rem;
        margin-bottom: 1.4rem; }
      h1 { margin: 0; font-size: 1.6rem; }
      #total { margin-left: auto; background: #e8503a; color: #fff;
        border-radius: 999px; padding: .2rem .7rem; font-size: .75rem;
        font-weight: 600; font-variant-numeric: tabular-nums; }
      #results ul { list-style: none; margin: 0 0 1.4rem; padding: 0; }
      #results li { display: flex; align-items: center; gap: .6rem;
        padding: .45rem 0; }
      #results button { background: #fff; border: 1px solid #ddd2c0;
        border-radius: 8px; padding: .25rem .6rem; cursor: pointer;
        font: 600 .8rem system-ui; }
      #results button:hover { border-color: #e8503a; color: #e8503a; }
      .dish { width: 6.5rem; font-weight: 600; }
      .bar { flex: 1; background: #f0e8da; border-radius: 6px; height: .8rem;
        overflow: hidden; }
      .bar i { display: block; height: 100%; width: var(--w, 0%);
        background: #e8503a; border-radius: 6px; transition: width .4s; }
      .n { width: 2rem; text-align: right;
        font-variant-numeric: tabular-nums; }
      #suggest { display: flex; gap: .5rem; flex-wrap: wrap; }
      #suggest input { flex: 1; min-width: 10rem; border: 1px solid #ddd2c0;
        border-radius: 8px; padding: .5rem .7rem; font: inherit;
        background: #fff; }
      #suggest button { background: #2b2620; color: #fbf7f0; border: 0;
        border-radius: 8px; padding: .5rem 1rem; font: 600 .9rem system-ui;
        cursor: pointer; }
      .err { flex-basis: 100%; margin: 0; color: #b3341f;
        font-size: .85rem; }
      .okay { flex-basis: 100%; margin: 0; color: #3d7a3f;
        font-size: .85rem; }
      footer { display: flex; justify-content: space-between;
        margin-top: 2rem; font-size: .85rem; }
      footer a { color: #8a6d2f; }
      .ghost { background: none; border: 0; color: #a09582;
        cursor: pointer; font: inherit; font-size: .85rem;
        text-decoration: underline; }
      .about h2 { margin-top: 0; }
      code { background: #f0e8da; border-radius: 4px; padding: .05rem .3rem; }
    </style>`,
    body: html`<main>${data.body}</main>`,
  }), 'Shell');

// ── the app: htmx headers ARE the whole adaptation ───────────────────
const app = await Application.initialize({
  name: 'htmx-demo',
  server: { port: 8003 },
  ui: {
    layout: Shell,
    // The contract headers are DATA — a config-driven app would put
    // these three lines in Application.yaml, per replica.
    swapHeader: 'hx-request',
    swapUnless: ['hx-boosted', 'hx-history-restore-request'],
    redirectHeader: 'HX-Redirect',
  },
});

const tallies = () => [...votes.entries()] as [string, number][];

app.get('/', (ctx) => ctx.redirect('/poll/ui'));
app.get('/poll/ui', { template: { render: PageView, prefer: 'html' } }, () => ({
  content: { tallies: tallies(), total: total() },
}));
app.get('/poll/about', {
  template: { render: AboutView, prefer: 'html' },
}, () => ({ content: {} }));

// The tallies — JSON to curl, the fragment to any HX-Request.
app.get('/poll', { template: PollView }, () => ({
  content: { tallies: tallies() },
}));

app.post('/poll/vote/:dish:', { template: VoteView }, (ctx) => {
  const dish = String(ctx.args.params['dish'] ?? '');
  if (!votes.has(dish)) {
    // A thrown code takes the ERROR path (JSON envelope / errorTemplate)
    // — never this route's template, whose data shape a 404 can't fill.
    throw new RapidError('RAPID_NOT_FOUND', { details: { dish } });
  }
  votes.set(dish, votes.get(dish)! + 1);
  return { content: { tallies: tallies(), total: total() } };
});

app.post('/poll/suggest', { template: SuggestView }, async (ctx) => {
  const body = (await ctx.payload ?? {}) as { dish?: string };
  const dish = (body.dish ?? '').trim();
  if (dish === '') {
    return {
      content: {
        state: 'error',
        message: 'Name a dish first.',
        value: body.dish ?? '',
      },
    };
  }
  if (!votes.has(dish)) votes.set(dish, 1);
  return {
    content: { state: 'added', tallies: tallies(), total: total() },
  };
});

// A reply `redirect` on a swap becomes 200 + HX-Redirect — htmx
// navigates; a no-JS form POST here would get the real 302 (PRG).
app.post('/poll/reset', (ctx) => {
  for (const dish of votes.keys()) votes.set(dish, 0);
  return ctx.redirect('/poll/ui');
});

await app.start();
app.log.info(`Lunch, decided — http://localhost:${app.port}/poll/ui`);
