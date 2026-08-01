# Doctor

Lightweight, decorator-driven dependency injection for Deno, Bun, and Node.js.

![Deno](https://img.shields.io/badge/Deno-000000?logo=deno)
![Bun](https://img.shields.io/badge/Bun-f9f1e1?logo=bun)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)

## Overview

Doctor is a small DI container built around three decorators:

- `@Vial(mode)` — register a class under a lifecycle (`SINGLETON`,
  `SCOPED`, or `TRANSIENT`).
- `@Dose()` — mark a property as injectable. Reads the runtime
  type from `reflect-metadata`, so the consumer's TypeScript must
  have `emitDecoratorMetadata: true`.
- `@Inoculate(scope?)` — wrap a class so every `new` call fills
  its `@Dose` properties automatically. The scope (if given) is
  captured at decoration time and reused for every instance.

The registry is a process-wide singleton exported as
`Doctor`. Decorators talk to it; consumers usually don't have to.

## Modules

| Module       | Description                                               | Documentation                                |
| ------------ | --------------------------------------------------------- | -------------------------------------------- |
| `Doctor`     | Process-wide injector instance (register, resolve, treat) | This page                                    |
| `inject`     | Resolve a vial by token (class name), import-free         | [Doctor-Inject](docs/Doctor-Inject.md)       |
| `@Vial`      | Class decorator — registers the class                     | [Doctor-Vial](docs/Doctor-Vial.md)           |
| `@Dose`      | Property decorator — marks injectable                     | [Doctor-Dose](docs/Doctor-Dose.md)           |
| `@Inoculate` | Class decorator — auto-inject on `new`                    | [Doctor-Inoculate](docs/Doctor-Inoculate.md) |
| `./build`    | Codegen (Deno-only) — `VialRegistry` from `@Vial` classes | [Doctor-Build](docs/Doctor-Build.md)         |
| `./errors`   | `DoctorError`, `UnregisteredVialError`, ...               | [Doctor-Errors](errors/Doctor-Errors.md)     |
| `./types`    | `Prescription`, `Vial`, `VialModes`                       | —                                            |
| `./examples` | Runnable multi-file example                               | [examples/](examples/)                       |

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

`reflect-metadata` is a runtime dependency. Import it once at your
entry point, before any decorator runs.

## TypeScript configuration

Decorators and runtime type emission must both be enabled:

```jsonc
// tsconfig.json
{
  "compilerOptions": {
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true
  }
}
```

For Deno, the same flags live under `compilerOptions` in your `deno.json`.
Recent Deno defaults to the TC39 (stage-3) decorator transform, which does
**not** emit `design:type` — so these flags are required there too, not just on
Node/Bun.

`@Dose()` only works on toolchains that emit decorator metadata. Without it the
decorator throws
[`MissingDesignTypeError`](errors/Doctor-Errors.md#missingdesigntypeerror):

| Toolchain                            | Works | How                               |
| ------------------------------------ | ----- | --------------------------------- |
| **Deno**                             | ✅    | set both flags in `deno.json`     |
| **Bun**                              | ✅    | set both flags in `tsconfig.json` |
| **Node** — `tsc` / `ts-node` / `swc` | ✅    | set both flags in `tsconfig.json` |
| **Node + `tsx`, esbuild, Vite**      | ❌    | these do not emit `design:type`   |

JSR consumers get the same rule: Deno reads the source, while Node/Bun get the
transpiled package — every runtime must still emit metadata for **its own**
decorated classes.

The token-based [`inject`](docs/Doctor-Inject.md) API does not read
`design:type`, so it is unaffected by the esbuild/`tsx` limitation (it still
needs `experimentalDecorators` for `@Vial`).

## Quick Start

```typescript
import 'reflect-metadata';
import { Dose, Inoculate, Vial } from '@tundralibs/doctor';

@Vial('SINGLETON')
class Logger {
  log(msg: string) {
    console.log(`[log] ${msg}`);
  }
}

@Inoculate()
class App {
  @Dose()
  public logger!: Logger;
  start() {
    this.logger.log('app started');
  }
}

new App().start(); // [log] app started
```

## Lifecycles

| Mode        | One instance per … | Use for                                     |
| ----------- | ------------------ | ------------------------------------------- |
| `SINGLETON` | Process            | Stateless services: loggers, config readers |
| `SCOPED`    | Named scope        | Per-request state: DB connections, sessions |
| `TRANSIENT` | Resolution call    | Lightweight throwaway objects: validators   |

Singletons are constructed lazily on first resolution and cached
before property injection, so registration order never matters and
singleton ↔ singleton cycles resolve. Depending on a **SCOPED** vial
from a SINGLETON is a captive-dependency hazard, though: the
singleton is built exactly once, under whichever scope its first
resolution happens to carry — with no scope in flight that first
resolution throws
[`ScopeRequiredError`](errors/Doctor-Errors.md#scoperequirederror),
and otherwise that scope's instance stays captive in the singleton
for its whole lifetime. SCOPED resolutions themselves always require
a scope — asking for a SCOPED vial without one throws the same
error.

## Constructing with a scope

Two ways to attach a scope to a class:

- **Decoration-time default** — `@Inoculate('background-job')` bakes
  the scope into the class. Every `new MyClass()` uses it, and a plain
  subclass (`class Sub extends MyClass {}`, at any depth, with no `@Dose`
  of its own) inherits it — the base wrapper treats the subclass instance
  with the baked-in scope. Any level that adds its own `@Dose` fields —
  leaf or intermediate — must carry its own `@Inoculate`, and that
  decorator captures its **own** scope: repeat the argument
  (`@Inoculate('background-job')`) or a SCOPED base dependency throws
  `ScopeRequiredError` under a bare `@Inoculate()`. A `@Dose`-adding
  level with no `@Inoculate` makes `new` all-or-nothing (never a silent
  half-injection)
  (see [@Inoculate → Subclassing](docs/Doctor-Inoculate.md#subclassing)).
- **Per-call override** — `Doctor.resolve(MyClass, 'req-42')`
  constructs and treats with a caller-supplied scope.
  `Doctor.resolve` works on plain classes, on `@Inoculate`d
  classes (it avoids double injection — directly by unwrapping the
  wrapper, and for a subclass of an `@Inoculate`d base by suppressing
  the wrapper's auto-treat for that exact construction only), and on
  `@Vial`-registered classes — though for registered classes the
  canonical lookup is `Doctor.dispense`.

## Vials with constructor arguments

Doctor constructs vials with a bare `new Klass()` by default — so
any class needing arguments must register a `factory`:

```typescript
class Database {
  constructor(public readonly url: string) {}
}

Doctor.prescribe(Database, {
  mode: 'SCOPED',
  factory: () => new Database(Deno.env.get('DATABASE_URL')!),
});
```

The decorator form accepts the same options object:

```typescript
@Vial({ mode: 'SCOPED', factory: () => new Database(env.URL) })
class Database { ... }
```

## Import-free injection with tokens

`inject('Token')` resolves a vial by its class-name token, so a consumer never
imports the dependency class. The return type comes from a `VialRegistry` you
generate from your `@Vial` classes with `@tundralibs/doctor/build`:

```typescript
// dev/CI step (Deno)
import { build } from '@tundralibs/doctor/build';
await build({ roots: ['./src'], out: './src/vial-registry.ts' });
```

```typescript
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

## Examples

Two runnable multi-file examples live under
[`packages/doctor/examples/`](examples/):

- **[web-app/](examples/web-app/)** — `Doctor.resolve(Class, scope)`
  for per-request scope variation. SINGLETON config + logger,
  SCOPED database per request, TRANSIENT repository, plain handler
  resolved per call. Demonstrates lazy singletons, cascade, scope
  isolation, and cleanup via `discharge`.
- **[cli-tool/](examples/cli-tool/)** — `@Inoculate()` for one-shot
  CLIs where the scope is fixed (or absent). SINGLETON config +
  logger + greeter shared by multiple command classes constructed
  with plain `new`. Shows the smaller-shape pattern when you don't
  need per-call scoping.

The web-app's file layout:

| File                                                      | What it shows                                            |
| --------------------------------------------------------- | -------------------------------------------------------- |
| [`Config.ts`](examples/web-app/Config.ts)                 | A class with required constructor args                   |
| [`registry.ts`](examples/web-app/registry.ts)             | Registering it with `Doctor.prescribe(..., { factory })` |
| [`Logger.ts`](examples/web-app/Logger.ts)                 | `@Vial('SINGLETON')` with a `@Dose` dependency           |
| [`Database.ts`](examples/web-app/Database.ts)             | `@Vial('SCOPED')` — one instance per scope               |
| [`UserRepository.ts`](examples/web-app/UserRepository.ts) | `@Vial('TRANSIENT')` — fresh instance per resolve        |
| [`UserHandler.ts`](examples/web-app/UserHandler.ts)       | Plain class injected via `Doctor.resolve`                |
| [`main.ts`](examples/web-app/main.ts)                     | Lazy singletons, cascade, per-request scope, cleanup     |

Run it:

```bash
deno run packages/doctor/examples/web-app/main.ts
```

See [examples/web-app/README.md](examples/web-app/README.md) for the
walkthrough and expected output. The CLI tool's walkthrough is at
[examples/cli-tool/README.md](examples/cli-tool/README.md).

## Related Documentation

- [inject](docs/Doctor-Inject.md) — resolve a vial by token, import-free
- [build](docs/Doctor-Build.md) — generate the `VialRegistry` from `@Vial` classes
- [@Vial](docs/Doctor-Vial.md) — registration decorator
- [@Dose](docs/Doctor-Dose.md) — property decorator
- [@Inoculate](docs/Doctor-Inoculate.md) — class decorator
- [Errors](errors/Doctor-Errors.md) — error classes and matching strategies
- [web-app example](examples/web-app/) — per-request scoping via `Doctor.resolve`
- [cli-tool example](examples/cli-tool/) — `@Inoculate()` for one-shot CLIs

## License

MIT
