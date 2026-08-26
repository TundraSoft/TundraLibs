# rAPId UI module — design (2026-08-23)

Status: **BUILT 2026-08-27** (branch `feat/rapid-ui`; docs/Rapid-UI.md is
the consumer-facing contract). The four open questions were settled (see
the final section). Grounded in the real
rapid source (every seam named below was verified to exist) and in the
mechanism the standalone `rapid-ui-demo` prototype proved clickable. The
ROADMAP one-liner ("Simple UI module — a deliberately MINIMAL client-side UI
helper … not a React/Vite-class framework") is the scope ceiling; this doc
maps every aspect of delivering it.

## The idea in one paragraph

A route can name a **template**. The handler keeps returning plain
JSON-shaped data — it never learns about HTML. Two deterministic signals
decide the representation: a `rapid-swap` request header (sent by our client
runtime) means "render the template as a **fragment**"; otherwise the route's
`prefer` says whether a plain request gets **JSON** (the default) or the
layout-wrapped HTML **page**. The `Accept` header is not consulted. A tiny
declarative **client runtime** fetches fragments and swaps them into the page
with `data-*` attributes, no inline handlers. Same route, same handler, same
data — two representations.

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
2. "Based on content type" became **two deterministic signals, and `Accept`
   is not consulted at all** (user's call, 2026-08-23): a `rapid-swap` request
   header selects a fragment; the route's `prefer` selects JSON or a page for
   everything else. A fragment and a page are both `text/html`, so `Accept`
   could never have told them apart — the hole that gave the demo's
   `includes('text/html')` a naked `<ul>` on a browser navigation — and
   dropping it also removes q-value ambiguity and `Vary: Accept`. See D3.

Everything else the user proposed stands as stated.

## What already exists (the seams this plugs into — verified)

| Seam                                                                                       | Where                                                                        | Used for                                                       |
| ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `ctx.accepts(...offered)` over pure `negotiate(accept, offered)`                           | `context/HTTPContext.ts:142`, `utils/negotiate.ts`                           | stays available to apps; the representer does NOT use it (D3)  |
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
- `view` is a **read-only, frozen, per-request bag** the representer builds
  so a layout can render a nav without a template ever touching `ctx`. By
  default it carries **only `{ requestId, path, query, csrfToken? }` — nothing
  from the auth bag** (decided 2026-08-23). An app that wants identity in its
  templates opts in with a **projection** that names exactly which fields
  cross over:

  ```ts ignore
  app.ui({
    layout: Shell,
    view: (ctx) => ({
      user: ctx.auth ? { name: ctx.auth.name as string } : undefined,
    }),
  });
  ```

  The projection's return is merged over the defaults (typed via
  `RapidView<Extra>`), so templates see `view.user`. This is safe by
  construction rather than by discipline: whatever an app's `authenticate`
  wrote into `ctx.auth` (full JWT claims via `jwt(pact)`, possibly more) never
  becomes reachable from every template and layout unless the app chose the
  fields. Templates take `view` as an optional second parameter; most ignore
  it.

### D2 — Rendering primitives: `html` / `raw` / `render` / `Html`

Exactly the demo's semantics, which it proved correct under an XSS payload:

- `` html`…${v}…` `` escapes **every** interpolated value (`& < > " '`);
  nested `Html` composes without double-escaping; arrays join with `''`;
  `null` / `undefined` / `false` render as `''` (so a conditional
  interpolation of the form `cond && html…` works); everything else goes
  through `String()` then escaping.
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

### D3 — Two deterministic signals; `Accept` is not consulted

| Request                                        | Representation                             |
| ---------------------------------------------- | ------------------------------------------ |
| `rapid-swap: 1` present (our runtime)          | HTML **fragment** — always                 |
| absent, resolved `prefer` = `'json'` (default) | **JSON** (the reply goes out unchanged)    |
| absent, resolved `prefer` = `'html'`           | HTML **page** — wrapped in the layout (D4) |

- **`rapid-swap`** is sent by the client runtime on every fetch it makes (the
  same idea as htmx's `HX-Request`). Present → the template's output is the
  whole body. Absent → `prefer` decides. No layout configured for a page →
  the fragment is served as-is; never an error.
- **`prefer`** is "what this route returns when it is _not_ a swap".
  `'json'` = an API-first endpoint that also knows how to render a fragment;
  `'html'` = the route _is_ a page. Resolution, most specific wins:
  route (`template: { render, prefer }` / plain-API option) → app
  (`app.ui({ prefer })`) → `'json'`. The app level exists so a pages-first
  web app does not annotate every route; an API route inside it overrides
  with `prefer: 'json'`. (No module level — `prefer` describes the route's
  nature, not its grouping; add to `@Module` only if a real need appears.)
- **`Accept` is ignored** by the representer (decided 2026-08-23). Why: a
  fragment and a page are both `text/html`, so `Accept` never could choose
  between them; removing it from the JSON-vs-HTML choice too makes the
  outcome readable off the route's declaration, kills q-value / browser
  `*/*` ambiguity, and needs no `Vary: Accept`. `ctx.accepts` remains for apps
  that want `Accept`-driven behaviour by hand.
- **What is given up, stated plainly:** a human typing an API route's URL
  into the address bar sees JSON, not a rendered list — correct for an API
  route. The case that matters is **progressive enhancement**: a form POST
  with JavaScript disabled is a plain navigation, so it would get JSON; set
  `prefer: 'html'` on that route and the no-JS path returns the page.
- The representer adds **`Vary: rapid-swap`** so an intermediary cache never
  serves a fragment to a navigation (or vice-versa).
- `HEAD`, `etag`, `compress`, range — all operate on the produced body and
  need no changes: the representer runs **before** them (D5).

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

- does nothing when the representation resolves to JSON (no `rapid-swap` and
  `prefer` = `'json'`, D3), or when the reply carries `redirect` (a redirect
  has no body to template — see D8);
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
- When the representation resolves to HTML (a swap, or a non-swap whose
  matched route resolved `prefer` = `'html'` — D3) and an `errorTemplate` is
  set, the error path renders it (a fragment for a swap, layout-wrapped for a
  page) with the error's status preserved. Otherwise the JSON envelope is
  sent as today. An error on an unmatched route (404 before routing) has no
  route `prefer`, so the app-level `prefer` decides.
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
- Requests carry `rapid-swap: 1` — the only header the representer reads —
  plus `Accept: text/html` as a courtesy to intermediaries and logs (not
  consulted server-side). Forms send `application/x-www-form-urlencoded`
  (rapid's `parseBody` already handles it and normalises repeated fields to
  arrays).
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
middleware. `RapidUiOptions` = `{ layout?, prefer?: 'json' | 'html', view?,
errorTemplate?, runtimePath? }` (defaults: no layout, `'json'`, no
projection, no error template, `/__rapid/ui.js`). It stores these on the app
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
- The `auth` bag / session reach templates **only** through the opt-in `view`
  projection (D1) — never by default — and `view` is frozen, so a template
  cannot mutate them.

### D14 — Testing

- Templates: pure — `render(UserList.render(data, view))` and assert the
  string. No server.
- Representation: with vs without `rapid-swap: 1`; `prefer` at route and app
  level (and route overriding app); `Vary: rapid-swap` present; and a
  negative test that an `Accept: text/html` header alone does NOT change the
  outcome (the decision is deterministic).
- `view`: defaults carry no auth; the projection's fields appear; the bag is
  frozen.
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
   resolution order, `rapid-swap`, the `view` bag + opt-in projection,
   `prefer` at route and app level.
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

## Post-build addition (user call, 2026-08-27)

`window.rapid.swap(url, target, opts?)` — the runtime's single
programmatic hook, added so app code can trigger swaps (multi-region
updates from a `rapid:swapped` listener) without synthesizing clicks. The
disciplined alternative to htmx-style out-of-band attributes: the
attribute surface stays frozen; everything beyond it is app JS over the
events.

Second addition, same day (user call): the swap contract's three header
names became configuration — `swapHeader` (presence = fragment),
`swapUnless` (presence CANCELS the swap; the escape htmx needs because it
sends `HX-Request` on boosted/history-restore navigations that expect the
page), and `redirectHeader` (htmx honours `HX-Redirect` natively). All
names join `Vary`; validated as header tokens at `app.ui()`. This is the
htmx-interop lever: their mature client drives rapid's server model
unchanged — docs/Rapid-UI.md "Bring your own client".

## Adversarial-review hardening (2026-08-27)

Eight-reviewer pass (runtime, representer, API/types, security, examples,
whole-package sweeps, feature scout); ~30 verified findings, zero
vulnerabilities, all fixed. The behavior-shaping ones: the layout's
`title?` slot is now WIRED (object-form `title: string | (data) =>
string`); `representError` stamps the same `Vary` as the success path
and is isolated in disclosure (a throwing errorTemplate falls back to
the JSON envelope, never an empty 204); a handler-set `vary` MERGES with
the swap names; templated routes returning `null` stay a 204;
`normalizeRouteTemplate` freezes its result (ctx.routeTemplate is
immutable); `app.ui()` before start()/fetch() is enforced loud, so is
`layout`-without-`template` and a non-function handler; non-`Html`
template returns throw `RAPID_RESPONSE_INVALID`; the runtime gained
per-target last-write-wins aborts, modifier-click and inner-link
carve-outs, real multipart for file inputs, submitter values, an
`outer`-swap event on the REPLACEMENT node, and try/catch around
redirect/cookie parsing; `view.csrfToken`'s cookie name is configurable
(`csrfCookie`). Docs now state the escaper's context boundaries (quoted
attributes + text only — URL/script contexts need app validation).

## Feature round (user call, 2026-08-27 — suggestions 1-7 built)

`UI_LIVE` (`app.ui({ live: true })` → `/__rapid/live.js`; `rapid.live.
connect/disconnect`, `rapid:push`/`rapid:live` document events, capped
backoff, resubscribe; both scripts now MERGE onto `window.rapid` so load
order is free); `ctx.isSwap` (the representer's decision, exported +
surfaced on HTTPContext); render diagnostics (`RAPID_TEMPLATE_RENDER`
naming the template, + a DEVELOPMENT-only built-in error fragment when
`app.ui()` is on with no errorTemplate — PRODUCTION always JSON);
typed projections (`template<D, Extra>` types `view` fields cast-free);
`htmlDocument()` + `view.runtimePath` (standards-mode preamble, no more
hand-written doctype/head); testing fixtures (`view()` factory,
`client` `swap: true` using the RESOLVED swap header); recipes docs
(pagination via `withQuery` + outer self-replacement, PRG/no-JS, CSP
nonce via projection, i18n via projection). A same-day polish round
added View Transitions on every swap (animation promises observed — a
hidden document's rejections never surface), focus restore by id
across a swap, and `rapid.refresh(target)` backed by a per-node GET
source memory (replace/outer only; non-GET outer swaps carry the
source forward). Suggestion 8's rejections stand: no attribute growth,
no async templates, no SPA history.

## Decisions taken (user, 2026-08-23)

1. Header names **`rapid-swap`** / **`rapid-redirect`** — no `x-` prefix (RFC
   6648). And, going further: the representer **ignores `Accept`** entirely;
   these two signals plus `prefer` are the whole decision (D3).
2. Runtime default path **`/__rapid/ui.js`**, configurable via
   `app.ui({ runtimePath })`.
3. **`prefer` is settable app-wide** (`app.ui({ prefer })`), route overrides
   app, default `'json'` (D3).
4. **`view` exposes nothing from the auth bag by default**; identity reaches
   templates only through an explicit `app.ui({ view })` projection naming
   the fields (D1). Chosen over "expose the whole bag" because it is safe by
   construction, not by discipline.
