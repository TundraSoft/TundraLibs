<!--
PR title MUST be a conventional commit — it becomes the squash commit
on main and drives changelogs and version bumps:

  type(scope): description
  types: feat fix docs refactor perf test build ci chore revert
  scope: the package dir (restler, compat, ...) or global
  breaking: feat!(scope): ... or a BREAKING CHANGE: footer
-->

## What

<!-- What does this PR change, and why? -->

## Checklist

- [ ] Touches **one package only** (or carries the `multi-package` label
      for a genuinely atomic cross-package change)
- [ ] Tests pass on all three runtimes (`deno task test`,
      `bun test packages/`, `node --import tsx --test 'packages/**/*.test.ts'`)
- [ ] `deno task fmt && deno task lint && deno task check` clean
- [ ] Tests are hermetic (no external network; stub transports or run a
      local server)
- [ ] Docs updated where behaviour changed (package README / JSDoc per
      [documentation.instructions.md](instructions/documentation.instructions.md))
- [ ] No hand-edited versions or changelogs (release-please owns those)
