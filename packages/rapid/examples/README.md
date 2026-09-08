# Examples

Four runnable apps, each built to show one part of rapid in the shape a real
project takes. Every one is also an API — the same routes answer JSON to
`curl` and HTML to a browser. Run them from the repo root; each file's header
comment lists the curl calls and what to try on the page.

| Example                | Port | Shows                                                                                                                                                        | Run                                                  |
| ---------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------- |
| [blog](./blog)         | 8001 | The full stack: decorated modules in files, `@tundralibs/norm` + SQLite, DI via `@tundralibs/doctor`, events, a cron job, a socket module, pact auth, endpoints | `deno run -A packages/rapid/examples/blog/main.ts`      |
| [kanban](./kanban)     | 8004 | The UI layer end to end: four swappable regions, forms as 200-state, `withQuery` filters, View Transitions, the live channel across windows, a bot job       | `deno run -A packages/rapid/examples/kanban/main.ts`    |
| [dashboard](./dashboard) | 8002 | Multi-region dynamic updates in one file: `rapid.swap()` + `rapid.refresh()`, period filters that survive refreshes                                        | `deno run -A packages/rapid/examples/dashboard/main.ts` |
| [htmx](./htmx)         | 8003 | Bring-your-own client: the same server model driven by htmx (`swapHeader`, `swapUnless`, `HX-Redirect`, `hx-swap-oob`, polling)                             | `deno run -A packages/rapid/examples/htmx/main.ts`      |

## Where to start

1. **blog** if you are building an API or a modular app. Read `main.ts`
   (boot order: open the database → mount endpoints → `app.modules()`),
   then `modules/Posts.ts` (routes + a job + events), `auth.ts` (a pact
   instance with two demo accounts, `pactAuth(pact)` →
   `authenticate`/`authorize`, `/login` over `pact.login()`) and
   `schemas.ts` (guardian schemas bound with `payload(Schema)`). The
   `configs/` directory is the config-driven `Application.initialize`
   shape — compare it with the annotated file `rapid init` writes.
2. **kanban** if you are building pages. `modules/views.ts` is the
   three-tier template set (regions → page → layout), `modules/Board.ts` one
   route per region, `public/app.js` the client wiring off `rapid:swapped`
   and the `'board'` channel.
3. **dashboard** for the smallest complete UI app, and **htmx** to see
   which parts of the UI story are the server's (all of them) and which are
   the client's.

## What the examples deliberately do not do

- No HTTPS, no real user store, no migrations beyond the blog's `Migrator`
  bootstrap — they run with `deno run -A` and in-memory or SQLite state.
- Cookie middleware runs with `secure: false` so the demos work over plain
  `http://localhost`; production keeps the default (`true`).
- The htmx page loads htmx from a CDN with an SRI hash; the bundled runtime
  examples serve everything from the app itself.

Each example's `main.ts` header is the walkthrough for that app; the
package's [README](../README.md) and [docs](../docs/) are the reference.
