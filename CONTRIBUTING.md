# TundraLibs Development Guide

A comprehensive guide for contributing to the TundraLibs monorepo with Deno workspaces.

## 🚀 Quick Start

```bash
# Setup
git clone https://github.com/tundralibs/tundralibs.git
cd tundralibs
deno task check && deno task test

# Development workflow
git checkout -b feat/utils/my-feature     # Create branch
# ... make changes ...
deno task check                           # Quality checks
git commit -m "feat(utils): Add feature" # Conventional commit
git push origin feat/utils/my-feature     # Push changes
# → Create PR → Automatic edge release

# Test workflows
gh workflow run test.yaml --ref dev1.0.0 # Test CI pipeline
gh run watch                              # Monitor progress
```

## 📋 Current Workspaces

| Package                | Description                                  | Status         |
| ---------------------- | -------------------------------------------- | -------------- |
| `@tundralibs/cacher`   | Caching engines (Memory, Redis, Memcached)   | ✅ Active      |
| `@tundralibs/crypt`    | Cryptographic utilities                      | ✅ Active      |
| `@tundralibs/dam`      | Data Access Management layer                 | 🚧 Development |
| `@tundralibs/guardian` | Data validation and transformation           | 🚧 Refactoring |
| `@tundralibs/id`       | ID generators (UUID, ULID, NanoID, ObjectID) | ✅ Active      |
| `@tundralibs/norm`     | Data normalization utilities                 | 🚧 Development |
| `@tundralibs/openapi`  | OpenAPI specification tools                  | 🚧 Development |
| `@tundralibs/restler`  | REST API client utilities                    | ✅ Active      |
| `@tundralibs/slogger`  | High-performance structured logging          | ✅ Active      |
| `@tundralibs/utils`    | General utility functions                    | ✅ Active      |

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

## 🛠️ Essential Commands

```bash
# Quality & Testing
deno task check              # Format, lint, type check
deno task test               # Tests + coverage + benchmarks
deno task security:all       # Security scanning

# Workspace Management
deno task workspace:add <name>     # Add new workspace
deno task workspace:sync           # Update all configurations

# Workflow Testing
gh workflow run test.yaml --ref dev1.0.0    # Test CI pipeline
gh run list --limit 5                       # Check recent runs
gh run watch                                 # Monitor active run
```

## 🔄 Development Workflow

### 1. **Branch Strategy**

- **One workspace per PR** - Focus on single package changes
- **Branch naming**: `<type>/<workspace>/<description>`
- **Types**: `feat/`, `fix/`, `perf/`, `docs/`, `test/`, `chore/`

```bash
# Examples
feat/utils/add-cache-utility     # New feature
fix/crypt/security-vulnerability # Bug fix
perf/id/optimize-generation      # Performance improvement
```

### 2. **Development Process**

```bash
# 1. Create feature branch
git checkout -b feat/utils/my-feature

# 2. Make changes and test
deno task check && deno task test

# 3. Commit with conventional format
git commit -m "feat(utils): Add new caching feature"

# 4. Push and create PR
git push origin feat/utils/my-feature
```

### 3. **Edge Releases**

Every PR automatically publishes edge versions for testing:

```bash
# Your PR creates: @tundralibs/utils@1.2.0-edge.123.abc1234
# Test with: deno add @tundralibs/utils@1.2.0-edge.123.abc1234
```

## 📝 Pull Request Guidelines

### PR Title Format (Required)

Use [Conventional Commits](https://conventionalcommits.org/) format:

```
<type>(<scope>): <description>

Examples:
feat(crypt): Add RSA encryption support
fix(id): Fix ULID timestamp generation bug  
perf(utils): Optimize memoization performance
BREAKING(utils): Remove deprecated Config.load method
```

### PR Requirements

- [ ] **One workspace per PR** - Focus changes on single package
- [ ] **Quality gates pass** - All linting, formatting, type checking must pass
- [ ] **Tests included** - New functionality requires tests
- [ ] **Documentation updated** - Update README.md and JSDoc comments
- [ ] **Performance verified** - Run benchmarks for performance-critical changes
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

## ➕ Adding New Workspaces

```bash
# Use the workspace management script
deno task workspace:add my-new-package

# This automatically:
# ✅ Creates workspace directory and deno.json
# ✅ Updates root deno.json workspace list
# ✅ Syncs all workflows with new workspace paths
# ✅ Updates labeler.yml for auto-labeling
# ✅ Updates issue templates with new package options
# ✅ Updates PR title validation scopes
```

## 🚀 Release Process

### Automatic Releases (Default)

- **PR Merged** → Release pipeline triggers
- **Version Bump** → Based on conventional commit type:
  - `BREAKING:` → Major version (1.0.0 → 2.0.0)
  - `feat:` → Minor version (1.0.0 → 1.1.0)
  - `fix:`, `perf:`, etc. → Patch version (1.0.0 → 1.0.1)
- **JSR Publishing** → Only changed workspaces are published
- **GitHub Release** → Tagged release with changelog

### Emergency Publishing

```bash
# Dry run first (recommended)
gh workflow run publish.yaml \
  --ref dev1.0.0 \
  --field workspace=utils \
  --field dry_run=true \
  --field reason="Critical security fix"

# Actual publish (use carefully)
gh workflow run publish.yaml \
  --ref dev1.0.0 \
  --field workspace=utils \
  --field dry_run=false \
  --field reason="Critical security fix"
```

## ✅ Quality Standards

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

### Security Standards

All code must maintain high security standards:

```bash
# Run security scans locally
deno task security:all         # Full security scan
```

**Security Requirements:**

- **No critical/high vulnerabilities** in dependencies
- **Input validation** for all external inputs
- **No secrets** in code or configuration files
- **Security review** for cryptographic or authentication code

## 🧪 Testing Workflows

For comprehensive workflow testing, see [`.docs/WorkflowTesting.md`](.docs/WorkflowTesting.md).

### Quick Testing Commands

```bash
# Test workflows (always specify branch during development)
gh workflow run test.yaml --ref dev1.0.0

# Check recent runs
gh run list --limit 5

# Watch latest run in real-time
gh run watch

# View failure details
gh run view [RUN_ID] --log-failed

# Safe emergency publish test
gh workflow run publish.yaml --ref dev1.0.0 --field workspace=utils --field dry_run=true --field reason='Testing'
```

### Safe Testing Sequence

1. **Quality Gates**: `gh workflow run test.yaml --ref dev1.0.0`
2. **Emergency Publish (Dry)**: `gh workflow run publish.yaml --ref dev1.0.0 --field workspace=utils --field dry_run=true --field reason='Testing'`
3. **Security Scan**: `gh workflow run security.yaml --ref dev1.0.0`
4. **Benchmarks**: `gh workflow run benchmark.yaml --ref dev1.0.0`

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

#### ❌ "Workflow does not have 'workflow_dispatch' trigger"

```bash
# Fix: Specify the branch with updated workflows
gh workflow run test.yaml --ref dev1.0.0
```

#### ❌ "Benchmark regression detected"

```bash
# Fix: Investigate performance impact
deno task bench:json > before.json
# ... make optimizations ...
deno task bench:json > after.json
# Compare results
```

### Getting Help

1. **Check existing issues** - Search for similar problems
2. **Review workflow logs** - GitHub Actions provide detailed logs
3. **Ask in discussions** - Use GitHub Discussions for questions
4. **Create issue** - For bugs or feature requests

---

## 📚 Resources

- **[Workflow Testing Guide](.docs/WorkflowTesting.md)** - Complete testing reference
- **[JSR Registry](https://jsr.io/@tundralibs)** - Published packages
- **[Deno Manual](https://deno.land/manual)** - Deno documentation
- **[Conventional Commits](https://conventionalcommits.org/)** - Commit format reference

---

**Happy coding! 🎉**

For questions or suggestions about this guide, please open an issue or discussion.
