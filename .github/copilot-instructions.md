# GitHub Copilot instructions

The repo-wide guidance for any AI working in this codebase lives in
[`/AGENTS.md`](../AGENTS.md) (development baseline, commands, conventions, and
the package map) and [`/CONVENTIONS.md`](../CONVENTIONS.md) (coding standards).
Read those first.

Task-specific guidance is auto-applied from `.github/instructions/*.instructions.md`
by their `applyTo` scopes:

- `documentation.instructions.md` — Markdown docs and JSDoc
- `testing.instructions.md` — `*.test.ts` / `*.bench.ts`
- `package-review.instructions.md` — code review and package audits

Do not duplicate content here — this file is a pointer so every tool
(Copilot, Claude Code, Cursor, Codex) resolves to the same single source.
