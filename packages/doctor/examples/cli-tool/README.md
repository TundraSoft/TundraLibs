# CLI-tool example

A one-shot command-line tool with two commands (`hello`, `stats`)
sharing the same Doctor-managed services.

| File                       | Role                                                                                                                                             |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Config.ts`                | Settings holder with required constructor arguments                                                                                              |
| `registry.ts`              | Registers `CliConfig` via `Doctor.prescribe(..., factory)`, side-effect-imports the `@Vial` classes, and carries the `VialRegistry` augmentation |
| `Logger.ts`                | `@Vial('SINGLETON')`, `inject('CliConfig')` field                                                                                                |
| `Greeter.ts`               | `@Vial('SINGLETON')`, depends on CliConfig + CliLogger                                                                                           |
| `commands/HelloCommand.ts` | Plain class, `inject('Greeter')` field                                                                                                           |
| `commands/StatsCommand.ts` | Plain class, `inject()` fields for CliConfig + CliLogger                                                                                         |
| `main.ts`                  | argv dispatcher                                                                                                                                  |

## Running

```bash
deno run packages/doctor/examples/cli-tool/main.ts hello Alice
deno run packages/doctor/examples/cli-tool/main.ts stats
```

## Expected output

```
$ deno run main.ts hello Alice
[greeter-cli v1.0.0] greeting: Hey Alice!
Hey Alice!

$ deno run main.ts stats
[greeter-cli v1.0.0] stats command invoked
app    : greeter-cli
version: 1.0.0
```

## What this example shows

| Aspect                               | Where                                                                                                                                                                                                                                               |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Wiring on plain `new`**            | [`HelloCommand.ts`](commands/HelloCommand.ts), [`StatsCommand.ts`](commands/StatsCommand.ts). `new Command()` is enough — the `inject()` field initializers resolve during construction, and every dependency is a SINGLETON so no scope is needed. |
| **Singleton cascade**                | `Greeter` is a SINGLETON whose fields `inject()` CliLogger and CliConfig. Doctor builds the chain on first resolve.                                                                                                                                 |
| **Factory for required-arg classes** | [`registry.ts`](registry.ts) hands Doctor a factory for `CliConfig` since the class takes two strings.                                                                                                                                              |
| **Side-effect registration**         | `@Vial` registers at class definition — [`registry.ts`](registry.ts) imports `Logger.ts`/`Greeter.ts` for that side effect. Forget one and its consumers throw `UnregisteredVialError` at `new`.                                                    |
| **Folder organisation**              | Commands live in their own `commands/` subfolder — natural for any CLI as it grows.                                                                                                                                                                 |

## CLI vs. web-app — when to use which pattern

The [web-app example](../web-app/) uses
`Doctor.resolve(Class, scope)` because each HTTP request needs its
own SCOPED Database instance — the scope name varies per call, and
`resolve` makes it the ambient scope for everything constructed
within.

This CLI just uses `new` because every invocation of every command
runs against the same singletons — there's nothing to scope per
call.

Rule of thumb:

- **Scope varies per call?** Use `Doctor.resolve(Class, scope)`.
- **Scope fixed (or absent)?** Plain `new` — the `inject()` fields
  (with an explicit scope argument, if any) do the rest.
