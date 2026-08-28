/**
 * Flightdeck's templates — pure `(data, view) => Html` functions over
 * the store's shapes, arranged as four independently-swappable REGIONS:
 *
 *   #board     the lanes + cards + filter chips (`outer` swaps)
 *   #composer  the file-a-card form (`outer` self-swap, 200+union errors)
 *   #stats     the lane tallies      (slot wrapper, `replace` swaps)
 *   #activity  the live feed         (slot wrapper, `replace` swaps)
 *
 * `AppView` (the page) COMPOSES the fragment templates by calling their
 * `render` — one data payload in, the same markup the fragment routes
 * serve, so a region refreshed over the wire is byte-compatible with
 * what the page first rendered. Everything dynamic afterwards is
 * app.js chaining `rapid.refresh()` off `rapid:swapped` and the live
 * channel — see public/app.js.
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
import type { Activity, Lane, Task } from '../types.ts';
import { LANES } from '../types.ts';

/** The board payload — the `/board` fragment's (and JSON's) shape. */
export type BoardData = {
  lanes: Record<Lane, Task[]>;
  owners: string[];
  owner?: string;
};

/** The composer's union — errors are STATE at 200, never a status. */
export type ComposerData =
  | { state: 'clean' }
  | {
    state: 'error';
    message: string;
    values: { title: string; owner: string; tag: string };
  };

const LANE_LABELS: Record<Lane, string> = {
  todo: 'To do',
  doing: 'In flight',
  review: 'On approach',
  done: 'Landed',
};

// A stable per-card view-transition-name makes a swap MORPH: cards that
// persist glide to their new lane instead of re-rendering (new ones
// fade in). That is also why .card carries NO CSS entry animation — to
// the DOM every swapped-in card is new, so an entry animation would
// replay across the whole board on every swap: the flicker.
const card = (task: Task, view: { query: Readonly<Record<string, string>> }) =>
  html`<li class="card tag-${task.tag}"
    style="view-transition-name: vt-${task.id}">
    <span class="tag">${task.tag}</span>
    <p>${task.title}</p>
    <footer>
      <span class="owner">${task.owner}</span>
      <span class="nav">${
    task.lane !== 'todo'
      ? html`<button
            data-action="${withQuery(`/board/tasks/${task.id}/move/back`, view.query)}"
            data-method="post" data-target="#board" data-swap="outer"
            aria-label="Move back"
          >◀</button>`
      : ''
  }${
    task.lane !== 'done'
      ? html`<button
            data-action="${withQuery(`/board/tasks/${task.id}/move/fwd`, view.query)}"
            data-method="post" data-target="#board" data-swap="outer"
            aria-label="Move forward"
          >▶</button>`
      : ''
  }</span>
    </footer>
  </li>`;

/**
 * The lanes — filter chips + four columns. Rooted `id="board"` so both
 * the chips and every move button `outer`-swap the WHOLE region: the
 * filter state travels inside the fragment, and the move buttons carry
 * it in their action URLs via `withQuery(…, view.query)`.
 */
export const BoardView = template<BoardData>((data, view) =>
  html`<section id="board">
    <nav class="chips">
      <button class="chip${data.owner === undefined ? ' chip-on' : ''}"
        data-action="${withQuery('/board', view.query, { owner: undefined })}"
        data-target="#board" data-swap="outer">Everyone</button>${
    data.owners.map((owner) =>
      html`<button class="chip${owner === data.owner ? ' chip-on' : ''}"
        data-action="${withQuery('/board', view.query, { owner })}"
        data-target="#board" data-swap="outer">${owner}</button>`
    )
  }
    </nav>
    <div class="lanes">${
    LANES.map((lane) =>
      html`<section class="lane lane-${lane}">
        <h2>${LANE_LABELS[lane]} <span class="count">${
        data.lanes[lane].length
      }</span></h2>
        <ul>${data.lanes[lane].map((task) => card(task, view))}</ul>
      </section>`
    )
  }</div>
  </section>`, 'BoardView');

/**
 * The file-a-card form — an `outer` SELF-swap (`data-target` defaults to
 * the form). Invalid input comes back as the SAME fragment in its error
 * state (HTTP 200 — the runtime never swaps error statuses, so
 * recoverable input problems are data, not failures), values re-filled.
 * The title input carries an id, so the runtime's focus restore puts the
 * cursor back after every swap — file three cards without touching the
 * mouse.
 */
export const ComposerView = template<ComposerData>((data) => {
  const values = data.state === 'error'
    ? data.values
    : { title: '', owner: '', tag: 'feature' };
  return html`<form id="composer" data-action="/board/tasks" data-swap="outer">
    <input id="composer-title" name="title" placeholder="File a card…"
      value="${values.title}" autocomplete="off">
    <input name="owner" placeholder="Owner" value="${values.owner}"
      autocomplete="off">
    <select name="tag">${
    ['feature', 'bug', 'ops'].map((tag) =>
      html`<option value="${tag}"${
        tag === values.tag ? html` selected` : ''
      }>${tag}</option>`
    )
  }</select>
    <button type="submit">File it</button>
    ${data.state === 'error' ? html`<p class="err">${data.message}</p>` : ''}
  </form>`;
}, 'ComposerView');

/** The lane tallies — swapped INTO the `#stats` slot (replace mode). */
export const StatsView = template<{ counts: Record<Lane, number> }>((data) =>
  html`<h2>Board</h2>
  <dl>${
    LANES.map((lane) =>
      html`<div class="stat">
        <dt>${LANE_LABELS[lane]}</dt>
        <dd>${data.counts[lane]}</dd>
      </div>`
    )
  }</dl>`, 'StatsView');

/** The activity feed — swapped INTO the `#activity` slot. */
export const ActivityView = template<{ rows: Activity[] }>((data) =>
  html`<h2>Activity</h2>
  ${
    data.rows.length === 0
      ? html`<p class="quiet">Nothing yet — move a card.</p>`
      : html`<ol>${
        data.rows.map((row, i) =>
          html`<li style="--i:${i}">
          <time>${new Date(row.at).toLocaleTimeString()}</time>
          ${row.text}
        </li>`
        )
      }</ol>`
  }`, 'ActivityView');

/** The page — composes the fragment templates around the layout grid. */
export const AppView = template<
  BoardData & { counts: Record<Lane, number>; rows: Activity[] }
>((data, view) =>
  html`<div class="deck">
    <div class="left">
      ${ComposerView.render({ state: 'clean' }, view)}
      ${BoardView.render(data, view)}
    </div>
    <aside class="rail">
      <div id="stats" class="panel">${
    StatsView.render({ counts: data.counts }, view)
  }</div>
      <div id="activity" class="panel">${
    ActivityView.render({ rows: data.rows }, view)
  }</div>
    </aside>
  </div>`, 'AppView');

/** The page shell — set via `@Module({ layout })`; htmlDocument preamble. */
export const Shell = template<{ body: Html; title?: string }>((data, view) =>
  htmlDocument({
    title: data.title ?? 'Flightdeck — a rAPId demo',
    head: html`<style>
      * { box-sizing: border-box; }
      body { margin: 0; background: #10151c; color: #dce3ec;
             font: 15px/1.45 system-ui, sans-serif; }
      main { max-width: 78rem; margin: 0 auto; padding: 0 1.2rem 3rem; }
      @keyframes rise { from { opacity: 0; transform: translateY(8px); }
                        to { opacity: 1; transform: none; } }
      @keyframes ping { 0% { box-shadow: 0 0 0 0 rgb(240 180 41 / .45); }
                        100% { box-shadow: 0 0 0 8px rgb(240 180 41 / 0); } }

      header.top { display: flex; align-items: baseline; gap: .8rem;
        max-width: 78rem; margin: 0 auto; padding: 1.3rem 1.2rem; }
      header.top h1 { margin: 0; font-size: 1.15rem; letter-spacing: .18em;
        text-transform: uppercase; color: #f0b429; }
      header.top p { margin: 0; color: #8b96a5; font-size: .85rem; }
      .live { display: inline-flex; align-items: center; gap: .35rem;
        margin-left: auto; font-size: .68rem; font-weight: 600;
        letter-spacing: .12em; color: #8b96a5;
        border: 1px solid #2b3644; border-radius: 999px; padding: .2rem .6rem; }
      .live i { width: .45rem; height: .45rem; border-radius: 50%;
        background: #55606e; }
      .live.on { color: #f0b429; border-color: #6d5a1f; }
      .live.on i { background: #f0b429; animation: ping 1.6s ease-out infinite; }

      .deck { display: grid; gap: 1.2rem;
        grid-template-columns: minmax(0, 1fr) 15rem; }
      @media (max-width: 56rem) { .deck { grid-template-columns: 1fr; } }

      #composer { display: flex; gap: .5rem; flex-wrap: wrap;
        margin-bottom: 1.1rem; }
      #composer input, #composer select { background: #1a222c; color: inherit;
        border: 1px solid #2b3644; border-radius: 8px; padding: .5rem .7rem;
        font: inherit; }
      #composer input[name=title], #composer #composer-title { flex: 1;
        min-width: 12rem; }
      #composer button { background: #f0b429; color: #10151c; border: 0;
        border-radius: 8px; padding: .5rem 1rem; font: 600 .9rem system-ui;
        cursor: pointer; }
      #composer .err { flex-basis: 100%; margin: 0; color: #ff9d87;
        font-size: .85rem; }

      .chips { display: flex; gap: .4rem; flex-wrap: wrap;
        margin-bottom: .9rem; }
      .chip { background: none; color: #8b96a5; border: 1px solid #2b3644;
        border-radius: 999px; padding: .3rem .8rem; font: .8rem system-ui;
        cursor: pointer; }
      .chip:hover { border-color: #f0b429; color: #dce3ec; }
      .chip-on { background: #f0b429; border-color: #f0b429; color: #10151c;
        font-weight: 600; }

      .lanes { display: grid; gap: .8rem;
        grid-template-columns: repeat(4, minmax(0, 1fr)); }
      @media (max-width: 72rem) {
        .lanes { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      }
      .lane { background: #151c25; border: 1px solid #222c38;
        border-radius: 12px; padding: .7rem .7rem .4rem; min-height: 10rem; }
      .lane h2 { margin: 0 0 .6rem; font-size: .72rem; letter-spacing: .14em;
        text-transform: uppercase; color: #8b96a5; display: flex;
        justify-content: space-between; }
      .count { color: #dce3ec; font-variant-numeric: tabular-nums; }
      .lane ul { list-style: none; margin: 0; padding: 0; }

      .card { background: #1a222c; border: 1px solid #2b3644;
        border-radius: 10px; padding: .6rem .7rem; margin-bottom: .55rem; }
      .card p { margin: .25rem 0 .45rem; font-size: .88rem; line-height: 1.35; }
      .card .tag { font: 600 .62rem system-ui; letter-spacing: .1em;
        text-transform: uppercase; border-radius: 4px; padding: .1rem .35rem; }
      .tag-bug .tag { background: #3a1f24; color: #ff9d87; }
      .tag-feature .tag { background: #16323a; color: #6fd3e8; }
      .tag-ops .tag { background: #2c2440; color: #b8a3f5; }
      .card footer { display: flex; justify-content: space-between;
        align-items: center; }
      .owner { color: #8b96a5; font-size: .75rem; }
      .nav button { background: #222c38; color: #8b96a5; border: 0;
        border-radius: 6px; padding: .15rem .5rem; margin-left: .25rem;
        cursor: pointer; font-size: .7rem; }
      .nav button:hover { background: #f0b429; color: #10151c; }

      .rail { display: flex; flex-direction: column; gap: 1.2rem; }
      .panel { background: #151c25; border: 1px solid #222c38;
        border-radius: 12px; padding: .9rem 1rem; }
      .panel h2 { margin: 0 0 .6rem; font-size: .72rem; letter-spacing: .14em;
        text-transform: uppercase; color: #8b96a5; }
      .panel dl { margin: 0; }
      .stat { display: flex; justify-content: space-between;
        padding: .18rem 0; }
      .stat dt { color: #8b96a5; font-size: .82rem; }
      .stat dd { margin: 0; font-variant-numeric: tabular-nums;
        font-weight: 600; }
      .panel ol { list-style: none; margin: 0; padding: 0; }
      .panel li { padding: .3rem 0; font-size: .78rem; line-height: 1.4;
        border-top: 1px solid #1d2632; animation: rise .3s ease-out both;
        animation-delay: calc(var(--i, 0) * 40ms); }
      .panel li:first-child { border-top: 0; }
      .panel time { display: block; color: #55606e; font-size: .68rem;
        font-variant-numeric: tabular-nums; }
      .quiet { color: #55606e; font-style: italic; font-size: .8rem; }

      #toast { position: fixed; bottom: 1.1rem; right: 1.1rem;
        background: #f0b429; color: #10151c; border-radius: 10px;
        padding: .6rem 1rem; font: 600 .82rem system-ui; opacity: 0;
        transform: translateY(10px); pointer-events: none;
        transition: opacity .25s, transform .25s; max-width: 20rem; }
      #toast.show { opacity: 1; transform: none; }
    </style>`,
    body: html`<header class="top">
      <h1>Flightdeck</h1>
      <p>every region is a fragment — a rAPId demo</p>
      <span id="live" class="live"><i></i> LIVE</span>
    </header>
    <main>${data.body}</main>
    <div id="toast"></div>
    <script src="${view.runtimePath}"></script>
    <script src="/__rapid/live.js"></script>
    <script src="/public/app.js"></script>`,
  }), 'Shell');
