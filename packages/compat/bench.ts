/**
 * @fileoverview Cross-runtime micro-benchmark harness — the benching
 * counterpart to `./test`. One `bench()` registration API and ONE
 * measurement engine on every runtime (Deno, Bun, Node), so numbers
 * from different runtimes are comparable: a `Deno.bench`-vs-something-
 * else split would confound every cross-runtime comparison with
 * harness differences. Zero dependencies — only `performance.now()`
 * and `setTimeout`, which all three runtimes provide.
 *
 * Files register benches at module scope and are RUN DIRECTLY
 * (`deno run`, `bun run`, `node --import tsx`) — Bun and Node have no
 * native bench runner to delegate to, so execution is scheduled
 * automatically after module evaluation (or trigger it explicitly via
 * {@link runBenches}, which returns the results programmatically).
 *
 * Set `BENCH_FORMAT=json` to emit a machine-readable report on stdout
 * instead of the table — that is the contract the cross-runtime
 * aggregator (`scripts/bench-all.ts`) consumes. Set `BENCH_FILTER` to
 * run a subset by name: a plain value is a substring match, a
 * `/wrapped/` value is a regular expression — the same convention as
 * `deno bench --filter`.
 *
 * `only: true` restricts a run to the marked benches — and, exactly
 * like `deno bench`, an auto-run that used `only` exits non-zero so a
 * forgotten `only` cannot slip through CI. `ignore: true` skips a
 * bench unconditionally (the runtime/OS flags skip conditionally).
 *
 * A bench fn receives a {@link BenchContext}: call `b.start()` /
 * `b.end()` to measure only a section of each iteration (per-iteration
 * setup/teardown stays outside the numbers). Use it on EVERY call or
 * on none — and note that per-section timing reads the clock twice per
 * ITERATION, so very short sections (≪1µs) re-expose the timer
 * resolution that whole-call batching exists to hide.
 *
 * Methodology (per bench): warm up for `warmupMs`; auto-calibrate a
 * batch size so one measured batch spans ≥2ms (sub-µs operations
 * cannot be timed individually — `performance.now()` resolution would
 * dominate); then sample batches until the time budget is spent.
 * Reported per-iteration times derive from those batch samples. Every
 * result is written to a sink object read after the run, so the JIT
 * cannot dead-code-eliminate the benched call.
 *
 * @module
 *
 * @example
 * ```typescript
 * import { bench } from '@tundralibs/compat/bench';
 *
 * bench('join two segments', () => {
 *   'a/b'.split('/');
 * });
 *
 * bench('spread copy', { group: 'copy', baseline: true }, () => {
 *   return [...[1, 2, 3]];
 * });
 * bench('slice copy', { group: 'copy' }, () => {
 *   return [1, 2, 3].slice();
 * });
 * // Run directly: deno run bench-file.ts / bun run bench-file.ts /
 * // node --import tsx bench-file.ts — results print automatically.
 * ```
 */

import { OS, RUNTIME } from './runtime.ts';

/**
 * Handed to every bench invocation. Ignoring it measures the whole
 * call; `start()`/`end()` bound the measured section instead —
 * `end()` is implied at return when `start()` was called without it.
 */
export type BenchContext = {
  /** The bench's registered name. */
  readonly name: string;
  /**
   * Begin this iteration's measured section.
   *
   * @throws {TypeError} When called twice in one iteration.
   */
  start(): void;
  /**
   * End this iteration's measured section.
   *
   * @throws {TypeError} When called before {@link start}, or twice.
   */
  end(): void;
};

/** A benched operation. May be sync or async (detected at warmup). */
export type BenchFn = (b: BenchContext) => unknown | Promise<unknown>;

/**
 * Bench config. Runtime/OS flags mirror `./test`'s `ItOptions`:
 * setting one to `false` skips the bench there — e.g.
 * `{ node: false }` benches Deno and Bun only.
 */
export type BenchOptions = {
  name?: string;
  fn?: BenchFn;
  /** Benches sharing a `group` are summarized relative to its baseline. */
  group?: string;
  /** Marks this bench as its group's 1.00x reference. */
  baseline?: boolean;
  /** Skip unconditionally. Wins over `only`. */
  ignore?: boolean;
  /**
   * When ANY registered bench sets this, only the marked benches run —
   * and an auto-run exits non-zero afterwards (like `deno bench`), so
   * a forgotten `only` cannot pass CI silently.
   */
  only?: boolean;
  deno?: boolean;
  bun?: boolean;
  node?: boolean;
  windows?: boolean;
  linux?: boolean;
  darwin?: boolean;
  /** Warmup duration before measuring. Primarily a test/CI-smoke knob. */
  warmupMs?: number;
  /** Sampling time budget. Primarily a test/CI-smoke knob. */
  budgetMs?: number;
};

/** One bench's measured statistics (all times in nanoseconds). */
export type BenchStats = {
  name: string;
  group?: string;
  baseline: boolean;
  /** Weighted mean: total measured time / total iterations. */
  avgNs: number;
  itersPerSec: number;
  minNs: number;
  maxNs: number;
  p75Ns: number;
  p99Ns: number;
  /** Batch samples the percentiles derive from. */
  samples: number;
  /** Total iterations executed across all measured batches. */
  iters: number;
};

/** The full run's result — what {@link runBenches} resolves with. */
export type BenchReport = {
  runtime: string;
  os: string;
  benches: BenchStats[];
  /** Present (`true`) when `only` restricted this run. */
  only?: boolean;
};

type Registered = {
  name: string;
  fn: BenchFn;
  group?: string;
  baseline: boolean;
  only: boolean;
  warmupMs: number;
  budgetMs: number;
};

/** Warmup duration when the bench doesn't override it. */
const DEFAULT_WARMUP_MS = 100;
/** Sampling budget when the bench doesn't override it. */
const DEFAULT_BUDGET_MS = 500;
/** A measured batch must span at least this long to out-noise the timer. */
const MIN_BATCH_MS = 2;
/** Sampling stops early after this many batch samples. */
const MAX_SAMPLES = 200;
/** Sampling never stops before this many batch samples. */
const MIN_SAMPLES = 3;
/**
 * Batch calibration gives up growing once a batch COSTS this much
 * wall time — a `b.start()`-sectioned bench with heavy unmeasured
 * setup could otherwise double `n` toward a batch that takes minutes
 * to produce 2ms of measured time.
 */
const CALIBRATION_WALL_CAP_MS = 50;

const registry: Registered[] = [];
let autoRunTimer: ReturnType<typeof setTimeout> | undefined;
let started = false;

/**
 * The dead-code-elimination sink: every benched call's result lands
 * here, and the object escapes to `globalThis` after the run, so the
 * JIT must treat the calls as observable.
 */
let sink: unknown;

/** Env reader that works on all three runtimes without throwing. */
const env = (name: string): string | undefined => {
  const g = globalThis as {
    Deno?: { env: { get(n: string): string | undefined } };
    process?: { env: Record<string, string | undefined> };
  };
  try {
    return g.Deno?.env.get(name) ?? g.process?.env[name];
  } catch {
    // Deno without --allow-env: behave as unset.
    return undefined;
  }
};

/** Should this bench run on the current runtime/OS? */
const enabled = (o: BenchOptions): boolean => {
  if (o.deno === false && RUNTIME === 'DENO') return false;
  if (o.bun === false && RUNTIME === 'BUN') return false;
  if (o.node === false && RUNTIME === 'NODE') return false;
  if (o.windows === false && OS === 'WINDOWS') return false;
  if (o.linux === false && OS === 'LINUX') return false;
  if (o.darwin === false && OS === 'DARWIN') return false;
  return true;
};

/**
 * Register a bench. Accepts the same three call shapes `Deno.bench`
 * does — `(name, fn)`, `(name, options, fn)`, and a single options
 * object carrying `name` and `fn` — so migrating an existing
 * `Deno.bench` file is the import line plus a rename.
 *
 * Registration is synchronous and side-effect-light; measurement runs
 * after module evaluation (see the module docs) in registration order,
 * strictly sequentially.
 *
 * @throws {TypeError} When no name or no function can be resolved
 *   from the arguments.
 */
export function bench(name: string, fn: BenchFn): void;
export function bench(name: string, options: BenchOptions, fn: BenchFn): void;
export function bench(
  options: BenchOptions & { name: string; fn: BenchFn },
): void;
export function bench(
  first: string | (BenchOptions & { name: string; fn: BenchFn }),
  second?: BenchOptions | BenchFn,
  third?: BenchFn,
): void {
  let name: string;
  let fn: BenchFn | undefined;
  let options: BenchOptions;
  if (typeof first === 'string') {
    name = first;
    if (typeof second === 'function') {
      fn = second;
      options = {};
    } else {
      options = second ?? {};
      fn = third;
    }
  } else {
    name = first.name;
    fn = first.fn;
    options = first;
  }
  if (typeof name !== 'string' || name.length === 0) {
    throw new TypeError('bench() requires a non-empty name');
  }
  if (typeof fn !== 'function') {
    throw new TypeError(`bench('${name}') requires a function`);
  }
  if (!enabled(options) || options.ignore === true) return;
  registry.push({
    name,
    fn,
    group: options.group,
    baseline: options.baseline === true,
    only: options.only === true,
    warmupMs: options.warmupMs ?? DEFAULT_WARMUP_MS,
    budgetMs: options.budgetMs ?? DEFAULT_BUDGET_MS,
  });
  // First registration arms the auto-run; it fires once module
  // evaluation (and thus all top-level registrations) has finished.
  if (autoRunTimer === undefined && !started) {
    autoRunTimer = setTimeout(() => {
      autoRun();
    }, 0);
  }
}

/**
 * Nearest-rank percentile of an ASCENDING-sorted sample array.
 * Exported only for its own unit test.
 *
 * @internal
 */
export function _percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return 0;
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(Math.max(rank, 1), sorted.length) - 1]!;
}

/** Mutable span state behind one bench's {@link BenchContext}. */
type SpanState = {
  startAt: number;
  endAt: number;
  /** Whether the fn has EVER called `start()` — picks the timing path. */
  used: boolean;
};

/** Build the context handed to a bench's invocations. */
const makeContext = (
  name: string,
): { ctx: BenchContext; state: SpanState } => {
  const state: SpanState = { startAt: -1, endAt: -1, used: false };
  const ctx: BenchContext = {
    name,
    start() {
      if (state.startAt !== -1) {
        throw new TypeError(
          `bench '${name}': b.start() called twice in one iteration ` +
            `(b.start()/b.end() must be used on every call or on none)`,
        );
      }
      state.used = true;
      state.startAt = performance.now();
    },
    end() {
      if (state.startAt === -1) {
        throw new TypeError(`bench '${name}': b.end() called before b.start()`);
      }
      if (state.endAt !== -1) {
        throw new TypeError(
          `bench '${name}': b.end() called twice in one iteration`,
        );
      }
      state.endAt = performance.now();
    },
  };
  return { ctx, state };
};

/** `[measuredMs, wallMs]` for one batch of `n` iterations. */
type BatchTime = [number, number];

/**
 * Run `fn` `n` times (sync path). Whole-call benches time the batch
 * with two clock reads; `b.start()`-sectioned benches sum the
 * per-iteration spans instead (`b.end()` implied at return).
 *
 * @throws {TypeError} When span usage turns inconsistent — an
 *   iteration of a sectioned bench that never called `b.start()`.
 */
const timeSyncBatch = (
  fn: BenchFn,
  n: number,
  ctx: BenchContext,
  state: SpanState,
): BatchTime => {
  if (!state.used) {
    const t0 = performance.now();
    for (let i = 0; i < n; i++) sink = fn(ctx);
    const wall = performance.now() - t0;
    return [wall, wall];
  }
  let measured = 0;
  const t0 = performance.now();
  for (let i = 0; i < n; i++) {
    state.startAt = -1;
    state.endAt = -1;
    sink = fn(ctx);
    if (state.startAt === -1) {
      throw new TypeError(
        `bench '${ctx.name}': b.start() was not called this iteration ` +
          `(b.start()/b.end() must be used on every call or on none)`,
      );
    }
    measured += (state.endAt !== -1 ? state.endAt : performance.now()) -
      state.startAt;
  }
  return [measured, performance.now() - t0];
};

/** Async twin of {@link timeSyncBatch} — awaits every invocation. */
const timeAsyncBatch = async (
  fn: BenchFn,
  n: number,
  ctx: BenchContext,
  state: SpanState,
): Promise<BatchTime> => {
  if (!state.used) {
    const t0 = performance.now();
    for (let i = 0; i < n; i++) sink = await fn(ctx);
    const wall = performance.now() - t0;
    return [wall, wall];
  }
  let measured = 0;
  const t0 = performance.now();
  for (let i = 0; i < n; i++) {
    state.startAt = -1;
    state.endAt = -1;
    sink = await fn(ctx);
    if (state.startAt === -1) {
      throw new TypeError(
        `bench '${ctx.name}': b.start() was not called this iteration ` +
          `(b.start()/b.end() must be used on every call or on none)`,
      );
    }
    measured += (state.endAt !== -1 ? state.endAt : performance.now()) -
      state.startAt;
  }
  return [measured, performance.now() - t0];
};

/** Measure one registered bench. */
const measure = async (entry: Registered): Promise<BenchStats> => {
  const { fn } = entry;
  const { ctx, state } = makeContext(entry.name);
  // Async detection on the first call: a thenable routes every later
  // call through the awaiting loop, so sync benches never pay for an
  // `await` they don't need. The same call reveals span usage.
  const probe = fn(ctx);
  const isAsync = probe instanceof Promise ||
    (typeof probe === 'object' && probe !== null &&
      typeof (probe as { then?: unknown }).then === 'function');
  sink = isAsync ? await probe : probe;

  // Warmup: let the JIT tier up before anything is recorded.
  const warmupEnd = performance.now() + entry.warmupMs;
  do {
    state.startAt = -1;
    state.endAt = -1;
    sink = isAsync ? await fn(ctx) : fn(ctx);
  } while (performance.now() < warmupEnd);

  const batch = (n: number): BatchTime | Promise<BatchTime> =>
    isAsync
      ? timeAsyncBatch(fn, n, ctx, state)
      : timeSyncBatch(fn, n, ctx, state);

  // Batch calibration: double n until one batch's MEASURED time spans
  // MIN_BATCH_MS — per-call timing of nanosecond-scale operations only
  // measures the clock otherwise. The WALL cap keeps a sectioned bench
  // with heavy unmeasured setup from growing n unboundedly.
  let n = 1;
  let [measuredMs, wallMs] = await batch(n);
  while (
    measuredMs < MIN_BATCH_MS && wallMs < CALIBRATION_WALL_CAP_MS &&
    n < 1 << 28
  ) {
    n *= 2;
    [measuredMs, wallMs] = await batch(n);
  }

  // Sampling: per-batch per-iteration averages, until the WALL budget
  // is spent (never fewer than MIN_SAMPLES, never more than
  // MAX_SAMPLES).
  const samples: number[] = [measuredMs / n];
  let totalMeasuredMs = measuredMs;
  let totalWallMs = wallMs;
  let totalIters = n;
  while (
    (samples.length < MIN_SAMPLES ||
      (totalWallMs < entry.budgetMs && samples.length < MAX_SAMPLES))
  ) {
    const [ms, wall] = await batch(n);
    samples.push(ms / n);
    totalMeasuredMs += ms;
    totalWallMs += wall;
    totalIters += n;
    if (samples.length >= MAX_SAMPLES) break;
  }

  samples.sort((a, b) => a - b);
  const toNs = (ms: number): number => ms * 1e6;
  const avgNs = toNs(totalMeasuredMs) / totalIters;
  return {
    name: entry.name,
    ...(entry.group !== undefined ? { group: entry.group } : {}),
    baseline: entry.baseline,
    avgNs,
    itersPerSec: avgNs > 0 ? 1e9 / avgNs : 0,
    minNs: toNs(samples[0]!),
    maxNs: toNs(samples[samples.length - 1]!),
    p75Ns: toNs(_percentile(samples, 75)),
    p99Ns: toNs(_percentile(samples, 99)),
    samples: samples.length,
    iters: totalIters,
  };
};

/** Human time formatting with unit auto-scaling. */
const fmtTime = (ns: number): string => {
  if (ns < 1e3) return `${ns.toFixed(1)} ns`;
  if (ns < 1e6) return `${(ns / 1e3).toFixed(1)} µs`;
  if (ns < 1e9) return `${(ns / 1e6).toFixed(1)} ms`;
  return `${(ns / 1e9).toFixed(2)} s`;
};

const fmtIters = (n: number): string => {
  return Math.round(n).toLocaleString('en-US');
};

/** Print the human-readable report. */
const printReport = (report: BenchReport): void => {
  const rows = report.benches.map((b) => [
    b.name,
    fmtTime(b.avgNs),
    fmtIters(b.itersPerSec),
    `(${fmtTime(b.minNs)} … ${fmtTime(b.maxNs)})`,
    fmtTime(b.p75Ns),
    fmtTime(b.p99Ns),
  ]);
  const head = [
    'benchmark',
    'time/iter (avg)',
    'iters/s',
    '(min … max)',
    'p75',
    'p99',
  ];
  const widths = head.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => r[i]!.length))
  );
  const line = (cells: string[]): string =>
    cells.map((
      c,
      i,
    ) => (i === 0 ? c.padEnd(widths[i]!) : c.padStart(widths[i]!))).join('   ');
  console.log(`runtime: ${report.runtime} (${report.os})`);
  console.log(line(head));
  console.log(widths.map((w) => '-'.repeat(w)).join('   '));
  for (const row of rows) console.log(line(row));

  // Group summaries, relative to each group's baseline (or its
  // first-registered bench when none is flagged).
  const groups = new Map<string, BenchStats[]>();
  for (const b of report.benches) {
    if (b.group === undefined) continue;
    const list = groups.get(b.group) ?? [];
    list.push(b);
    groups.set(b.group, list);
  }
  for (const [group, members] of groups) {
    if (members.length < 2) continue;
    const base = members.find((m) => m.baseline) ?? members[0]!;
    console.log(`\nsummary [${group}] — baseline: ${base.name}`);
    for (const m of members) {
      if (m === base) continue;
      const factor = m.avgNs / base.avgNs;
      const verdict = factor >= 1
        ? `${factor.toFixed(2)}x slower`
        : `${(1 / factor).toFixed(2)}x faster`;
      console.log(`  ${m.name}: ${verdict}`);
    }
  }
};

/**
 * Build a name predicate from `BENCH_FILTER`: plain value = substring
 * match, `/wrapped/` = regular expression (`deno bench --filter`'s
 * convention).
 *
 * @throws {SyntaxError} When a `/wrapped/` value is not a valid
 *   regular expression.
 */
const parseFilter = (
  raw: string | undefined,
): ((name: string) => boolean) | undefined => {
  if (raw === undefined || raw === '') return undefined;
  if (raw.length > 2 && raw.startsWith('/') && raw.endsWith('/')) {
    const re = new RegExp(raw.slice(1, -1));
    return (name) => re.test(name);
  }
  return (name) => name.includes(raw);
};

/**
 * Run every registered bench now, strictly sequentially, and resolve
 * with the report. `only`-marked benches (when any exist) and the
 * `BENCH_FILTER` selection are applied here. Cancels the pending
 * auto-run, so calling this explicitly never double-runs. Prints the
 * report unless `quiet: true`; honours `BENCH_FORMAT=json` when
 * printing.
 *
 * @throws {Error} When called while a run is already in progress.
 * @throws {SyntaxError} When `BENCH_FILTER` holds an invalid
 *   `/regex/`.
 */
export async function runBenches(
  options: { quiet?: boolean } = {},
): Promise<BenchReport> {
  if (started) {
    throw new Error('runBenches() called while a run is already in progress');
  }
  started = true;
  if (autoRunTimer !== undefined) {
    clearTimeout(autoRunTimer);
    autoRunTimer = undefined;
  }
  try {
    let entries = [...registry];
    const onlyMode = entries.some((e) => e.only);
    if (onlyMode) entries = entries.filter((e) => e.only);
    const filter = parseFilter(env('BENCH_FILTER'));
    if (filter !== undefined) entries = entries.filter((e) => filter(e.name));

    const benches: BenchStats[] = [];
    for (const entry of entries) {
      benches.push(await measure(entry));
    }
    // The sink escapes, making every benched call observable.
    (globalThis as Record<string, unknown>).__compatBenchSink = sink;
    const report: BenchReport = {
      runtime: RUNTIME,
      os: OS,
      benches,
      ...(onlyMode ? { only: true } : {}),
    };
    if (options.quiet !== true) {
      if (env('BENCH_FORMAT') === 'json') {
        console.log(JSON.stringify(report));
      } else {
        printReport(report);
      }
    }
    return report;
  } finally {
    registry.length = 0;
    started = false;
  }
}

/** Set the process exit code on whichever runtime this is. */
const setExitCode = (code: number): void => {
  const g = globalThis as {
    Deno?: { exitCode: number };
    process?: { exitCode?: number };
  };
  if (g.Deno !== undefined) g.Deno.exitCode = code;
  else if (g.process !== undefined) g.process.exitCode = code;
};

/** The scheduled entry point — failures must not vanish silently. */
const autoRun = (): void => {
  autoRunTimer = undefined;
  runBenches().then((report) => {
    if (report.only === true) {
      console.error(
        "bench: the 'only' option was used — exiting non-zero so it " +
          'cannot slip through CI',
      );
      setExitCode(1);
    }
  }).catch((error) => {
    console.error('bench run failed:', error);
    setExitCode(1);
  });
};
