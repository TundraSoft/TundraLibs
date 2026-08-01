# Repository Settings Checklist

Manual GitHub settings required for the CI/release pipeline. Settings do
**not** travel with a file copy — apply these on `TundraSoft/TundraLibs`
when migrating (and optionally on the staging repo to validate).

## 1. General (Settings → General)

- [ ] **Pull Requests**: allow **squash merging only** — disable "Allow
      merge commits" and "Allow rebase merging". The squashed commit
      message is what release-please parses, so this is load-bearing.
- [ ] **Default commit message** for squash: "Pull request title" (the
      PR title is lint-enforced as conventional; branch commits are not).
- [ ] Enable **Automatically delete head branches**.
- [ ] **Wikis**: enabled (wiki-sync publishes there).

## 2. Branch protection / ruleset for `main` (Settings → Rules)

- [ ] Require a pull request before merging (no direct pushes).
- [ ] Require status checks to pass. Required check names:
  - `Format, lint, type-check`
  - `Dependency audit (high+)`
  - `JSR publish dry-run`
  - `Test (deno)` / `Test (bun)` / `Test (node-22)` / `Test (node-24)`
  - `Conventional PR title`
  - `Single-package guard`
- [ ] Require branches to be up to date before merging (optional but
      recommended once traffic grows).
- [ ] Do **not** enable "require linear history" enforcement beyond
      squash-only — squash merging already guarantees it.

## 3. Labels (Settings → Labels — or `gh label create`)

The labeler and guard reference these; actions/labeler does not create
missing labels.

- [ ] `multi-package` — escape hatch for the single-package guard.
- [ ] `pkg: <name>` for every package: `pkg: cacher`, `pkg: compat`,
      `pkg: crypt`, `pkg: doctor`, `pkg: drivers`, `pkg: guardian`,
      `pkg: id`, `pkg: metro-man`, `pkg: norm`, `pkg: oql`,
      `pkg: radrouter`, `pkg: restler`, `pkg: rpc`, `pkg: slogger`,
      `pkg: utils`.
- [ ] `infra`, `dependencies`, `ci-health`.

One-shot script:

```bash
gh label create multi-package -c '#d93f0b' -d 'Deliberate cross-package change'
gh label create ci-health -c '#b60205' -d 'Weekly health run failure'
gh label create infra -c '#c5def5' -d 'CI / tooling / workflows'
gh label create dependencies -c '#0366d6' -d 'Dependency updates'
for p in cacher compat crypt doctor drivers guardian id metro-man norm oql radrouter restler rpc slogger utils; do
  gh label create "pkg: $p" -c '#1d76db' -d "Package: $p"
done
```

## 4. Actions (Settings → Actions → General)

- [ ] Workflow permissions: **Read repository contents** (workflows
      declare their own elevated permissions per job).
- [ ] "Allow GitHub Actions to create and approve pull requests":
      **enabled** (release-please opens PRs).

## 5. Secrets (Settings → Secrets and variables → Actions)

- [ ] `RELEASE_PLEASE_TOKEN` — fine-grained PAT, this repo only, with
      **Contents: read/write** and **Pull requests: read/write**.
      Why: PRs created by the default `GITHUB_TOKEN` do not trigger
      workflows, so release PRs would never get their required CI
      checks. The workflow falls back to `GITHUB_TOKEN` if unset.
- [ ] Nothing else — JSR publishing is tokenless (OIDC).

## 6. Security (Settings → Advanced Security)

Free on the public repo:

- [ ] Enable **Secret scanning** and **Push protection**.
- [ ] Enable **Private vulnerability reporting** (SECURITY.md directs
      reporters to the Security tab).
- [ ] Enable **Dependabot alerts** (version-update PRs come from
      `.github/dependabot.yml` automatically).
- [ ] Enable **Dependabot security updates** — auto-opens PRs that fix
      vulnerable npm-side dependencies (better than an alert or issue:
      the fix arrives as a mergeable PR).
- [ ] Do **not** enable CodeQL "default setup" — the repo ships an
      advanced-setup workflow (`codeql.yml`); the two conflict.

## 7. JSR (jsr.io — at first publish, not before)

- [ ] Create the `@tundralibs` scope (if not already owned).
- [ ] Create each package under the scope.
- [ ] Link each package to the `TundraSoft/TundraLibs` GitHub repo
      (enables tokenless OIDC publish + provenance).
- [ ] First-wave publish must go dependency-order (bottom-up):
      `utils` → `compat` → everything else (workspace deps must exist
      on JSR before dependents publish). After the first wave, order
      no longer matters.

## 8. Publish arming

The publish job in `release-please.yml` is hard-gated to
`github.repository == 'TundraSoft/TundraLibs'` — the staging repo can
merge release PRs to rehearse the pipeline without ever publishing.
No action needed; noted so the gate isn't "fixed" as a bug.
