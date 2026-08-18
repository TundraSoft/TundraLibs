# Web-app example

A small "user lookup" flow that exercises each Doctor lifecycle:

| File                | Lifecycle | Depends on                                |
| ------------------- | --------- | ----------------------------------------- |
| `Config.ts`         | SINGLETON | nothing (registered via factory)          |
| `Logger.ts`         | SINGLETON | `WebConfig`                               |
| `Database.ts`       | SCOPED    | `WebConfig`, `WebLogger`                  |
| `UserRepository.ts` | TRANSIENT | `Database`, `WebLogger`                   |
| `UserHandler.ts`    | (plain)   | `WebLogger`, `Database`, `UserRepository` |

`WebConfig` has required constructor arguments (`appName`, `dbUrl`)
and is registered via the `factory` hook in
[registry.ts](registry.ts). The other vials register themselves
through the `@Vial` decorator when `registry.ts` imports them.

`UserHandler` is a plain, unregistered class: each request builds a
fresh one via `Doctor.resolve(UserHandler, scopeName)`, and that
scope becomes the **ambient operation scope** for every `inject()`
field resolving during its construction.

## Running

```bash
deno run packages/doctor/examples/web-app/main.ts
```

## Expected output

```
=== Scenario 1 — singleton injection ===
Logger.config defined?      true
Logger.config.appName:      demo-api

=== Scenario 2 — nested resolution ===
Database.config defined?    true
Database.logger defined?    true

=== Scenario 3 — handle a request ===
handler.repo.db === handler.db? true
[demo-api] UserHandler.handle(42)
[demo-api] db connect → postgres://localhost:5432/demo
[demo-api] db.findUser(42)
[demo-api] → result: {"id":42,"name":"user-42"}

=== Scenario 4 — per-request scope ===
h1.db === h2.db?            false  (expect false)
h1.db === h1Again.db?       true   (expect true — same scope)
h1.logger === h2.logger?    true   (expect true — singleton)

=== Scenario 5 — discharge at end of request ===
h1.db === h1AfterClear.db?  false  (expect false — scope was cleared)
```

## What the example demonstrates

| Scenario | Behavior                                                                                                                                                                                                       |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1        | **Lazy singletons, wired during construction.** `WebLogger` is constructed on first resolve; its `inject('WebConfig')` field resolves while the constructor runs, so `logger.config` is set before caching.    |
| 2        | **Nested DI cascades.** `Doctor.dispense(Database, scope)` returns a `Database` whose `config` and `logger` fields injected themselves during construction.                                                    |
| 3        | **The ambient operation scope.** `Doctor.resolve(UserHandler, scope)` makes `scope` ambient for the whole construction — the handler's `db` and its TRANSIENT repo's `db` resolve to the SAME scoped Database. |
| 4        | **Per-request scope.** Two `resolve(UserHandler, 'req-X')` calls with different scope names get different `Database` instances. Same scope name gets the same instance. Singletons are shared across both.     |
| 5        | **Scope cleanup.** `Doctor.discharge('req-A')` drops every per-scope instance under that name. The next resolve for `req-A` gets a fresh `Database`.                                                           |

## Choosing a scope per call

`Doctor.resolve(Class, scope?)` is the per-request entry point:
construct a plain class under a caller-chosen scope, with every
scope-less `inject()` in the construction inheriting it. For a fixed
scope, skip `resolve` entirely — name the scope in the field itself
(`inject('Database', 'jobs')`) and construct with plain `new`.
