# Testing

What `@tundralibs/rapid/testing` gives you, how each kind of test is written,
and how to keep a suite green on Deno, Bun and Node at once.

---

## TL;DR

- `client(app)` drives routes through `app.fetch()` — no port, no network,
  the whole middleware onion. `{ status, headers, body }` back, JSON decoded.
- `harness({ modules, stub })` boots the module system with fakes stocked
  into a **fresh child** DI container, so tests cannot leak into each other.
- `view(overrides)` builds the frozen view bag a template receives, for
  pure template tests.
- Decorated methods are plain methods: `new Users().find('7')` needs no app.
- One suite, three runtimes: import `describe`/`it` from
  `@tundralibs/rapid/testing` (re-exported from `@tundralibs/compat/test`).

---

## Setup

```ts
import { Application } from '@tundralibs/rapid';
import { client, describe, it } from '@tundralibs/rapid/testing';
import * as asserts from '@std/asserts';

describe('users', () => {
  it('answers on /ping', async () => {
    const app = await Application.initialize({
      name: 'test',
      mode: 'DEVELOPMENT', // disclosed errors — read the real message in a failure
      logger: { handlers: [] }, // silent
    });
    app.get('/ping', () => ({ content: { ok: true } }));

    const api = client(app);
    const res = await api.get('/ping');
    asserts.assertEquals(res.status, 200);
    asserts.assertEquals(res.body, { ok: true });
    await app.stop();
  });
});
```

`mode: 'DEVELOPMENT'` is worth setting in tests: a 500 then carries the
thrown message and `debug` in its body instead of `Internal server error`.
`logger: { handlers: [] }` keeps the output quiet; drop it when you want to
see the access lines.

## `client(app)` — HTTP through the whole cycle

`client(app).get|post|put|patch|delete(path, options?)` builds a `Request`
against `http://rapid.test` and hands it to `app.fetch()`; every middleware,
the router, the representer and disclosure run exactly as in production.

| Option    | Effect                                                                                                                          |
| --------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `body`    | JSON-serialised; `content-type: application/json` unless `headers` names one.                                                   |
| `headers` | Request headers; explicit entries win. Cookies go here: `{ cookie: 'sid=…' }`.                                                  |
| `query`   | Query-string pairs.                                                                                                             |
| `swap`    | `true` sends the app's **resolved** swap header, so a UI test never hardcodes a header a later htmx config would silently miss. |
| `host`    | The hostname (default `rapid.test`) — for `server.api.hosts` tests. An absolute `path` overrides it.                            |

The response is `{ status, headers, body }`; `body` is `res.json()` when the
content type includes `json`, else the text. For streams, byte bodies or
manual control call `app.fetch(new Request(...))` directly — it is the same
path.

Things to test through `client()`: error envelopes (`body.code`,
`body.requestId`), the `x-request-id` / `x-response-time` stamps, cookie
round-trips (capture `set-cookie` from one response and send it as `cookie`
on the next), CSRF (`csrf({ secure: false })` in tests — the default
`secure: true` cookie is dropped over plain http), the fragment / page / JSON
matrix of a templated route (`swap: true` vs a plain request), and the api
surface (`host: 'api.rapid.test'` or an `/api/...` path).

## `harness()` — the module system with fakes

```ts
import { RapidModule } from '@tundralibs/rapid/modules';
import { harness } from '@tundralibs/rapid/testing';
import { inject, label } from '@tundralibs/doctor';
import * as asserts from '@std/asserts';

const Clock = label<{ now(): string }>('Clock');

class Stamper extends RapidModule {
  readonly name = 'Stamper';
  readonly namespace = 'stamp';
  protected readonly events = {};
  private readonly clock = inject(Clock);
  stamp(): { at: string } {
    return { at: this.clock.now() };
  }
}

const h = await harness({
  modules: [{ Stamper }],
  stub: [[Clock, { now: () => 'FROZEN' }]],
});
asserts.assertEquals(h.modules.Stamper.stamp(), { at: 'FROZEN' });
const result = await h.invoke(Stamper, 'stamp', []);
asserts.assertEquals(result.status, 200);
await h.dispose();
```

- `modules` are namespaces or plain objects of classes; `instances` hands
  over pre-built modules with constructor arguments.
- `stub` entries (`[token, value]`) are stocked into a **fresh child** of the
  global doctor before boot and revoked on dispose; the process-wide registry
  is never touched. Pass `container: app.container` to boot against exactly
  what an app resolves.
- `context` is the boot context (`{ name, mode?, logger? }`); the default is
  a quiet in-memory logger. A module's `this.config` is empty under the
  harness — stub the dependency that needs configuration.
- The harness is `RapidModuleInitResult` plus `invoke` (bound to the
  runtime), `dispose()` and `Symbol.asyncDispose`, so `await using h =
  await harness(...)` tears it down at block end.
- `h.runtime.emit('ns:Module:Event', payload)` fires subscribers;
  `h.invoke(Target, 'method', args)` runs the target's `@Use` guards and
  returns the envelope, so a denial is asserted as `result.status === 403`.

## Templates and the UI

```ts
import { html, render, template } from '@tundralibs/rapid/ui';
import { view } from '@tundralibs/rapid/testing';
import * as asserts from '@std/asserts';

const Hello = template<{ name: string }>((d, v) =>
  html`<p data-path="${v.path}">Hi ${d.name}</p>`
);

asserts.assertEquals(
  render(Hello.render({ name: '<b>' }, view({ path: '/x' }))),
  '<p data-path="/x">Hi &lt;b&gt;</p>',
);
```

`view()` returns a frozen bag with `requestId: 'test-request'`,
`runtimePath: '/__rapid/ui.js'`, `path: '/'`, `asset: (p) => p` and any
overrides or projection extras; `query` stays frozen even when overridden,
so a template that mutates it fails here, not in production. The
representation matrix (fragment vs page vs JSON, `Vary`, error pages) is an
integration test through `client()` with and without `swap: true`.

The client runtime scripts have no DOM runner in the suite; rapid pins them
by source-string invariants, and the examples are the manual check.

## Jobs, sockets, events

- **Jobs**: `await app.triggerJob('name', args)` runs a job now through the
  full cycle (bypassing the overlap guard and `jobs.enabled`) and returns
  the outcome (`status`, `handlerRan`); no scheduler is started.
- **Sockets**: `app.fetch()` serves HTTP only, so a socket command needs a
  listening app: `await app.start()` on `server: { port: 0 }` and connect an
  `@tundralibs/rpc` `Client` to `ws://127.0.0.1:${app.port}/ws`. Unit-test
  the handler itself by constructing a `SOCKETContext` from
  `@tundralibs/rapid/context`, as rapid's own suite does.
- **Events**: assert through a subscriber module in the harness, or through
  the emitting module's own observable effect; `runtime.drain()` waits for
  fire-and-forget emissions.

## Three runtimes

rapid's tests run on Deno, Bun and Node in CI, and yours should too:

```bash
deno test -A
bun test
node --import tsx --test 'src/**/*.test.ts'
```

- Import `describe`/`it`/`beforeAll`/`afterAll` from
  `@tundralibs/rapid/testing`; they resolve to the runtime's own runner.
- Never reach for a runtime global (`Deno.*`, `Bun.*`, `process`) in a test
  that must run everywhere; `@tundralibs/compat` has the portable helpers
  (temp dirs, files, env).
- Bun and tsx read `tsconfig.json` from the working directory — run them
  from the project root.
- Timing-sensitive assertions (rate-limit windows, session TTLs) should
  use a small `window` or `ttl` and a real `setTimeout`, not fake clocks;
  the in-memory hooks use wall-clock seconds.

## What each kind of test should cover

- **A handler or module method**: call it directly. Validation and access
  are middleware concerns; the method's job is its meaning.
- **A route**: `client()`; assert status, body shape and the headers the
  route promises. Include one failure path per error code the route can
  produce.
- **A middleware**: `client()` with a stub route behind it; assert what it
  stamps on success, what survives an error, and that off-transport
  invocations pass through (or are refused, for a `guard*`).
- **A config option**: assert the boot rejects the bad value
  (`assertRejects(() => Application.initialize({...}), Error, 'the key')`)
  and that the good value has the documented effect.
- **A template**: render it with `view()` and compare strings.

A test must be able to fail. Never assert what the type checker already
proves.

---

[← Back to rAPId](../README.md)
