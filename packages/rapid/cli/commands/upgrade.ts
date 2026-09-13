/**
 * @fileoverview `rapid upgrade [--dir .]` — bump every `@tundralibs/*`
 * dependency in `deno.json` and `package.json` to its latest JSR version,
 * and refresh the generated `.agent.md` files + the `AGENTS.md`/`CLAUDE.md`/
 * copilot pointer sections (only what rapid itself generates — a project's
 * own notes elsewhere in those files are never touched). `upgrade` has no
 * `ScaffoldAnswers` (that's `init`-only), so which optional guides to
 * refresh is detected from what's already on disk.
 * @module
 */
import {
  pathExists,
  readTextFile,
  writeTextFile,
} from '@tundralibs/compat/file';
import { latestVersion } from '../latestVersion.ts';
import { ensureSection } from '../markdown.ts';
import { agentDocs, CLAUDE_BODY, COPILOT_BODY } from '../templates.ts';

// Matches a @tundralibs/<pkg> version in either manifest's dep strings:
//   "jsr:@tundralibs/rapid@^1.2.3"  or  "npm:@jsr/tundralibs__rapid@^1.2.3"
const DENO_DEP = /(@tundralibs\/([a-z-]+)@\^?)(\d+\.\d+\.\d+)/g;
const NPM_DEP = /(@jsr\/tundralibs__([a-z-]+)@\^?)(\d+\.\d+\.\d+)/g;

async function bump(
  file: string,
  re: RegExp,
  cache: Map<string, string | null>,
): Promise<string[]> {
  if (!(await pathExists(file))) return [];
  const before = await readTextFile(file);
  const changed: string[] = [];
  const matches = [...before.matchAll(re)];
  let after = before;
  for (const m of matches) {
    const pkg = m[2]!;
    if (!cache.has(pkg)) cache.set(pkg, await latestVersion(pkg));
    const latest = cache.get(pkg);
    if (latest && latest !== m[3]) {
      after = after.replace(m[0], `${m[1]}${latest}`);
      changed.push(`${pkg} ${m[3]} → ${latest}`);
    }
  }
  if (after !== before) await writeTextFile(file, after);
  return changed;
}

/** The `upgrade` command. Returns the process exit code. */
export async function upgradeCommand(dir = '.'): Promise<number> {
  const cache = new Map<string, string | null>();
  const changes = [
    ...await bump(`${dir}/deno.json`, DENO_DEP, cache),
    ...await bump(`${dir}/package.json`, NPM_DEP, cache),
  ];
  if (changes.length === 0) {
    console.log('✓ already up to date');
  } else {
    for (const c of [...new Set(changes)]) console.log(`↑ ${c}`);
  }

  // No answers object here — detect which optional layers this project has
  // from what init already wrote for them.
  const [hasModules, hasUi, hasNorm, rapidVersion] = await Promise.all([
    pathExists(`${dir}/modules/mod.ts`),
    pathExists(`${dir}/views/mod.ts`),
    pathExists(`${dir}/configs/Norm.yaml`),
    latestVersion('rapid'),
  ]);
  const { files, reference } = agentDocs(rapidVersion, {
    module: hasModules,
    ui: hasUi,
    norm: hasNorm,
  });
  for (const [rel, content] of Object.entries(files)) {
    await writeTextFile(`${dir}/${rel}`, content);
  }
  await ensureSection(`${dir}/AGENTS.md`, reference);
  await ensureSection(`${dir}/CLAUDE.md`, CLAUDE_BODY);
  await ensureSection(
    `${dir}/.github/copilot-instructions.md`,
    COPILOT_BODY,
  );
  return 0;
}
