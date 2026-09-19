/**
 * @fileoverview `norm upgrade [--dir .]` — bump every `@tundralibs/*`
 * dependency in `deno.json` and `package.json` to its latest JSR version,
 * and refresh `norm.agent.md` + the `AGENTS.md`/`CLAUDE.md` pointer to it
 * (only the section norm itself generates — a project's own notes
 * elsewhere in those files are never touched).
 * @module
 */
import {
  pathExists,
  readTextFile,
  writeTextFile,
} from '@tundralibs/compat/file';
import { latestVersion } from '../latestVersion.ts';
import { ensureAgentDocs } from '../agentDocs.ts';

// Matches a @tundralibs/<pkg> version in either manifest's dep strings:
//   "jsr:@tundralibs/norm@^1.2.3"  or  "npm:@jsr/tundralibs__norm@^1.2.3"
const DENO_DEP = /(@tundralibs\/([a-z-]+)@\^?)(\d+\.\d+\.\d+)/g;
const NPM_DEP = /(@jsr\/tundralibs__([a-z-]+)@\^?)(\d+\.\d+\.\d+)/g;

async function bump(
  file: string,
  re: RegExp,
  cache: Map<string, string | null>,
  resolveVersion: (pkg: string) => Promise<string | null>,
): Promise<string[]> {
  if (!(await pathExists(file))) return [];
  const before = await readTextFile(file);
  const changed: string[] = [];
  const matches = [...before.matchAll(re)];
  let after = before;
  for (const m of matches) {
    const pkg = m[2]!;
    if (!cache.has(pkg)) cache.set(pkg, await resolveVersion(pkg));
    const latest = cache.get(pkg);
    if (latest && latest !== m[3]) {
      after = after.replace(m[0], `${m[1]}${latest}`);
      changed.push(`${pkg} ${m[3]} → ${latest}`);
    }
  }
  if (after !== before) await writeTextFile(file, after);
  return changed;
}

/**
 * The `upgrade` command. Returns the process exit code.
 *
 * `resolveVersion` defaults to the real JSR lookup; tests pass a stub so
 * the suite never depends on network I/O.
 *
 * `log` defaults to `console.log` and exists so the suite can run the
 * command WITHOUT writing to stdout. Node 22's `node:test` runner
 * corrupts its own reporter IPC channel when a `console.log()` is
 * followed by an async file write, repeated in one process — which is
 * exactly what this command does, once per call, across the several
 * calls a test file makes. The failure surfaces as an unrelated
 * "Unable to deserialize cloned data" on whichever file was reporting.
 * Silencing the command in tests removes the trigger outright; ordering
 * the writes before the log (the previous mitigation) only lowered the
 * odds.
 */
export async function upgradeCommand(
  dir = '.',
  resolveVersion: (pkg: string) => Promise<string | null> = latestVersion,
  log: (message: string) => void = console.log,
): Promise<number> {
  const cache = new Map<string, string | null>();
  const changes = [
    ...await bump(`${dir}/deno.json`, DENO_DEP, cache, resolveVersion),
    ...await bump(`${dir}/package.json`, NPM_DEP, cache, resolveVersion),
  ];
  // Still ordered writes-then-log: it costs nothing and keeps the Node 22
  // trigger (see `log`) out of the command's own call, not just out of
  // the suite's.
  await ensureAgentDocs(dir);
  if (changes.length === 0) {
    log('✓ already up to date');
  } else {
    for (const c of [...new Set(changes)]) log(`↑ ${c}`);
  }
  return 0;
}
