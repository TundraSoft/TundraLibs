# Modules

How to build an app out of decorated classes: the decorators and binders,
the `RapidModule` tier with its events, `invoke` and lifecycle, and how
`app.modules()` boots it all. Everything here is metadata plus one
registration core: a decorated method is still a plain method you can call
in a test with `new`.

---

## TL;DR

- **Two tiers.** Any class with `@GET`/`@SOCKET`/`@JOB` methods mounts with
  `app.module(new Users())`. A class extending `RapidModule` additionally
  gets `name`/`namespace` identity, declared `events`, `this.log`,
  `this.config`, `this.emit()`, `this.invoke()`, `init()`/`dispose()` hooks,
  and boots with `app.modules({ modules: [namespaces] })`.
- **Decorators never wrap.** They record metadata by method name in the
  class's `Symbol.metadata`; the method is untouched.
- **Binders type the signature.** `@GET('/:id:', { bind: [param('id'),
  payload(Schema)] })` gives `find(id: string, body: Body)`. Without a
  validator `param` is `string` and `payload` is `unknown`.
- **Boot once, before start.** `app.modules()` constructs zero-argument
  modules (or dispenses ones doctor knows), mounts every decorated instance,
  wires `@On` subscriptions, runs `init()` in mount order; `stop()` disposes
  in reverse.
- **Modules never import each other.** They `emit` declared events and, when
  a synchronous answer is needed, `invoke` a target through the runtime.

---

## The plain tier — any decorated class

```ts
import { Application } from '@tundralibs/rapid';
import {
  GET,
  Module,
  param,
  payload,
  POST,
} from '@tundralibs/rapid/decorators';
import type { RapidContextResponse } from '@tundralibs/rapid';

@Module('Users', { prefix: '/users' })
class Users {
  @GET('/:id:', { bind: [param('id')] })
  find(id: string): RapidContextResponse {
    return { content: { id } };
  }

  @POST('/', { bind: [payload()] })
  create(body: unknown): RapidContextResponse {
    return { status: 201, content: { created: body } };
  }
}

const app = await Application.initialize({ name: 'plain-tier' });
app.module(new Users()); // an instance you built — DI or not, rapid does not care
```

`app.module(...instances)` walks each instance's prototype chain, reads the
decorations, and registers them through the same core as `app.get()` /
`app.socket()` / `app.job()`. Nothing is global: two apps never see each
other's classes, and a second `import()` of the same file is a cache hit.

### Decorators

| Decorator                                        | Records                                                                                                                                                   |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@GET/@POST/@PUT/@PATCH/@DELETE(path, options?)` | An HTTP route. `options`: `bind`, `version`, `summary`, `description`, `tags`, `operationId`, `security`, `response`, `template`, `layout`, `middleware`. |
| `@SOCKET(command, { bind?, middleware? })`       | A websocket command. The name is joined with the module `namespace`: `ns.command`.                                                                        |
| `@JOB(name, schedule, { bind?, args? })`         | A cron job (5-field schedule, validated at decoration). Name joined as `ns.name`; `args` are the registration defaults for `ctx.args.params`.             |
| `@Module(name?, options?)`                       | Class metadata: `prefix` (HTTP paths only), `namespace` (sockets and jobs), `version`, `description`, `tags`, `security`, `layout`, `middleware`.         |
| `@On(...events)`                                 | Subscribe a method to declared events (`'ns:Module:Event'`), `RapidModule` only.                                                                          |
| `@Use(...middleware)`                            | Guard module-to-module `invoke()` of this method, `RapidModule` only. Never runs for a transport request.                                                 |

Decorators stack: one method may be `@GET` and `@JOB` at once. Ordering of
rapid decorators relative to third-party wrapping decorators does not
matter — the route binds whatever function ends up installed under the
method name. A subclass that overrides a decorated method must re-decorate
it, or mounting fails loudly rather than binding a route to a method the
instance no longer runs.

`response` deserves a note: give it a schema that can `parse` and
DEVELOPMENT mode **enforces** it — a success reply whose `content` fails the
declared shape is a loud `RAPID_RESPONSE_INVALID` instead of a response the
docs lie about. PRODUCTION never runs the check.

#### Route middleware on decorated routes

A decorated route takes the same route-scoped chain a plain
`app.get(path, ...middleware, handler)` does — `middleware` on the route
decorator for one route, `middleware` on `@Module` for every HTTP route and
socket command in the class. Order inside the app onion: app-wide `use()`
first, then the module's chain, then the route's, then the handler.

```ts
import { GET, Module, param } from '@tundralibs/rapid/decorators';
import type { RapidContextResponse, RapidMiddleware } from '@tundralibs/rapid';

// e.g. from pactAuth(pact) — the catalog's middlewares are all universal
declare const authenticate: RapidMiddleware;
declare const authorize: (
  module: string,
  permission: string,
) => RapidMiddleware;

@Module('Admin', {
  prefix: '/admin',
  middleware: [authenticate], // every route and command in the class
})
class Admin {
  @GET('/users/:id:', {
    bind: [param('id')],
    middleware: [authorize('Admin', 'READ')], // this route only
    security: ['bearerAuth'], // documents what the guard enforces
  })
  user(id: string): RapidContextResponse {
    return { content: { id } };
  }
}
```

Entries are checked at decoration time — a non-function (a factory you forgot
to call) fails at import as `RAPID_CONFIG` naming the decorator and index.
The chain is HTTP-typed on `@GET`/…, socket-typed on `@SOCKET`, and universal
on `@Module` — a universal middleware (every catalog middleware, anything
from `pactAuth`) fits all three. Jobs are
not covered: `@JOB` has no per-registration chain, only the app-wide
`use()` scoped with `onlyJOB`. Middleware here is behaviour; the OpenAPI
`security` option is documentation — declare both.

### Binders

`bind` is a tuple in method-parameter order; its element types become the
parameter types.

| Binder                       | Yields                                                                      | Notes                                                                                       |
| ---------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `param(name, validate?)`     | `ctx.args.params[name]` — `string` without a validator                      | A present, non-string value with no validator is a 400 at invocation.                       |
| `payload(schemaOrValidate?)` | `await ctx.payload` — `unknown` without a validator                         | A schema **object** (anything with `.parse`) also documents the request body in OpenAPI.    |
| `query(validate?)`           | `ctx.args.query` (`{ filters, sorting }`)                                   | Untrusted as-is; the validator is where the allow-list lives. Not emitted into OpenAPI.     |
| `paging()`                   | `ctx.args.paging`                                                           | Always valid (clamped).                                                                     |
| `header(name, validate?)`    | the header on HTTP, the upgrade header on SOCKET, `null` on JOB             | Emitted as an optional header parameter in OpenAPI.                                         |
| `cookie(name, validate?)`    | the cookie on HTTP, `null` elsewhere                                        |                                                                                             |
| `auth(validate?)`            | `ctx.auth`                                                                  | `undefined` until an auth middleware set it.                                                |
| `session()`                  | `await getSession(ctx)` — HTTP with `session()` installed, else `undefined` | Exported from `@tundralibs/rapid/decorators` only (the root's `session` is the middleware). |
| `connection()`               | `ctx.connection`                                                            | `@SOCKET` methods only — anything else is `RAPID_CONFIG` at mount.                          |
| `config('set.key')`          | `ctx.config.get(path)` on any transport                                     | Set = lowercased file name, keys case-sensitive; a missing path binds `undefined`.          |

Validation rule: a `@tundralibs/guardian` failure is automatically a 400
with per-field messages; any other validator's throw is a 500 unless wrapped
in `validated()`. A `RapidError` you throw is used as-is.

## The `RapidModule` tier

```ts
import { event, RapidModule, reply } from '@tundralibs/rapid/modules';
import {
  GET,
  On,
  param,
  payload,
  POST,
  Use,
} from '@tundralibs/rapid/decorators';
import type {
  EventContext,
  RapidModuleInvokeMiddleware,
} from '@tundralibs/rapid/modules';

const EVENTS = { PostCreated: event<{ id: string }>() };

function mustBeInternal(
  ...[ctx, next]: Parameters<RapidModuleInvokeMiddleware>
): ReturnType<RapidModuleInvokeMiddleware> {
  if (ctx.auth === undefined) {
    ctx.response = reply(403, { reason: 'internal callers only' });
    return;
  }
  return next(); // ALWAYS return next() — a bare `next();` detaches
}

export class Posts extends RapidModule<typeof EVENTS> {
  readonly name = 'Posts';
  readonly namespace = 'blog';
  protected readonly events = EVENTS;

  @GET('/posts/:id:', { bind: [param('id')] })
  get(id: string) {
    return { content: { id, title: 'hello' } };
  }

  @POST('/posts', { bind: [payload()] })
  async create(body: unknown) {
    const id = 'p1';
    await this.emit('PostCreated', { id }); // awaited: subscribers settled before we reply
    return reply(201, { id, body });
  }

  @Use(mustBeInternal)
  count() {
    return { content: { total: 1 } };
  }

  init() {
    this.log.info('posts ready');
  }
}

export class Audit extends RapidModule {
  readonly name = 'Audit';
  readonly namespace = 'blog';
  protected readonly events = {};

  @On('blog:Posts:PostCreated')
  onCreated(payload: { id: string }, ctx: EventContext) {
    this.log.info('post created', { id: payload.id, requestId: ctx.requestId });
  }
}
```

- **Identity.** `name` is PascalCase and unique within its `namespace`
  (kebab-case). Events are fully qualified as `namespace:Name:Event`
  and every subscription is checked against the declared set when the
  runtime finalizes — a typo fails the boot, not silently never fires.
- **`events`** is a const map of `event<T>()` markers (pure type carriers).
  The class generic (`RapidModule<typeof EVENTS>`) is what types `emit`; a
  module that emits nothing omits both.
- **`emit(name, payload)`** resolves when every subscriber has settled.
  Await it for in-request consistency, or fire and forget — either way a
  throwing subscriber is isolated and logged, and never affects the emitter
  or the other subscribers. Subscribers get correlation only (`requestId`,
  `action`, `event`) — no state and no auth (an event carries no authority).
- **`invoke(Target, 'method', args)`** calls another module through the
  runtime: the target's `@Use` guards run, a copy of the caller's state and
  the caller's auth flow, and the outcome is an envelope — a denied guard is
  a 403 reply, not a throw. Prefer events; reach for `invoke` when you need
  an answer.
- **`reply(status, content)`** is the explicit envelope. A plain return is
  200 with that value as content; `undefined` is 204; a domain object that
  happens to have a `content` key stays content — the runtime never guesses.
- **`init()` / `dispose()`** are optional (duck-typed, no `override`
  needed): `init` runs once after every module is mounted, in mount order;
  `dispose` runs on shutdown in reverse. An `init` that throws rolls back
  the ones already initialised.
- **`this.log`** carries `module: 'ns:Name'` and the request id;
  **`this.config`** is the app's other config sets.

All of these throw `RAPID_CONFIG` if used before the module is mounted; a
unit test that needs them boots a `harness()` (see
[Testing](./Rapid-Testing.md)).

## Booting — `app.modules()`

```ts ignore
import { Application } from '@tundralibs/rapid';
import * as blog from './modules/mod.ts'; // the barrel `rapid modules` generates

const app = await Application.initialize('./configs');
const { modules, runtime } = await app.modules({ modules: [blog] });
modules.Posts.count(); // typed by export name
await app.start();
```

- Pass **module namespaces** (the result of `import * as`); every export
  whose prototype descends from `RapidModule` is constructed with zero
  arguments, or dispensed from the app's doctor container when the class is
  registered there. A class with required constructor parameters fails
  loudly — hand it over pre-built under `instances: { Posts: new Posts(db) }`
  instead. A field initialiser `inject(Label)` in an unregistered module
  resolves against the app's container.
- Call it **once**, before `start()` or the first `fetch()`. A second call
  is `RAPID_CONFIG`. Mounting failures dispose what was built before
  rethrowing.
- `app.moduleRuntime` exposes the `ModuleRuntime` (`invoke`, `emit`,
  `drain`, `modules`, `declaredEvents`); `stop()` disposes it.
- The `rapid modules` CLI command regenerates `modules/mod.ts` from the
  files in the directory (sorted, `export abstract class` skipped, duplicate
  class names refused); `--check` fails CI when the barrel is stale.

`initModules(context, sources, container?)` from `@tundralibs/rapid/modules`
is the same boot without an `Application` — for a worker, a CLI or a test
that only needs the module system. `buildModuleContext(options)` builds the
standalone context it takes.

## Prefixes, namespaces, versions

- `@Module({ prefix: '/users' })` joins onto HTTP paths only; slashes are
  normalised. A prefix may carry params (`/tenants/:tid:`) that any method
  binds with `param('tid')`.
- `namespace` (the `RapidModule` field, or `@Module({ namespace })` on a
  plain class) dots onto socket command and job names: `blog.posts.get`.
- `@Module({ version })` is the default version for the class's routes;
  `@GET(path, { version })` overrides; `server.versioning` decides where a
  request declares its version.

## OpenAPI from the declarations

A module's `name` is its routes' default tag, its `namespace` the tag group,
its `description` the tag's; a route's `summary`, `description`, `tags`,
`operationId` (default `<Module>_<method>`), `security` (`['bearerAuth']`;
`[]` marks it deliberately public) and `response` describe the operation;
`payload(Schema)` with a schema object documents the request body. Serve the
document with the `openapi()` endpoint and the reference page with `docs()` —
see [OpenAPI and the API reference](./Rapid-OpenAPI.md).

## Pitfalls

- **Registering a module after `start()`** throws. Boot everything first.
- **`@Use` is not route middleware.** It guards module-to-module `invoke()`
  and never runs for a request. Guard a decorated route with the
  `middleware` option on the route decorator or on `@Module`.
- **Constructor autobinding** (`this.find = this.find.bind(this)`) installs
  an own property that shadows the decorated prototype method — mounting
  refuses it with a message naming the method.
- **A bare `next();` in an invoke middleware** detaches the call: the
  invocation finishes before the method does. Always `return next()`.
- **Returning without `next()` and without a response** from an invoke guard
  is a 204 success envelope, not a denial. Set `ctx.response = reply(403, …)`
  to deny.
- **Harness config is empty.** Under `harness()` a module's `this.config`
  is an empty `Config` — stub the dependency that needs configuration instead.

---

[← Back to rAPId](../README.md)
