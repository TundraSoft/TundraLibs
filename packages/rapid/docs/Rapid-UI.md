# UI — templates, fragments & the swap runtime

An opt-in HTML layer (`@tundralibs/rapid/ui`): a route names a **template**,
the handler keeps returning JSON-shaped data, and the same route serves both
representations. Not a React/Vite-class framework — a deliberately minimal
mechanism for server-rendered pages with fragment swaps.

## The decision table — deterministic, `Accept` is never consulted

| Request                                        | Representation                       |
| ---------------------------------------------- | ------------------------------------ |
| `rapid-swap` header present (our runtime)      | HTML **fragment** — always           |
| absent, resolved `prefer` = `'json'` (default) | **JSON**, the reply goes out as-is   |
| absent, resolved `prefer` = `'html'`           | HTML **page**, wrapped in the layout |

`prefer` resolves route → `app.ui({ prefer })` → `'json'`. A fragment and a
page are both `text/html`, so `Accept` could never tell them apart; ignoring
it entirely makes the outcome readable off the route's declaration and needs
no `Vary: Accept`. Every templated response instead carries
`Vary: rapid-swap`. What is given up: a form POST with JavaScript disabled is
a plain navigation and would get JSON — set `prefer: 'html'` on that route
and the no-JS path returns the page.

## Templates

```ts
import { html, raw, render, template } from '@tundralibs/rapid/ui';

type Users = { status: 'ok'; items: string[] } | { status: 'empty' };

export const UserList = template<Users>((data) =>
  data.status !== 'ok'
    ? html`<p class="muted">No data to view here.</p>`
    : html`<ul>${data.items.map((u) => html`<li>${u}</li>`)}</ul>`
);
```

- `` html`…` `` escapes **every** interpolated value (`& < > " '`); nested
  `Html` composes without double-escaping; arrays join with `''`; `null` /
  `undefined` / `false` render as `''` (so `cond && html\`…\`` works).
- `raw(string)` is the ONLY unescaped path — one greppable audit point. The
  framework never calls it internally.
- Templates are pure and synchronous — async work belongs in the handler.
  Unit-test with `render(UserList.render(data, view))`; no server needed. The
  route option cannot statically prove the handler's `content` matches the
  template's data type — that test is the pairing check.
- **Where escaping protects you — and where it can't.** `html` escaping is
  safe for element TEXT and QUOTED attribute values only. Three contexts
  stay dangerous with untrusted data even though every value is escaped:
  an UNQUOTED attribute (`src=${v}` — spaces break out; always quote),
  a URL attribute (`href="${v}"` with `javascript:alert(1)` contains no
  escapable character — validate schemes/allowlist URLs before
  interpolating request-derived values like `view.query.*`), and raw-text
  elements (`<script>`/`<style>` — never interpolate into them). `raw()`
  is the single opt-out for TRUSTED markup; these context rules are the
  other half of the audit.

## Wiring routes

```ts ignore
// Plain API — every verb helper takes the options slot:
app.get('/users', { template: UserList }, listUsers);
app.get('/page', { template: { render: UserList, prefer: 'html' } }, listUsers);

// Decorators:
@Module('Users', { layout: Shell }) // module-wide layout default
class Users {
  @GET('/users', { template: UserList }) // route template
  list() {
    return { content: { status: 'ok', items: [] } };
  }
}
```

A wrong import or shape throws `RAPID_CONFIG` at registration/mount, never at
first request. `template` is HTTP-only — ignored on `@SOCKET`/`@JOB`, the
same documented rule as the reply envelope's `cookies`/`redirect`.

**Layouts** (`RapidTemplate<{ body, title? }>`) wrap pages, never fragments;
resolution is route (`layout` either form) → `@Module({ layout })` →
`app.ui({ layout })` → none (the fragment serves as the page). Wrap the
outermost layout's output in `htmlDocument({ lang?, title?, head?, body })`
— the doctype/charset/viewport/`<title>` preamble every page needs (skip it
and browsers quirks-mode the page); `view.runtimePath` is where the swap
runtime is served, for the layout's script tag.

A throwing template surfaces as `RAPID_TEMPLATE_RENDER` naming the
template (`details.template` — the `template()` factory's name argument
earns its keep here); the underlying throw rides `debug` — rendered in
DEVELOPMENT, always in the server log — and PRODUCTION collapses the
envelope. In DEVELOPMENT, an app that called `app.ui()` but set no
`errorTemplate` gets a built-in escaped `<pre>` error fragment on HTML
requests — the failure shows IN the page instead of a silent
`rapid:error`; PRODUCTION always keeps the JSON envelope.

## `app.ui()` and the view bag

```ts ignore
app.ui({
  layout: Shell, // app default
  prefer: 'html', // pages-first app; API routes override back
  errorTemplate: ErrorPage,
  view: (ctx) => ({ // OPT-IN identity projection
    user: ctx.auth ? { name: ctx.auth.name as string } : undefined,
  }),
});
```

Every template receives a frozen, read-only `view` as its second parameter:
`{ requestId, runtimePath, path, query, asset, csrfToken? }` (`csrfToken`
reads the `csrf` cookie — set `app.ui({ csrfCookie })` if you renamed it in
`csrf()`).
**Nothing from `ctx.auth` is reachable by default** — the projection names
exactly which fields cross, so identity exposure is safe by construction,
not by discipline.

Type the projection's fields once and templates consume them cast-free —
`template`'s second generic is the projection shape:

```ts
import { html, template } from '@tundralibs/rapid/ui';

type AppView = { user?: { name: string } };
const Nav = template<unknown, AppView>((_data, view) =>
  html`<nav>${view.user?.name ?? 'guest'}</nav>`
);
```

`view.asset()` versions static-asset URLs so they can cache forever: build
the content-keyed map once at boot with `fingerprintAssets()`, hand it to
`app.ui({ assets })`, and serve with `serveStatic({ fingerprint: true })` —
a mapped path renders as `/style.css?v=<hash>` (served
`Cache-Control: … immutable`; a changed file gets a new URL), an unmapped
path passes through unchanged, so templates never branch:

```ts ignore
import { fingerprintAssets } from '@tundralibs/rapid/ui';

const assets = await fingerprintAssets('./public'); // '/style.css' → 'a1b2c3'
app.ui({ assets });
app.use(serveStatic({ root: './public', fingerprint: true }));
// a template: html`<link rel="stylesheet" href="${view.asset('/style.css')}">`
```

Handlers that vary SIDE EFFECTS by representation read `ctx.isSwap` — the
representer's own decision (config-aware: a renamed `swapHeader`/
`swapUnless` keeps it correct) instead of re-deriving header checks.

Pages can carry a `<title>`: the object form's `title` — a string or a
`(data) => string` — is handed to the layout as its `{ body, title? }`
data on non-swap pages:

```ts ignore
app.get(
  '/posts/ui',
  { template: { render: PostList, prefer: 'html', title: 'The Library' } },
  list,
);
```

One divergence to know: the representer runs on the RETURN-VALUE channel
only. A handler (or middleware) assigning `ctx.response` directly on a
templated route bypasses the template AND the `Vary` stamp — return the
reply instead.

`app.ui()` also registers the client runtime at `runtimePath` (default
`/__rapid/ui.js`) — served from a string constant (no file read: works on
Workers and with `app.fetch()`), with a strong content-keyed `ETag`
and `cache-control: no-cache` — every load revalidates (a `304` when
unchanged), so a package upgrade can never leave a stale runtime cached
under the constant path. Call `app.ui()` at most
once; a second call is `RAPID_CONFIG`.

## The client runtime

One delegated `click` + one `submit` listener over `data-action` elements —
no inline handlers anywhere, so `script-src 'self'` suffices.

| attribute     | meaning                                                 |
| ------------- | ------------------------------------------------------- |
| `data-action` | URL to fetch                                            |
| `data-method` | default `get`; forms default `post`                     |
| `data-target` | selector to swap into (default: the element itself)     |
| `data-swap`   | `replace` (default) \| `outer` \| `append` \| `prepend` |

Requests carry `rapid-swap: 1` (the only header the representer reads) plus
`Accept: text/html` as a courtesy. Forms post
`application/x-www-form-urlencoded`. The `csrf` cookie is echoed as
`x-csrf-token` — matching `csrf()`'s defaults; both names are overridable via
`data-csrf-cookie` / `data-csrf-header` on `<body>`.

- **Redirects:** a swap response carrying `redirect` becomes `200` +
  `rapid-redirect: <url>` (a `fetch()` would transparently follow the 3xx and
  hand back the target's body — the wrong thing to swap); the runtime follows
  it to relative/same-origin URLs ONLY. A plain navigation keeps the ordinary
  301/302 — and that server-side `Location` is the handler's value verbatim:
  the same-origin guarantee is a SWAP-side property, so a handler building a
  redirect from request input (`?next=`) must validate it itself.
- **Events:** `rapid:swapped` after a successful swap (re-init widgets
  there — for `data-swap="outer"` it fires on the REPLACEMENT node, since
  the original was detached); `rapid:error` with `{ status, body }` when
  the response is not swappable HTML — a non-HTML body (the JSON error
  envelope) is never swapped into the page. A **2xx** non-HTML response
  (a 204 to a POST) also lands as `rapid:error` — by design, since there
  is nothing to swap; check `detail.status` when that is a success for
  you.
- **Request hygiene, built in:** per-target LAST-WRITE-WINS — a newer
  swap aborts the in-flight one, so racing clicks can't land out of
  order; modifier-clicks (ctrl/cmd/shift/alt) are left to the browser; a
  real `<a href>` INSIDE a `data-action` container keeps its native
  navigation; a form holding a file input posts real `multipart/form-data`
  (the upload gauntlet applies) and the submit button's own name/value is
  included; keyboard FOCUS survives a swap (an id-carrying focused
  element inside the target is re-focused on its replacement).
- **View Transitions:** when the browser supports
  `document.startViewTransition`, every swap rides the native cross-fade
  — zero configuration, graceful no-op elsewhere. Opt out (or restyle)
  in CSS — the default cross-fade lives on the old/new pseudos, not the
  group:
  `::view-transition-old(root), ::view-transition-new(root) { animation: none }`.
  For a MORPH instead of a cross-fade, give repeated items a stable
  per-id `view-transition-name` (`style="view-transition-name: t-${id}"`):
  items that persist across a swap then GLIDE to their new position —
  a list reorder or a kanban move animates for one inline style. The
  flicker to avoid is the opposite mistake: a CSS entry animation ON the
  swapped-in items replays for every card on every swap, because to the
  DOM they are all new.
- **Script placement:** load the runtime (and your own script) at the end
  of `<body>` or with `defer` — the `<body data-…>` config overrides are
  read once at evaluation.
- **Programmatic:** `window.rapid.swap(url, target, { method?, swap?,
  body? })` — `target` a selector or Element; resolves `true` when the swap
  happened. `window.rapid.refresh(target)` re-fetches the last GET
  fragment swapped into `target` (POST sources are never replayed, and
  `append`/`prepend` swaps never register — a "refresh" would re-append;
  refresh on a target with no recorded source resolves `false`). These
  two functions are the runtime's whole public API — they exist for the
  **dynamic-update patterns** below. Everything further (polling,
  history) stays app JS over the runtime's events — the attribute
  surface is deliberately frozen.

## Dynamic updates — one action, many regions

One user action often invalidates more than one region of the page.
rapid deliberately ships NO declarative attribute for this
(`data-also-update="…"` grows without bound); the runtime emits events
and exposes two functions, and the reaction lives in a few lines of
YOUR page script — visible, debuggable, yours. Three patterns, by how
much the reacting code has to know:

**1. Chain a swap off `rapid:swapped`** — when the page script knows the
reacting region's URL. Every successful swap bubbles `rapid:swapped`
from the swapped node, so one document listener routes on `e.target.id`:

```js ignore
document.addEventListener('rapid:swapped', (e) => {
  if (e.target.id === 'card-users') rapid.swap('/cards/stats', '#card-stats');
});
```

The sales-dashboard example wires its bookings table this way: the
log-a-sale POST swaps the form, and the listener fetches fresh orders.

**2. `rapid.refresh(target)`** — the same chain, URL-free: it re-fetches
whatever GET fragment last landed in the target, filters and query
intact, so the listener names REGIONS, not routes:

```js ignore
document.addEventListener('rapid:swapped', (e) => {
  if (e.target.id === 'board') rapid.refresh('#stats');
});
```

This is also how a region keeps its FILTER through an update: the
dashboard refreshes `#dash` after a logged sale, and the active
`?days=` period survives because refresh re-fetches the recorded URL.
A region has a recorded source only after its FIRST swap — on a freshly
loaded page fall back to an explicit `rapid.swap` when `refresh`
resolves `false` (the kanban example's `freshen()` helper).

**3. The live channel** — updates this user did NOT initiate: another
tab, another user, a cron job. Broadcast server-side and map
`rapid:push` to the same refreshes (next section). The kanban example
composes all three: a move button's own swap replaces the board, the
`rapid:swapped` listener refreshes the stats rail, and the broadcast
refreshes every OTHER window.

Server-side bookkeeping that must vary by representation belongs behind
`ctx.isSwap` — the dashboard's fragments-served meta stat counts
exactly this way instead of re-deriving header checks.

## Bring your own client (htmx)

The swap contract is three header names, all configurable — so a mature
client like [htmx](https://htmx.org) can drive the same routes while rapid
keeps its server model:

```ts ignore
app.ui({
  swapHeader: 'hx-request', // htmx sends HX-Request: true on every request
  swapUnless: ['hx-boosted', 'hx-history-restore-request'],
  redirectHeader: 'HX-Redirect', // htmx follows this natively
});
```

- `swapHeader` — presence selects the fragment (value ignored).
- `swapUnless` — names whose presence CANCELS the swap: htmx sends its
  marker on `hx-boost`ed navigations and history restores too, where it
  expects the full PAGE — without this, boosted links would swap a bare
  fragment into `<body>`. All names join `Vary` automatically.
- `redirectHeader` — the swap-side redirect (D8) rides this name; htmx
  performs a full navigation on `HX-Redirect`, exactly the bundled
  runtime's semantics.

With that config, `hx-get`/`hx-post`/`hx-target` attributes work against
templated routes as-is; give page routes `prefer: 'html'` so boosted
navigations and address-bar visits render pages. The bundled runtime
follows renamed headers via `data-swap-header` / `data-redirect-header` on
`<body>` — but if you adopt htmx you simply don't serve it. Runnable:
[`examples/htmx/main.ts`](../examples/htmx/main.ts) drives a poll
entirely through htmx — `hx-swap-oob` multi-region responses,
declarative polling, a boosted page proving `swapUnless`, and a reply
`redirect` landing as `HX-Redirect`.

## Live updates (`app.ui({ live: true })`)

The opt-in **live bridge** (`/__rapid/live.js`, served exactly like the
runtime) turns server broadcasts into DOM events — it renders nothing and
swaps nothing, so fragments stay HTTP-fetched with auth/etag/`Vary` in the
path:

```js ignore
// page script — the whole live story:
rapid.live.connect('comments'); // channels declared via app.channel()
document.addEventListener('rapid:push', (e) => {
  if (e.detail.channel !== 'comments') return;
  rapid.swap('/posts/' + e.detail.data.postId + '/comments', '#comments');
});
document.addEventListener('rapid:live', (e) => {
  badge.classList.toggle('on', e.detail.connected);
});
```

Server side: `app.channel('comments')` declares the lane — one-way by
construction, clients can never publish into it — and `app.publish()` /
`ctx.publish()` broadcast; a cron job pushing an update is the canonical
pattern. The bridge reconnects with capped backoff and resubscribes (a
refused subscribe is `console.warn`ed — undeclared channel, `authorize`
veto); `rapid.live.disconnect()` stops it. The socket path defaults to
`/ws` (`data-live-path` on `<body>` overrides). `UI_LIVE` is exported
for serve-it-yourself setups.

**Known limit:** the bridge rides the rpc WebSocket, which mounts only
in `app.start()`'s listening server — on ANY `fetch()`-only deployment
(Cloudflare Workers included) there is no socket to dial, so
`live: true` serves a script that can never connect, and the first
`fetch()` logs a warning saying so. An SSE variant is on the roadmap;
until then, live updates are a listening-server feature.

## Recipes

- **Pagination / infinite scroll** — the fragment ends with its own next
  button, which replaces ITSELF (`data-swap="outer"`, no `data-target`)
  with the next page: rows accumulate, and exactly ONE button ever
  exists — an `append` into the list would leave every previous button
  alive and re-clickable:

  ```ts ignore
  import { withQuery } from '@tundralibs/rapid/ui';

  const PostPage = template<Page>((data, view) =>
    html`${data.rows.map(Row)}
      ${
      data.hasMore &&
      html`
        <button
          data-action="${withQuery(view.path, view.query, {
            page: data.page + 1,
          })}"
          data-swap="outer"
        >Load more</button>
      `
    }`
  );
  ```

- **Validated forms** — the error arm of a form's union (message,
  per-field problems, values to re-fill) is a primitive: `formState()`
  runs any `.parse`-bearing schema and hands back typed data or the
  render-ready `RapidFormError` — the template types its union as
  `RapidFormError | { state: 'clean' } | …`:

  ```ts ignore
  import { formState } from '@tundralibs/rapid/ui';

  const form = await formState(CreatePostBody, body);
  if (!form.ok) return { content: form.error }; // 200 — the union's own state
  posts.add(form.data);
  return { content: { state: 'added' } };
  ```

- **Post/Redirect/Get & no-JS forms** — give the form's route
  `prefer: 'html'`: with JavaScript the runtime swaps the fragment; without
  it the POST is a plain navigation, so return `redirect` on success (the
  navigation path keeps the real 302 — PRG) and the error-state union page
  on failure, values re-filled from the returned data. No framework knob —
  the D3/D8 rules compose into it.
- **Strict CSP (nonces)** — the projection carries per-request data, so a
  style/script nonce is just a view field:
  `app.ui({ view: (ctx) => ({ nonce: mintNonce(ctx) }) })` and
  `html\`<style nonce="${view.nonce}">…\``— pair with your security
  middleware emitting the matching header. Prefer external files via`serveStatic` where you can.
- **i18n** — same pattern: negotiate the locale in the projection and hand
  templates a translator as data —
  `view: (ctx) => ({ t: makeT(ctx.headers.get('accept-language')) })`.
  Templates stay pure; `t` is per-request-constant.
- **Template unit tests** — `import { view } from '@tundralibs/rapid/testing'`
  for the frozen bag (`render(UserList.render(data, view()))`), and
  `client(app).get('/x', { swap: true })` to drive the fragment/page/JSON
  matrix with the app's RESOLVED swap header (htmx config included).

## Errors

`app.ui({ errorTemplate })` receives exactly the disclosure payload the JSON
envelope would carry (PRODUCTION collapses 5xx, never `debug`) plus
`requestId`, and renders only when the representation resolves to HTML — a
swap gets the bare fragment, a page is layout-wrapped, the status is
preserved. Without it (or off-HTML), the JSON envelope is sent unchanged.
One asymmetry to know in a `prefer: 'html'` app: a NON-templated JSON
route's successes stay JSON, but its errors resolve to HTML pages like
everything else — `prefer` lives on templates, so there is no bare-route
opt-out; keep `prefer: 'html'` scoped to page routes when that matters.

## Bytes and streams

A template consumes **data**: a templated route whose HTML representation is
asked of a `Uint8Array`/stream content is `RAPID_RESPONSE_INVALID`. Stream
replies belong on non-templated routes (or `prefer: 'json'`, where the reply
passes through untouched).

## OpenAPI

A templated route's `200` lists both `application/json` and `text/html`.

Runnable examples: [`examples/dashboard/main.ts`](../examples/dashboard/main.ts)
(a sales dashboard: period chips, both swapped-chain patterns,
`ctx.isSwap`), [`examples/kanban/main.ts`](../examples/kanban/main.ts)
(all three dynamic-update patterns, live channel, View-Transition
morphs), and [`examples/htmx/main.ts`](../examples/htmx/main.ts) (the
same contract driven by htmx) — run any with `deno run -A` and open the
printed URL.
