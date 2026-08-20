/// <reference lib="deno.ns" />
/**
 * @fileoverview Cross-runtime bench aggregator: runs each given
 * `.bench.ts` file under Deno, Bun, and Node (via tsx), collects the
 * `BENCH_FORMAT=json` reports the `./bench` harness emits, and merges
 * them into one table with a column per runtime.
 *
 * A repo tool, not package API — Deno-only on purpose (it SPAWNS the
 * three runtimes; it doesn't need to run on them).
 *
 *     deno run --allow-run --allow-read --allow-env \
 *       packages/compat/scripts/bench-all.ts packages/compat/path.bench.ts
 *
 * Bun and tsx resolve `tsconfig.json` from the working directory, so
 * each file's lanes run with cwd at its own package root — a
 * decorator-using package's compiler overrides would otherwise be
 * silently ignored (the monorepo's known tsconfig-cwd trap).
 *
 * @module
 */

import type { BenchReport, BenchStats } from '../bench.ts';

type Lane = { runtime: 'DENO' | 'BUN' | 'NODE'; cmd: string; args: string[] };

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

const runLane = async (
  lane: Lane,
  file: string,
  filter: string | undefined,
): Promise<BenchReport | undefined> => {
  const cwd = lane.runtime === 'DENO' ? ROOT : packageDirOf(file);
  const rel = file.startsWith(cwd) ? file.slice(cwd.length + 1) : file;
  const command = new Deno.Command(lane.cmd, {
    args: [...lane.args, lane.runtime === 'DENO' ? file : rel],
    cwd,
    env: {
      BENCH_FORMAT: 'json',
      ...(filter !== undefined ? { BENCH_FILTER: filter } : {}),
    },
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
  // The report is the last stdout line — anything before it is the
  // benched module's own logging.
  const lines = new TextDecoder().decode(stdout).trim().split('\n');
  try {
    return JSON.parse(lines[lines.length - 1]!) as BenchReport;
  } catch {
    console.error(`${lane.runtime} lane for ${file} emitted no JSON report`);
    return undefined;
  }
};

const main = async (): Promise<void> => {
  let filter: string | undefined;
  const files = Deno.args.filter((arg) => {
    if (arg.startsWith('--filter=')) {
      filter = arg.slice('--filter='.length);
      return false;
    }
    return true;
  });
  if (files.length === 0) {
    console.error(
      'usage: bench-all.ts [--filter=<substr|/regex/>] <file.bench.ts> [more ...]',
    );
    Deno.exitCode = 1;
    return;
  }
  const lanes: Lane[] = [
    {
      runtime: 'DENO',
      cmd: 'deno',
      args: ['run', '--allow-env', '--allow-read', '--config', 'deno.json'],
    },
    { runtime: 'BUN', cmd: 'bun', args: ['run'] },
    { runtime: 'NODE', cmd: 'node', args: ['--import', 'tsx'] },
  ];

  for (const file of files) {
    console.log(`\n== ${file} ==`);
    // Sequential on purpose: concurrent lanes would contend for CPU
    // and corrupt each other's numbers.
    const reports = new Map<string, BenchReport>();
    for (const lane of lanes) {
      const report = await runLane(lane, file, filter);
      if (report) reports.set(lane.runtime, report);
    }
    if (reports.size === 0) continue;

    // Merge on bench name, preserving first-seen registration order.
    const names: string[] = [];
    const byName = new Map<string, Map<string, BenchStats>>();
    for (const [runtime, report] of reports) {
      for (const stat of report.benches) {
        if (!byName.has(stat.name)) {
          byName.set(stat.name, new Map());
          names.push(stat.name);
        }
        byName.get(stat.name)!.set(runtime, stat);
      }
    }

    const runtimes = [...reports.keys()];
    const head = ['benchmark', ...runtimes.map((r) => `${r} avg`)];
    const rows = names.map((name) => {
      const per = byName.get(name)!;
      const avgs = runtimes.map((r) => per.get(r)?.avgNs);
      const best = Math.min(
        ...avgs.filter((a): a is number => a !== undefined),
      );
      return [
        name,
        ...avgs.map((a) =>
          a === undefined ? '-' : `${fmtTime(a)}${a === best ? ' *' : ''}`
        ),
      ];
    });
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
  }
};

void main();
