# UI — templates, fragments & the swap runtime

An opt-in HTML layer (`@tundralibs/rapid/ui`): a route names a **template**,
the handler keeps returning JSON-shaped data, and the same route serves both
representations. Not a React/Vite-class framework — a deliberately minimal
mechanism for server-rendered pages with fragment swaps.

## The decision table — deterministic, `Accept` is never consulted

| Request                                        | Representation                     |
| ---------------------------------------------- | ---------------------------------- |
| `rapid-swap` header present (our runtime)      | HTML **fragment** — always         |
| absent, resolved `prefer` = `'json'` (default) | **JSON**, the reply goes out as-is |
| absent, resolved `prefer` = `'html'`           | HTML **page** (layout ▸ core)      |

`prefer` resolves route → `ui.prefer` → `'json'`. A fragment and a
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
  `undefined` / `false` render as `''` (so `cond && html\`…\``works for a
  BOOLEAN`cond`).`0`and`''`render as text — branch on a value with`when()`(below), never`value && …`.
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

## Keeping large pages readable

Templates are TypeScript values, so control flow is expression-form (like
JSX) — a big page written as one template turns into nested ternaries.
Four habits keep it flat:

- **Compute above the markup.** Branches and derived lists are plain
  variables; the `html` block interpolates names, not logic.
- **Split into components.** A page is a tree of small `template()`s
  (the shipped examples run 5–8 per page); shared ones in `views/`, a
  module's beside it as `<Module>.views.ts` (see Recipes).
- **`when` / `each`** for the two shapes `&&`/`.map` handle worst — a
  value-truthiness branch (`0`/`''` would leak as text) and a list with an
  empty state:

  ```ts ignore
  const Cart = template<{ items: Item[]; credit: number }>((d) =>
    html`<ul>${
      each(d.items, (i) =>
        html`<li>${i.name}</li>`, () =>
        html`<li class="muted">Your cart is empty</li>`)
    }</ul>
    ${when(d.credit, (c) => html`<p>Credit: ${c}</p>`)}`
  );
  ```

  Both take callbacks, so only the taken branch is evaluated and `when`
  hands over the narrowed value.
- **Editor support.** Extensions that highlight lit-style `` html`…` ``
  templates (VS Code's lit-plugin family) give HTML colouring, tag
  matching, and auto-indent inside the tag. Truly static chrome can also
  live in a real `.html` file — see the designer-handoff recipe.

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

**Layouts** (`RapidTemplate<{ body, title? }>`) wrap pages, never
fragments — see [The three tiers](#the-three-tiers): resolution is route
(`layout` either form, `false` to opt out) → `@Module({ layout })` → the
app default → none (straight into the core). The CORE — not a layout —
owns `htmlDocument({ lang?, title?, meta?, head?, body })`, the
doctype/charset/viewport/`<title>` preamble every page needs (skip it
and browsers quirks-mode the page); `view.runtimePath` is where the swap
runtime is served, for the core's script tag.

A throwing template surfaces as `RAPID_TEMPLATE_RENDER` naming the
template (`details.template` — the `template()` factory's name argument
earns its keep here); the underlying throw rides `debug` — rendered in
DEVELOPMENT, always in the server log — and PRODUCTION collapses the
envelope. HTML-resolving errors render through the error-page registry
ending in the built-in `DefaultErrorPage` — see [Errors](#errors).

## Configuring the UI

UI configuration is split by NATURE, typed disjoint, at
`Application.initialize`:

- **The DATA half** — serializable, so a config-driven app sets it in
  `Application.yaml` under `ui:` (per replica): `enabled`, `runtimePath`,
  `live`, `history`, `prefer`, `csrfCookie`, and the contract headers
  (`swapHeader` / `swapUnless` / `redirectHeader`).
- **The CODE half** — templates and functions YAML can never name
  (config names code, never imports it): `core`, `layout`, `view`,
  `errorTemplate`/`errorTemplates`, `assets`. Config-driven apps pass it
  in the factory options; programmatic apps put both halves in one `ui`
  bag.

```yaml
# configs/Application.yaml — the replica-level surface
ui:
  enabled: true # false = API replica: JSON everywhere, no runtime routes
  prefer: html
  live: true
  history: true
```

```ts ignore
const app = await Application.initialize({
  path: './configs',
  ui: { // the CODE half
    core: CoreShell,
    layout: PageShape, // app-default module-tier layout
    errorTemplates: { 404: NotFound, '5xx': ServerFault },
    view: (ctx) => ({ // OPT-IN identity projection
      user: ctx.auth ? { name: ctx.auth.name as string } : undefined,
    }),
  },
});
```

`ui.enabled: false` turns a replica API-only — templated routes serve
JSON unconditionally, the runtime/live/history routes are not
registered. One caution rides that switch: with the UI on, a
`prefer: 'html'` route's template acts as a de-facto field filter —
disabled, the handler's FULL content ships as JSON. Handlers must only
ever return what may serialize; the representer never filters.

Configuring the UI registers the client runtime at `runtimePath`
(default `/__rapid/ui.js`) — served from a string constant (no file
read: works on Workers and with `app.fetch()`), strong content-keyed
`ETag`, `cache-control: no-cache` (a 304 when unchanged — never a stale
runtime after an upgrade). Configure at most once; a second
configuration (the deprecated `app.ui()` included) is `RAPID_CONFIG`.

## The three tiers

Pages compose from exactly three tiers — no deeper chaining exists:

1. **The core** (`ui: { core }`) — the DOCUMENT: `<head>` (meta, css,
   js), body open, body-end scripts. App-level, optional, and
   irreplaceable below the app: every page renders inside it. Its
   per-page "edits" are its data slots — `title` and `meta`.
2. **The module/route layout** — the PAGE SHAPE (nav, header, footer, a
   content slot), always nesting inside the core. Resolution: route
   `layout` → the `@Module`'s → the app default → none (straight into
   the core). `layout: false` at route or module level opts out of the
   tier even when a default exists (the print/embed page inside a
   chrome-heavy module).
3. **The content** — the route's fragment, composed from view
   components: plain typed functions (`Card({ title, body })`), no
   mechanism. Change the component, every consumer follows.

```ts ignore
const CoreShell = template<RapidCoreData>((d, view) =>
  htmlDocument({
    title: d.title ?? 'Acme',
    meta: d.meta,
    head: html`<link rel="stylesheet" href="${view.asset('/site.css')}">`,
    body: html`${d.body}<script src="${view.runtimePath}"></script>`,
  })
);

const PageShape = template<{ body: Html; title?: string }>((d, view) =>
  html`
    <header>
      <nav>…</nav>
    </header>
    <main>${d.body}</main>
  `
);
```

`title` (a string or `(data) => string` on the route's template options)
flows to BOTH wrapper tiers — the core renders `<title>`, the layout may
show a heading; either may ignore it. On swap replies it rides the
`rapid-title` response header instead (the history module syncs
`document.title` from it). `meta` (a record or `(data) => record` —
`description`, `og:*`, `canonical`) reaches the CORE only;
`htmlDocument` renders it escaped:

```ts ignore
@GET('/posts/:id:', {
  template: {
    render: PostPage,
    title: (p) => p.title,
    meta: (p) => ({ description: p.summary, 'og:title': p.title }),
  },
})
```

A swap always gets the bare fragment — both tiers apply to full pages
only.

## The view bag

Every template receives a frozen, read-only `view` as its second parameter:
`{ requestId, runtimePath, path, query, asset, csrfToken? }` (`csrfToken`
reads the `csrf` cookie — set `ui.csrfCookie` if you renamed it in
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

Handlers that vary SIDE EFFECTS by representation read `ctx.isSwap` — the
representer's own decision (config-aware: a renamed `swapHeader`/
`swapUnless` keeps it correct; always `false` on a `ui.enabled: false`
replica) instead of re-deriving header checks.

One divergence to know: the representer runs on the RETURN-VALUE channel
only. A handler (or middleware) assigning `ctx.response` directly on a
templated route bypasses the template AND the `Vary` stamp — return the
reply instead.

## Static files & asset versioning

Static serving is CONFIG — `server.static`, URL prefix → directory,
served framework-side on ROUTE MISS (before the 404): routes always win
a collision, `secureHeaders`/`cors`/`compress`/logging always apply,
and there is no middleware to mount or position:

```yaml
server:
  static:
    /assets:
      root: ../public # relative → anchored to the config directory
      fingerprint: true
    /files: ../uploads-public # string shorthand
```

`view.asset()` versions asset URLs so they can cache forever, LAZILY —
no boot walk: the first template that references
`view.asset('/assets/site.css')` reads and content-hashes the file
under its `fingerprint: true` mount (cached; DEVELOPMENT re-checks the
mtime so an edited file re-hashes on the next render). The rendered URL
(`/assets/site.css?v=<hash>`) is served with
`Cache-Control: public, max-age=31536000, immutable` — a changed file
gets a new URL, so nothing is ever stale and repeat loads cost zero
requests. Resolution order: an explicit `ui: { assets }` manifest entry
(the bundler/Workers path — `fingerprintAssets()` builds one) → the
lazy hash → passthrough, so templates never branch. The hash is a cache
key, not integrity (SRI is a different feature).

Extract your css/js into these files rather than inlining them in the
core — an inline `<style>` re-ships with every page; a fingerprinted
stylesheet caches forever.

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
- **Events:** `rapid:swapped` after a successful swap — detail
  `{ status, url, method, swap, title? }`, the full swap identity, so
  listeners (and the history module) never re-derive it (re-init widgets
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

```yaml
# the contract headers are DATA — per replica, in Application.yaml
ui:
  swapHeader: hx-request # htmx sends HX-Request: true on every request
  swapUnless: [hx-boosted, hx-history-restore-request]
  redirectHeader: HX-Redirect # htmx follows this natively
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

## Live updates (`ui.live: true`)

The opt-in **live bridge** (`ui.live: true` → `/__rapid/live.js`, served
exactly like the runtime) turns server broadcasts into DOM events — it renders nothing and
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

## History (`ui.history: true`)

The opt-in **history module** (`/__rapid/history.js`, served like the
runtime) gives swap navigation a working address bar and back button —
with **no DOM cache, ever**: back/forward RE-FETCHES the recorded URL
into the recorded region (marker-keyed `history.state`; a full
navigation when the region is gone), so what restore shows is always
what the server would serve, with auth/etag/`Vary` in the path.

Pushes are per-interaction opt-in, never automatic:

```html
<!-- declarative: push the fetched URL (needs an id on the region) -->
<button data-action="/board?owner=Ada" data-target="#board"
  data-swap="outer" data-push>Ada</button>
<!-- or push a different page URL -->
<a data-action="/cards/orders" data-target="#orders"
  data-push="/orders">Orders</a>
```

```js ignore
// programmatic: a rapid.swap that also pushes
rapid.history.push('/board?owner=Ada', '#board', { swap: 'outer' });
```

The contract that keeps back/reload safe: **only push URLs that are
themselves page routes** (`prefer: 'html'`) — the same route then serves
the full page on a plain navigation, so a deep link or reload of a
pushed URL just works. `document.title` syncs from the `rapid-title`
response header (stamped on swap replies of routes with a `title`) on
pushed and restored swaps only — an ordinary widget swap never retitles
the tab. One history-bearing region per page; don't push URLs carrying
secrets (they land in the address bar and browser history).

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
  `ui: { view: (ctx) => ({ nonce: mintNonce(ctx) }) }` at
  `Application.initialize` and
  `html\`<style nonce="${view.nonce}">…\``— pair with your security
  middleware emitting the matching header. Prefer external files via`server.static` where you can.
- **i18n** — same pattern: negotiate the locale in the projection and hand
  templates a translator as data —
  `view: (ctx) => ({ t: makeT(ctx.headers.get('accept-language')) })`.
  Templates stay pure; `t` is per-request-constant.
- **Layout composition** — the two wrapper tiers cover page structure;
  anything fancier is a plain function call. A section wrapper shared by
  a module's fragments is a component its views apply; a layout variant
  that extends another passes through it explicitly (thread `title`
  yourself past the first level):

  ```ts ignore
  const AdminShape = template<{ body: Html; title?: string }>((d, view) =>
    PageShape.render({
      body: html`<aside>${adminNav(view)}</aside>${d.body}`,
      title: d.title,
    }, view)
  );
  ```

  The doctrine that keeps tiers honest: a module `layout:` means "this
  module owns the page shape"; a module that only wants a strip INSIDE
  the app's shape shouldn't set `layout:` at all — wrap in a component
  and inherit the default. And module-specific css belongs in the
  module's layout as a body-level
  `<link rel="stylesheet" href="${view.asset(…)}">` (spec-legal) — the
  core's head stays app-wide.
- **View separation** — the convention the scaffold generates: shared
  code (the core, error pages, cross-module components) in `views/`;
  each module's fragments co-located as `<Module>.views.ts` beside the
  module, its layout with them. Templates are plain values — organize
  freely, but this shape keeps "edit the page" next to "edit the
  module".
- **Designer-handoff shells** — a truly static chrome file needs no
  template language: read it at boot, split on a marker, `raw()` the
  halves (server runtimes only):

  ```ts ignore
  const src = await readTextFile('./views/shell.html');
  const [pre, post] = src.split('<!--body-->');
  const FileShell = template<{ body: Html }>((d) =>
    html`${raw(pre!)}${d.body}${raw(post!)}`
  );
  ```

  Anything dynamic (title, nav, scripts) enters via composition around
  it — never as expressions in the file.
- **Template unit tests** — `import { view } from '@tundralibs/rapid/testing'`
  for the frozen bag (`render(UserList.render(data, view()))`), and
  `client(app).get('/x', { swap: true })` to drive the fragment/page/JSON
  matrix with the app's RESOLVED swap header (htmx config included).

## Errors

Error pages resolve through a CLOSED registry — `ui: { errorTemplates }`
keyed by exact status (400–599), `'4xx'`/`'5xx'`, or `'default'`
(`errorTemplate` is sugar for `{ default }`; both together is a config
error). Resolution is fixed: exact → class → `default` → the built-in
`DefaultErrorPage` — so a UI-configured app never shows a browser a raw
JSON envelope; PRODUCTION ships the collapsed disclosure as HTML.
Dispatch beyond that grammar is a typed branch inside one template:

```ts ignore
const ErrorPage = template<Record<string, unknown>>((e, view) =>
  (e.status as number) === 404
    ? NotFound.render(e, view)
    : (e.status as number) >= 500
    ? ServerFault.render(e, view)
    : BadRequest.render(e, view)
);
```

Every entry receives exactly the disclosure payload the JSON envelope
would carry (PRODUCTION collapses 5xx, never `debug`) plus `requestId`,
`status`, and `mode`, and renders only when the representation resolves
to HTML: a swap, a route/app `prefer: 'html'`, or — with
`errorTemplates` configured — an UNMATCHED request whose `Accept`
explicitly prefers `text/html`, so the commonest error of all (a browser
navigating to an unknown URL) gets the 404 page while `*/*`/JSON clients
keep the envelope (`Accept` joins `Vary` when consulted; this error path
is the one place Accept is ever read; a MATCHED route — templated or
not — keeps its declared representation, so a JSON API route's errors
stay JSON whatever a browser's Accept says). A swap gets the bare fragment, a
page renders inside the CORE
(the module tier is skipped: errors are not module-scoped, and a module
layout may depend on the very data that failed) with
`"{status} {message}"` as the core's title. Off-HTML (and on a
`ui.enabled: false` replica), the JSON envelope is sent unchanged.
One asymmetry to know in a `prefer: 'html'` app: a NON-templated JSON
route's successes stay JSON, but its errors resolve to HTML pages like
everything else — `prefer` lives on templates, so there is no bare-route
opt-out; keep `prefer: 'html'` scoped to page routes when that matters.

For failed SECTIONS there is deliberately no error template: recoverable
input problems are the form union's own 200-state (`formState`), and a
hard swap failure fires `rapid:error` without touching the region
(swapping an error page over a half-filled form would destroy it) — show
a toast or badge from that event (see the blog example's `blog.js`).

## Bytes and streams

A template consumes **data**: a templated route whose HTML representation is
asked of a `Uint8Array`/stream content is `RAPID_RESPONSE_INVALID`. Stream
replies belong on non-templated routes (or `prefer: 'json'`, where the reply
passes through untouched).

A structural limit to know: rendering is **synchronous and
whole-string** — a page is built entirely in memory before the first
byte leaves, so HTML never streams. That is the right trade for this
layer's scope (admin surfaces, CRUD apps, fragments measured in
kilobytes); a page so large that time-to-first-byte depends on streaming
its markup is past what this layer targets.

## OpenAPI

A templated route's `200` lists both `application/json` and `text/html`.

Runnable examples: [`examples/dashboard/main.ts`](../examples/dashboard/main.ts)
(a sales dashboard: period chips, both swapped-chain patterns,
`ctx.isSwap`), [`examples/kanban/main.ts`](../examples/kanban/main.ts)
(all three dynamic-update patterns, live channel, View-Transition
morphs), and [`examples/htmx/main.ts`](../examples/htmx/main.ts) (the
same contract driven by htmx) — run any with `deno run -A` and open the
printed URL.
