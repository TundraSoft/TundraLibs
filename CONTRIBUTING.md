# TundraLibs Development Guide

A comprehensive guide for contributing to the TundraLibs monorepo with Deno workspaces.

## 🚀 Quick Reference

### Common Commands

```bash
# Setup
deno task check && deno task test        # Verify everything works

# Development
deno task check                          # Run all quality checks
deno task test                          # Full test suite
deno task bench                         # Performance benchmarks
deno task security:all                  # Security vulnerability scan

# Branch workflow
git checkout -b feat/utils/my-feature   # Create feature branch
git commit -m "feat(utils): Add feature" # Conventional commit
```

### Quick Workflows

```bash
# 🐛 Bug Fix
git checkout -b fix/crypt/security-issue
# ... make fix ...
git commit -m "fix(crypt): Resolve security vulnerability"
# → PR created → @tundralibs/crypt@edge published

# ✨ New Feature  
git checkout -b feat/id/new-generator
# ... implement feature ...
git commit -m "feat(id): Add new ID generator with custom alphabet"
# → PR created → @tundralibs/id@edge published

# 🧪 Test Someone's PR
deno add @tundralibs/utils@1.2.0-edge.123.abc1234  # Use bleeding edge version

# 🚨 Emergency Publish
gh workflow run publish.yaml --field workspace=utils --field dryRun=false --field reason="Critical bug fix"
```

---

## 📋 Table of Contents

- [Project Structure](#project-structure)
- [Development Workflow](#development-workflow)
- [Branch Strategy](#branch-strategy)
- [Pull Request Guidelines](#pull-request-guidelines)
- [Adding New Workspaces](#adding-new-workspaces)
- [Release Process](#release-process)
- [Emergency Publishing](#emergency-publishing)
- [Quality Standards](#quality-standards)
- [Troubleshooting](#troubleshooting)

## 🏗️ Project Structure

TundraLibs is organized as a Deno workspace monorepo with the following structure:

```
TundraLibs/
├── crypt/          # @tundralibs/crypt - Cryptographic utilities
├── id/             # @tundralibs/id - ID generation utilities  
├── utils/          # @tundralibs/utils - General utility functions
├── .github/        # CI/CD workflows and templates
├── docs/           # Generated documentation
├── CHANGELOG.md    # Auto-generated changelog
└── deno.json       # Root workspace configuration
```

### Available Commands

```bash
# Quality checks
deno task check                 # Run all checks (format, lint, types)
deno task check:fmt            # Check code formatting
deno task check:lint           # Run linter
deno task check:types          # Type checking

# Testing
deno task test                 # Full test suite (tests + coverage + benchmarks)
deno task test:run             # Run tests with coverage
deno task test:bench           # Run benchmarks only
deno task bench                # Run benchmarks (separate)
deno task bench:json           # Run benchmarks with JSON output

# Workspace management
deno task workspace:add        # Add new workspace
deno task workspace:remove     # Remove workspace
deno task workspace:sync       # Sync workspace with workflows and issue templates
```

## 🔄 Development Workflow

### 1. Setting Up Your Environment

```bash
# Clone the repository
git clone https://github.com/tundralibs/tundralibs.git
cd tundralibs

# Ensure you have Deno v2.x installed
deno --version

# Run initial checks
deno task check
deno task test
```

### 2. Making Changes

```bash
# Create a feature branch (see Branch Strategy below)
git checkout -b feat/utils/add-cache-utility

# Make your changes in the appropriate workspace
cd utils/
# ... make changes ...

# Test your changes
cd ..
deno task check
deno task test

# Commit with conventional commits
git add .
git commit -m "feat(utils): Add LRU cache utility with TTL support"
```

## 🌿 Branch Strategy

### Branch Naming Convention

Follow this pattern: `<type>/<workspace>/<description>`

**Types:**

- `feat/` - New features
- `fix/` - Bug fixes
- `perf/` - Performance improvements
- `refactor/` - Code refactoring
- `docs/` - Documentation changes
- `test/` - Test improvements
- `chore/` - Maintenance tasks

**Examples:**

```bash
feat/crypt/add-aes-encryption     # New AES encryption feature
fix/id/nanoid-collision-bug       # Fix collision bug in nanoID
perf/utils/optimize-cache         # Performance optimization
docs/workflows/update-dev-guide   # Documentation update
```

### Branch Rules

#### ✅ **One Workspace Per PR**

```bash
# ✅ GOOD - Single workspace focus
feat/utils/add-throttle-function

# ❌ BAD - Multiple workspaces
feat/utils-and-crypt/add-utilities
```

#### ✅ **Workspace-Specific Branches**

- Each PR should focus on **ONE workspace only**
- Cross-workspace changes require separate PRs
- Exception: Documentation and workflow changes can span multiple areas

#### ✅ **Branch Lifecycle**

1. **Create** from `main`
2. **Develop** with regular commits
3. **Test** thoroughly before PR
4. **Submit** PR with proper title
5. **Delete** branch after merge

### 🚀 Edge Releases

When you create a PR, **edge versions** are automatically published for testing:

```bash
# Your PR automatically creates:
@tundralibs/utils@1.2.0-edge.123.abc1234    # Latest changes from PR #123
@tundralibs/crypt@2.1.0-edge.124.def5678    # Updated when crypt/ changes

# Anyone can test your changes immediately:
deno add @tundralibs/utils@1.2.0-edge.123.abc1234
```

#### Edge Release Behavior

- ✅ **Auto-published** when PR is created/updated
- ✅ **Workspace-specific** - only changed workspaces get edge releases
- ✅ **Unique versions** - each PR gets its own edge version with PR number and commit hash
- ✅ **PR comments** - Automatic notification with exact version strings

#### Testing Edge Versions

```bash
# Test someone's PR changes (exact version from PR comment)
deno add @tundralibs/crypt@2.1.0-edge.123.abc1234

# Use in development
import { encrypt } from '@tundralibs/crypt@2.1.0-edge.123.abc1234';

# Switch back to stable
deno add @tundralibs/crypt@2.1.0
```

⚠️ **Important**: Edge versions are **unstable** and should never be used in production.

---

## 📝 Pull Request Guidelines

### PR Title Format (Required)

Use [Conventional Commits](https://conventionalcommits.org/) format:

```
<type>(<scope>): <description>

Examples:
feat(crypt): Add RSA encryption support
fix(id): Fix ULID timestamp generation bug  
perf(utils): Optimize memoization performance
docs(workflows): Update development guide
BREAKING(utils): Remove deprecated Config.load method
```

**Available Scopes:**

- `crypt` - Cryptographic utilities
- `id` - ID generation utilities
- `utils` - General utilities
- `workflows` - GitHub Actions workflows
- `docs` - Documentation
- `deps` - Dependencies
- `release` - Release processes
- `emergency` - Emergency fixes

### PR Description Template

Your PR should include:

```markdown
## What Changed

Brief description of the changes made.

## Why

Explain the motivation behind these changes.

## Testing

- [ ] All existing tests pass
- [ ] New tests added for new functionality
- [ ] Benchmarks updated if performance-critical
- [ ] Manual testing completed

## Breaking Changes

List any breaking changes (if applicable).

## Related Issues

Fixes #123, Relates to #456
```

### PR Review Process

1. **Automated Checks** - All workflows must pass
2. **Code Review** - At least one approving review required
3. **Performance Check** - Benchmark results reviewed for regressions
4. **Quality Gates** - Linting, formatting, and type checking must pass

## ➕ Adding New Workspaces

### 1. Create Workspace Structure

```bash
# Use the workspace management script
deno task workspace:add

# Or manually create:
mkdir my-new-workspace
cd my-new-workspace
```

### 2. Create deno.json

```json
{
  "name": "@tundralibs/my-workspace",
  "version": "1.0.0-dev1",
  "description": "Description of your workspace",
  "exports": {
    ".": "./mod.ts"
  },
  "imports": {
    // Add any specific dependencies
  }
}
```

### 3. Create Core Files

```bash
# Main module export
touch mod.ts

# README documentation  
touch README.md

# Tests
touch my-feature.test.ts

# Benchmarks (if applicable)
touch my-feature.bench.ts
```

### 4. Update Root Configuration

Add your workspace to the root `deno.json`:

```json
{
  "workspace": [
    "./crypt",
    "./id",
    "./utils",
    "./my-new-workspace" // Add here
  ]
}
```

### 5. Update CI Configuration

Add workspace to `.github/labeler.yml`:

```yaml
my-workspace:
  - changed-files:
      - any-glob-to-any-file: my-workspace/*
```

Add scope to `.github/workflows/pr-title.yaml`:

```yaml
scopes: |-
  workflows
  crypt
  id
  utils
  my-workspace  # Add here
```

### 6. Submit Workspace Addition PR

```bash
git checkout -b feat/workflows/add-my-workspace
git add .
git commit -m "feat(workflows): Add my-workspace to monorepo"
git push origin feat/workflows/add-my-workspace
```

## 🚀 Release Process

### Automatic Releases (Recommended)

The release process is **fully automated** when PRs are merged to `main`:

1. **PR Merged** → Release pipeline triggers
2. **Change Detection** → Only proceeds if workspace files changed
3. **Changelog Update** → Automatically prepends new entry
4. **Version Bump** → Based on conventional commit type:
   - `BREAKING:` → Major version (1.0.0 → 2.0.0)
   - `feat:` → Minor version (1.0.0 → 1.1.0)
   - `fix:`, `perf:`, etc. → Patch version (1.0.0 → 1.0.1)
5. **JSR Publishing** → Only changed workspaces are published
6. **GitHub Release** → Tagged release with changelog

### Manual Release (If Needed)

```bash
# Trigger manual release via GitHub Actions
gh workflow run release.yaml \
  --field force_release=true \
  --field release_type=minor
```

### Release Flow Example

```bash
# 1. Normal development
git checkout -b feat/utils/add-cache
# ... make changes ...
git commit -m "feat(utils): Add LRU cache with TTL support"
git push origin feat/utils/add-cache

# 2. Create PR with proper title
# Title: "feat(utils): Add LRU cache with TTL support"

# 3. PR gets reviewed and merged
# 4. Automatic release pipeline:
#    - Updates CHANGELOG.md
#    - Bumps utils version (minor: 1.0.0 → 1.1.0)  
#    - Publishes @tundralibs/utils@1.1.0 to JSR
#    - Creates GitHub release
```

## 🚨 Emergency Publishing

For critical hotfixes that need immediate publishing:

### When to Use Emergency Publish

- **Critical security vulnerabilities**
- **Severe bugs affecting production users**
- **Broken releases that need immediate rollback**

### Emergency Publish Process

1. **Via GitHub Actions UI:**
   ```
   Go to: Actions → Emergency Publish → Run workflow
   - Workspace: Select affected workspace
   - Dry Run: Start with 'true' to test
   - Reason: Explain the emergency
   ```

2. **Via GitHub CLI:**
   ```bash
   # Dry run first
   gh workflow run publish.yaml \
     --field workspace=utils \
     --field dryRun=true \
     --field reason="Critical security fix for XSS vulnerability"

   # Actual publish
   gh workflow run publish.yaml \
     --field workspace=utils \
     --field dryRun=false \
     --field reason="Critical security fix for XSS vulnerability"
   ```

### Emergency Publish Tracking

- **Automatic Issue Creation** - Each emergency publish creates a tracking issue
- **Required Follow-up Actions:**
  - [ ] Update CHANGELOG.md manually
  - [ ] Verify published packages work correctly
  - [ ] Plan proper version bump for next release
  - [ ] Document lessons learned

### Post-Emergency Actions

```bash
# 1. Create follow-up PR to update changelog
git checkout -b docs/emergency-changelog-update
# ... update CHANGELOG.md ...
git commit -m "docs: Update CHANGELOG.md for emergency publish"

# 2. If version bump needed, create separate PR
git checkout -b chore/post-emergency-version-bump
# ... manual version adjustments if needed ...
git commit -m "chore: Adjust versions after emergency publish"
```

## ✅ Quality Standards

### Code Quality Requirements

All code must pass these checks before merging:

```bash
# Formatting (Prettier-style)
deno task check:fmt

# Linting (ESLint-style rules)  
deno task check:lint

# Type checking (strict TypeScript)
deno task check:types

# Testing (with coverage)
deno task test:run

# Performance (benchmark regressions)
deno task test:bench
```

### Performance Standards

- **No regressions >10%** - Benchmark workflow will flag significant slowdowns
- **New features** should include benchmarks if performance-critical
- **Optimization PRs** should show measurable improvements

### Documentation Standards

- **README.md** required for each workspace
- **JSDoc comments** for all public APIs
- **Examples** in documentation
- **CHANGELOG.md** automatically maintained

### Testing Standards

- **Unit tests** for all new functionality
- **Integration tests** for complex features
- **Benchmarks** for performance-critical code
- **Minimum 80% coverage** maintained

### Security Standards

All code must maintain high security standards:

```bash
# Run security scans locally
deno task security:all         # Full security scan
deno task security             # Filesystem scan only
deno task security:repo        # Repository vulnerability scan
deno task security:config      # Configuration security scan
```

**Security Requirements:**

- **No critical/high vulnerabilities** in dependencies
- **Input validation** for all external inputs
- **No secrets** in code or configuration files
- **Security review** for cryptographic or authentication code
- **Follow OWASP guidelines** for web-related functionality

**Automated Security:**

- **Trivy scans** run on every PR and daily on main branch
- **Dependabot** monitors dependencies for vulnerabilities
- **Secret scanning** prevents accidental credential commits
- **SARIF results** uploaded to GitHub Security tab

**Reporting Security Issues:**

- Use [private vulnerability reporting](https://github.com/TundraSoft/TundraLibs/security/advisories/new) for sensitive issues
- See [SECURITY.md](.github/SECURITY.md) for full security policy

## 🔧 Troubleshooting

### Common Issues

#### ❌ "PR title doesn't match conventional commits"

```bash
# Fix: Update PR title to match format
# Bad:  "Add new feature"
# Good: "feat(utils): Add new caching feature"
```

#### ❌ "Workspace changes detected in multiple workspaces"

```bash
# Fix: Split into separate PRs
git checkout -b feat/utils/part-of-changes
git checkout -b feat/crypt/other-part-of-changes
```

#### ❌ "Benchmark regression detected"

```bash
# Fix: Investigate performance impact
deno task bench:json > before.json
# ... make optimizations ...
deno task bench:json > after.json
# Compare results
```

#### ❌ "Release pipeline didn't trigger"

```bash
# Check: Only workspace files trigger releases
# Non-triggering changes: .github/, *.md, .vscode/
# Triggering changes: crypt/, id/, utils/

# Manual trigger if needed:
gh workflow run release.yaml --field force_release=true
```

### Getting Help

1. **Check existing issues** - Search for similar problems
2. **Review workflow logs** - GitHub Actions provide detailed logs
3. **Ask in discussions** - Use GitHub Discussions for questions
4. **Create issue** - For bugs or feature requests

### Development Tools

```bash
# Recommended VS Code extensions:
# - Deno (official)
# - GitLens
# - Conventional Commits

# Useful aliases:
alias dt="deno task"
alias dtc="deno task check"
alias dtt="deno task test"
```

---

## 📚 Additional Resources

- [Deno Manual](https://deno.land/manual)
- [JSR Documentation](https://jsr.io/docs)
- [Conventional Commits](https://conventionalcommits.org/)
- [Keep a Changelog](https://keepachangelog.com/)
- [Semantic Versioning](https://semver.org/)

---

**Happy coding! 🎉**

For questions or suggestions about this guide, please open an issue or discussion.
