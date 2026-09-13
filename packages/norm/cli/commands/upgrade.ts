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
 */
export async function upgradeCommand(
  dir = '.',
  resolveVersion: (pkg: string) => Promise<string | null> = latestVersion,
): Promise<number> {
  const cache = new Map<string, string | null>();
  const changes = [
    ...await bump(`${dir}/deno.json`, DENO_DEP, cache, resolveVersion),
    ...await bump(`${dir}/package.json`, NPM_DEP, cache, resolveVersion),
  ];
  // ensureAgentDocs() runs BEFORE the summary is logged — not just after —
  // because a console.log() immediately preceding a new async file-write
  // call, repeated across calls in the same process, triggers a Node 22
  // `node:test` runner bug that corrupts the test-reporter IPC channel
  // ("Unable to deserialize cloned data due to invalid or unsupported
  // version"). Confirmed by direct bisection: swapping the order alone
  // takes the failure rate from ~majority of runs to zero across dozens
  // of trials. Node 24, Deno, and Bun are unaffected either way.
  await ensureAgentDocs(dir);
  if (changes.length === 0) {
    console.log('✓ already up to date');
  } else {
    for (const c of [...new Set(changes)]) console.log(`↑ ${c}`);
  }
  return 0;
}
