#!/usr/bin/env -S deno run -A
/**
 * @fileoverview Browser-bundlability gate for every published export in the
 * workspace.
 *
 * The first golden rule is that a package must LOAD on all five targets —
 * Deno, Bun, Node, Workers and the browser — unless it documents otherwise.
 * "Loads in a browser" in practice means "a bundler can resolve its import
 * graph", and nothing was checking that: on 2026-09-22 fourteen of the twenty
 * package barrels could not be bundled at all, every one of them aborting on
 * the same `cloudflare:sockets` specifier in `compat/net.ts`. Packages with no
 * business touching a socket — `guardian`, `crypt`, `radrouter`, `metro-man` —
 * were among the casualties, which is what a missing gate looks like.
 *
 * This walks the `exports` map of every workspace package and bundles each
 * entry for the browser. It fails CLOSED: a new export is gated the moment it
 * is published, and an export may only fail if it is listed in
 * {@link RUNTIME_ONLY} with a reason.
 *
 * Scope note: this is the *bundlability* gate — can a bundler resolve the
 * graph at all. It is deliberately not a bundle-SIZE or purity gate; the
 * narrower "does an edge entrypoint reach a socket or a native binding" rule
 * lives in `packages/drivers/scripts/check-edge-safety.ts`, which this does not
 * replace.
 *
 * Run via `deno task check:bundle`.
 *
 * @module
 */

/**
 * Exports that legitimately cannot bundle for a browser, each with the reason
 * it is exempt. Keys are `<package><subpath>` as reported below — e.g.
 * `norm/cli`, or `drivers` for a package's root barrel.
 *
 * Add an entry ONLY for an export whose whole purpose is a capability the
 * browser does not have (a native binding, a filesystem CLI). An export that
 * merely *reaches* runtime-only code through a barrel is the bug this gate
 * exists to catch — narrow its imports instead of listing it here.
 */
const RUNTIME_ONLY: Record<string, string> = {
  'drivers/engines': 'engine barrel: loads every native driver binding',
  'drivers/sqlite': 'native SQLite binding (jsr:@db/sqlite / bun:sqlite)',
  'norm/engines/sqlite': 'native SQLite binding, via the drivers engine',
  'norm/cli': 'filesystem + process CLI entrypoint',
  'rapid/cli': 'filesystem + process CLI entrypoint',
};

/** One gated entry: the published name, and the file it resolves to. */
type Entry = { readonly name: string; readonly path: string };

/** Every `exports` entry of every workspace package, in package order. */
async function entries(): Promise<Entry[]> {
  const names: string[] = [];
  for await (const e of Deno.readDir('packages')) {
    if (e.isDirectory) names.push(e.name);
  }
  names.sort();
  const out: Entry[] = [];
  for (const pkg of names) {
    let config: { exports?: Record<string, string> };
    try {
      config = JSON.parse(
        await Deno.readTextFile(`packages/${pkg}/deno.json`),
      );
    } catch {
      continue; // not a published package
    }
    for (const [subpath, file] of Object.entries(config.exports ?? {})) {
      out.push({
        name: `${pkg}${subpath === '.' ? '' : subpath.slice(1)}`,
        path: `packages/${pkg}/${file.replace(/^\.\//, '')}`,
      });
    }
  }
  return out;
}

/** Bundle one entry for the browser; resolves to the stderr on failure. */
async function bundles(entry: Entry): Promise<string | null> {
  const { code, stderr } = await new Deno.Command('deno', {
    args: ['bundle', '--platform', 'browser', entry.path, '-o', '/dev/null'],
    stdout: 'null',
    stderr: 'piped',
  }).output();
  if (code === 0) return null;
  return new TextDecoder().decode(stderr)
    // deno bundle colourises; strip so CI logs stay readable.
    .replace(/\x1b\[[0-9;]*m/g, '')
    .split('\n')
    .filter((l) => l.includes('error:') || l.includes('at file'))
    .slice(0, 2)
    .join(' ')
    .trim();
}

const all = await entries();
const broke: string[] = [];
const fixed: string[] = [];

for (const entry of all) {
  const failure = await bundles(entry);
  const exempt = entry.name in RUNTIME_ONLY;
  if (failure !== null && !exempt) {
    broke.push(`  ${entry.name}\n      ${failure}`);
  }
  // An exemption that starts passing is stale — the gate should widen, not
  // keep a carve-out that no longer carves anything out.
  if (failure === null && exempt) fixed.push(entry.name);
}

console.log(
  `Checked ${all.length} exports (${
    Object.keys(RUNTIME_ONLY).length
  } runtime-only, exempt).`,
);

if (fixed.length > 0) {
  console.log(
    `\nThese are listed as runtime-only but now bundle — drop them from RUNTIME_ONLY:`,
  );
  for (const name of fixed) console.log(`  ${name}`);
}

if (broke.length > 0) {
  console.error(`\n${broke.length} export(s) cannot be bundled for a browser:`);
  console.error(broke.join('\n'));
  console.error(
    `\nNarrow the offending imports onto subpaths (see ROADMAP.md, "Barrel-pull hygiene"),\n` +
      `or — only if the export's whole purpose is a browser-less capability — add it to\n` +
      `RUNTIME_ONLY in ${import.meta.url.split('/').pop()} with a reason.`,
  );
  Deno.exit(1);
}

if (fixed.length > 0) Deno.exit(1);
console.log('All non-exempt exports bundle for the browser.');
