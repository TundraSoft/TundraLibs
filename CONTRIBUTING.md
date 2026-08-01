# Contributing to TundraLibs

Thanks for contributing! This is a cross-runtime TypeScript monorepo —
everything must work on **Deno, Bun, and Node.js**. This guide covers
the workflow; the pipelines enforce most of it automatically.

## Prerequisites

- [Deno](https://deno.com) 2.x (primary toolchain: fmt, lint, check, publish)
- [Bun](https://bun.sh) 1.x (npm-side installs + test runner)
- [Node.js](https://nodejs.org) 22+

## Setup

```bash
git clone <repo>
cd TundraLibs
bun install          # node_modules for the Bun/Node test runs
deno task test       # runs the Deno test suite
```

Run the full cross-runtime suite the way CI does:

```bash
deno task test                                    # Deno
bun test packages/                                # Bun
node --import tsx --test 'packages/**/*.test.ts'  # Node.js
```

## Workflow

1. **Branch** off `main`, do your work.
2. **One package per PR.** A PR touching multiple `packages/*` dirs
   fails the `Single-package guard` check. If the change is genuinely
   atomic (e.g. a breaking change plus its downstream fixes), add the
   `multi-package` label.
3. **PR title must be a conventional commit** — it becomes the squash
   commit on `main` and drives changelogs and version bumps:

   ```
   type(scope): description

   type:  feat | fix | docs | refactor | perf | test | build | ci | chore | revert
   scope: the package dir (restler, compat, ...) or global
   feat!: / BREAKING CHANGE: footer for breaking changes
   ```

4. **CI must be green**: format, lint, type-check, dependency audit,
   JSR publish dry-run, and the test matrix across all three runtimes.
5. **Squash-merge.** Branch commits can be messy; the title is what
   lands.

## Ground Rules

- **Cross-runtime always** — no `Deno.*`/`Bun.*` globals in package
  source; use `@tundralibs/compat` for runtime-specific capabilities.
- **Hermetic tests** — no network calls to external services. Stub
  transports (e.g. the `_fetch` seam) or run a local server in the
  suite.
- **Never `--no-check`.**
- **Format and lint before pushing**: `deno task fmt && deno task lint`.
- **JSDoc and docs** follow
  [.github/instructions/documentation.instructions.md](.github/instructions/documentation.instructions.md)
  — each package's main doc is its `README.md`; sub-docs are
  `{Package}-{Topic}.md`.
- **Tests** follow
  [.github/instructions/testing.instructions.md](.github/instructions/testing.instructions.md)
  — `describe`/`it` from `@tundralibs/compat/test` so suites run on all
  three runtimes.

## Adding or Removing a Package

Use the workspace tool — it scaffolds the package and regenerates every
config that enumerates packages (release config, labels, issue
templates, wiki mapping):

```bash
deno task workspace:add MyPkg      # casing of 'MyPkg' = display/wiki name
deno task workspace:remove mypkg
deno task workspace:sync           # re-sync after manual changes
```

CI fails with instructions if the generated files drift.

## Releases (maintainers)

Versioning is automated — **do not bump versions or edit changelogs by
hand**. release-please reads the conventional commits on `main`,
maintains one release PR per package, and merging a release PR tags and
publishes that package to JSR. Your only job as a contributor is a
correct PR title.

## Security

Do not report vulnerabilities in public issues — see
[SECURITY.md](SECURITY.md).
