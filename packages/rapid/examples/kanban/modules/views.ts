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
import type { RapidFormError } from '../../../types/mod.ts';
import type { Activity, Lane, Task } from '../types.ts';
import { LANES } from '../types.ts';

/** The board payload — the `/board` fragment's (and JSON's) shape. */
export type BoardData = {
  lanes: Record<Lane, Task[]>;
  owners: string[];
  owner?: string;
};

/** The composer's union — errors are STATE at 200, never a status. */
// The composer's union: `formState()`'s error arm IS the error state —
// message + per-field problems + the submitted values to re-fill.
export type ComposerData = { state: 'clean' } | RapidFormError;

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
        data-target="#board" data-swap="outer"
        data-push="${withQuery('/board/ui', view.query, { owner: undefined })}"
      >Everyone</button>${
    data.owners.map((owner) =>
      html`<button class="chip${owner === data.owner ? ' chip-on' : ''}"
        data-action="${withQuery('/board', view.query, { owner })}"
        data-target="#board" data-swap="outer"
        data-push="${withQuery('/board/ui', view.query, { owner })}"
      >${owner}</button>`
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
    ? { title: '', owner: '', tag: 'feature', ...data.values }
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

/**
 * The CORE — the document: head (fingerprinted stylesheet via
 * `view.asset()`), toast slot, and the three scripts (swap runtime,
 * live bridge, history module). Chrome is tier 2 below; the print view
 * (`layout: false`) renders straight in here.
 */
export const BoardCore = template<{ body: Html; title?: string }>(
  (data, view) =>
    htmlDocument({
      title: data.title ?? 'Flightdeck — a rAPId demo',
      head: html`<link rel="stylesheet" href="${
        view.asset('/public/board.css')
      }">`,
      body: html`${data.body}
    <div id="toast"></div>
    <script src="${view.runtimePath}"></script>
    <script src="/__rapid/live.js"></script>
    <script src="/__rapid/history.js"></script>
    <script src="/public/app.js"></script>`,
    }),
  'BoardCore',
);

/**
 * The board CHROME — the module's tier-2 layout (`@Module({ layout })`):
 * masthead + LIVE badge + the print link. The print route opts out of
 * this tier entirely (`layout: false`).
 */
export const Chrome = template<{ body: Html; title?: string }>((data) =>
  html`<header class="top">
      <h1>Flightdeck</h1>
      <p>every region is a fragment — a rAPId demo</p>
      <span id="live" class="live"><i></i> LIVE</span>
      <a class="plain" href="/board/print">print</a>
    </header>
    <main>${data.body}</main>`, 'Chrome');

/**
 * The print view — lanes only, no chrome, no buttons: served by
 * /board/print with `layout: false`, so it renders straight into the
 * core (document + css, none of the board chrome).
 */
export const PrintView = template<BoardData>((data) =>
  html`<div class="printboard">
    <h1>Flightdeck${data.owner ? html` — ${data.owner}` : ''}</h1>
    <div class="lanes">${
    LANES.map((lane) =>
      html`<section><h2>${LANE_LABELS[lane]}</h2><ul>${
        data.lanes[lane].map((task) =>
          html`<li>${task.title} · ${task.owner}</li>`
        )
      }</ul></section>`
    )
  }</div>
  </div>`, 'PrintView');
