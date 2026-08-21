# Doctor

Lightweight dependency injection for Deno, Bun, Node.js, Cloudflare
Workers, and browsers — no `reflect-metadata`, no legacy decorators,
no build flags.

![Deno](https://img.shields.io/badge/Deno-000000?logo=deno)
![Bun](https://img.shields.io/badge/Bun-f9f1e1?logo=bun)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)
![Cloudflare Workers](https://img.shields.io/badge/Cloudflare%20Workers-F38020?logo=cloudflare&logoColor=white)
![Browsers](https://img.shields.io/badge/Browsers-4285F4?logo=googlechrome&logoColor=white)

## Overview

Doctor is a small DI container built around three primitives:

- `@Vial(mode)` — class decorator that registers a class under a
  lifecycle (`SINGLETON`, `SCOPED`, or `TRANSIENT`).
- `label` + `Doctor.stock` — register a **ready-made value** (or a
  labelled factory) under a typed label, no class required.
- `inject(target)` — typed resolution by label, by class, or by
  import-free class-name token. Used as a **field initializer** or
  **constructor default parameter**, it wires an instance while it
  constructs — that IS the injection mechanism, there is no separate
  injection step.

```typescript
import { inject, Vial } from '@tundralibs/doctor';

declare module '@tundralibs/doctor' {
  interface VialRegistry {
    Logger: Logger;
  }
}

@Vial('SINGLETON')
class Logger {
  log(msg: string) {
    console.log(`[log] ${msg}`);
  }
}

class App {
  logger = inject('Logger'); // resolves while `new App()` runs

  start() {
    this.logger.log('app started');
  }
}

new App().start(); // [log] app started
```

The registry is a process-wide singleton exported as `Doctor`.
Decorators talk to it; consumers usually don't have to.

**Design rule: decorators RECORD, they never SUPPLY VALUES.** `@Vial`
only registers the class. There is deliberately no `@Dose`-style
member decorator handing you the value, because Bun currently
miscompiles value-supplying member decorators whenever a file contains
more than one decorated class
([oven-sh/bun#30326](https://github.com/oven-sh/bun/issues/30326)) —
the last class's initializer silently replaces everyone else's.
`inject()` initializers are plain expressions, immune by construction,
and shorter anyway.

## Migrating from 1.0.x

Doctor 1.1 drops the legacy-decorator machinery — `experimentalDecorators`,
`emitDecoratorMetadata`, and `reflect-metadata` — entirely:

| 1.0.x                                            | 1.1+                                                                                          |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| `@Dose() logger!: Logger`                        | `logger = inject('Logger')`                                                                   |
| `@Inoculate()` on the class                      | nothing — `inject()` fields wire themselves on `new`                                          |
| `@Inoculate('scope')`                            | `inject('Db', 'scope')` per field, or `Doctor.resolve(Class, 'scope')`                        |
| `Doctor.treat(instance)`                         | removed — injection happens during construction                                               |
| `import 'reflect-metadata'`                      | removed — no runtime dependency                                                               |
| `experimentalDecorators: true` (tsconfig)        | **must be off** — `@Vial` is a TC39 standard decorator                                        |
| `MissingMetadataError`, `MissingDesignTypeError` | removed — their failure modes no longer exist                                                 |
| SINGLETON ↔ SINGLETON cycles resolved            | eager cycles **throw** `CircularDependencyError`; break with a [lazy getter](#lazy-injection) |
| `Prescription` type                              | removed                                                                                       |

## Installation

**Deno:**

```bash
deno add @tundralibs/doctor
```

**Bun:**

```bash
bunx jsr add @tundralibs/doctor
```

**Node.js:**

```bash
npx jsr add @tundralibs/doctor
```

## TypeScript configuration

`@Vial` is a TC39 (stage-3) standard decorator — the default in
TypeScript 5+, Deno, Bun, esbuild, and tsx. There is nothing to turn
ON; make sure the legacy flag is not turned on:

```jsonc
// tsconfig.json — both flags absent or false
{
  "compilerOptions": {
    "experimentalDecorators": false,
    "emitDecoratorMetadata": false
  }
}
```

| Toolchain                       | Works |
| ------------------------------- | ----- |
| **Deno**                        | ✅    |
| **Bun**                         | ✅    |
| **Node** — `tsc` / `ts-node`    | ✅    |
| **Node + `tsx`, esbuild, Vite** | ✅    |

(1.0.x required `emitDecoratorMetadata`, which tsx/esbuild can never
emit — that row was a ❌. 1.1 removes the requirement.)

### Bundling for the browser or a Worker (esbuild/Wrangler/Vite)

**Pin a `target`.** "TC39 decorator" describes the _syntax_, not
something browsers or workerd execute natively — no shipping runtime
does yet, so a bundler must still lower it to plain JS. Left at its
default, esbuild assumes native support and passes the syntax
through unchanged, which is a hard `SyntaxError` at load time
everywhere:

```typescript ignore
// esbuild — either the CLI flag or the JS API option
esbuild.build({
  target: 'es2022', // or your bundler's equivalent
  // ...
});
```

Verified directly: a `@Vial`/`inject()` consumer bundled with
`--target=es2022` runs correctly in a real browser tab and in a
workerd-shaped environment (`process`, `Bun`, `Deno`, `window`, and
`document` all absent). Doctor itself has zero runtime dependencies
beyond `@tundralibs/utils`'s `Singleton` — imported from its narrow
`@tundralibs/utils/Singleton` subpath, not the full barrel, so
`getFreePort`'s Node-builtin loading code (`node:net`/`tls`/…) never
enters the bundle. Confirmed empirically: the barrel import pulled
those strings in regardless of tree-shaking (they're module-level,
so not provably side-effect-free), the narrow subpath doesn't.

## The three injection idioms

```typescript ignore
class Handler {
  // EAGER — field initializer. Resolves while `new` runs; a missing
  // registration fails loudly at construction.
  logger = inject('Logger');

  // EAGER — constructor default parameter. Same timing; handy when
  // tests want to pass a double explicitly: new Handler(fakeDb).
  constructor(private db = inject('Db')) {}

  // LAZY — memoizing getter. Resolves on FIRST ACCESS.
  private __audit?: Audit;
  get audit(): Audit {
    return this.__audit ??= inject('Audit', 'jobs');
  }
}
```

### Lazy injection

Reach for the lazy-getter idiom when you need to:

- **break a dependency cycle** — two eager `inject()`s pointing at
  each other throw `CircularDependencyError` (each side re-enters the
  other's still-running construction); a getter on one side defers
  its resolution until both instances exist;
- **register after construction** — the vial only has to exist by
  first _access_, not by `new`;
- **keep a dependency out of serialization** — a getter lives on the
  prototype, so `JSON.stringify`/spread skip it; an eager field is an
  ordinary enumerable property.

Two rules come with lazy: give it an **explicit scope** when the
dependency is SCOPED (first access usually happens outside any
operation, where there is no [ambient scope](#scopes-and-the-ambient-operation-scope)
to inherit), and call [`Doctor.checkup()`](#boot-time-preflight-checkup)
at startup so a missing registration still fails at boot rather than
on first use.

## Lifecycles

| Mode        | One instance per … | Use for                                     |
| ----------- | ------------------ | ------------------------------------------- |
| `SINGLETON` | Process            | Stateless services: loggers, config readers |
| `SCOPED`    | Named scope        | Per-request state: DB connections, sessions |
| `TRANSIENT` | Resolution call    | Lightweight throwaway objects: validators   |

Singletons are constructed lazily on first resolution and cached on
**successful** construction — a failed construction caches nothing,
so registering the missing dependency and retrying just works.

Depending on a **SCOPED** vial from a SINGLETON is a
captive-dependency hazard: the singleton is built exactly once, under
whichever scope its first resolution happens to carry, and that
scope's instance stays captive in the singleton for its whole
lifetime. SCOPED resolutions themselves always require a scope —
asking for a SCOPED vial without one throws
[`ScopeRequiredError`](errors/Doctor-Errors.md#scoperequirederror).

## Scopes and the ambient operation scope

Every `Doctor.dispense(type, scope)` / `Doctor.resolve(type, scope)`
call makes its `scope` the **ambient operation scope** while it
constructs. Any `inject()` that runs during that construction — field
initializers, constructor defaults, nested vials' own initializers —
and names no scope of its own inherits it:

```typescript ignore
class UserHandler {
  db = inject('Database'); // SCOPED — no scope named here
  repo = inject('UserRepository'); // TRANSIENT, whose own fields inject 'Database'
}

const h = Doctor.resolve(UserHandler, `req-${id}`);
h.db === h.repo.db; // true — both resolved under `req-${id}`
```

Precedence: an explicit argument always wins —
`inject('Db', 'pinned')` resolves under `'pinned'` no matter what
operation is in flight. Outside any operation there is no ambient
scope, so a scope-less `inject()` of a SCOPED vial throws
`ScopeRequiredError` — loudly, at `new`.

End a request by dropping its scope:

```typescript ignore
Doctor.discharge(`req-${id}`); // drops every instance in that scope
```

## Boot-time preflight: checkup()

```typescript ignore
Doctor.checkup(); // eagerly dispenses every registered SINGLETON
```

Constructs every SINGLETON now, so a missing registration or a
throwing factory fails at startup instead of deep inside the first
request that touches it — the counterweight to lazy getters. SCOPED
and TRANSIENT vials are skipped (no scope to resolve under; nothing
to warm). Returns the number of singletons dispensed.

See it catch a real missing dependency, then pass once the
dependency registers, in the
[lazy-and-cycles example](examples/lazy-and-cycles/) (Scenarios 1–2).

## Vials with constructor arguments

Doctor constructs vials with a bare `new Klass()` by default — a
class needing arguments registers a `factory`:

```typescript ignore
class Database {
  constructor(public readonly url: string) {}
}

Doctor.prescribe(Database, {
  mode: 'SCOPED',
  factory: () => new Database(Deno.env.get('DATABASE_URL')!),
});
```

The decorator form accepts the same options object:

```typescript ignore
@Vial({ mode: 'SCOPED', factory: () => new Database(env.URL) })
class Database { ... }
```

## Import-free injection with tokens

`inject('Token')` resolves a vial by its class-name token, so a consumer never
imports the dependency class. The return type comes from a `VialRegistry` you
generate from your `@Vial` classes with `@tundralibs/doctor/build`:

```typescript ignore
// dev/CI step (Deno)
import { build } from '@tundralibs/doctor/build';
await build({ roots: ['./src'], out: './src/vial-registry.ts' });
```

```typescript ignore
import './vial-registry.ts'; // the generated type augmentation
import { inject } from '@tundralibs/doctor';

const config = inject('Config'); // typed as Config — no `import { Config }`
```

The build step itself is **Deno-only** — it walks files with
`Deno.readDir` / `Deno.writeTextFile`, which is why the `./build` subpath is
exported from `deno.json` only (not `package.json`). The registry file it
emits is plain type declarations, consumed unchanged on every runtime.

The token is the class name, so names must be unique and survive minification.
See [inject](docs/Doctor-Inject.md) and [build](docs/Doctor-Build.md) for the
full API and caveats.

## Ready-made values — `label` + `stock`

Not everything is a class Doctor can `new`: a connected database, a
parsed config object, a client built by an `await`. Stock such a value
under a typed **label** and `inject` it — typed, with no `VialRegistry`
augmentation:

```typescript
import { Doctor, inject, label } from '@tundralibs/doctor';

type BlogDb = { repo(name: string): unknown };
declare const db: BlogDb;

export const Db = label<BlogDb>('Db'); // a typed label: name + contents
Doctor.stock(Db, db); // stock a ready-made value under it

class Posts {
  db = inject(Db); // typed as BlogDb, no module augmentation
}
```

A stocked value is handed out as-is on every dispense — a singleton by
nature (a function is a value too: returned, never called). For a
non-class thing that needs a lifecycle, stock a **factory** and pick a
mode; it runs through the same engine as class vials:

```typescript
import { Doctor, label } from '@tundralibs/doctor';

type Conn = { query(sql: string): unknown };
declare function connect(): Conn;

export const Db = label<Conn>('Db');
Doctor.stock(Db, { mode: 'SCOPED', factory: () => connect() });
// Doctor.dispense(Db, 'req-7') connects once per scope; discharge('req-7') drops it
```

| Form                              | Lifecycle                                          |
| --------------------------------- | -------------------------------------------------- |
| `stock(label, value)`             | SINGLETON by nature — the same object every time   |
| `stock(label, { mode, factory })` | `SINGLETON` / `SCOPED` / `TRANSIENT`, as for vials |

Labels are keyed by **name**: `inject('Db')` and
`Doctor.dispenseByName('Db')` reach the same entry (the string form is
typed only once `Db` is in `VialRegistry`). `Doctor.has(Db)` checks for
an optional service; `Doctor.revoke(Db)` drops one — caches included —
so a test can stock a fake in its place without `reset()`.

Two caveats, both by design:

- **No async factories.** Injection runs inside field initializers,
  which are synchronous. `await` the setup, then stock the result.
- **SCOPED means an explicit scope name** plus `Doctor.discharge(scope)`
  when you are done — the scope a `Doctor.resolve(Handler, scope)`
  operation carries, not an ambient per-request context.

Full API in [stock](docs/Doctor-Stock.md).

## Modules

| Module       | Description                                                  | Documentation                            |
| ------------ | ------------------------------------------------------------ | ---------------------------------------- |
| `Doctor`     | Process-wide injector (register, dispense, resolve, checkup) | This page                                |
| `inject`     | Resolve by label, by class, or by token (class name)         | [Doctor-Inject](docs/Doctor-Inject.md)   |
| `stock`      | Typed labels for ready-made values and labelled factories    | [Doctor-Stock](docs/Doctor-Stock.md)     |
| `@Vial`      | Class decorator — registers the class                        | [Doctor-Vial](docs/Doctor-Vial.md)       |
| `./build`    | Codegen (Deno-only) — `VialRegistry` from `@Vial` classes    | [Doctor-Build](docs/Doctor-Build.md)     |
| `./errors`   | `DoctorError`, `UnregisteredVialError`, ...                  | [Doctor-Errors](errors/Doctor-Errors.md) |
| `./types`    | `Vial`, `VialModes`, `VialOptions`, `Label`, `StockOptions`  | —                                        |
| `./examples` | Runnable multi-file examples                                 | [examples/](examples/)                   |

## Examples

Three runnable multi-file examples live under
[`packages/doctor/examples/`](examples/):

- **[web-app/](examples/web-app/)** — `Doctor.resolve(Class, scope)`
  for per-request scope variation. SINGLETON config + logger, SCOPED
  database per request, TRANSIENT repository, plain handler resolved
  per call. Demonstrates lazy singletons, the ambient operation
  scope, scope isolation, and cleanup via `discharge`.
- **[cli-tool/](examples/cli-tool/)** — one-shot CLIs where every
  dependency is a singleton: plain command classes wired by their
  `inject()` fields on `new`, no per-call scoping.
- **[lazy-and-cycles/](examples/lazy-and-cycles/)** — a lazy getter
  breaking an eager/eager cycle, `Doctor.checkup()` catching a
  missing dependency at boot, deferred vial registration, and a live
  `CircularDependencyError` from a cycle nothing breaks.

Run them:

```bash
deno run packages/doctor/examples/web-app/main.ts
deno run packages/doctor/examples/cli-tool/main.ts hello Alice
deno run packages/doctor/examples/lazy-and-cycles/main.ts
```

See [examples/web-app/README.md](examples/web-app/README.md),
[examples/cli-tool/README.md](examples/cli-tool/README.md), and
[examples/lazy-and-cycles/README.md](examples/lazy-and-cycles/README.md)
for walkthroughs and expected output.

## Related Documentation

- [inject](docs/Doctor-Inject.md) — resolve by label, by class, or by token
- [stock](docs/Doctor-Stock.md) — typed labels for ready-made values and labelled factories
- [build](docs/Doctor-Build.md) — generate the `VialRegistry` from `@Vial` classes
- [@Vial](docs/Doctor-Vial.md) — registration decorator
- [Errors](errors/Doctor-Errors.md) — error classes and matching strategies
- [web-app example](examples/web-app/) — per-request scoping via `Doctor.resolve`
- [cli-tool example](examples/cli-tool/) — singleton wiring with plain `new`
- [lazy-and-cycles example](examples/lazy-and-cycles/) — lazy getters, `checkup()`, deferred registration, `CircularDependencyError`

## License

MIT
