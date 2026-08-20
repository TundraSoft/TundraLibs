/**
 * @fileoverview Tests for the cross-runtime bench harness. Runs use
 * millisecond budgets (`warmupMs`/`budgetMs`) so the suite stays
 * fast — the statistical QUALITY of full-budget runs is not assertable
 * in a unit test, but the mechanics (registration shapes, skip flags,
 * async handling, stat invariants, percentile math) are.
 *
 * @module
 */

import { describe, it } from './test.ts';
import * as asserts from '@std/asserts';
import { _percentile, bench, runBenches } from './bench.ts';
import { RUNTIME } from './runtime.ts';

/** Tiny budgets: enough iterations to be meaningful, fast enough for CI. */
const FAST = { warmupMs: 5, budgetMs: 20 };

describe('compat.bench', () => {
  describe('registration shapes', () => {
    it('accepts (name, fn), (name, options, fn), and the object form', async () => {
      bench('shape-two-arg', { ...FAST }, () => 1 + 1);
      bench('shape-three-arg', { group: 'shapes', ...FAST }, () => 2 + 2);
      bench({
        name: 'shape-object',
        fn: () => 3 + 3,
        group: 'shapes',
        ...FAST,
      });
      const report = await runBenches({ quiet: true });
      const names = report.benches.map((b) => b.name);
      asserts.assertEquals(names, [
        'shape-two-arg',
        'shape-three-arg',
        'shape-object',
      ]);
      asserts.assertEquals(report.benches[1]!.group, 'shapes');
    });

    it('rejects a missing name and a missing fn', () => {
      asserts.assertThrows(
        // deno-lint-ignore no-explicit-any
        () => bench('' as any, () => 1),
        TypeError,
        'non-empty name',
      );
      asserts.assertThrows(
        // deno-lint-ignore no-explicit-any
        () => bench('no-fn', undefined as any),
        TypeError,
        'requires a function',
      );
    });
  });

  describe('skip flags', () => {
    it('a bench disabled for the current runtime never runs', async () => {
      const flag = RUNTIME.toLowerCase() as 'deno' | 'bun' | 'node';
      let ran = false;
      bench('skipped-here', { [flag]: false, ...FAST }, () => {
        ran = true;
      });
      bench('runs-here', { ...FAST }, () => 1);
      const report = await runBenches({ quiet: true });
      asserts.assertEquals(report.benches.map((b) => b.name), ['runs-here']);
      asserts.assertEquals(ran, false);
    });
  });

  describe('measurement', () => {
    it('produces internally-consistent stats for a sync bench', async () => {
      bench('sync-stats', { ...FAST }, () => Math.sqrt(1234.5678));
      const report = await runBenches({ quiet: true });
      const b = report.benches[0]!;
      asserts.assertEquals(report.runtime, RUNTIME);
      asserts.assert(b.avgNs > 0, 'avg must be positive');
      asserts.assert(b.minNs <= b.p75Ns, 'min <= p75');
      asserts.assert(b.p75Ns <= b.p99Ns, 'p75 <= p99');
      asserts.assert(b.p99Ns <= b.maxNs, 'p99 <= max');
      asserts.assert(b.iters >= b.samples, 'iters count batches at least');
      // iters/s is derived from avg — must agree to float precision.
      asserts.assertAlmostEquals(b.itersPerSec, 1e9 / b.avgNs, 1e-6);
    });

    it('awaits async benches instead of timing promise creation', async () => {
      // A ~2ms async op: if the harness failed to await, the measured
      // average would be promise-CREATION time (nanoseconds).
      bench(
        'async-sleep',
        { warmupMs: 1, budgetMs: 10 },
        () => new Promise((resolve) => setTimeout(resolve, 2)),
      );
      const report = await runBenches({ quiet: true });
      asserts.assert(
        report.benches[0]!.avgNs > 1e6,
        `expected ≥1ms avg for a 2ms sleep, got ${report.benches[0]!.avgNs}ns`,
      );
    });

    it('marks the group baseline through to the stats', async () => {
      bench('base', { group: 'g', baseline: true, ...FAST }, () => 1);
      bench('other', { group: 'g', ...FAST }, () => 2);
      const report = await runBenches({ quiet: true });
      asserts.assertEquals(report.benches[0]!.baseline, true);
      asserts.assertEquals(report.benches[1]!.baseline, false);
    });

    it('a completed run clears the registry (no re-run bleed)', async () => {
      bench('once-only', { ...FAST }, () => 1);
      await runBenches({ quiet: true });
      const second = await runBenches({ quiet: true });
      asserts.assertEquals(second.benches.length, 0);
    });
  });

  describe('_percentile (nearest-rank, sorted input)', () => {
    it('picks exact ranks from a known distribution', () => {
      const sorted = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      asserts.assertEquals(_percentile(sorted, 50), 5);
      asserts.assertEquals(_percentile(sorted, 75), 8);
      asserts.assertEquals(_percentile(sorted, 99), 10);
      asserts.assertEquals(_percentile(sorted, 100), 10);
    });

    it('handles single-element and empty inputs', () => {
      asserts.assertEquals(_percentile([42], 75), 42);
      asserts.assertEquals(_percentile([], 75), 0);
    });
  });
});
