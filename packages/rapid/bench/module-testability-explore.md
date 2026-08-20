# Module testability without the server

Uncommitted scratch report. Hands-on verified with
`.bench/module-testability-explore.ts` on both Deno and Node (identical output —
see the raw run below).

## Finding: yes, directly, with zero server/transport involvement

`@Module`/`@GET`/`@POST`/etc. are **metadata-only** TC39 decorators — they call
`recordDecoration()`/`recordModule()` into a side-table keyed by the
function/class object and return `undefined`. They never wrap the method. So a
decorated class is, at the object level, an entirely plain class:
`new
Widgets()` and `widgets.find('1')` are just JS, with nothing
framework-owned in the call path. A unit test needs no `Application`, no
`HTTPContext`, no mount step, no port.

```ts
const widgets = new Widgets();
const created = widgets.create("gizmo"); // just calls the method
assertEqual(created.status, 201);
```

## The one real caveat: `bind` binders are invisible to a direct call

`@POST('/', { bind: [payload(validated(CreatePostBody))] })` (as used in the
blog example) only takes effect at **mount time** — `utils/mountModule.ts` is
what reads `binds`, pulls values out of `ctx.args`, runs them through the binder
(`param`, `payload`, `query`, ...), and calls the method with the translated
arguments. Calling `widgets.create(name)` directly skips that translation
entirely: you're handing the method its final argument shape by hand, guardian
validation and all, exactly as if you'd already passed through the binder.

Practical read: this is a **feature**, not a workaround — it means module unit
tests are pure business-logic tests (no HTTP, no fetch mocking, no `payload()`
machinery to fight), IF the test author supplies already-valid arguments the way
a passing binder would. What it does NOT cover:

- Whether the `bind` tuple is wired to the right binder/path param name — that's
  mount-time wiring, only exercised by an actual `app.module()` + real
  HTTP/socket call (or a narrower mount-tier test against `mountModule.ts`
  directly).
- Whether `payload(validated(Schema))` actually rejects bad input — that's
  testing the `validated()`/guardian-schema function in isolation, a separate
  unit target from the module method itself.

So the natural test pyramid this design produces: **method logic** → plain unit
test, zero framework (verified above); **binder wiring** → a thin mount-level
test or one E2E smoke test per route shape; **validation schemas** → unit-tested
on their own, independent of the module.

## Introspection is available too, if a test wants to assert on metadata

`decorationsOf(method)` and `moduleMetaOf(ctor)` (exported from
`decorators/mod.ts`) read the same side-tables the mount tier reads — e.g. a
test asserting `find` really is registered as `GET /:id:` without spinning up a
router. Requires grabbing the function reference off
`Object.getPrototypeOf(instance)`, since decorations key on the function object
itself, not the instance.

## Live output (identical on Deno and Node)

```
create(): {"status":201,"content":{"id":"1","name":"gizmo"}}
find() [hit]: {"content":{"id":"1","name":"gizmo"}}
find() [miss]: {"status":404,"content":{"error":"not found"}}
find() decorations: [{"kind":"HTTP","method":"GET","path":"/:id:","binds":[],"methodName":"find"}]
@Module metadata: {"name":"Widgets","prefix":"/widgets","namespace":"widgets"}
```
