/**
 * @fileoverview `norm init` — scaffold a norm project, or add norm to one
 * that already exists, in the CURRENT directory. No dialect or runtime
 * prompt: `Entity`/`Schema` never touch a dialect, so the dialect lives as
 * DATA in `configs/Norm.yaml` (`db.ts` never changes when it's edited);
 * and every project gets both `deno.json` and `package.json`
 * unconditionally, the same way every package in this monorepo ships
 * both, rather than asking which runtime to target.
 *
 * Every file below either doesn't exist yet (write a sensible default) or
 * already exists (merge into it, or leave it alone entirely) — one flow
 * covers a brand-new project and an existing one, rapid or otherwise,
 * with no host-specific branching.
 * @module
 */
import {
  makeDir,
  pathExists,
  readTextFile,
  writeTextFile,
} from '@tundralibs/compat/file';
import { prompt } from '@tundralibs/compat/cli';
import type { ParsedArgs } from '@tundralibs/compat/cli';
import { latestVersion } from '../latestVersion.ts';
import { ensureManifest } from '../manifest.ts';
import { ensureSection } from '../markdown.ts';
import {
  AI_GUIDE_SECTION,
  DB,
  DENO_JSON,
  GITIGNORE,
  MODEL_SAMPLE,
  MODELS_BARREL,
  NORM_YAML,
  PACKAGE_JSON,
  README,
  render,
} from '../templates.ts';

const DEFAULT_NAME = 'my-norm-project';

const writeIfMissing = async (
  path: string,
  content: string,
): Promise<boolean> => {
  if (await pathExists(path)) return false;
  await writeTextFile(path, content);
  return true;
};

/** Pull `name` off whichever manifest already exists, else prompt/default. */
const resolveProjectName = async (
  base: string,
  yes: boolean,
): Promise<string> => {
  for (const file of ['deno.json', 'package.json']) {
    const path = `${base}/${file}`;
    if (!(await pathExists(path))) continue;
    try {
      const manifest = JSON.parse(await readTextFile(path)) as {
        name?: unknown;
      };
      if (typeof manifest.name === 'string' && manifest.name.trim() !== '') {
        return manifest.name;
      }
    } catch {
      // Not valid JSON — fall through to prompting/defaulting below.
    }
  }
  if (yes) return DEFAULT_NAME;
  return (await prompt('Project name', { default: DEFAULT_NAME })).trim() ||
    DEFAULT_NAME;
};

/** The `init` command. Returns the process exit code. */
export async function initCommand(
  args: ParsedArgs,
  base = '.',
): Promise<number> {
  const yes = args.yes === true;
  const name = await resolveProjectName(base, yes);

  await makeDir(`${base}/models`, { recursive: true });
  const wroteUsers = await writeIfMissing(
    `${base}/models/Users.ts`,
    MODEL_SAMPLE,
  );
  await writeIfMissing(`${base}/models/mod.ts`, MODELS_BARREL);

  await makeDir(`${base}/configs`, { recursive: true });
  const normYamlPath = `${base}/configs/Norm.yaml`;
  if (await pathExists(normYamlPath)) {
    console.log(`  ~ configs/Norm.yaml (already exists — left untouched)`);
  } else {
    await writeTextFile(normYamlPath, NORM_YAML);
    console.log(`  + configs/Norm.yaml`);
  }

  const wroteDb = await writeIfMissing(`${base}/db.ts`, DB);
  await writeIfMissing(`${base}/.gitignore`, GITIGNORE);
  await writeIfMissing(`${base}/README.md`, render(README, { name }));

  const [normVersion, utilsVersion] = await Promise.all([
    latestVersion('norm'),
    latestVersion('utils'),
  ]);
  const normSpec = normVersion === null ? '' : `@^${normVersion}`;
  const utilsSpec = utilsVersion === null ? '' : `@^${utilsVersion}`;
  const vars = { name, normSpec, utilsSpec };

  await ensureManifest(`${base}/deno.json`, render(DENO_JSON, vars), {
    depsKey: 'imports',
    deps: {
      '@tundralibs/norm': `jsr:@tundralibs/norm${normSpec}`,
      '@tundralibs/utils': `jsr:@tundralibs/utils${utilsSpec}`,
      // The Deno sqlite backend resolves this bare specifier itself — it
      // must be in the consumer's own import map (verified against
      // packages/drivers/deno.json's own "$sqlite_deno" entry).
      $sqlite_deno: 'jsr:@db/sqlite@^0.13.0',
    },
    tasksKey: 'tasks',
    tasks: {
      test: 'deno test -A',
      fmt: 'deno fmt',
      lint: 'deno lint',
      check: 'deno check db.ts',
    },
  });
  await ensureManifest(`${base}/package.json`, render(PACKAGE_JSON, vars), {
    depsKey: 'dependencies',
    deps: {
      '@tundralibs/norm': `npm:@jsr/tundralibs__norm${normSpec}`,
      '@tundralibs/utils': `npm:@jsr/tundralibs__utils${utilsSpec}`,
      tsx: '^4',
    },
    tasksKey: 'scripts',
    tasks: { test: 'node --import tsx --test' },
  });

  await ensureSection(`${base}/CLAUDE.md`, AI_GUIDE_SECTION);
  await ensureSection(`${base}/AGENTS.md`, AI_GUIDE_SECTION);

  console.log(
    `\n✓ norm ready in ${base === '.' ? 'the current directory' : base}`,
  );
  if (wroteUsers || wroteDb) {
    console.log('  edit models/Users.ts, then configs/Norm.yaml to connect');
  }
  return 0;
}
