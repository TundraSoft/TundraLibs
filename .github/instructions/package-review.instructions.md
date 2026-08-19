---
applyTo: '**'
description: 'Code-review and package-audit guidance for TundraLibs — verification-first, correctness-led, tool-neutral findings.'
---

# Review Instructions

Guidance for reviewing TundraLibs code. Works for any tool: the output is a set
of **findings**, which each tool renders its own way — inline PR comments
(Copilot, Cursor), a chat summary, or (in audit mode) a `REVIEW.md`. Write the
finding once, in the shape below; the rendering is the tool's job.

## Two modes

- **Change review (default).** Review a diff / PR / branch. Report findings on
  the changed lines and anything the change breaks. This is what Copilot and
  Cursor do on a PR, and the common case.
- **Package audit (explicit only).** A full read of one package, producing a
  findings report. Only when asked for a full audit — never as a side effect of
  a change review. **Do not commit the report inside `packages/<pkg>/`** — every
  file there ships in the JSR tarball to consumers, and review notes must not.
  Deliver it as chat/PR output, a tracking issue, or a file *outside* the
  package (e.g. repo-root `reviews/`, which is not published). Format at the end.

## The one rule: verify before you report

Every finding must be checked against the actual code before it is written. This
repo has repeatedly been bitten by confident-but-wrong claims — a review that
invents a bug is worse than one that misses it, because someone acts on it.

- Read the surrounding code and the symbol's definition. Do not report from the
  diff alone.
- State a **failure scenario**: concrete inputs/state → wrong output/crash. If
  you cannot, it is not a finding.
- Prefer **few high-confidence findings** over many speculative ones. Mark
  confidence when unsure; drop it if you cannot substantiate it.

## What to look for (most-severe first)

1. **Correctness / bugs** — wrong output, crashes, unhandled cases, off-by-one,
   race conditions (TOCTOU, concurrent access), resource leaks (unclosed
   handles/connections), broken error propagation.
2. **Security** — input validation (path traversal, injection, malformed
   input), data/secret exposure, permission bypass, resource-exhaustion DoS,
   weak crypto or key handling.
3. **API / usability** — inconsistent patterns for similar operations, unclear
   or inconsistent throw-vs-return, missing async/sync variant, footgun
   ergonomics, weak type safety where a compile-time guarantee is possible.
4. **Performance** — an actual complexity or allocation problem with a plausible
   real-world impact (O(n²) on unbounded input, redundant work in a hot path,
   missing streaming for large data). Not micro-optimizations.
5. **Tests & docs** — a code change with no test for the new behavior; a doc or
   JSDoc claim the change makes false.

## Repo-specific checks (high-signal here)

- **Docs must be true.** An example that does not compile, or a documented
  method/default/type/capability that does not exist in source, is a
  correctness bug — this repo ships docs in the tarball. Flag phantom
  capabilities and stale prose the same as code bugs.
- **Cross-runtime.** Any direct use of a Deno/Bun/Node-only global instead of
  `@tundralibs/compat` breaks a runtime silently.
- **Consumer resolution.** A doc example importing a sibling `@tundralibs/*`
  package without telling the reader to install it fails for consumers.
- **Conventions** (see [CONVENTIONS.md](../../CONVENTIONS.md)): privacy `__`/`_`
  prefixes (not `#`), one exported type per file under `types/`, errors under
  `errors/` extending `BaseError`, imports through folder barrels. Flag
  deviations in *new* code only.
- **Public API / JSR.** A new export whose signature references a non-exported
  type (`private-type-ref`), or that would degrade under `deno publish`'s
  slow-type check.

## What NOT to flag

- Formatting, import ordering, or style — `deno fmt` / `deno lint` own these.
- Subjective preference, naming bikesheds, or "I would have written it
  differently" without a concrete defect.
- Pre-existing issues outside the change's scope (in change-review mode) —
  unless the change makes them materially worse. Note them separately at most.

## Finding shape (tool-neutral)

Each finding:

- **Location** — `path:line`
- **Severity** — critical / high / medium / low
- **What** — one sentence: the defect
- **Why / failure scenario** — the concrete path to wrong behavior
- **Fix** — a minimal suggested change (a diff or a sentence)

Rendered inline (Copilot/Cursor) that's the comment body; in a chat summary it's
a list item; in an audit it's a `REVIEW.md` entry. Always open the review with
one line of what was reviewed, and note genuinely good things briefly — reviews
that only criticize get tuned out.

## Tone

Constructive and specific. Explain *why*, give an actionable fix, acknowledge
good practices. Technical accuracy over volume.

## Audit mode: report format

Only for an explicit full-package audit. Deliver as chat/PR/issue output, or a
file **outside** the package (never `packages/<pkg>/REVIEW.md` — it would ship
to consumers):

```markdown
# <Package> Review

**Date:** <date> · **Scope:** <what was read>

## Summary

<one paragraph: overall health, headline findings>

## Findings

### <severity> — <one-line title>

**Location:** `path:line`
**Failure scenario:** <concrete path to wrong behavior>
**Fix:** <minimal change>

<repeat, most-severe first>

## What's already solid

- <briefly, the good parts>
```

Keep it a flat, verified findings list ordered by severity — not a
progress-tracker. Track remediation in PRs and issues, not by editing this file.
