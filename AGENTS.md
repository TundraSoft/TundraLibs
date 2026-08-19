# TundraLibs — agent guide

A monorepo of independent, cross-runtime TypeScript libraries (Deno + Bun +
Node.js), published to [JSR](https://jsr.io) under `@tundralibs`. This file is
the always-on baseline for any AI working **in** this repo. It is read
automatically by Claude Code, Cursor, and Codex (via `AGENTS.md`) and by GitHub
Copilot (via `.github/copilot-instructions.md`, which points here).

## Golden rules

- **Every package runs identically on Deno, Bun, and Node.** Never use a
  runtime-only global directly — go through `@tundralibs/compat`.
- **One package per PR.** A change spanning packages needs the `multi-package`
  label and a clear reason. Conventional-commit PR titles (`feat(oql): …`,
  `docs(guardian): …`, `fix(compat): …`).
- **Never hand-edit versions or changelogs.** release-please owns them from
  conventional commits. `.release-please-manifest.json`,
  `release-please-config.json`, `.github/labeler.yml`, `.github/codecov.yml`,
  and the issue templates are **generated** by `deno task workspace:sync` — edit
  the generator (`.github/scripts/workspace.ts`), never the output.
- **Docs are shipped code and must be true.** README/`docs/*.md` travel in the
  JSR tarball to consumers. Every `` ```ts `` block must compile
  (`deno check --doc-only`); non-code blocks are tagged `` ```ts ignore ``.
  Examples use public specifiers (`@tundralibs/<pkg>`), never relative imports.
  Never document a capability the code does not have.
- **Verify, don't assert.** Before claiming a symbol/default/behavior, check it
  in source. This repo has been bitten repeatedly by confident-but-wrong claims.
- **No slop.** Every line you add — code, test, comment, or doc — must earn its
  place. Minimal diffs; no speculative abstractions, no filler prose, no
  restating what the type-checker already proves. Each task's instructions carry
  a concrete anti-slop rule (docs: a length budget; tests: a test must be able
  to fail; review: verify before reporting) — follow them.

## Commands

```bash
deno task test          # full suite (also: bun test packages/ , node --import tsx --test)
deno task check         # type-check every package barrel
deno task fmt           # format (check: deno fmt --check)
deno task lint          # lint
deno task workspace:add <Name>      # scaffold a package + regenerate config
deno task workspace:sync            # regenerate all generated files
```

Before opening a PR: `deno task fmt && deno task lint && deno task check && deno task test`.

## Conventions

Coding standards live in [CONVENTIONS.md](CONVENTIONS.md) — read it before
writing new code. The load-bearing ones: privacy via `__`/`_` prefixes (not
`#`), one exported type per file under `types/`, errors under `errors/` extending
`BaseError`, module constants `UPPER_SNAKE_CASE`, imports through folder barrels.

## Task-specific instructions

When the task matches, read the matching file (Copilot auto-applies them via
`applyTo`; other tools: read them when the task calls for it):

| Task                                     | Read                                                                                                       |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Writing/changing package source          | [.github/instructions/development.instructions.md](.github/instructions/development.instructions.md)       |
| Writing/editing docs or JSDoc            | [.github/instructions/documentation.instructions.md](.github/instructions/documentation.instructions.md)   |
| Writing/changing tests                   | [.github/instructions/testing.instructions.md](.github/instructions/testing.instructions.md)               |
| Reviewing a change or auditing a package | [.github/instructions/package-review.instructions.md](.github/instructions/package-review.instructions.md) |

Specialized subagent personas live in [.github/agents/](.github/agents/).

## Which package for which job

| Need                                                                                              | Package                                                                    |
| ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| ORM / model layer over a schema                                                                   | `norm`                                                                     |
| Build a typed query, translate to SQL/Mongo                                                       | `oql`                                                                      |
| Connect/pool a database (SQL, Mongo, Redis, Memcached, edge HTTP)                                 | `drivers`                                                                  |
| HTTP router                                                                                       | `radrouter` · WebSocket RPC + pub/sub: `rpc` · REST client base: `restler` |
| Runtime shim (webserver, fetch, fs, net, runtime detect)                                          | `compat`                                                                   |
| Logging: `slogger` · tracing: `tracer` · metrics: `metro-man` · request-scoped context: `ambient` |                                                                            |
| Validation                                                                                        | `guardian` · schema at API boundaries                                      |
| Auth (bitmask authz + JWT/OAuth)                                                                  | `pact` · crypto primitives: `crypt`                                        |
| IDs (NanoID/CUID/ULID/ObjectID)                                                                   | `id` · caching: `cacher` · cron: `cronus` · DI: `doctor`                   |
| Options+Events base, BaseError, config/env/memoize/IP helpers                                     | `utils`                                                                    |
