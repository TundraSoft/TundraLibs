---
applyTo: 'packages/**/*.ts'
description: 'Development guidance for TundraLibs package source — points at the single-source standards, adds the load-bearing reminders.'
---

# Development Instructions

You are writing or changing package **source**. This file is a thin pointer, not
a second rulebook — the standards live in one place and are not restated here.

- **Coding standards → [CONVENTIONS.md](../../CONVENTIONS.md)** (single source):
  file/folder naming, one exported type per file under `types/`, errors under
  `errors/` extending `BaseError`, privacy `__`/`_` prefixes (never `#`),
  imports through folder barrels, module constants `UPPER_SNAKE_CASE`. Read it
  before adding new code.
- **Workflow, commands, package map → [AGENTS.md](../../AGENTS.md)**: the golden
  rules, `deno task test/fmt/lint/check`, one-package-per-PR, release-please
  ownership of versions.

Load-bearing reminders while you code (each expanded in the sources above):

- **Cross-runtime always.** Targets are Deno, Bun, Node, Cloudflare Workers,
  and the browser — code must run on all five unless the package documents
  otherwise. Never touch a runtime-only global directly — go through
  `@tundralibs/compat`, or you break a runtime silently. A capability a target
  lacks (fs, sockets, a listening server) must degrade to a clear
  `UnsupportedRuntimeError`, never a raw `TypeError`; feature-detect with
  `isWorkers` / `isBrowser` / `RUNTIME` from `@tundralibs/compat/runtime`.
- **Verify, don't assert.** Check a symbol/default/behavior in source before
  relying on it. Confident-but-wrong is this repo's recurring failure mode.
- **No slop.** Minimal diffs; no speculative abstractions, no filler comments,
  no code that only restates what the type-checker already proves.
- **Public API is a contract.** A new export must not reference a non-exported
  type (`private-type-ref`) and must survive `deno publish`'s slow-type check;
  its behavior and traps belong in its JSDoc (that is what reaches consumers on
  import).
- Tests for new behavior are required — see
  [testing.instructions.md](testing.instructions.md); docs stay true — see
  [documentation.instructions.md](documentation.instructions.md).
