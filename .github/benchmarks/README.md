# Benchmark Results Directory

This directory stores historical benchmark results for performance tracking.

## Files

- `latest-baseline.json` - Current performance baseline from main branch
- `benchmark-YYYY-MM-DD_HH-MM-SS-COMMIT.json` - Historical benchmark results

## Workflow

The benchmark workflow:
1. Runs benchmarks on every PR and main branch push
2. Stores results with timestamps and commit hashes
3. Compares PR performance against main branch baseline
4. Creates GitHub issues for significant performance regressions (>10% slower)
5. Maintains rolling history of last 10 benchmark runs

## Performance Regression Threshold

- **🟢 Good**: <5% performance change
- **🟡 Neutral**: 5-10% performance change  
- **🔴 Regression**: >10% performance degradation (creates issue)
- **🆕 New**: New benchmark (no baseline comparison)

## Manual Baseline Update

To create a new performance baseline:
```bash
# Via GitHub Actions
gh workflow run benchmark.yaml --field baseline=true
```
