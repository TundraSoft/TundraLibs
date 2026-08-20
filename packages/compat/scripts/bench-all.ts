/// <reference lib="deno.ns" />
/**
 * @fileoverview Cross-runtime bench aggregator: runs `.bench.ts` files
 * under Deno, Bun, and Node (via tsx), collects the
 * `BENCH_FORMAT=json` reports the `./bench` harness emits, and merges
 * them into one report with a column per runtime.
 *
 * A repo tool, not package API — Deno-only on purpose (it SPAWNS the
 * three runtimes; it doesn't need to run on them).
 *
 *     deno run --allow-run --allow-read --allow-env --allow-write \
 *       packages/compat/scripts/bench-all.ts [flags] <file-or-dir ...>
 *
 * Targets: explicit `.bench.ts` files, directories (walked recursively
 * for `*.bench.ts`), or `--all` for every package. Flags:
 *
 * - `--filter=<substr|/re/>` — forwarded to the harness (BENCH_FILTER)
 * - `--lanes=deno,bun,node`  — subset of runtimes (default: all three)
 * - `--format=table|md|csv`  — output shape (default: table)
 * - `--save-baseline=<file>` — write the merged results as a baseline
 * - `--baseline=<file>`      — compare against a saved baseline
 * - `--smoke`                — BENCH_SMOKE=1 on every lane (rot check;
 *   numbers meaningless, baseline flags refuse to mix with it)
 *
 * Bun and tsx resolve `tsconfig.json` from the working directory, so
 * each file's lanes run with cwd at its own package root — a
 * decorator-using package's compiler overrides would otherwise be
 * silently ignored (the monorepo's known tsconfig-cwd trap).
 *
 * @module
 */

import type { BenchReport, BenchStats } from '../bench.ts';

type LaneName = 'DENO' | 'BUN' | 'NODE';
type Lane = { runtime: LaneName; cmd: string; args: string[] };

/** One file's merged results: bench name → runtime → stats. */
type Merged = {
  file: string;
  names: string[];
  runtimes: LaneName[];
  byName: Map<string, Map<LaneName, BenchStats>>;
};

/** The saved-baseline shape (`--save-baseline` / `--baseline`). */
type Baseline = {
  savedAt: string;
  commit?: string;
  files: Record<
    string,
    Record<string, Record<string, { avgNs: number; p50Ns: number }>>
  >;
};

/** Regression flag threshold for baseline comparison. */
const REGRESSION_PCT = 10;

/** Repo root — this file sits at `packages/compat/scripts/`. */
const ROOT = new URL('../../..', import.meta.url).pathname;

/** The package directory (cwd for the Bun/Node lanes) of a bench file. */
const packageDirOf = (file: string): string => {
  const match = file.match(/^(.*?packages\/[^/]+)\//);
  return match ? match[1]! : ROOT;
};

const fmtTime = (ns: number): string => {
  if (ns < 1e3) return `${ns.toFixed(1)} ns`;
  if (ns < 1e6) return `${(ns / 1e3).toFixed(1)} µs`;
  if (ns < 1e9) return `${(ns / 1e6).toFixed(1)} ms`;
  return `${(ns / 1e9).toFixed(2)} s`;
};

/** Recursively collect `*.bench.ts` under `dir` (sorted, stable). */
const discover = (dir: string, found: string[] = []): string[] => {
  for (const entry of Deno.readDirSync(dir)) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory) discover(path, found);
    else if (entry.name.endsWith('.bench.ts')) found.push(path);
  }
  return found.sort();
};

const runLane = async (
  lane: Lane,
  file: string,
  extraEnv: Record<string, string>,
): Promise<BenchReport | undefined> => {
  const cwd = lane.runtime === 'DENO' ? ROOT : packageDirOf(file);
  const rel = file.startsWith(cwd) ? file.slice(cwd.length + 1) : file;
  const command = new Deno.Command(lane.cmd, {
    args: [...lane.args, lane.runtime === 'DENO' ? file : rel],
    cwd,
    env: { BENCH_FORMAT: 'json', ...extraEnv },
    stdout: 'piped',
    stderr: 'piped',
  });
  const { code, stdout, stderr } = await command.output();
  if (code !== 0) {
    console.error(
      `${lane.runtime} lane failed for ${file}:\n${
        new TextDecoder().decode(stderr)
      }`,
    );
    return undefined;
  }
  // The report is the LAST parseable JSON line — scanned backwards, so
  // a bench whose own logging flushes asynchronously (a console-writing
  // handler bench, say) after the report cannot hide it.
  const lines = new TextDecoder().decode(stdout).trim().split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i]!;
    if (!line.startsWith('{') || !line.includes('"benches"')) continue;
    try {
      return JSON.parse(line) as BenchReport;
    } catch {
      // Not the report after all — keep scanning.
    }
  }
  // Exit 0 with no report = the file registered nothing (a guarded
  // bench whose external service is unavailable). A skip, not an error.
  console.log(
    `${lane.runtime} lane: no benches registered (skipped — ` +
      `guarded external dependency unavailable?)`,
  );
  return undefined;
};

/** Run every lane for one file and merge on bench name. */
const runFile = async (
  file: string,
  lanes: Lane[],
  extraEnv: Record<string, string>,
): Promise<Merged | undefined> => {
  // Sequential on purpose: concurrent lanes would contend for CPU and
  // corrupt each other's numbers.
  const reports = new Map<LaneName, BenchReport>();
  for (const lane of lanes) {
    const report = await runLane(lane, file, extraEnv);
    if (report) reports.set(lane.runtime, report);
  }
  if (reports.size === 0) return undefined;
  const names: string[] = [];
  const byName = new Map<string, Map<LaneName, BenchStats>>();
  for (const [runtime, report] of reports) {
    for (const stat of report.benches) {
      if (!byName.has(stat.name)) {
        byName.set(stat.name, new Map());
        names.push(stat.name);
      }
      byName.get(stat.name)!.set(runtime, stat);
    }
  }
  return { file, names, runtimes: [...reports.keys()], byName };
};

/** Rows for one merged file: `[bench, cell-per-runtime...]`. */
const rowsOf = (m: Merged): string[][] =>
  m.names.map((name) => {
    const per = m.byName.get(name)!;
    const avgs = m.runtimes.map((r) => per.get(r)?.avgNs);
    const best = Math.min(...avgs.filter((a): a is number => a !== undefined));
    return [
      name,
      ...avgs.map((a) =>
        a === undefined ? '-' : `${fmtTime(a)}${a === best ? ' *' : ''}`
      ),
    ];
  });

const printTable = (m: Merged): void => {
  const head = ['benchmark', ...m.runtimes.map((r) => `${r} avg`)];
  const rows = rowsOf(m);
  const widths = head.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => r[i]!.length))
  );
  const line = (cells: string[]): string =>
    cells.map((
      c,
      i,
    ) => (i === 0 ? c.padEnd(widths[i]!) : c.padStart(widths[i]!)))
      .join('   ');
  console.log(line(head));
  console.log(widths.map((w) => '-'.repeat(w)).join('   '));
  for (const row of rows) console.log(line(row));
  console.log('(* = fastest runtime for that bench)');
};

const printMarkdown = (m: Merged): void => {
  console.log(
    `| benchmark | ${m.runtimes.map((r) => `${r} avg`).join(' | ')} |`,
  );
  console.log(`| --- | ${m.runtimes.map(() => '---:').join(' | ')} |`);
  for (const row of rowsOf(m)) {
    console.log(`| ${row.join(' | ')} |`);
  }
};

const printCsv = (m: Merged): void => {
  console.log(['benchmark', ...m.runtimes.map((r) => `${r}_avg_ns`)].join(','));
  for (const name of m.names) {
    const per = m.byName.get(name)!;
    const cells = m.runtimes.map((r) => {
      const s = per.get(r);
      return s === undefined ? '' : s.avgNs.toFixed(1);
    });
    console.log([JSON.stringify(name), ...cells].join(','));
  }
};

/** Group summaries with per-runtime relative factors, merged. */
const printGroupSummaries = (m: Merged): void => {
  const groups = new Map<string, string[]>();
  for (const name of m.names) {
    const anyStat = [...m.byName.get(name)!.values()][0]!;
    if (anyStat.group === undefined) continue;
    const list = groups.get(anyStat.group) ?? [];
    list.push(name);
    groups.set(anyStat.group, list);
  }
  for (const [group, members] of groups) {
    if (members.length < 2) continue;
    const base = members.find((name) =>
      [...m.byName.get(name)!.values()].some((s) =>
        s.baseline
      )
    ) ?? members[0]!;
    console.log(`\nsummary [${group}] — baseline: ${base}`);
    for (const name of members) {
      if (name === base) continue;
      const factors = m.runtimes.map((r) => {
        const s = m.byName.get(name)!.get(r);
        const b = m.byName.get(base)!.get(r);
        if (s === undefined || b === undefined || b.avgNs === 0) return '-';
        const f = s.avgNs / b.avgNs;
        return f >= 1
          ? `${f.toFixed(2)}x slower`
          : `${(1 / f).toFixed(2)}x faster`;
      });
      console.log(
        `  ${name}: ${
          factors.map((f, i) => `${f} (${m.runtimes[i]})`).join(', ')
        }`,
      );
    }
  }
};

/** Compare merged results to a saved baseline (on p50 — robust). */
const printComparison = (m: Merged, baseline: Baseline): void => {
  const saved = baseline.files[m.file];
  if (saved === undefined) {
    console.log(`(no baseline entry for ${m.file})`);
    return;
  }
  const from = baseline.commit !== undefined ? ` since ${baseline.commit}` : '';
  for (const name of m.names) {
    for (const runtime of m.runtimes) {
      const now = m.byName.get(name)!.get(runtime);
      const then = saved[runtime]?.[name];
      if (now === undefined || then === undefined || then.p50Ns === 0) continue;
      const pct = ((now.p50Ns - then.p50Ns) / then.p50Ns) * 100;
      if (Math.abs(pct) < REGRESSION_PCT) continue;
      const dir = pct > 0 ? 'SLOWER' : 'faster';
      console.log(
        `  ${pct > 0 ? '⚠' : '✓'} ${name} [${runtime}]: ` +
          `${Math.abs(pct).toFixed(1)}% ${dir}${from} ` +
          `(${fmtTime(then.p50Ns)} → ${fmtTime(now.p50Ns)})`,
      );
    }
  }
};

/** Current short commit, when git is available. */
const gitCommit = async (): Promise<string | undefined> => {
  try {
    const out = await new Deno.Command('git', {
      args: ['rev-parse', '--short', 'HEAD'],
      cwd: ROOT,
      stdout: 'piped',
      stderr: 'null',
    }).output();
    if (out.code !== 0) return undefined;
    return new TextDecoder().decode(out.stdout).trim();
  } catch {
    return undefined;
  }
};

const main = async (): Promise<void> => {
  let filter: string | undefined;
  let lanesArg = 'deno,bun,node';
  let format: 'table' | 'md' | 'csv' = 'table';
  let saveBaseline: string | undefined;
  let compareBaseline: string | undefined;
  let smoke = false;
  let all = false;
  const targets: string[] = [];
  for (const arg of Deno.args) {
    if (arg.startsWith('--filter=')) filter = arg.slice(9);
    else if (arg.startsWith('--lanes=')) lanesArg = arg.slice(8);
    else if (arg.startsWith('--format=')) {
      format = arg.slice(9) as 'table' | 'md' | 'csv';
      if (!['table', 'md', 'csv'].includes(format)) {
        console.error(`unknown --format: ${format}`);
        Deno.exitCode = 1;
        return;
      }
    } else if (arg.startsWith('--save-baseline=')) saveBaseline = arg.slice(16);
    else if (arg.startsWith('--baseline=')) compareBaseline = arg.slice(11);
    else if (arg === '--smoke') smoke = true;
    else if (arg === '--all') all = true;
    else if (arg.startsWith('--')) {
      console.error(`unknown flag: ${arg}`);
      Deno.exitCode = 1;
      return;
    } else targets.push(arg);
  }
  if (smoke && (saveBaseline !== undefined || compareBaseline !== undefined)) {
    console.error('--smoke numbers are meaningless — refusing baseline flags');
    Deno.exitCode = 1;
    return;
  }

  // Resolve targets: files stay, directories walk, --all = packages/.
  const files: string[] = [];
  if (all) files.push(...discover(`${ROOT}packages`));
  for (const target of targets) {
    const stat = Deno.statSync(target);
    if (stat.isDirectory) files.push(...discover(target));
    else files.push(target);
  }
  if (files.length === 0) {
    console.error(
      'usage: bench-all.ts [--filter=<substr|/re/>] [--lanes=deno,bun,node] ' +
        '[--format=table|md|csv] [--save-baseline=<f>] [--baseline=<f>] ' +
        '[--smoke] (--all | <file-or-dir ...>)',
    );
    Deno.exitCode = 1;
    return;
  }

  const allLanes: Lane[] = [
    {
      runtime: 'DENO',
      // -A: parity with the retired `deno bench --allow-all` task —
      // benches touch files/net/env per package, and enumerating flags
      // per file isn't knowable here.
      cmd: 'deno',
      args: ['run', '-A', '--config', 'deno.json'],
    },
    { runtime: 'BUN', cmd: 'bun', args: ['run'] },
    { runtime: 'NODE', cmd: 'node', args: ['--import', 'tsx'] },
  ];
  const wanted = lanesArg.toUpperCase().split(',').map((s) => s.trim());
  const lanes = allLanes.filter((l) => wanted.includes(l.runtime));
  if (lanes.length === 0) {
    console.error(`--lanes matched no runtime: ${lanesArg}`);
    Deno.exitCode = 1;
    return;
  }

  const extraEnv: Record<string, string> = {
    ...(filter !== undefined ? { BENCH_FILTER: filter } : {}),
    ...(smoke ? { BENCH_SMOKE: '1' } : {}),
  };
  const baseline: Baseline | undefined = compareBaseline !== undefined
    ? JSON.parse(Deno.readTextFileSync(compareBaseline)) as Baseline
    : undefined;
  const toSave: Baseline = {
    savedAt: new Date().toISOString(),
    ...(await gitCommit().then((c) => c !== undefined ? { commit: c } : {})),
    files: {},
  };

  for (const file of files) {
    console.log(`\n== ${file} ==`);
    const merged = await runFile(file, lanes, extraEnv);
    if (merged === undefined) continue;
    // Baselines key on repo-relative paths so they survive checkouts.
    const relFile = file.startsWith(ROOT) ? file.slice(ROOT.length) : file;
    merged.file = relFile;
    if (format === 'md') printMarkdown(merged);
    else if (format === 'csv') printCsv(merged);
    else printTable(merged);
    if (format === 'table') printGroupSummaries(merged);
    if (baseline !== undefined) {
      console.log(`\nvs baseline (${compareBaseline}, ±${REGRESSION_PCT}%):`);
      printComparison(merged, baseline);
    }
    if (saveBaseline !== undefined) {
      const perFile: Record<
        string,
        Record<string, { avgNs: number; p50Ns: number }>
      > = {};
      for (const [name, per] of merged.byName) {
        for (const [runtime, stats] of per) {
          perFile[runtime] ??= {};
          perFile[runtime]![name] = {
            avgNs: stats.avgNs,
            p50Ns: stats.p50Ns,
          };
        }
      }
      toSave.files[relFile] = perFile;
    }
  }

  if (saveBaseline !== undefined) {
    Deno.writeTextFileSync(saveBaseline, JSON.stringify(toSave, null, 2));
    console.log(`\nbaseline saved: ${saveBaseline}`);
  }
};

void main();
