/**
 * @fileoverview `rapid init [name]` — scaffold a new project. Interactive
 * prompts (or flags / `--yes`), then write the template set. The RUNTIME is
 * asked first: it is a project-wide choice (config file, commands, deploy
 * artifact), not a container detail. Runs on Deno/Bun/Node via compat; no
 * subprocesses (git is yours to init — a `.gitignore` is written for you).
 * @module
 */
import { makeDir, pathExists, writeTextFile } from '@tundralibs/compat/file';
import { prompt } from '@tundralibs/compat/cli';
import type { ParsedArgs } from '@tundralibs/compat/cli';
import { latestVersion } from '../latestVersion.ts';
import { scaffold, type ScaffoldAnswers } from '../templates.ts';

const RUNTIMES = ['deno', 'bun', 'node', 'workers'] as const;
type Runtime = ScaffoldAnswers['runtime'];

const asBool = (v: unknown): boolean | undefined =>
  v === true ? true : v === false ? false : undefined;

const isRuntime = (v: unknown): v is Runtime =>
  typeof v === 'string' && (RUNTIMES as readonly string[]).includes(v);

const ask = async (q: string, def: boolean): Promise<boolean> => {
  const a = (await prompt(`${q} (${def ? 'Y/n' : 'y/N'})`, {
    default: def ? 'y' : 'n',
  })).trim().toLowerCase();
  return a === '' ? def : a.startsWith('y');
};

/** The per-runtime "now run this" hint printed at the end. */
const NEXT: Record<Runtime, string> = {
  deno: 'deno task dev',
  bun: 'bun install && bun run dev',
  node: 'npm install && npm run dev',
  workers: 'npm install && npx wrangler dev',
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

  // Runtime FIRST — everything else is shaped by it.
  let runtime: Runtime = 'deno';
  const flag = args.runtime;
  if (isRuntime(flag)) {
    runtime = flag;
  } else if (flag !== undefined) {
    console.error(
      `✗ unknown runtime '${String(flag)}' (expected ${RUNTIMES.join('|')})`,
    );
    return 1;
  } else if (!yes) {
    const r = (await prompt(`Runtime (${RUNTIMES.join('/')})`, {
      default: 'deno',
    })).trim().toLowerCase();
    if (isRuntime(r)) runtime = r;
    else if (r !== '') {
      console.error(`✗ unknown runtime '${r}'`);
      return 1;
    }
  }

  const pick = async (
    key: string,
    q: string,
    def: boolean,
  ): Promise<boolean> => asBool(args[key]) ?? (yes ? def : await ask(q, def));

  const module = await pick('module', 'Include the module system?', true);
  const norm = await pick('norm', 'Include a database (norm)?', false);
  // The UI scaffold is server-runtime only — Workers assets need a
  // bundler manifest, so the combination is refused rather than half-built.
  const ui = runtime === 'workers'
    ? false
    : await pick('ui', 'Include the UI layer (three-tier pages)?', false);
  if (runtime === 'workers' && (args.ui === true || args.with !== undefined)) {
    console.error(
      '✗ --ui targets server runtimes (Workers assets need a bundler manifest)',
    );
    return 1;
  }
  // --with <css>: self-host a starter stylesheet under public/vendor/ —
  // downloaded at scaffold time, never a CDN link at runtime.
  const WITH_CSS: Record<string, { file: string; url: string }> = {
    bootstrap: {
      file: 'bootstrap.min.css',
      url:
        'https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css',
    },
    pico: {
      file: 'pico.min.css',
      url: 'https://cdn.jsdelivr.net/npm/@picocss/pico@2.0.6/css/pico.min.css',
    },
  };
  let withCss: { file: string; url: string } | undefined;
  if (args.with !== undefined) {
    if (!ui) {
      console.error('✗ --with needs --ui');
      return 1;
    }
    withCss = WITH_CSS[String(args.with)];
    if (withCss === undefined) {
      console.error(
        `✗ unknown --with '${String(args.with)}' (expected ${
          Object.keys(WITH_CSS).join('|')
        })`,
      );
      return 1;
    }
  }
  // No container for Workers — never offer a Dockerfile there.
  const docker = runtime === 'workers'
    ? false
    : await pick('docker', `Add a Dockerfile (tundrasoft/${runtime})?`, false);
  const github = await pick(
    'github',
    'Add a GitHub Actions CI workflow?',
    false,
  );
  const ai = await pick(
    'ai',
    'Add AI-assistant instructions (AGENTS.md / CLAUDE.md / Copilot)?',
    true,
  );

  const root = base === '.' ? name : `${base}/${name}`;
  if (await pathExists(root)) {
    console.error(`✗ '${name}' already exists`);
    return 1;
  }

  // Fetch the vendor stylesheet FIRST — a failed download degrades to a
  // scaffold without the link (warned), never a broken reference.
  let vendorBody: string | undefined;
  if (withCss !== undefined) {
    try {
      const res = await fetch(withCss.url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      vendorBody = await res.text();
    } catch (error) {
      console.error(
        `! could not download ${withCss.url} (${
          error instanceof Error ? error.message : String(error)
        }) — scaffolding without it`,
      );
      withCss = undefined;
    }
  }

  const rapidVersion = (await latestVersion('rapid')) ?? '1.0.0';
  const files = scaffold(
    {
      name,
      module,
      norm,
      runtime,
      docker,
      github,
      ai,
      ui,
      ...(withCss !== undefined ? { vendorCss: withCss.file } : {}),
    },
    rapidVersion,
  );
  if (withCss !== undefined && vendorBody !== undefined) {
    files[`public/vendor/${withCss.file}`] = vendorBody;
  }

  for (const [rel, content] of Object.entries(files)) {
    const path = `${root}/${rel}`;
    const slash = path.lastIndexOf('/');
    if (slash > 0) await makeDir(path.slice(0, slash), { recursive: true });
    await writeTextFile(path, content);
  }

  console.log(`\n✓ created ${name}/ (${runtime})`);
  console.log(`  ${Object.keys(files).length} files`);
  console.log(`\n  cd ${name}`);
  console.log(`  ${NEXT[runtime]}\n`);
  return 0;
}
