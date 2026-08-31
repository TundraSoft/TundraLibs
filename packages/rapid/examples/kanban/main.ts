/**
 * Flightdeck — the UI-layer showcase: a live kanban board where EVERY
 * region of the page is a server-rendered fragment and every update is
 * a swap. Where the blog example (../blog) shows the full stack (norm,
 * SQLite, auth, sockets), this one is deliberately database-free so the
 * whole UI story stays in view:
 *
 *   modules/views.ts   templates: four swappable regions + the page that
 *                      COMPOSES them + the layout shell
 *   modules/Board.ts   one route per region, the mutations, the bot JOB
 *   store.ts           in-memory store behind a doctor label, with the
 *                      activity seam main.ts taps for broadcasts
 *   public/app.js      the dynamic-update wiring: rapid:swapped chains,
 *                      rapid.refresh(), the live channel
 *
 * What to try on the page (http://localhost:8004/ → /board/ui):
 *
 *   - Move a card (◀ ▶): the board outer-swaps — and the card GLIDES to
 *     its new lane (a stable per-card `view-transition-name` turns the
 *     swap's View Transition into a morph) — while app.js refreshes the
 *     stats rail off the board's `rapid:swapped`: multi-region updates
 *     from ONE user action.
 *   - File a card: the form outer-swaps ITSELF (errors come back as the
 *     form's 200-state, values kept, focus restored to the title box),
 *     then app.js refreshes board + stats.
 *   - Filter by owner: chips are `withQuery` links over the SAME board
 *     route; move buttons carry the filter in their URLs.
 *   - Open the page in TWO windows: every mutation broadcasts on the
 *     'board' channel (the store's activity seam → app.publish), and
 *     the other window toasts + refreshes its regions. A bot teammate
 *     keeps the board moving on its own.
 *
 * The same routes are an API — no headers, no HTML:
 *
 * ```bash
 * curl -s localhost:8004/board | jq            # lanes + owners (JSON)
 * curl -s 'localhost:8004/board?owner=Ada' | jq       # the chips' filter
 * curl -s localhost:8004/board/stats | jq
 * ID=$(curl -s localhost:8004/board | jq -r '.lanes.todo[0].id')
 * curl -s -X POST localhost:8004/board/tasks/$ID/move/fwd | jq
 * curl -s -X POST localhost:8004/board/tasks -H 'content-type: application/json' \
 *   -d '{"title":"Ship it","owner":"Ada","tag":"feature"}' | jq
 * ```
 *
 * Run (from the repo root):
 *
 * ```bash
 * deno run -A packages/rapid/examples/kanban/main.ts
 * ```
 *
 * @module
 */

import { Application } from '../../mod.ts';
import {
  requestId,
  requestLogger,
  secureHeaders,
} from '../../middlewares/mod.ts';
import { registerKanbanServices, TaskStore } from './store.ts';
import * as kanban from './modules/mod.ts';

const configDir = new URL('./configs', import.meta.url).pathname;
const app = await Application.initialize(configDir, {});

app.use(
  requestLogger(),
  secureHeaders(),
  requestId(),
);
// Static serving is CONFIG now — configs/Application.yaml `server.static`.

// The swap runtime + the live bridge, and the one broadcast lane.
// ui: { live: true } lives in configs/Application.yaml now — per replica.
app.channel('board');

app.get('/', (ctx) => ctx.redirect('/board/ui'));

// Stock the store, tap its activity seam for the live channel, THEN
// boot the module (its inject(STORE) resolves during construction).
const store = new TaskStore();
registerKanbanServices(store);
store.onActivity((entry) => {
  void app.publish('board', entry);
});
await app.modules({ modules: [kanban] });

await app.start();

// The teammate bot: a real cron job (every minute) that a demo-friendly
// interval also triggers. An embedder shutting down gracefully clears
// this BEFORE app.stop(); the standalone demo dies with the process.
const _bot = setInterval(() => void app.triggerJob('board.bot'), 9000);

app.log.info(
  `Flightdeck — http://localhost:${app.port}/board/ui ` +
    `(JSON: curl -s localhost:${app.port}/board | jq)`,
);
