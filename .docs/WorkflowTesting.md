# GitHub Workflow Testing Guide

A comprehensive guide for testing GitHub Actions workflows using GitHub CLI (`gh`).

## 🚀 Prerequisites

```bash
# Install GitHub CLI (if not already installed)
brew install gh

# Authenticate with GitHub
gh auth login

# Verify authentication
gh auth status
```

## 📋 Available Workflows

| Workflow            | File                   | Purpose                           | Safety Level         |
| ------------------- | ---------------------- | --------------------------------- | -------------------- |
| `test.yaml`         | Test & Quality Gates   | Quality checks, tests, benchmarks | ✅ Safe              |
| `publish.yaml`      | Emergency Publish      | JSR package publishing            | ⚠️ Use dry_run=true  |
| `release.yaml`      | Release Pipeline       | Full release automation           | ❌ Production impact |
| `benchmark.yaml`    | Performance Benchmarks | Performance regression testing    | ✅ Safe              |
| `security.yaml`     | Security Scan          | Vulnerability scanning            | ✅ Safe              |
| `edge-release.yaml` | Edge Release           | PR-triggered edge versions        | ✅ Auto-triggered    |

## 🧪 Testing Commands

### 1. **Run Workflows Manually**

```bash
# Basic workflow dispatch (uses default branch)
gh workflow run test.yaml

# Run on specific branch (recommended during development)
gh workflow run test.yaml --ref dev1.0.0

# Run with parameters
gh workflow run publish.yaml \
  --ref dev1.0.0 \
  --field workspace=utils \
  --field dry_run=true \
  --field reason='Testing workflow functionality'

# Force release (use carefully!)
gh workflow run release.yaml \
  --ref dev1.0.0 \
  --field force_release=true \
  --field release_type=patch
```

### 2. **Monitor Workflow Runs**

```bash
# List recent workflow runs
gh run list --limit 10

# List runs for specific workflow
gh run list --workflow="test.yaml" --limit 5

# Watch a running workflow in real-time
gh run watch [RUN_ID]

# Watch latest run
gh run watch

# View completed run summary
gh run view [RUN_ID]

# View detailed logs
gh run view [RUN_ID] --log

# View only failed step logs
gh run view [RUN_ID] --log-failed
```

### 3. **Workflow Status Indicators**

- `*` - Currently running
- `✓` - Completed successfully
- `X` - Failed
- `-` - Not started/skipped

## 🛡️ Safe Testing Sequence

### **Step 1: Quality Gates (Always Safe)**

```bash
gh workflow run test.yaml --ref dev1.0.0
```

### **Step 2: Monitor Results**

```bash
# Check status
gh run list --workflow="test.yaml" --limit 3

# Watch if running
gh run watch
```

### **Step 3: Emergency Publish Test (Dry Run Only)**

```bash
gh workflow run publish.yaml \
  --ref dev1.0.0 \
  --field workspace=utils \
  --field dry_run=true \
  --field reason='Testing publish workflow'
```

### **Step 4: Security & Benchmarks**

```bash
# Security scanning
gh workflow run security.yaml --ref dev1.0.0

# Performance benchmarks  
gh workflow run benchmark.yaml --ref dev1.0.0
```

## 📊 Real Example Session

```bash
# 1. Run quality gates
$ gh workflow run test.yaml --ref dev1.0.0
✓ Created workflow_dispatch event for test.yaml at dev1.0.0

# 2. Check status
$ gh run list --workflow="test.yaml" --limit 3
STATUS  TITLE                 WORKFLOW              BRANCH    EVENT              ID           
*       Test & Quality Gates  Test & Quality Gates  dev1.0.0  workflow_dispatch  19372580782
X       github changes        Test & Quality Gates  dev1.0.0  push               19372570211
✓       Updates               Test & Quality Gates  dev1.0.0  push               18071880698

# 3. Watch in real-time
$ gh run watch 19372580782
X dev1.0.0 Test & Quality Gates · 19372580782
Triggered via workflow_dispatch less than a minute ago

JOBS
X Quality Checks in 8s (ID 55431904494)
  ✓ Set up job
  ✓ Checkout code
  ✓ Setup Deno
  X Check formatting
  ...

# 4. View failure details
$ gh run view 19372580782 --log-failed
Quality Checks  Check formatting  error: Could not find config file...
```

## 🔍 Common Issues & Solutions

### **Issue: "Workflow does not have 'workflow_dispatch' trigger"**

```bash
# Solution: Specify the branch with updated workflows
gh workflow run test.yaml --ref dev1.0.0
```

### **Issue: Workflow fails on formatting/linting**

```bash
# Fix locally first
deno task check
deno task test

# Then commit and push changes
git add .
git commit -m "fix: resolve formatting issues"
git push
```

### **Issue: Permission denied**

```bash
# Re-authenticate with proper scopes
gh auth refresh -s workflow
```

## 🎯 Workflow-Specific Parameters

### **test.yaml**

```bash
gh workflow run test.yaml \
  --ref dev1.0.0 \
  --field deno_version=v2.x \
  --field submit_reports=true
```

### **publish.yaml**

```bash
gh workflow run publish.yaml \
  --ref dev1.0.0 \
  --field workspace=utils \           # Required: workspace to publish
  --field dry_run=true \              # Recommended: test first
  --field reason='Emergency fix'      # Required: reason for publishing
```

### **release.yaml**

```bash
gh workflow run release.yaml \
  --ref dev1.0.0 \
  --field force_release=true \        # Force release even without changes
  --field release_type=patch         # patch|minor|major
```

## 📚 Additional Commands

### **Workflow Management**

```bash
# List all workflows
gh workflow list

# View workflow definition
gh workflow view test.yaml

# Download workflow artifacts
gh run download [RUN_ID]

# Cancel running workflow
gh run cancel [RUN_ID]

# Re-run failed workflow
gh run rerun [RUN_ID]
```

### **Branch-Specific Testing**

```bash
# Always specify branch during development
gh workflow run test.yaml --ref $(git branch --show-current)

# Or create an alias
alias ghw='gh workflow run test.yaml --ref $(git branch --show-current)'
```

## ⚠️ Safety Guidelines

### **✅ Always Safe to Run**

- `test.yaml` - Quality gates only
- `security.yaml` - Security scanning
- `benchmark.yaml` - Performance tests
- Any workflow with `dry_run=true`

### **⚠️ Use with Caution**

- `publish.yaml` with `dry_run=false` - Publishes to JSR
- `release.yaml` - Creates actual releases

### **❌ Production Impact**

- Never run `release.yaml` on main branch unless intentional
- Always test with `dry_run=true` first
- Monitor logs in real-time during critical workflows

## 🚀 Quick Reference

```bash
# Most common commands
gh workflow run test.yaml --ref dev1.0.0        # Test workflows
gh run list --limit 5                           # Check recent runs  
gh run watch                                     # Watch latest run
gh run view [ID] --log-failed                    # Debug failures

# Emergency testing
gh workflow run publish.yaml --ref dev1.0.0 --field workspace=utils --field dry_run=true --field reason='Testing'
```

---

**💡 Pro Tip**: Always specify `--ref [branch-name]` when testing workflows on development branches to ensure you're testing the latest changes!
