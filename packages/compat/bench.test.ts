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
import { OS, RUNTIME } from './runtime.ts';

/** Tiny budgets: enough iterations to be meaningful, fast enough for CI. */
const FAST = { warmupMs: 5, budgetMs: 20 };

/** Cross-runtime env set/unset for the BENCH_FILTER tests. */
const setEnv = (key: string, value: string | undefined): void => {
  const g = globalThis as {
    Deno?: {
      env: { set(k: string, v: string): void; delete(k: string): void };
    };
    process?: { env: Record<string, string | undefined> };
  };
  if (g.Deno !== undefined) {
    if (value === undefined) g.Deno.env.delete(key);
    else g.Deno.env.set(key, value);
  } else if (g.process !== undefined) {
    if (value === undefined) delete g.process.env[key];
    else g.process.env[key] = value;
  }
};

/** Busy-wait — deterministic wall-clock work for the context tests. */
const spinMs = (ms: number): void => {
  const until = performance.now() + ms;
  while (performance.now() < until) {
    // spin
  }
};

/** Run `fn` with `console.log`/`console.error` captured; returns the lines. */
const captureConsole = async (fn: () => Promise<void>): Promise<string[]> => {
  const lines: string[] = [];
  const collect = (...args: unknown[]): void => {
    lines.push(args.map((a) => String(a)).join(' '));
  };
  const origLog = console.log;
  const origErr = console.error;
  console.log = collect;
  console.error = collect;
  try {
    await fn();
  } finally {
    console.log = origLog;
    console.error = origErr;
  }
  return lines;
};

/** Read/write the process exit code portably (Deno vs Node/Bun). */
const exitCodeGlobal = globalThis as {
  Deno?: { exitCode: number };
  process?: { exitCode?: number };
};
const getExitCode = (): number | undefined =>
  exitCodeGlobal.Deno?.exitCode ?? exitCodeGlobal.process?.exitCode;
const setExitCodeRaw = (code: number): void => {
  if (exitCodeGlobal.Deno !== undefined) exitCodeGlobal.Deno.exitCode = code;
  if (exitCodeGlobal.process !== undefined) {
    exitCodeGlobal.process.exitCode = code;
  }
};

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
      bench({ name: 'shape-object-then-fn', ...FAST }, () => 4 + 4);
      const report = await runBenches({ quiet: true });
      const names = report.benches.map((b) => b.name);
      asserts.assertEquals(names, [
        'shape-two-arg',
        'shape-three-arg',
        'shape-object',
        'shape-object-then-fn',
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

  describe('meta and hardened stats', () => {
    it('stamps runtime version, arch, and cores', async () => {
      bench('stamped', { ...FAST }, () => 1);
      const report = await runBenches({ quiet: true });
      asserts.assert(report.meta.runtimeVersion.length > 0);
      asserts.assert(report.meta.runtimeVersion !== 'unknown');
      asserts.assert(report.meta.cores >= 1);
      asserts.assert(report.meta.arch.length > 0);
      asserts.assertEquals('smoke' in report.meta, false);
    });

    it('p50 sits inside [min, p75] and MAD is non-negative', async () => {
      bench('median', { ...FAST }, () => Math.sqrt(42));
      const report = await runBenches({ quiet: true });
      const b = report.benches[0]!;
      asserts.assert(b.minNs <= b.p50Ns, 'min <= p50');
      asserts.assert(b.p50Ns <= b.p75Ns, 'p50 <= p75');
      asserts.assert(b.madNs >= 0, 'MAD >= 0');
    });
  });

  describe('fixed n and smoke', () => {
    it('n fixes the batch size exactly', async () => {
      bench('fixed-n', { n: 7, ...FAST }, () => 1);
      const report = await runBenches({ quiet: true });
      const b = report.benches[0]!;
      asserts.assertEquals(
        b.iters % 7,
        0,
        `iters (${b.iters}) must be whole batches of n=7`,
      );
      asserts.assertEquals(b.iters / 7, b.samples);
    });

    it('BENCH_SMOKE shrinks budgets, caps n, and stamps the report', async () => {
      // Generous budgets that smoke must override — the wall-clock
      // assertion below fails if it doesn't.
      bench('smoked', { warmupMs: 2000, budgetMs: 4000, n: 5000 }, () => 1);
      setEnv('BENCH_SMOKE', '1');
      const t0 = performance.now();
      try {
        const report = await runBenches({ quiet: true });
        asserts.assert(
          performance.now() - t0 < 1000,
          'smoke run must ignore the 6s of configured budgets',
        );
        asserts.assertEquals(report.meta.smoke, true);
        const b = report.benches[0]!;
        asserts.assert(
          b.iters / b.samples <= 10,
          `smoke must cap fixed n at 10, got ${b.iters / b.samples}`,
        );
      } finally {
        setEnv('BENCH_SMOKE', undefined);
      }
    });
  });

  describe('ignore and only', () => {
    it('ignore: true drops a bench unconditionally', async () => {
      bench('ignored', { ignore: true, ...FAST }, () => 1);
      bench('kept', { ...FAST }, () => 2);
      const report = await runBenches({ quiet: true });
      asserts.assertEquals(report.benches.map((b) => b.name), ['kept']);
    });

    it('only: true restricts the run and flags the report', async () => {
      bench('not-marked-a', { ...FAST }, () => 1);
      bench('marked', { only: true, ...FAST }, () => 2);
      bench('not-marked-b', { ...FAST }, () => 3);
      const report = await runBenches({ quiet: true });
      asserts.assertEquals(report.benches.map((b) => b.name), ['marked']);
      asserts.assertEquals(report.only, true);
    });

    it('a run without only carries no only flag', async () => {
      bench('plain', { ...FAST }, () => 1);
      const report = await runBenches({ quiet: true });
      asserts.assertEquals('only' in report, false);
    });

    it('ignore wins over only', async () => {
      bench('both-flags', { only: true, ignore: true, ...FAST }, () => 1);
      bench('plain', { ...FAST }, () => 2);
      const report = await runBenches({ quiet: true });
      asserts.assertEquals(report.benches.map((b) => b.name), ['plain']);
    });
  });

  describe('BENCH_FILTER', () => {
    it('plain value is a substring match', async () => {
      bench('alpha-one', { ...FAST }, () => 1);
      bench('beta-two', { ...FAST }, () => 2);
      bench('alpha-three', { ...FAST }, () => 3);
      setEnv('BENCH_FILTER', 'alpha');
      try {
        const report = await runBenches({ quiet: true });
        asserts.assertEquals(report.benches.map((b) => b.name), [
          'alpha-one',
          'alpha-three',
        ]);
      } finally {
        setEnv('BENCH_FILTER', undefined);
      }
    });

    it('a /wrapped/ value is a regular expression', async () => {
      bench('alpha-one', { ...FAST }, () => 1);
      bench('beta-two', { ...FAST }, () => 2);
      setEnv('BENCH_FILTER', '/^beta-/');
      try {
        const report = await runBenches({ quiet: true });
        asserts.assertEquals(report.benches.map((b) => b.name), ['beta-two']);
      } finally {
        setEnv('BENCH_FILTER', undefined);
      }
    });
  });

  describe('bench context (b.start / b.end)', () => {
    it('measures only the started section, not per-iteration setup', async () => {
      // 2ms unmeasured setup + a sub-µs measured section: if start/end
      // were ignored, avg would be ≥2ms; sectioned, it must be far
      // below the setup cost.
      bench('sectioned', { warmupMs: 1, budgetMs: 15 }, (b) => {
        spinMs(2);
        b.start();
        const x = Math.sqrt(98765.4321);
        b.end();
        return x;
      });
      const report = await runBenches({ quiet: true });
      asserts.assert(
        report.benches[0]!.avgNs < 1e6,
        `sectioned avg should exclude the 2ms setup, got ${
          report.benches[0]!.avgNs
        }ns`,
      );
    });

    it('b.end() is implied at return when omitted', async () => {
      // Setup 1.5ms, measured tail ~0.4ms: implicit end at return must
      // yield roughly the tail, never setup + tail.
      bench('implicit-end', { warmupMs: 1, budgetMs: 15 }, (b) => {
        spinMs(1.5);
        b.start();
        spinMs(0.4);
      });
      const report = await runBenches({ quiet: true });
      const avg = report.benches[0]!.avgNs;
      asserts.assert(
        avg > 0.2e6 && avg < 1.2e6,
        `implicit-end avg should be ~0.4ms, got ${avg}ns`,
      );
    });

    it('b.end() before b.start() rejects the run', async () => {
      bench('end-first', { ...FAST }, (b) => {
        b.end();
      });
      await asserts.assertRejects(
        () => runBenches({ quiet: true }),
        TypeError,
        'b.end() called before b.start()',
      );
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

  describe('report printing (non-quiet)', () => {
    it('prints a table plus per-group slower/faster summaries', async () => {
      // Group A: light baseline vs a heavier member → deterministically
      // "slower". Group B is the mirror → "faster". Both summary
      // verdicts, plus the whole table printer, are exercised.
      const heavy = () => {
        let s = 0;
        for (let i = 0; i < 3000; i++) s += i;
        return s;
      };
      bench('A-base', { group: 'A', baseline: true, ...FAST }, () => 1 + 1);
      bench('A-heavy', { group: 'A', ...FAST }, heavy);
      bench('B-base', { group: 'B', baseline: true, ...FAST }, heavy);
      bench('B-light', { group: 'B', ...FAST }, () => 1 + 1);
      // A ~2ms section reaches fmtTime's millisecond unit.
      bench('slow-ms', { warmupMs: 1, budgetMs: 12 }, (b) => {
        b.start();
        spinMs(2);
        b.end();
      });
      const out = (await captureConsole(async () => void (await runBenches())))
        .join('\n');
      asserts.assertStringIncludes(out, 'benchmark');
      asserts.assertStringIncludes(out, 'summary [A]');
      asserts.assertStringIncludes(out, 'slower');
      asserts.assertStringIncludes(out, 'summary [B]');
      asserts.assertStringIncludes(out, 'faster');
      asserts.assertStringIncludes(out, ' ms'); // slow-ms → fmtTime ms branch
    });

    it('emits a single JSON line under BENCH_FORMAT=json', async () => {
      bench('json-one', { ...FAST }, () => 1);
      setEnv('BENCH_FORMAT', 'json');
      try {
        const lines = await captureConsole(async () =>
          void (await runBenches())
        );
        const parsed = JSON.parse(lines[lines.length - 1]!);
        asserts.assertEquals(parsed.benches[0].name, 'json-one');
        asserts.assertEquals(typeof parsed.meta.cores, 'number');
      } finally {
        setEnv('BENCH_FORMAT', undefined);
      }
    });
  });

  describe('b.start / b.end misuse (more)', () => {
    it('b.start() twice in one iteration rejects', async () => {
      bench('start-twice', { ...FAST }, (b) => {
        b.start();
        b.start();
      });
      await asserts.assertRejects(
        () => runBenches({ quiet: true }),
        TypeError,
        'b.start() called twice',
      );
    });

    it('b.end() twice in one iteration rejects', async () => {
      bench('end-twice', { ...FAST }, (b) => {
        b.start();
        b.end();
        b.end();
      });
      await asserts.assertRejects(
        () => runBenches({ quiet: true }),
        TypeError,
        'b.end() called twice',
      );
    });

    it('using b.start() then skipping it on a later call rejects', async () => {
      let first = true;
      bench('start-skip', { warmupMs: 1, budgetMs: 15 }, (b) => {
        if (first) {
          first = false;
          b.start();
          b.end();
        }
        // Later iterations omit b.start() → the harness must reject.
      });
      await asserts.assertRejects(
        () => runBenches({ quiet: true }),
        TypeError,
        'was not called this iteration',
      );
    });

    it('async sectioned timing runs (measures only the started span)', async () => {
      bench('async-sectioned', { warmupMs: 1, budgetMs: 15 }, async (b) => {
        await Promise.resolve();
        b.start();
        const x = Math.sqrt(2);
        b.end();
        return x;
      });
      const report = await runBenches({ quiet: true });
      asserts.assert(report.benches[0]!.avgNs >= 0);
    });

    it('async bench skipping b.start() after use rejects', async () => {
      let first = true;
      bench('async-start-skip', { warmupMs: 1, budgetMs: 15 }, async (b) => {
        await Promise.resolve();
        if (first) {
          first = false;
          b.start();
          b.end();
        }
      });
      await asserts.assertRejects(
        () => runBenches({ quiet: true }),
        TypeError,
        'was not called this iteration',
      );
    });
  });

  describe('OS gating', () => {
    it('a bench disabled for the current OS is skipped', async () => {
      if (OS !== 'DARWIN' && OS !== 'LINUX' && OS !== 'WINDOWS') return; // UNKNOWN: no option key to target
      const key = OS.toLowerCase() as 'darwin' | 'linux' | 'windows';
      bench('os-off', { [key]: false, ...FAST }, () => 1);
      bench('os-on', { ...FAST }, () => 2);
      const names = (await runBenches({ quiet: true })).benches.map((b) =>
        b.name
      );
      asserts.assert(!names.includes('os-off'), 'os-off must be skipped');
      asserts.assert(names.includes('os-on'));
    });
  });

  describe('run guard', () => {
    it('rejects a second runBenches while one is in progress', async () => {
      bench('concurrent', { ...FAST }, () => 1);
      const inFlight = runBenches({ quiet: true });
      await asserts.assertRejects(
        () => runBenches({ quiet: true }),
        Error,
        'already in progress',
      );
      await inFlight;
    });
  });

  describe('auto-run entry point', () => {
    // The armed setTimeout that fires after module evaluation. Covered
    // in-process (a subprocess would run an UNINSTRUMENTED child): let
    // the timer fire, poll until the async run settles, and save/restore
    // the process exit code it flips.
    const awaitAutoRun = async (expectCode: number): Promise<string> => {
      const saved = getExitCode();
      try {
        const lines: string[] = [];
        const collect = (...a: unknown[]): void => {
          lines.push(a.map((x) => String(x)).join(' '));
        };
        const origLog = console.log;
        const origErr = console.error;
        console.log = collect;
        console.error = collect;
        try {
          const deadline = performance.now() + 4000;
          while (getExitCode() !== expectCode && performance.now() < deadline) {
            await new Promise((r) => setTimeout(r, 20));
          }
        } finally {
          console.log = origLog;
          console.error = origErr;
        }
        return lines.join('\n');
      } finally {
        setExitCodeRaw(saved ?? 0);
      }
    };

    it('only-mode flips the exit code and prints the CI tripwire', async () => {
      bench('auto-only', { only: true, ...FAST }, () => 1);
      const out = await awaitAutoRun(1);
      asserts.assertStringIncludes(out, "'only'");
    });

    it('a thrown bench flips the exit code and logs the failure', async () => {
      bench('auto-throw', { ...FAST }, () => {
        throw new Error('boom');
      });
      const out = await awaitAutoRun(1);
      asserts.assertStringIncludes(out, 'bench run failed');
    });
  });
});
