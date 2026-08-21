/**
 * @fileoverview `rapid init [name]` — scaffold a new project. Interactive
 * prompts (or flags / `--yes`), then write the template set, optionally
 * `git init`. Runs on Deno/Bun/Node via compat.
 * @module
 */
import { makeDir, pathExists, writeTextFile } from '@tundralibs/compat/file';
import { prompt } from '@tundralibs/compat/cli';
import type { ParsedArgs } from '@tundralibs/compat/cli';
import { latestVersion } from '../latestVersion.ts';
import { gitInit } from '../git.ts';
import { scaffold, type ScaffoldAnswers } from '../templates.ts';

const asBool = (v: unknown): boolean | undefined =>
  v === true ? true : v === false ? false : undefined;

const ask = async (q: string, def: boolean): Promise<boolean> => {
  const a = (await prompt(`${q} (${def ? 'Y/n' : 'y/N'})`, {
    default: def ? 'y' : 'n',
  })).trim().toLowerCase();
  return a === '' ? def : a.startsWith('y');
};

/** The `init` command. Returns the process exit code. */
export async function initCommand(
  args: ParsedArgs,
  base = '.',
): Promise<number> {
  const yes = args.yes === true;
  let name = (args._[0] as string | undefined) ??
    (args.name as string | undefined);
  if (name === undefined) {
    name = yes ? 'my-rapid-app' : (await prompt('Project name', {
      default: 'my-rapid-app',
    })).trim() || 'my-rapid-app';
  }

  // A project name is a single non-empty directory name — reject an empty /
  // whitespace name (a bare `""` arg skips the default above and would make
  // `root` the filesystem root) and any path separators / `..` so it can't
  // write outside `base` (e.g. `../../etc`, `/abs`).
  if (
    name.trim() === '' || /[/\\]/.test(name) || name === '.' || name === '..'
  ) {
    console.error(`✗ invalid project name '${name}'`);
    return 1;
  }

  const pick = async (
    flag: string,
    q: string,
    def: boolean,
  ): Promise<boolean> => asBool(args[flag]) ?? (yes ? def : await ask(q, def));

  const module = await pick('module', 'Include the module system?', true);
  const norm = await pick('norm', 'Include a database (norm)?', false);
  const docker = await pick('docker', 'Add a Dockerfile?', false);
  const git = await pick('git', 'Initialise a git repository?', true);
  let runtime: ScaffoldAnswers['runtime'] = 'deno';
  if (docker) {
    const r = asBool(args.runtime) === undefined
      ? (args.runtime as string | undefined)
      : undefined;
    runtime = (r === 'bun' || r === 'node')
      ? r
      : yes
      ? 'deno'
      : (((await prompt('Container runtime (deno/bun/node)', {
        default: 'deno',
      })).trim().toLowerCase()) as ScaffoldAnswers['runtime']) || 'deno';
    if (runtime !== 'bun' && runtime !== 'node') runtime = 'deno';
  }

  const root = base === '.' ? name : `${base}/${name}`;
  if (await pathExists(root)) {
    console.error(`✗ '${name}' already exists`);
    return 1;
  }

  const rapidVersion = (await latestVersion('rapid')) ?? '1.0.0';
  const files = scaffold({ name, module, norm, docker, runtime }, rapidVersion);

  for (const [rel, content] of Object.entries(files)) {
    const path = `${root}/${rel}`;
    const slash = path.lastIndexOf('/');
    if (slash > 0) await makeDir(path.slice(0, slash), { recursive: true });
    await writeTextFile(path, content);
  }

  const gitOk = git ? await gitInit(root) : false;

  console.log(`\n✓ created ${name}/`);
  console.log(
    `  ${Object.keys(files).length} files` +
      (git
        ? gitOk ? ' · git initialised' : ' · git init skipped (git not found)'
        : ''),
  );
  console.log(`\n  cd ${name}`);
  console.log('  deno task dev   # or: bun run dev / npm run dev\n');
  return 0;
}
