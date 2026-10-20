#!/usr/bin/env -S deno run --allow-read --allow-net
/**
 * @fileoverview Hold one package's JSR publish until every in-repo
 * dependency it was built against is live on JSR.
 *
 * The release workflow publishes every released package in parallel, but
 * packages depend on each other (`workspace:*`), and `deno publish` pins
 * each one to `^<the version in this commit>`. JSR resolves those
 * constraints when it PROCESSES the upload, so a dependent processed before
 * its dependency fails with `unresolvableJsrDependency`. On 2026-10-19
 * JSR's queue ran about an hour behind: rapid 0.13.0 was processed before
 * norm 1.12.0 existed and failed, and the job was cancelled while
 * `deno publish` still waited, so its retry loop never ran.
 *
 * Usage:
 *   publish-wait.ts packages/rapid           wait, then exit 0 (or 1 on timeout)
 *   publish-wait.ts --plan packages/a ...    dry run: print the order a set
 *                                            of released packages can go live
 * Options: --timeout-min <n> (default 150), --interval-sec <n> (default 30).
 *
 * A dependency that was not part of this release is already live at that
 * version, so it passes on the first check; the single-package manual
 * republish path works unchanged.
 */

type Pkg = { name: string; version: string; dir: string; deps: string[] };

const ROOT = new URL('../../', import.meta.url);

/** Every workspace package by name: version + runtime in-repo deps. */
function workspace(): Map<string, Pkg> {
  const out = new Map<string, Pkg>();
  for (const entry of Deno.readDirSync(new URL('packages/', ROOT))) {
    if (!entry.isDirectory) continue;
    const dir = `packages/${entry.name}`;
    let deno: { name?: string; version?: string };
    let npm: { dependencies?: Record<string, string> };
    try {
      deno = JSON.parse(
        Deno.readTextFileSync(new URL(`${dir}/deno.json`, ROOT)),
      );
      npm = JSON.parse(
        Deno.readTextFileSync(new URL(`${dir}/package.json`, ROOT)),
      );
    } catch {
      continue; // not a published package
    }
    if (!deno.name || !deno.version) continue;
    // Runtime deps only: the published graph never contains devDependencies.
    const deps = Object.entries(npm.dependencies ?? {})
      .filter(([n, spec]) =>
        n.startsWith('@tundralibs/') && spec.startsWith('workspace:')
      )
      .map(([n]) => n);
    out.set(deno.name, { name: deno.name, version: deno.version, dir, deps });
  }
  return out;
}

/** Whether `name@version` exists on JSR (a version still queued or that
 * failed processing does not). */
async function isLive(name: string, version: string): Promise<boolean> {
  const [scope, pkg] = name.slice(1).split('/');
  const res = await fetch(
    `https://api.jsr.io/scopes/${scope}/packages/${pkg}/versions/${version}`,
  );
  await res.body?.cancel();
  return res.ok;
}

/** Topological levels of `released` by in-repo deps: level n can go live
 * once levels < n are live. Deps outside the set are already published. */
export function plan(released: Pkg[]): Pkg[][] {
  const pending = new Map(released.map((p) => [p.name, p]));
  const levels: Pkg[][] = [];
  while (pending.size > 0) {
    const level = [...pending.values()].filter((p) =>
      p.deps.every((d) => !pending.has(d))
    );
    if (level.length === 0) {
      throw new Error(
        `dependency cycle among: ${[...pending.keys()].join(', ')}`,
      );
    }
    for (const p of level) pending.delete(p.name);
    levels.push(level.sort((a, b) => a.name.localeCompare(b.name)));
  }
  return levels;
}

function flag(args: string[], name: string, fallback: number): number {
  const i = args.indexOf(name);
  return i === -1 ? fallback : Number(args[i + 1]);
}

if (import.meta.main) {
  const args = Deno.args;
  const all = workspace();
  const byDir = new Map([...all.values()].map((p) => [p.dir, p]));
  const pick = (dir: string): Pkg => {
    const p = byDir.get(dir.replace(/\/+$/, ''));
    if (!p) throw new Error(`not a workspace package: ${dir}`);
    return p;
  };

  if (args[0] === '--plan') {
    const levels = plan(args.slice(1).map(pick));
    levels.forEach((level, i) => {
      for (const p of level) {
        const gates = p.deps.filter((d) => level.every((q) => q.name !== d))
          .map((d) => `${d}@${all.get(d)!.version}`);
        console.log(
          `${i + 1}. ${p.name}@${p.version}  waits for: ${
            gates.join(', ') || '(none)'
          }`,
        );
      }
    });
    Deno.exit(0);
  }

  const target = pick(args[0] ?? '');
  const deadline = Date.now() + flag(args, '--timeout-min', 150) * 60_000;
  const interval = flag(args, '--interval-sec', 30) * 1000;
  let waiting = target.deps.map((d) => ({
    name: d,
    version: all.get(d)!.version,
  }));
  while (true) {
    const live = await Promise.all(
      waiting.map((d) => isLive(d.name, d.version).catch(() => false)),
    );
    waiting = waiting.filter((_, i) => !live[i]);
    if (waiting.length === 0) {
      console.log(
        `${target.name}@${target.version}: every in-repo dependency is live on JSR`,
      );
      Deno.exit(0);
    }
    const list = waiting.map((d) => `${d.name}@${d.version}`).join(', ');
    if (Date.now() >= deadline) {
      console.log(
        `::error::${target.name}@${target.version}: still not live on JSR: ${list}`,
      );
      Deno.exit(1);
    }
    console.log(`${target.name}@${target.version}: waiting for ${list}`);
    await new Promise((r) => setTimeout(r, interval));
  }
}
