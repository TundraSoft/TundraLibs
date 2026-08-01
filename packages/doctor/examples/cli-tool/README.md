# CLI-tool example

A one-shot command-line tool with two commands (`hello`, `stats`)
sharing the same Doctor-managed services.

| File                       | Role                                                    |
| -------------------------- | ------------------------------------------------------- |
| `Config.ts`                | Settings holder with required constructor arguments     |
| `registry.ts`              | Registers `Config` via `Doctor.prescribe(..., factory)` |
| `Logger.ts`                | `@Vial('SINGLETON')`, `@Dose` Config                    |
| `Greeter.ts`               | `@Vial('SINGLETON')`, depends on Config + Logger        |
| `commands/HelloCommand.ts` | `@Inoculate()` handler, `@Dose` Greeter                 |
| `commands/StatsCommand.ts` | `@Inoculate()` handler, `@Dose` Config + Logger         |
| `main.ts`                  | argv dispatcher                                         |

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

| Aspect                               | Where                                                                                                                                                                                                    |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`@Inoculate()` with no scope**     | [`HelloCommand.ts`](commands/HelloCommand.ts), [`StatsCommand.ts`](commands/StatsCommand.ts). Constructing with plain `new Command()` is enough — every dependency is a SINGLETON so no scope is needed. |
| **Singleton cascade**                | `Greeter` is a SINGLETON that `@Dose`s Logger and Config. Doctor builds the chain on first resolve.                                                                                                      |
| **Factory for required-arg classes** | [`registry.ts`](registry.ts) hands Doctor a factory for `Config` since the class takes two strings.                                                                                                      |
| **Folder organisation**              | Commands live in their own `commands/` subfolder — natural for any CLI as it grows.                                                                                                                      |

## CLI vs. web-app — when to use which pattern

The [web-app example](../web-app/) uses
`Doctor.resolve(Class, scope)` because each HTTP request needs its
own SCOPED Database instance — the scope name varies per call.

This CLI uses `@Inoculate()` because every invocation of every
command runs against the same singletons — there's nothing to
scope per call. The decoration-time form is simpler when it fits.

Rule of thumb:

- **Scope varies per call?** Use `Doctor.resolve(Class, scope)`.
- **Scope fixed (or absent)?** Use `@Inoculate(scope?)` and `new`.
