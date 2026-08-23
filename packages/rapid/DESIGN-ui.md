# rAPId UI module — design (2026-08-23)

Status: **PROPOSED — awaiting decision.** Nothing here is built. Grounded in
the real rapid source (every seam named below was verified to exist) and in
the mechanism the standalone `rapid-ui-demo` prototype proved clickable. The
ROADMAP one-liner ("Simple UI module — a deliberately MINIMAL client-side UI
helper … not a React/Vite-class framework") is the scope ceiling; this doc
maps every aspect of delivering it.

## The idea in one paragraph

A route can name a **template**. The handler keeps returning plain
JSON-shaped data — it never learns about HTML. **Content negotiation** (the
`Accept` header, via the existing `ctx.accepts`) decides whether that data
goes out as JSON or is run through the template as HTML. A tiny declarative
**client runtime** fetches HTML fragments and swaps them into the page with
`data-*` attributes, no inline handlers. Same route, same handler, same data —
two representations.

## The user's proposal, and the decision on it

> In the router decorator we would have an additional arg pointing to a
> template; based on content type the same route can either share the data or
> the HTML render.

**Adopted, with two refinements:**

1. The template is referenced **by function, not by name**.
   `@GET('/users', { template: UserList })` — `UserList` is an import. No
   string registry to maintain, nothing to resolve at boot, no filesystem scan
   (Workers-safe by construction), and the reference is typed. The demo used a
   string registry only because it faked the decorators as config objects.
2. `Accept` decides **JSON vs HTML**; a second signal decides **fragment vs
   full page**, because both of those are `text/html`. See D3 — this is the
   one thing the demo's `includes('text/html')` could not express, and why a
   browser navigating straight to a demo API route got a naked `<ul>`.

Everything else the user proposed stands as stated.

## What already exists (the seams this plugs into — verified)

| Seam                                                                                       | Where                                                                        | Used for                                                       |
| ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `ctx.accepts(...offered)` over pure `negotiate(accept, offered)`                           | `context/HTTPContext.ts:142`, `utils/negotiate.ts`                           | JSON-vs-HTML choice (q-values, specificity, server order)      |
| `ctx.html(content, status?)`                                                               | `HTTPContext.ts`                                                             | the HTML reply shape (content-type `text/html; charset=UTF-8`) |
| Reply envelope `{ content, status?, headers?, cookies?, redirect? }`                       | `types/context/Response.ts`                                                  | untouched by the representer except `content` + content-type   |
| `serializeResponse(content, status, headers, head)`                                        | `utils/serializeResponse.ts`, called from `HTTPContext._respond`             | a string content + explicit content-type → correct wire body   |
| Decoration → route entry carry-through (`version`, `openapi`)                              | `types/Decoration.ts`, `utils/mountModule.ts:235-251`, `types/RouteEntry.ts` | `template` / `layout` ride the identical path                  |
| `app.route(method, path, { version, openapi }, handler)`                                   | `Application.ts` (the `target.route` `mountModule` calls)                    | the plain-API form gains `template` / `layout`                 |
| `app.onError(hook)` + the post-onion error path                                            | `Application.ts:926`, `transports/Transport.ts:179-204`                      | HTML error pages                                               |
| `csrf()` defaults: cookie `csrf` (`httpOnly: false`), header `x-csrf-token`, field `_csrf` | `middlewares/csrf.ts`                                                        | the runtime auto-echoes the token                              |
| `serveStatic`, `etag`, `compress`, `autoHead`                                              | `middlewares/`                                                               | the app's own assets; all downstream of the representer        |
| `harness()` / `client()`                                                                   | `testing/`                                                                   | negotiated tests                                               |
| `buildOpenApi`                                                                             | `utils/buildOpenApi.ts` (emits `application/json` only today)                | advertise `text/html` on templated routes                      |

Nothing in rapid renders HTML today beyond `ctx.html(string)`; there is no
escaping helper anywhere in the package. All of the below is net-new, but
small.

## Decisions

### D1 — Templates are pure functions with a tiny typed wrapper

```ts ignore
import { html, template } from '@tundralibs/rapid/ui';

type UsersResult =
  | { status: 'ok'; items: { name: string; email: string }[] }
  | { status: 'empty' }
  | { status: 'error'; message: string };

export const UserList = template<UsersResult>((data) =>
  data.status !== 'ok'
    ? html`<p class="muted">No data to view here.</p>`
    : html`<ul>${data.items.map((u) => html`<li>${u.name}</li>`)}</ul>`
);
```

- `RapidTemplate<D>` is an object `{ name: string; render(data: D, view: RapidView): Html }`.
  It is declared with **method syntax** deliberately: method bivariance lets
  `RapidTemplate<UsersResult>` be accepted where the route option is typed
  `RapidTemplate<unknown>`, which a function-typed property would reject under
  strict function types. `template()` is the factory; it takes an optional
  `name` (the variable name is not knowable at runtime) and diagnostics fall
  back to the route path when none is given.
- **Typing limit, stated honestly:** the decorator cannot statically prove
  that the handler's `content` matches the template's `D` — the reply
  envelope's `content` is a union (`string | Record | Uint8Array | stream`),
  and threading a second generic through `@GET` for this would make every
  route signature worse to serve one check. A mismatch surfaces as a template
  reading `undefined` fields. The mitigation is cheap and explicit: templates
  are pure, so `render(UserList.render(handlerResult, view))` in a unit test
  pins the pairing. (Revisit if TS makes this free later.)
- `view` is a **read-only per-request bag** the representer builds —
  `{ requestId, path, query, auth, csrfToken? }` — so a layout can render a
  nav or a user menu without a template ever touching `ctx`. Templates take
  it as an optional second parameter; most ignore it.

### D2 — Rendering primitives: `html` / `raw` / `render` / `Html`

Exactly the demo's semantics, which it proved correct under an XSS payload:

- `` html`…${v}…` `` escapes **every** interpolated value (`& < > " '`);
  nested `Html` composes without double-escaping; arrays join with `''`;
  `null` / `undefined` / `false` render as `''` (so `${cond && html\`…\`}`works); everything else goes through`String()` then escaping.
- `raw(string)` is the **only** opt-out and therefore the single audit point
  for unsafe markup. It exists for markup you already trust (a sanitized rich-
  text field). It is never used internally by the representer.
- `Html` is a class carrying the string under a **Symbol brand**, not a
  `__html` property as in the demo — an object literal from a JSON body must
  never be able to impersonate trusted markup.
- `render(html): string` unwraps for the wire and for tests.
- Synchronous only. Async work belongs in the handler; a template that needs
  to await is a handler that returned too little. Streaming templates are out
  of scope for v1 (see "Deferred").

### D3 — Two signals: `Accept` picks JSON vs HTML; a request header picks fragment vs page

- **JSON vs HTML** — `ctx.accepts('application/json', 'text/html')`. Offered
  order is server preference, so **no `Accept` or `*/*` → JSON**: an API
  route stays API-first for `curl`, SDKs, and `fetch()` without headers. A
  browser navigation (`text/html` first) gets HTML. A route can invert the
  default with `template: { render: Page, prefer: 'html' }` for page-first
  routes.
- **Fragment vs full page** — both are `text/html`, so `Accept` cannot
  distinguish them. The client runtime sends **`rapid-swap: 1`** on every
  fetch it makes (the same idea as htmx's `HX-Request`). Present → the
  template's output is the whole body (a fragment). Absent → it is wrapped in
  the resolved **layout** (D4). No layout configured → the fragment is served
  as-is; never an error.
- The representer adds **`Vary: Accept, rapid-swap`** so an intermediary
  cache never serves a fragment to a navigation or JSON to a browser.
- `HEAD`, `etag`, `compress`, range — all operate on the produced body and
  need no changes: the representer runs **before** them (D6).

### D4 — Layout resolution: route → module → app

`layout` is itself a `RapidTemplate<{ body: Html; title?: string }, view>`.
Resolution, most specific wins:

1. `@GET(path, { template: { render, layout } })` / plain-API `{ layout }`
2. `@Module('Users', { layout })` — a module-wide default, beside `prefix` /
   `version` in `RapidModuleMeta`
3. `app.ui({ layout })` — the app default
4. none → fragment

A page-shell route is just a route whose template **is** the page and whose
`prefer` is `'html'`; it needs no layout. The demo's "separate GET /" is this
case and needs no special path.

### D5 — Where the representer runs, and on what

The representer is an **HTTP-transport step at the innermost point of the
onion**: where `HTTPTransport` dispatches the matched route's handler and
assigns its reply to `ctx.response`. Concretely:

```ts ignore
// HTTPTransport dispatch (pseudo)
const reply = await route.handler(ctx);
ctx.response = route.template !== undefined
  ? represent(reply, route, ctx) // may return `reply` unchanged (JSON)
  : reply;
```

`represent()`:

- does nothing when `Accept` negotiates to JSON, or when the reply carries
  `redirect` (a redirect has no body to template — see D8);
- otherwise replaces **only `content`** with `render(layout?(template.render(content, view)))`
  and sets `content-type: text/html; charset=UTF-8` (merging, never
  clobbering, any headers the handler set); `status`, `cookies`, `redirect`
  pass through untouched — the envelope split rapid already has is exactly
  what keeps the demo's `_status`-leaks-into-JSON bug from being possible;
- rejects a stream/`Uint8Array` content with `RAPID_RESPONSE_INVALID` — a
  template consumes data, not bytes;
- is **HTTP-only**. `template` on a `@SOCKET` / `@JOB` method is ignored and
  documented as such, the same rule as `cookies` / `redirect` (decided
  earlier: document and ignore on other transports). Its presence is still
  allowed at decoration time so a multi-transport method can carry one.

Running at the innermost point means every middleware's post-`next()` view
(`etag`, `compress`, `responseTimer`, `requestLogger`) sees the **final HTML**,
not the pre-representation data object.

### D6 — The plain API gets the same option

```ts ignore
app.get('/users', { template: UserList }, listUsers);
app.route(
  'GET',
  '/users',
  { version: 'v2', template: UserListV2 },
  listUsersV2,
);
```

The verb helpers' optional-options slot (today `{ version }` on `route()`)
gains `template` / `layout`. `RapidRouteEntry` gains `template?: RapidRouteTemplate`
(the normalised `{ render, layout?, prefer }`), populated by both the plain
API and `mountModule`. One registration core, as always.

### D7 — Decorator and module surface

- `RouteDecoratorOptions` gains `template?: RapidTemplate<unknown> | RapidRouteTemplateOptions`
  and `layout?`. The `HTTP` variant of `RapidDecoration` stores them as
  **data** (metadata-only decorators — the method is never wrapped).
- `mountModule` carries them to `target.route(..., { version, openapi, template })`
  beside `openapi`, resolving the module-level `layout` default exactly as it
  resolves `version` today (`decoration.version ?? moduleVersion`).
- `RapidModuleMeta` gains `layout?`.
- Validation at **mount time**, fail-fast: a `template` that is not a
  `RapidTemplate` (wrong import, `undefined` from a typo) throws
  `RAPID_CONFIG` when the module mounts, never at first request.

### D8 — Redirects, the swap runtime, and open redirects

A `fetch()` follows a 3xx transparently and hands the runtime the _target's_
body, which is the wrong thing to swap into a fragment slot. So when a reply
carries `redirect` **and** the request is a swap (`rapid-swap: 1`), the
representer sends `200` with an empty body and **`rapid-redirect: <url>`**;
the runtime performs `location.assign(url)`. A navigation request keeps the
ordinary 301/302. The runtime follows a `rapid-redirect` **only** to a
relative or same-origin URL — the header is server-set, but the rule costs
nothing and closes the open-redirect class by construction.

### D9 — Errors

A `RapidError` thrown from a handler is turned into the JSON disclosure
envelope in `Transport.ts` (post-onion) after `app.onError` gets a chance to
override. HTML errors hook **there**:

- `app.ui({ errorTemplate })` — a `RapidTemplate<RapidErrorPayload>` receiving
  exactly `err.payload(app.mode)` plus `requestId` (the same disclosure rules
  as JSON: PRODUCTION collapses 5xx, never renders `debug`).
- When `Accept` negotiates HTML and an `errorTemplate` is set, the error path
  renders it (wrapped in the layout for a navigation, a fragment for a swap)
  with the error's status preserved. Otherwise the JSON envelope is sent as
  today.
- Because this runs post-onion, `compress`/`etag` do not see error HTML — the
  same is already true of JSON error envelopes; nothing new is lost.
- The **runtime** checks the response `content-type`: a non-HTML body (the
  JSON envelope when no `errorTemplate` is configured, or a network failure)
  is never swapped into the page. It dispatches a `rapid:error` DOM event
  with `{ status, body }` on the target and leaves the existing content in
  place. An app that wants inline error UI listens for it or configures an
  `errorTemplate`.

### D10 — The client runtime

Shipped as a **string constant** (`UI_RUNTIME`) exported from
`@tundralibs/rapid/ui` and served by `app.ui()` at `GET /__rapid/ui.js`
(path configurable) with a strong `ETag` and `cache-control: public,
max-age=…, immutable` keyed on the package version. No file read → works on
Workers and with `app.fetch()`. The app's own CSS/assets are its business
(`serveStatic`).

Behaviour (the demo's `swap.js`, hardened — about 80 lines, no dependencies):

- One delegated `click` listener and one `submit` listener for
  `[data-action]`; `e.preventDefault()`; no inline handlers anywhere
  (CSP-friendly — `script-src 'self'` suffices).
- Attributes: `data-action` (URL), `data-method` (default `get` for
  elements, `post` for forms), `data-target` (selector; default: the element
  itself), `data-swap` = `replace` (default) | `outer` | `append` | `prepend`.
- Requests carry `Accept: text/html` and `rapid-swap: 1`. Forms send
  `application/x-www-form-urlencoded` (rapid's `parseBody` already handles it
  and normalises repeated fields to arrays).
- **CSRF**: if a `csrf` cookie exists it is echoed as `x-csrf-token` —
  matching `csrf()`'s defaults with zero configuration. Both names are
  overridable via `data-` attributes on `<body>` for apps that renamed them.
- Honours `rapid-redirect` (D8) and emits `rapid:error` (D9); emits
  `rapid:swapped` after a successful swap so app code can re-initialise
  widgets inside the new fragment.
- Deliberately **not** included: polling, history push-state, WebSocket
  wiring, transitions, `data-confirm`. Each is a later, opt-in attribute if
  demand appears; none is needed to make the mechanism whole.

### D11 — Package surface

New subpath **`@tundralibs/rapid/ui`** (added to `deno.json` exports):

```ts ignore
export { Html, html, raw, render, template } from './ui/html.ts';
export { ui, UI_RUNTIME } from './ui/ui.ts'; // app.ui() options + the runtime
export type {
  RapidRouteTemplate,
  RapidTemplate,
  RapidUiOptions,
  RapidView,
} from '../types/mod.ts';
```

`app.ui(options)` is a small **app method** (like `app.modules()`), not a
middleware: it stores the layout / errorTemplate / runtime path on the app
and registers the runtime route. Types live one-per-file under `types/ui/`.
The root barrel re-exports nothing from `ui/` — an API-only app pays nothing
for it.

### D12 — The `{ status: 'ok' | 'empty' | 'error' }` union is an app convention

The demo's discriminated union is the **recommended** data shape and the docs
will show it — it is what lets one template collapse empty+error while a
sibling surfaces the error text, and it gives JSON consumers the same
distinction for free. rapid does not define or require it. A template gets
whatever the handler returned.

### D13 — OpenAPI, versioning, HEAD, ETag, compression, sessions, auth

- `buildOpenApi` lists **both** `application/json` and `text/html` under a
  templated route's responses (today it emits JSON only).
- Versioning is orthogonal (a versioned route may carry its own template —
  D6 shows it).
- `autoHead`, `etag`, `compress`, `responseTimer`, `requestLogger` need no
  change (D5). `serveStatic`'s Range/206 is for files, unaffected.
- `session()` / `auth` bag reach templates only through `view` (D1); a
  template cannot mutate them.

### D14 — Testing

- Templates: pure — `render(UserList.render(data, view))` and assert the
  string. No server.
- Negotiation: `client().get('/users', { headers: { accept: 'text/html' } })`
  vs no header; with and without `rapid-swap: 1`; the `Vary` header; `prefer`.
- The representer's passthroughs: status / cookies preserved; stream content
  rejected; template on a `@JOB` ignored.
- Errors: `errorTemplate` rendering with PRODUCTION disclosure; JSON when unset.
- The runtime: not browser-tested in CI (no DOM runner in the suite). It is
  covered by a **unit test over its source string** for the invariants that
  matter (no inline handlers, the exact header names, the same-origin
  redirect guard) plus the `examples/` app for manual verification — stated
  as the honest limit.

## Build plan (rapid-only — no cross-package work)

1. **Primitives** — `ui/html.ts` (`html`/`raw`/`render`/`template`/`Html`),
   `types/ui/*`, the `./ui` export, tests (escaping incl. the XSS case,
   composition, arrays, nullish, `raw` audit).
2. **Route option + representer** — `RouteDecoratorOptions.template/layout`,
   `RapidDecoration`, `mountModule` carry-through + mount-time validation,
   `RapidRouteEntry.template`, plain-API options slot, `represent()` in
   `HTTPTransport`, `Vary`, stream rejection, JOB/SOCKET ignore (documented).
3. **Layout, page vs fragment, `app.ui()`** — `RapidModuleMeta.layout`,
   resolution order, `rapid-swap`, `view` bag, `prefer`.
4. **Runtime + redirect + errors + OpenAPI** — `UI_RUNTIME` + its route,
   `rapid-redirect`, `errorTemplate` in the error path, `rapid:error` /
   `rapid:swapped`, `buildOpenApi` media types.
5. **Docs + example** — README "UI" section (between Streaming responses and
   Endpoints), `examples/ui.ts` (the demo's Users/Billing cards rebuilt on the
   real API), ROADMAP entry moved to Shipped, AGENTS.md template row.

Each step is independently shippable and tested on all three runtimes.

## Deferred (explicitly out of v1)

- Streaming/async templates (an `AsyncIterable<Html>` body) — the streaming
  model supports it at the transport; the template layer would need an
  async `html` variant. Wait for a need.
- Partial nesting helpers / slots beyond plain function composition.
- Runtime extras: polling, push-state history, `data-confirm`, transitions,
  WebSocket-driven swaps (the socket transport + `ctx.publish` already exist;
  a `rapid:push` bridge would be a separate small design).
- i18n / locale in `view`.
- A `rapid ui` CLI scaffold (templates + layout + a first page) — after the
  mechanism ships.

## Open questions for the decision

1. Header names `rapid-swap` / `rapid-redirect` (vs `x-rapid-*`). Modern
   guidance (RFC 6648) deprecates the `x-` prefix; proposed: no prefix.
2. Runtime path `/__rapid/ui.js` (configurable) — acceptable default?
3. Should `prefer: 'html'` be settable **app-wide** (`app.ui({ prefer })`) for
   apps that are pages-first? Proposed: yes, route overrides app.
4. `view.auth` exposes the whole auth bag to templates. Proposed: yes (it is
   already app-shaped and read-only); an app that wants less shapes it in the
   handler's data instead.
