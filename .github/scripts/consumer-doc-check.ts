/**
 * @fileoverview Verifies that each published package's shipped documentation
 * examples compile from a *consumer's* perspective, not the workspace's.
 *
 * The in-repo `deno check --doc-only` gate resolves `@tundralibs/*` as
 * workspace members, so a doc example importing a sibling package passes even
 * though a consumer who installed only this package cannot resolve it. This
 * script closes that blind spot: it installs each package standalone from JSR
 * and re-checks the docs that actually shipped in the tarball.
 *
 * Docs are copied out of `node_modules` before checking — Deno skips files
 * inside `node_modules`, so checking them in place silently passes.
 *
 * Usage:
 *   deno run -A .github/scripts/consumer-doc-check.ts [--only <pkg>] [--keep]
 *                                                     [--local]
 *
 * `--local` tests the **working tree** instead of the published tarball: the
 * package is still installed from JSR to obtain a realistic dependency graph
 * and consumer-shaped resolution, then its `.ts`/`.md` files are overwritten
 * from `packages/<pkg>`. Use it to validate a fix before releasing. Its
 * `package.json`/`deno.json` are deliberately left as installed, so dependency
 * aliasing (`@jsr/tundralibs__*`) keeps working.
 *
 * `--local` LIMITATION: the installed package resolves types through its
 * generated `_dist/*.d.ts`, which the overlay does not regenerate. So a fix
 * whose only effect is in the emitted declaration (e.g. exporting a type that
 * was previously inlined, which stops a parameter degrading to `never`) will
 * NOT show green under `--local` even when correct.
 *
 * ⚠️ `deno publish --dry-run` does NOT reliably catch this class of bug
 * either — its "slow types" check verifies the package is fast-check
 * COMPATIBLE, not that the emitted `.d.ts` is CORRECT. Confirmed
 * 2026-08-17: `getFreePort`'s destructured-in-the-signature parameter
 * passed `--dry-run` clean while the real published tarball (utils
 * 1.0.5) still emitted `(_dts_1: never)` for it — a signature-position
 * destructuring pattern JSR's npm-compat generator mishandles even when
 * "slow types" has nothing to flag. The only fully reliable
 * verification for a declaration-emission fix is: republish, then
 * re-run this check (without `--local`) against the real thing.
 *
 * @module
 */

const MANIFEST = '.release-please-manifest.json';

/** Packages deliberately not checked, with the reason. */
const SKIP: Record<string, string> = {
  doctor: 'pending revamp — docs will be rewritten with the package',
};

/**
 * Sibling packages whose presence a package's examples legitimately require —
 * integration recipes, or an opt-in path like norm's bring-your-own-engine.
 *
 * Declaring one here installs it before checking, so the example compiles.
 * It does NOT excuse the doc: the example must still tell the reader to install
 * it (see CONVENTIONS.md, "Documentation examples use public specifiers").
 *
 * Keep this list short and justified. Anything NOT declared here that a doc
 * imports is a genuine defect — a reader who installed only this package
 * cannot resolve it — and the check will fail, which is the point.
 *
 * A bare name means the sibling `@tundralibs/<name>`. An entry containing ':'
 * is passed through verbatim, for third-party packages an example genuinely
 * demonstrates (e.g. 'npm:ws').
 */
const DOC_PEERS: Record<string, string[]> = {
  // norm's BYO-engine path deliberately takes a driver instance.
  norm: ['drivers'],
  // Observability recipes: ambient/slogger/tracer document each other's wiring.
  ambient: ['slogger', 'tracer'],
  slogger: ['ambient', 'tracer'],
  tracer: ['norm', 'slogger', 'drivers', 'restler', 'radrouter'],
  // Servers/routers demonstrate the compat webserver they run on.
  rpc: ['compat', 'guardian'],
  radrouter: ['compat', 'guardian'],
  // Engines document the query layer and shared helpers they build on.
  drivers: ['oql', 'utils'],
  // Validation and token recipes.
  id: ['guardian'],
  pact: ['crypt'],
  // getFreePort's test-fixture examples import the compat test harness.
  utils: ['compat'],
  // compat's webserver docs show the raw `ws` npm client as an alternative;
  // `ws` ships no types, so a reader following that snippet also needs @types/ws.
  compat: ['npm:ws', 'npm:@types/ws'],
};

type Failure = { pkg: string; detail: string };

const args = Deno.args;
const only = args.includes('--only')
  ? args[args.indexOf('--only') + 1]
  : undefined;
const keep = args.includes('--keep');
const local = args.includes('--local');

// Mirror the workspace's own compilerOptions rather than hardcoding them — the
// suite's TC39-standard-vs-experimental decorator mode lives here, and forcing
// the wrong one makes every decorator example fail for the wrong reason. Read
// it once so the harness tracks the repo instead of drifting from it.
const ROOT_COMPILER_OPTIONS: Record<string, unknown> = (() => {
  try {
    return JSON.parse(Deno.readTextFileSync('deno.json')).compilerOptions ?? {};
  } catch {
    return { lib: ['deno.window', 'deno.ns', 'deno.unstable'] };
  }
})();

const manifest = JSON.parse(await Deno.readTextFile(MANIFEST)) as
  Record<string, string>;
const packages = Object.keys(manifest)
  .map((p) => p.replace('packages/', ''))
  .filter((p) => !(p in SKIP))
  .filter((p) => !only || p === only);

console.log(`Checking ${packages.length} package(s) as a consumer would.\n`);
for (const [pkg, why] of Object.entries(SKIP)) {
  if (!only) console.log(`  skipping ${pkg}: ${why}`);
}

const failures: Failure[] = [];

for (const pkg of packages) {
  const dir = await Deno.makeTempDir({ prefix: `consumer-${pkg}-` });
  try {
    await run(['npm', 'init', '-y'], dir);

    const peers = DOC_PEERS[pkg] ?? [];
    // Sibling packages install via `jsr add`; third-party deps (entries with a
    // ':' such as 'npm:ws') via `npm install`, because `jsr add` rejects npm
    // specifiers — and does so with exit code 0, so its output must be checked.
    const jsrSpecs = [pkg, ...peers.filter((p) => !p.includes(':'))]
      .map((p) => `@tundralibs/${p}`);
    const npmSpecs = peers
      .filter((p) => p.startsWith('npm:'))
      .map((p) => p.slice(4));

    const add = await run(['npx', '--yes', 'jsr', 'add', ...jsrSpecs], dir);
    if (add.code !== 0 || /error|invalid/i.test(add.err + add.out)) {
      failures.push({ pkg, detail: `jsr install failed:\n${(add.err + add.out).slice(-800)}` });
      continue;
    }
    if (npmSpecs.length) {
      const npmAdd = await run(['npm', 'install', ...npmSpecs], dir);
      if (npmAdd.code !== 0) {
        failures.push({ pkg, detail: `npm install failed:\n${npmAdd.err.slice(-800)}` });
        continue;
      }
    }

    // Mirror the workspace's compilerOptions exactly. Anything that differs
    // here shows up as a doc failure caused by this harness rather than by
    // packaging — omitting `lib`, for instance, changes inference enough to
    // produce spurious implicit-any errors on callbacks. Keep in sync with the
    // root deno.json so the only variable under test is consumer resolution.
    await Deno.writeTextFile(
      `${dir}/deno.json`,
      JSON.stringify({
        // 'auto' so third-party packages an example legitimately demonstrates
        // (express, @types/node) are fetched rather than reported as failures.
        // Those are not defects — a reader following such an example installs
        // them too. The signal we want is a *sibling @tundralibs* package the
        // reader was never told to install.
        nodeModulesDir: 'auto',
        // Deno refuses packages published in the last 24h by default (supply
        // chain policy). This checker deliberately tests the newest published
        // version, and a run just after a release wave would otherwise fail on
        // every package with "blocked by the minimum dependency age policy".
        minimumDependencyAge: 'PT0S',
        compilerOptions: ROOT_COMPILER_OPTIONS,
      }),
    );

    const installed = `${dir}/node_modules/@tundralibs/${pkg}`;

    // Report the version actually resolved. This checks the PUBLISHED tarball,
    // which can lag the working tree — during a release wave especially, a
    // failure here may already be fixed in the repo but not yet on the registry.
    let version = 'unknown';
    try {
      version = JSON.parse(
        await Deno.readTextFile(`${installed}/package.json`),
      ).version ?? 'unknown';
    } catch { /* fall through with 'unknown' */ }

    if (local) {
      // Overlay the working tree onto the installed package: source and docs
      // only. package.json / deno.json stay as installed so the dependency
      // aliases npm created (@jsr/tundralibs__*) continue to resolve.
      //
      // NOTE: cross-package *resolution* (the primary thing this check exists
      // for) is exercised faithfully. But a symbol's TYPES still resolve through
      // the installed `_dist/*.d.ts`, which the overlay does not regenerate. A
      // fix whose only effect is in the emitted declaration therefore stays red
      // under `--local` until the package republishes — `deno publish --dry-run`
      // is NOT a substitute (its slow-type check misses at least one real bug
      // class; see the module docstring). Republish, then re-run this check
      // WITHOUT `--local` to confirm.
      await overlay(`packages/${pkg}`, installed);
      version = `${version}+worktree`;
    }

    const docs = await collectDocs(installed);
    if (docs.length === 0) {
      failures.push({ pkg, detail: 'no README.md or docs/*.md in the tarball' });
      continue;
    }

    // Copy out of node_modules — Deno will not walk files inside it.
    const staged = `${dir}/_shipped_docs`;
    await Deno.mkdir(staged, { recursive: true });
    const rel: string[] = [];
    for (const src of docs) {
      const flat = src.slice(installed.length + 1).replaceAll('/', '__');
      await Deno.copyFile(src, `${staged}/${flat}`);
      rel.push(`_shipped_docs/${flat}`);
    }

    const check = await run(['deno', 'check', '--doc-only', ...rel], dir);
    if (check.code !== 0) {
      failures.push({ pkg, detail: `v${version}\n${strip(check.err).trim().slice(-2000)}` });
      console.log(`  ✗ ${pkg} v${version}`);
    } else {
      console.log(`  ✓ ${pkg} v${version} (${docs.length} doc file(s))`);
    }
  } catch (err) {
    failures.push({
      pkg,
      detail: err instanceof Error ? err.message : String(err),
    });
  } finally {
    if (!keep) await Deno.remove(dir, { recursive: true }).catch(() => {});
    else console.log(`    kept: ${dir}`);
  }
}

if (failures.length === 0) {
  console.log(`\nAll ${packages.length} package(s) pass from a consumer install.`);
  Deno.exit(0);
}

console.log(`\n${failures.length} package(s) failed:\n`);
for (const f of failures) {
  console.log(`### ${f.pkg}\n${f.detail}\n`);
}
console.log(
  'These examples compile in the workspace but not for someone who installed\n' +
    'only this package — usually a doc importing a sibling @tundralibs package\n' +
    'without telling the reader to install it too.',
);
Deno.exit(1);

/** Runs a command, capturing output. */
async function run(cmd: string[], cwd: string) {
  const p = new Deno.Command(cmd[0], {
    args: cmd.slice(1),
    cwd,
    stdout: 'piped',
    stderr: 'piped',
  });
  const { code, stdout, stderr } = await p.output();
  return {
    code,
    out: new TextDecoder().decode(stdout),
    err: new TextDecoder().decode(stderr),
  };
}

/**
 * Copies working-tree `.ts` / `.md` files over an installed package so the
 * unreleased state can be checked. Config files are skipped on purpose — the
 * installed ones carry the npm dependency aliases. Test, bench and fixture
 * files are skipped as they never affect doc resolution.
 */
async function overlay(from: string, to: string) {
  for await (const src of walk(from)) {
    const rel = src.slice(from.length + 1);
    if (rel.startsWith('node_modules/') || rel.startsWith('_dist/')) continue;
    if (/\.(test|bench)\.ts$/.test(rel)) continue;
    if (rel === 'package.json' || rel === 'deno.json') continue;
    if (!rel.endsWith('.ts') && !rel.endsWith('.md')) continue;
    const dest = `${to}/${rel}`;
    await Deno.mkdir(dest.slice(0, dest.lastIndexOf('/')), { recursive: true });
    await Deno.copyFile(src, dest);
  }
}

/** README.md plus every shipped markdown doc, recursively. */
async function collectDocs(root: string): Promise<string[]> {
  const found: string[] = [];
  const readme = `${root}/README.md`;
  if (await exists(readme)) found.push(readme);
  for await (const entry of walk(root)) {
    if (entry.endsWith('.md') && !entry.endsWith('README.md') &&
      !entry.endsWith('CHANGELOG.md')) found.push(entry);
  }
  return found;
}

async function* walk(dir: string): AsyncGenerator<string> {
  for await (const e of Deno.readDir(dir)) {
    const path = `${dir}/${e.name}`;
    if (e.isDirectory) {
      if (e.name === 'node_modules' || e.name === '_dist') continue;
      yield* walk(path);
    } else yield path;
  }
}

async function exists(path: string) {
  try {
    await Deno.stat(path);
    return true;
  } catch {
    return false;
  }
}

/** Strips ANSI colour codes so CI logs and issue bodies stay readable. */
function strip(s: string) {
  // deno-lint-ignore no-control-regex
  return s.replace(/\x1b\[[0-9;]*m/g, '');
}
