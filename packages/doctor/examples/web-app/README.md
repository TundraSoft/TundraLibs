# Web-app example

A small "user lookup" flow that exercises each Doctor lifecycle:

| File                | Lifecycle | Depends on                             |
| ------------------- | --------- | -------------------------------------- |
| `Config.ts`         | SINGLETON | nothing (registered via factory)       |
| `Logger.ts`         | SINGLETON | `Config`                               |
| `Database.ts`       | SCOPED    | `Config`, `Logger`                     |
| `UserRepository.ts` | TRANSIENT | `Database`, `Logger`                   |
| `UserHandler.ts`    | (plain)   | `Logger`, `Database`, `UserRepository` |

`Config` has required constructor arguments (`appName`, `dbUrl`) and
is registered via the `factory` hook in [registry.ts](registry.ts).
The other vials register themselves through the `@Vial` decorator on
import.

`UserHandler` is a plain class — no `@Inoculate` — because each
request needs a different scope. Construction goes through
`Doctor.resolve(UserHandler, scopeName)`.

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
handler.repo.db defined?    true
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

| Scenario | Behavior                                                                                                                                                                                                   |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1        | **Lazy singletons + cascade.** `Logger` is constructed on first resolve and treated before being cached, so `Logger.config` is filled in.                                                                  |
| 2        | **Nested DI cascades.** `Doctor.dispense(Database, scope)` returns a `Database` with `config` and `logger` already injected.                                                                               |
| 3        | **Top-of-graph via `resolve`.** `Doctor.resolve(UserHandler, scope)` constructs a plain class, treats its `@Dose` properties, and cascades into each one.                                                  |
| 4        | **Per-request scope.** Two `resolve(UserHandler, 'req-X')` calls with different scope names get different `Database` instances. Same scope name gets the same instance. Singletons are shared across both. |
| 5        | **Scope cleanup.** `Doctor.discharge('req-A')` drops every per-scope instance under that name. The next resolve for `req-A` gets a fresh `Database`.                                                       |

## When to use `@Inoculate` vs `Doctor.resolve`

- **`@Inoculate(defaultScope?)`** — pin the scope at decoration
  time, then construct with `new Class()`. Good for fixed-scope
  scenarios (CLI tools, background jobs).
- **`Doctor.resolve(Class, scope?)`** — choose scope per call.
  The class can be plain or `@Inoculate`d; `resolve` bypasses any
  `@Inoculate` wrapper to avoid double injection.
