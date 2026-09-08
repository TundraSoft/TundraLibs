# OpenAPI and the API reference

Where the OpenAPI document comes from, how security schemes are declared, and
the `docs()` page that renders it — with rapid's own templates by default, a
generated credential box, try-it forms, and two ways to make it yours.

---

## TL;DR

- The document is **assembled from the routes** you register — nothing is
  written by hand. `app.get('/openapi.json', openapi())` serves it (JSON,
  cached per version, DEVELOPMENT only unless `expose` says otherwise).
- **Security schemes are yours to declare.** `openapi({ securitySchemes })`
  takes the precise OpenAPI 3.0 shapes (`http`, `apiKey`, `oauth2`,
  `openIdConnect`), validated at mount; routes reference them by name in
  `security`. `bearerAuth` is always declared. Nothing is inferred from
  middleware.
- `docs(app, { spec: '/openapi.json' })` mounts the **reference page** at
  `/docs`: rendered server-side inside your app's `core`/`layout` (branding for
  free), no bundler, no CDN. `tryIt: true` adds the credential box (one control
  per declared scheme) and a "Try it" form under every operation.
- Customize by **branding** (the app's core/layout, or `layout: false`) or by
  **composition** (`render: (doc, view, opts) => html` built from the exported
  parts `DocsAuth`, `DocsReference`, `DocsOperation`, `DocsSchemas`).
- Prefer Scalar, Redoc or Swagger UI? `viewer: 'scalar' | 'redoc' | 'swagger'`
  serves a pinned, SRI-checked shell around the same document.

---

## Where the document comes from

(The handlers' mounting rules, the probes and the metrics endpoint are in
the [endpoints guide](./Rapid-Endpoints.md); this guide is about the document
and its page.)

Every registered HTTP route becomes an operation. A plain `app.get()` route
contributes its path, method and path parameters; a decorated module route
adds what its declarations say — `summary`, `description`, `tags`,
`operationId`, `security`, the request body from `payload(Schema)` and the
response shape from `response` (see [Modules](./Rapid-Modules.md), "OpenAPI
from the declarations"). Every operation references one shared `RapidError`
component for its `400`/`401`/`403`/`404`/`500` responses, so the error
envelope is documented once.

```ts
import { Application } from '@tundralibs/rapid';
import { openapi } from '@tundralibs/rapid/endpoints';

const app = await Application.initialize({ name: 'shop' });

app.get(
  '/openapi.json',
  openapi({
    info: { version: '2.1.0', description: 'Orders and customers.' },
    servers: [{ url: 'https://api.example.com' }],
    expose: 'ALL', // default 'DEVELOPMENT' — see below
  }),
);
```

| Option            | Default                                       | Notes                                                                                                         |
| ----------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `info`            | `title` = the app `name`, `version` = `1.0.0` | Merged over the defaults.                                                                                     |
| `servers`         | omitted                                       | `{ url, description? }[]` — never auto-generated (a surface or proxy decides the public origin, not the app). |
| `securitySchemes` | none beyond `bearerAuth`                      | See the next section. Validated when `openapi()` is called.                                                   |
| `expose`          | `'DEVELOPMENT'`                               | `'PRODUCTION'` or `'ALL'` to serve elsewhere; a non-matching mode answers a plain `RAPID_NOT_FOUND` 404.      |

Things the assembler decides for you:

- **Versions.** `?version=v2` serves only that version's routes plus the
  unversioned ones (header-versioned routes sharing a path cannot coexist in
  one document). The root carries `x-versions`, each operation `x-version`.
  Known versions are cached; an unknown value is built fresh and never cached
  (the query is client-controlled).
- **Pages.** A templated route with `prefer: 'html'` documents a `text/html`
  200; an API-first templated route documents both representations. On an app
  with an api surface (`server.api`, or `ui.enabled: false`) pages are left out
  — they do not exist on that surface.
- **UI infrastructure** (the runtime scripts, the `docs()` page itself) is
  never listed.

## Security schemes

rapid does not guess how you authenticate. The pact adapter, a bring-your-own
`authenticate`, an upstream gateway — the document cannot tell them apart, so
the schemes are declared once, by you, with the exact shapes OpenAPI 3.0
defines:

```ts
import type { OpenApiSecuritySchemes } from '@tundralibs/rapid/endpoints';

export const SCHEMES: OpenApiSecuritySchemes = {
  // Authorization: Bearer <jwt> — what pactAuth's authenticate reads.
  bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
  // HTTP basic.
  basic: { type: 'http', scheme: 'basic' },
  // A key in a header, a query parameter or a cookie.
  apiKey: { type: 'apiKey', in: 'header', name: 'x-api-key' },
  // OAuth 2.0 — at least one flow, each with the URLs that flow requires.
  oauth: {
    type: 'oauth2',
    flows: {
      authorizationCode: {
        authorizationUrl: 'https://idp.example.com/authorize',
        tokenUrl: 'https://idp.example.com/token',
        scopes: { 'orders:read': 'Read orders' },
      },
    },
  },
  // OpenID Connect discovery.
  oidc: {
    type: 'openIdConnect',
    openIdConnectUrl:
      'https://idp.example.com/.well-known/openid-configuration',
  },
};
```

| `type`          | Required fields                                                                                                                                           |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `http`          | `scheme` (`'bearer'`, `'basic'`, or another IANA HTTP auth scheme); optional `bearerFormat`                                                               |
| `apiKey`        | `in: 'header' \| 'query' \| 'cookie'`, `name`                                                                                                             |
| `oauth2`        | `flows` with at least one of `implicit` (`authorizationUrl`), `password` / `clientCredentials` (`tokenUrl`), `authorizationCode` (both); `scopes` on each |
| `openIdConnect` | `openIdConnectUrl`                                                                                                                                        |

The rules the type cannot express are checked when the endpoint is created and
fail as `RAPID_CONFIG` naming the scheme: the key must match `[A-Za-z0-9._-]+`
(routes reference it by name), URLs must parse, a flow needs its URLs and a
`scopes` object (`{}` when the API defines none). `bearerAuth` (HTTP bearer)
is always present; an entry of the same name overrides it (to add
`bearerFormat`, say).

A route names the schemes that protect it — `security: ['bearerAuth']` on a
decorated route or in `app.route()`'s `openapi` option; `security: []` marks
an operation deliberately public. There is no automatic link between an
`authorize()` middleware and the document: the guard is behaviour, the
requirement is documentation, and keeping them separate is what lets a
gateway-authenticated API document a scheme rapid never sees.

## The reference page — `docs()`

```ts
import { Application } from '@tundralibs/rapid';
import { docs, openapi } from '@tundralibs/rapid/endpoints';

const app = await Application.initialize({ name: 'shop' });
const SCHEMES = {
  apiKey: { type: 'apiKey', in: 'header', name: 'x-api-key' },
} as const;

app.get('/openapi.json', openapi({ securitySchemes: SCHEMES }));
docs(app, {
  spec: '/openapi.json', // linked from the page header
  securitySchemes: SCHEMES, // the page assembles the same document
  tryIt: { login: { path: '/login' } },
});
```

`docs()` mounts itself (it registers a page and, with `tryIt`, one script
route), which is why it takes the app instead of returning a handler. The page
is `GET /docs` by default, a templated route with `prefer: 'html'`, so it is
part of the ui surface and never the api surface; it is gated by `expose`
exactly like `openapi()`; and it is stamped as UI infrastructure so it never
lists itself.

| Option                                 | Default               | What it does                                                                                                                                                                   |
| -------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `path`                                 | `'/docs'`             | Where the page is mounted.                                                                                                                                                     |
| `viewer`                               | `'rapid'`             | `'rapid'` renders server-side from rapid's templates; `'scalar'` / `'redoc'` / `'swagger'` load a pinned viewer; an object supplies your own asset URLs + SRI hashes.          |
| `spec`                                 | —                     | The JSON document's URL. Linked by the rapid viewer; **required** by a third-party viewer (it fetches the document itself).                                                    |
| `title`                                | `'<app name> API'`    | Page title (also handed to the core/layout).                                                                                                                                   |
| `layout`                               | the app's `ui.layout` | The module-tier layout for this page; `false` renders straight into the core.                                                                                                  |
| `render`                               | the default page      | `(doc, view, opts) => Html` — compose your own body from the parts (rapid viewer only).                                                                                        |
| `tryIt`                                | `false`               | `true` renders the credential box and try-it forms; `{ login: { path, fields? } }` adds a sign-in form posting JSON to `path` (`fields` defaults to `identifier`, `password`). |
| `expose`                               | `'DEVELOPMENT'`       | As `openapi()`.                                                                                                                                                                |
| `guards`                               | none                  | Route middleware run before the page — an `authorize()` for a production reference.                                                                                            |
| `info` · `servers` · `securitySchemes` | as `openapi()`        | The page builds the document itself, so give it the same options you gave `openapi()` (a shared constant keeps them in step).                                                  |

What the default page renders, top to bottom: the title, version, a link to
the JSON and the API versions; the credential box (when `tryIt` is on); a
two-column reference — a navigation of tag groups → tags → operations, and
each operation with its method badge, path, version and `deprecated`
badges, its security requirements (`public` for `security: []`), parameters
table, request body, responses with schema tables (`$ref`s link to the
schema section), and the try-it form; then every `components.schemas` entry
with an anchor. The stylesheet is inline and `docs-`-prefixed, so it neither
needs nor disturbs your own CSS.

### The credential box and "Try it"

`tryIt` turns the reference into a client. rapid serves one script of its
own at `/__rapid/docs.js` — same ETag/`no-cache`/`nosniff` treatment as the
UI runtime, no CDN, so a `script-src 'self'` policy is enough.

- **One control per declared scheme.** An `http` bearer scheme (and any
  non-basic scheme) gets a token field; `basic` gets user + password;
  `apiKey` gets a field for the header, query parameter or cookie it names;
  `oauth2` and `openIdConnect` get a token field with a link to the provider
  (the redirect dance is the provider's UI, not the reference's).
- **Values live in the tab's `sessionStorage`** under `rapid.docs.credentials`
  — gone when the tab closes, never sent anywhere but this origin.
- **A try-it request applies them by type**: `Authorization: Bearer <token>`
  (or the scheme's own word), `Authorization: Basic …`, the header or query
  key; a cookie key is the browser's to send. Only the schemes the operation
  lists in `security` are applied (all of them when it lists none). The
  `csrf` cookie is echoed as `x-csrf-token` like the UI runtime does, so a
  `csrf()`-protected POST works from the page.
- **The sign-in form** (`tryIt: { login: { path, fields } }`) POSTs
  `{ [identifier]: …, [password]: … }` as JSON to `path` and reads `token`
  from the reply, filling every bearer-shaped control. A `pactAuth` `login()`
  route answers exactly that shape and also sets the session cookie, so
  cookie-authenticated routes work too — see
  [Authentication & authorization](./Rapid-Auth.md).
- **`window.rapid.docs`** — `setCredential(name, value)` and `credentials()`
  — is the hook a custom box uses; every change fires a
  `rapid:docs:credentials` event on `document`.

Path parameters are filled from the form (`{id}` in the path), query and
header parameters go where they belong, a body is sent as JSON, and the
result panel shows status, headers and the (pretty-printed) body.

## Making it yours

### 1. Branding — the page is one of your pages

The rapid viewer renders inside whatever `ui.core` and `ui.layout` the app
configured, with the title passed to both tiers — the nav, fonts and footer
your other pages have, the reference has too, with no option set. A page
whose chrome should differ takes its own `layout`, or `layout: false` to
render straight into the core; with no core configured at all the page is
emitted as a complete document.

```ts
import { Application } from '@tundralibs/rapid';
import { docs } from '@tundralibs/rapid/endpoints';
import { html, htmlDocument, template } from '@tundralibs/rapid/ui';

const Core = template<{ body: unknown; title?: string }>((d) =>
  htmlDocument({
    title: d.title,
    head: html`<link rel="stylesheet" href="/brand.css">`,
    body: html`
      <header class="brand">Shop</header>
      <main>${d.body}</main>
    `,
  })
);

const app = await Application.initialize({
  name: 'shop',
  ui: { core: Core },
});
docs(app, { title: 'Shop API reference', layout: false, tryIt: true });
```

### 2. Composition — build the body from the parts

`render` replaces the page body and receives the assembled document, the
view bag and the part options (`tryIt`, `login`) so the parts you keep stay
wired. Everything the default page uses is exported:

| Part                                           | Renders                                                           |
| ---------------------------------------------- | ----------------------------------------------------------------- |
| `DocsAuth(doc, opts)`                          | The credential box (+ sign-in form when `opts.login` is set).     |
| `DocsReference(doc, opts)`                     | The navigation and every operation, grouped by tag.               |
| `DocsOperation(path, method, operation, opts)` | One operation — for a hand-picked subset or a different grouping. |
| `DocsSchemas(doc)`                             | `components.schemas` with anchors.                                |

```ts
import { Application } from '@tundralibs/rapid';
import {
  docs,
  DocsAuth,
  DocsOperation,
  DocsReference,
  DocsSchemas,
} from '@tundralibs/rapid/endpoints';
import { html } from '@tundralibs/rapid/ui';

const app = await Application.initialize({ name: 'shop' });

docs(app, {
  tryIt: { login: { path: '/login', fields: ['email', 'password'] } },
  render: (doc, view, opts) =>
    html`
      <aside class="intro">
        <h1>${doc.info?.title}</h1>
        <p>Signed in as ${view.query.as ?? 'nobody'} — request ${view
          .requestId}</p>
        ${DocsAuth(doc, opts)}
        <!-- your own control, wired through the same store -->
        <label>Tenant <input id="tenant" placeholder="acme"></label>
      </aside>
      <h2>Start here</h2>
      ${DocsOperation('/orders', 'get', doc.paths['/orders']?.get ?? {}, opts)}
      ${DocsReference(doc, opts)}
      ${DocsSchemas(doc)}
      <script>
        document.getElementById('tenant').addEventListener('change', (e) =>
          rapid.docs.setCredential('tenantKey', e.target.value));
      </script>
    `,
});
```

The inline `<script>` above is your page's, so it needs whatever your CSP
allows (a `secureHeaders({ contentSecurityPolicy })` without
`'unsafe-inline'` blocks it — put the handler in a file under
`server.static` instead). A custom control that
stores under a declared scheme's name (`tenantKey` above, declared as an
`apiKey`) is applied to try-it requests exactly like the generated one.

### Third-party viewers

```ts
import { Application } from '@tundralibs/rapid';
import { docs, openapi } from '@tundralibs/rapid/endpoints';

const app = await Application.initialize({ name: 'shop' });
app.get('/openapi.json', openapi());
docs(app, { viewer: 'scalar', spec: '/openapi.json' });
docs(app, { path: '/redoc', viewer: 'redoc', spec: '/openapi.json' });
docs(app, { path: '/swagger', viewer: 'swagger', spec: '/openapi.json' });
```

Each named viewer is a pinned jsDelivr build with its SRI `integrity` hash
baked in, loaded with `crossorigin="anonymous"`; the shell is still rendered
inside your core/layout. `spec` is required (the viewer fetches the JSON
itself, so mount `openapi()` with the same `expose`). To pin a different
version or self-host, pass the object form —
`viewer: { kind: 'scalar', script: { src, integrity }, style? }` — an empty
`integrity` is refused. `render` and `tryIt` are the rapid viewer's; the
third-party viewers bring their own. Your CSP must allow the script host
(`script-src 'self' https://cdn.jsdelivr.net`, plus `style-src` for Swagger's
stylesheet) — with `secureHeaders()`, extend its `contentSecurityPolicy`.

## Pitfalls

- **Two documents, one set of options.** `openapi()` and `docs()` each
  assemble the document; give both the same `info` / `servers` /
  `securitySchemes` or the page and the JSON disagree.
- **`expose` is per mount.** A PRODUCTION reference needs `expose: 'ALL'` (or
  `'PRODUCTION'`) on `docs()` _and_ on the `openapi()` a third-party viewer
  fetches — and a `guards: [authorize(...)]` if the inventory is not public.
- **The document knows nothing about your middleware.** An
  `authorize()`-guarded route without `security` on its declaration documents
  no requirement. Declare it.
- **Try-it is same-origin.** The forms call the page's own origin; a
  `servers` entry pointing elsewhere is documentation, not a target.
- **Cookie API keys cannot be typed in.** The browser sends the cookie it
  has; the control exists to show what is expected. Sign in through the login
  form (or the app) to get it set.
- **A route registered after `docs()`** is still documented — the document is
  assembled on the first request per version and cached, not at mount. A
  route registered after the _first request_ is not (register everything
  before `start()`).

---

[← Back to rAPId](../README.md)
