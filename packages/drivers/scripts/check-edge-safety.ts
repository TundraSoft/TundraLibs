#!/usr/bin/env -S deno run -A
/**
 * @fileoverview Edge-safety gate for the package root barrel and the
 * SQL-over-HTTP edge drivers.
 *
 * The edge drivers (Neon → Postgres-over-HTTP, Turso and Cloudflare D1 →
 * SQLite-over-HTTP) target
 * edge / serverless runtimes (Cloudflare Workers, Vercel Edge, Deno Deploy)
 * that expose `fetch()` but NOT the Node TCP/TLS stack — and, for the SQLite
 * engines, no native SQLite binding either. This script fails (non-zero exit)
 * if any edge module's **runtime** import graph reaches a module that would
 * drag in raw sockets, a database wire protocol, a native SQLite driver, or a
 * Node networking builtin.
 *
 * The root barrel (`drivers/mod.ts`) is gated by the SAME rules, because it is
 * held to the same promise: it exports the abstract bases, the errors and the
 * shared types, and NO engine, so importing `@tundralibs/drivers` must never be
 * what puts a native SQLite binding or a wire protocol in a bundle. It is
 * listed as an entry precisely so that re-adding an engine export — the exact
 * regression this gate exists to catch — turns red here instead of in a
 * consumer's build.
 *
 * Why the *runtime* graph and not the flat module list:
 *   `deno info --json` lists every statically-referenced module, including
 *   those reached only through `import type`. Type-only edges are erased by
 *   the TS->JS compile and never reach a bundler or an edge runtime — a
 *   type-only reference to a TLS option type (e.g. `EngineSSLOptions`) or to
 *   a utility type re-exported from a barrel is harmless. We therefore walk
 *   only `code` dependency edges from each edge entrypoint; a forbidden module
 *   trips the gate only when it is genuinely loaded at runtime.
 *
 * Adding a future edge engine: append its `mod.ts` to {@link EDGE_ENTRIES}. The
 * same rules apply to every entry — `node:*` builtins fail CLOSED (allowed only
 * unconditionally via {@link ALLOWED_NODE}, currently empty, or through the
 * importer-scoped guard in {@link GUARDED_NODE_IMPORTERS}), and each edge engine
 * may reuse only the pure, transport-free helpers explicitly carved out in
 * {@link forbiddenReason}.
 *
 * No rule was relaxed to admit the barrel. The abstract bases it exports
 * (`BaseEngine`, `ConnectionEngine`, `SQLConnectionEngine`, `SQLEngine`, and the
 * `ConnectionPool` they own) live at the package root, not under
 * `engines/postgres/` or `engines/sqlite/`, so they never matched a forbidden
 * pattern in the first place — they are pure TypeScript over `@tundralibs/utils`
 * and the compat shims, and reach a socket only when a concrete engine
 * implements `_createResource`. "Reaches a base class" was always fine;
 * "reaches a native binding or a socket" was always a failure. That is why the
 * barrel passes today and fails the moment an engine is re-exported from it.
 *
 * Run via: `deno task check:edge-safety` (from packages/drivers), or directly
 * `deno run -A packages/drivers/scripts/check-edge-safety.ts`.
 *
 * @module
 */

/**
 * Entrypoints to gate, resolved relative to this script so CWD does not matter.
 * Add a future edge engine's `mod.ts` here.
 *
 * `barrel` is the package root. It exports no engine — only the abstract bases,
 * the errors and the types — and this entry is what keeps it that way: adding
 * any engine back to `mod.ts` makes this gate fail.
 */
const EDGE_ENTRIES: ReadonlyArray<{ name: string; url: string }> = [
  {
    name: 'barrel',
    url: new URL('../mod.ts', import.meta.url).href,
  },
  {
    name: 'neon',
    url: new URL('../engines/neon/mod.ts', import.meta.url).href,
  },
  {
    name: 'turso',
    url: new URL('../engines/turso/mod.ts', import.meta.url).href,
  },
  {
    name: 'd1',
    url: new URL('../engines/d1/mod.ts', import.meta.url).href,
  },
];

/** Shape of the bits of `deno info --json` output we consume. */
type DepEdge = {
  specifier: string;
  code?: { specifier?: string };
  type?: { specifier?: string };
};
type ModuleNode = {
  specifier: string;
  dependencies?: DepEdge[];
  error?: string;
};
type DenoInfo = { roots: string[]; modules: ModuleNode[] };

/**
 * Node built-ins that are unconditionally edge-safe regardless of importer.
 * Deliberately EMPTY: no Node builtin is safe on every edge runtime, so the
 * base rule for any `node:*` specifier is fail-CLOSED. The builtins that ARE
 * legitimately reachable (`node:fs`/`node:os`/`node:path`) are handled by the
 * importer-scoped carve-out below, never by this blanket set.
 */
const ALLOWED_NODE: ReadonlySet<string> = new Set<string>();

/**
 * Importer-scoped carve-out for the handful of Node built-ins that the edge
 * graphs legitimately reach — but ONLY through the vetted `compat` shims, each
 * of which pulls the builtin via a runtime-guarded dynamic `import()`
 * (`if (isNode || isBun) { … await import('node:fs') … }`, `isDeno` for
 * `node:path`) that never fires on a bare edge runtime. A `node:*` builtin
 * listed here passes the gate ONLY when EVERY module that statically references
 * it is one of the allow-listed importer paths; any other importer (a
 * production edge module reaching for it directly) fails closed. Keyed by the
 * base builtin (`node:fs`), so subpaths (`node:fs/promises`) share the guard.
 */
const GUARDED_NODE_IMPORTERS: Readonly<Record<string, ReadonlyArray<RegExp>>> =
  {
    'node:fs': [/\/compat\/file\.ts$/],
    'node:os': [/\/compat\/file\.ts$/, /\/compat\/runtime\.ts$/],
    'node:path': [/\/compat\/path\.ts$/],
  };

/**
 * Classify a module specifier. Returns a human-readable reason when the
 * module is forbidden in an edge runtime graph, or `null` when it is fine.
 *
 * `importers` is the set of RUNTIME-reachable modules that statically reference
 * `spec` (code edges only); it is consulted for the importer-scoped `node:*`
 * carve-out — a guarded builtin is allowed only when every one of its importers
 * is a vetted compat shim.
 *
 * The rules are shared across every edge engine: an engine that has no business
 * touching Postgres wire code, a native SQLite binding, or a Node builtin
 * should never reach one, so gating all of them everywhere is both correct and
 * future-proof.
 */
function forbiddenReason(
  spec: string,
  importers: ReadonlyArray<string>,
): string | null {
  // Node built-ins — fail CLOSED. Strip any subpath (`node:fs/promises` → `fs`)
  // and require the base builtin to be either unconditionally edge-safe
  // (`ALLOWED_NODE`, currently empty) or reached ONLY through a vetted,
  // runtime-guarded compat shim (`GUARDED_NODE_IMPORTERS`). Any other `node:*`
  // import — a stray `node:crypto`, `node:http2`, `node:worker_threads`,
  // `node:dns/promises`, … — trips the gate, closing the old allowlist-by-
  // omission hole where only an exact set of builtins was denied.
  const nodeBase = spec.match(/^node:([^/]+)/);
  if (nodeBase) {
    const base = nodeBase[1]!;
    if (ALLOWED_NODE.has(base)) return null;
    const guards = GUARDED_NODE_IMPORTERS[`node:${base}`];
    if (
      guards && importers.length > 0 &&
      importers.every((imp) => guards.some((re) => re.test(imp)))
    ) {
      return null;
    }
    return `Node builtin '${spec}'`;
  }

  // Node-only npm database clients. `MariaEngine`/`PlanetScaleEngine` load
  // `npm:mariadb` and `MongoEngine` loads `npm:mongodb`; both sit on the Node
  // TCP/TLS stack and neither runs on an edge runtime. They are NOT caught by
  // any rule below — they are neither a `node:` builtin nor one of this
  // package's own wire modules — so without this they would slip through, as
  // they did before the root barrel became an entry here. Deny is by package
  // name (and by the `$maria`/`$mongo` import-map aliases, in case a specifier
  // reaches the graph unresolved) rather than blanket-denying `npm:`, so a
  // future edge engine can still reuse a genuinely fetch-only npm package.
  if (/^(npm:|\$)(maria(db)?|mongo(db)?)(@|\/|$)/.test(spec)) {
    return `Node-only npm database client '${spec}'`;
  }

  // Native SQLite bindings (the native `SQLiteEngine`'s adapter loads one of
  // these per runtime). None exist on the edge; the Turso engine must reach
  // its SQLite surface only through the pure `sqlite/errorCodes.ts`.
  if (/^bun:sqlite$/.test(spec)) return "Bun builtin 'bun:sqlite'";
  if (/(^|[:/])better-sqlite3(@|\/|$)/.test(spec)) {
    return 'native module better-sqlite3';
  }
  if (/@db\/sqlite/.test(spec) || /\bsqlite_deno\b/.test(spec)) {
    return 'native module @db/sqlite';
  }

  // compat raw-socket + server transports.
  if (/\/compat\/net\.ts$/.test(spec)) return 'compat/net.ts (raw TCP/TLS)';
  if (/\/compat\/udp\.ts$/.test(spec)) return 'compat/udp.ts (raw UDP)';
  if (/\/compat\/webserver\//.test(spec)) {
    return 'compat/webserver (HTTP server)';
  }
  if (/\/compat\/websocket\//.test(spec)) {
    return 'compat/websocket (WebSocket)';
  }

  // Postgres TCP wire protocol. Match the drivers-postgres path suffix (NOT a
  // bare `binary.ts`, which would false-positive on @std/yaml/_type/binary.ts)
  // and allow the two PURE, socket-free modules the Neon driver legitimately
  // reuses: `values.ts` (value decoding) and `sqlState.ts` (SQLSTATE map).
  const pg = spec.match(/\/drivers\/engines\/postgres\/(.+)$/);
  if (pg) {
    const base = pg[1].split('/').pop() ?? pg[1];
    if (base !== 'values.ts' && base !== 'sqlState.ts') {
      return `Postgres wire module (engines/postgres/${pg[1]})`;
    }
  }

  // Native SQLite engine surface. Allow only the PURE `errorCodes.ts` the
  // Turso driver reuses; everything else there (adapter.ts, Engine.ts, …)
  // imports a native SQLite binding.
  const sqlite = spec.match(/\/drivers\/engines\/sqlite\/(.+)$/);
  if (sqlite) {
    const base = sqlite[1].split('/').pop() ?? sqlite[1];
    if (base !== 'errorCodes.ts') {
      return `native SQLite engine module (engines/sqlite/${sqlite[1]})`;
    }
  }

  return null;
}

/** Pretty, repo-relative form of a module specifier for console output. */
function short(spec: string): string {
  return spec.replace(/^file:\/\/.*?\/packages\//, 'packages/').replace(
    /^file:\/\//,
    '',
  );
}

/** Collect the forbidden modules RUNTIME-reachable from one edge entrypoint. */
async function auditEntry(
  entryUrl: string,
): Promise<
  { reachable: number; offenders: Array<{ spec: string; chain: string[] }> }
> {
  const cmd = new Deno.Command('deno', {
    args: ['info', '--json', entryUrl],
    stdout: 'piped',
    stderr: 'piped',
  });
  const { code, stdout, stderr } = await cmd.output();
  if (code !== 0) {
    console.error(`\`deno info --json ${short(entryUrl)}\` failed:`);
    console.error(new TextDecoder().decode(stderr));
    Deno.exit(2);
  }

  const info = JSON.parse(new TextDecoder().decode(stdout)) as DenoInfo;
  const bySpec = new Map(info.modules.map((m) => [m.specifier, m]));
  const root = info.roots[0]!;

  // BFS over CODE (runtime) edges only. Track a parent link so we can print a
  // minimal import chain for any offender.
  const parent = new Map<string, string>();
  const reachable = new Set<string>([root]);
  const queue = [root];
  while (queue.length) {
    const cur = queue.shift()!;
    const mod = bySpec.get(cur);
    if (!mod?.dependencies) continue;
    for (const dep of mod.dependencies) {
      const next = dep.code?.specifier;
      if (!next || reachable.has(next)) continue;
      reachable.add(next);
      parent.set(next, cur);
      queue.push(next);
    }
  }

  // Map each reachable module to ALL reachable modules that statically import
  // it (code edges) — the importer-scoped `node:*` carve-out must see EVERY
  // importer, not just the first BFS parent, so an unvetted importer can't hide
  // behind a vetted one.
  const importersOf = new Map<string, string[]>();
  for (const spec of reachable) {
    const mod = bySpec.get(spec);
    if (!mod?.dependencies) continue;
    for (const dep of mod.dependencies) {
      const next = dep.code?.specifier;
      if (!next || !reachable.has(next)) continue;
      const list = importersOf.get(next);
      if (list) list.push(spec);
      else importersOf.set(next, [spec]);
    }
  }

  const chain = (spec: string): string[] => {
    const out: string[] = [];
    let cur: string | undefined = spec;
    while (cur) {
      out.unshift(short(cur));
      cur = parent.get(cur);
      if (out.length > 64) break;
    }
    return out;
  };

  const offenders: Array<{ spec: string; reason: string; chain: string[] }> =
    [];
  for (const spec of reachable) {
    const reason = forbiddenReason(spec, importersOf.get(spec) ?? []);
    if (reason) offenders.push({ spec, reason, chain: chain(spec) });
  }
  offenders.sort((a, b) => a.spec.localeCompare(b.spec));
  return { reachable: reachable.size, offenders };
}

async function main(): Promise<never> {
  let anyFailed = false;

  for (const { name, url } of EDGE_ENTRIES) {
    const { reachable, offenders } = await auditEntry(url);
    if (offenders.length === 0) {
      console.log(
        `edge-safety OK (${name}): ${reachable} runtime modules reachable ` +
          `from ${short(url)}; none pull a disallowed node: builtin (only ` +
          `fs/os/path via the guarded compat shims), a native SQLite binding, ` +
          `a Node-only npm database client, compat ` +
          `net/udp/webserver/websocket, or a database wire protocol.`,
      );
      continue;
    }

    anyFailed = true;
    console.error(
      `edge-safety FAILED (${name}): ${offenders.length} forbidden module(s) ` +
        `are RUNTIME-reachable from ${short(url)}:\n`,
    );
    for (const { reason, chain } of offenders) {
      console.error(`  x ${reason}`);
      console.error('      via: ' + chain.join('\n           -> '));
      console.error('');
    }
  }

  Deno.exit(anyFailed ? 1 : 0);
}

await main();
