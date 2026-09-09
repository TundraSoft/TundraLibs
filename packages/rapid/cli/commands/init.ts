/**
 * @fileoverview `rapid init [name]` — scaffold a new project. Interactive
 * prompts (or flags / `--yes`), then write the template set. No runtime
 * prompt: both `deno.json` and `package.json` are always written (every
 * package in this monorepo ships both). Runs on Deno/Bun/Node via compat;
 * no subprocesses (git is yours to init — a `.gitignore` is written for you).
 * @module
 */
import { makeDir, pathExists, writeTextFile } from '@tundralibs/compat/file';
import { prompt } from '@tundralibs/compat/cli';
import type { ParsedArgs } from '@tundralibs/compat/cli';
import { latestVersion } from '../latestVersion.ts';
import { scaffold } from '../templates.ts';

const asBool = (v: unknown): boolean | undefined =>
  v === true ? true : v === false ? false : undefined;

const ask = async (q: string, def: boolean): Promise<boolean> => {
  const a = (await prompt(`${q} (${def ? 'Y/n' : 'y/N'})`, {
    default: def ? 'y' : 'n',
  })).trim().toLowerCase();
  return a === '' ? def : a.startsWith('y');
};

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

/**
 * Validate `--with` and download the stylesheet. `error` set means the
 * command should print it and exit 1; otherwise `css` (possibly
 * undefined — no `--with`, or a failed download degrading gracefully)
 * is what `scaffold()`/the file map need.
 */
async function resolveVendorCss(
  args: ParsedArgs,
  ui: boolean,
): Promise<
  { error: string } | {
    error?: undefined;
    css?: { file: string; body: string };
  }
> {
  if (args.with === undefined) return {};
  if (!ui) return { error: '✗ --with needs --ui' };
  const withCss = WITH_CSS[String(args.with)];
  if (withCss === undefined) {
    return {
      error: `✗ unknown --with '${String(args.with)}' (expected ${
        Object.keys(WITH_CSS).join('|')
      })`,
    };
  }
  try {
    const res = await fetch(withCss.url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return { css: { file: withCss.file, body: await res.text() } };
  } catch (error) {
    console.error(
      `! could not download ${withCss.url} (${
        error instanceof Error ? error.message : String(error)
      }) — scaffolding without it`,
    );
    return {};
  }
}

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
  // The name is interpolated UNESCAPED into YAML, JSON and TS strings — a
  // quote or `: ` would corrupt the scaffold, so only package-name-safe
  // characters pass.
  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(name)) {
    console.error(
      `✗ invalid project name '${name}' — letters, digits, '.', '_' and '-' only (must start with a letter or digit)`,
    );
    return 1;
  }

  const pick = async (
    key: string,
    q: string,
    def: boolean,
  ): Promise<boolean> => asBool(args[key]) ?? (yes ? def : await ask(q, def));

  const module = await pick('module', 'Include the module system?', true);
  const norm = await pick('norm', 'Include a database (norm)?', false);
  const ui = await pick(
    'ui',
    'Include the UI layer (three-tier pages)?',
    false,
  );
  const vendor = await resolveVendorCss(args, ui);
  if (vendor.error !== undefined) {
    console.error(vendor.error);
    return 1;
  }
  const root = base === '.' ? name : `${base}/${name}`;
  if (await pathExists(root)) {
    console.error(`✗ '${name}' already exists`);
    return 1;
  }

  // null (offline / unpublished) → the manifest pins no version (= latest).
  // norm/utils are only ever fetched when --norm — no network cost otherwise.
  const [rapidVersion, normVersion, utilsVersion] = await Promise.all([
    latestVersion('rapid'),
    norm ? latestVersion('norm') : Promise.resolve(null),
    norm ? latestVersion('utils') : Promise.resolve(null),
  ]);
  const files = scaffold(
    {
      name,
      module,
      norm,
      ui,
      ...(vendor.css !== undefined ? { vendorCss: vendor.css.file } : {}),
    },
    rapidVersion,
    { norm: normVersion, utils: utilsVersion },
  );
  if (vendor.css !== undefined) {
    files[`public/vendor/${vendor.css.file}`] = vendor.css.body;
  }

  for (const [rel, content] of Object.entries(files)) {
    const path = `${root}/${rel}`;
    const slash = path.lastIndexOf('/');
    if (slash > 0) await makeDir(path.slice(0, slash), { recursive: true });
    await writeTextFile(path, content);
  }

  console.log(`\n✓ created ${name}/`);
  console.log(`  ${Object.keys(files).length} files`);
  console.log(`\n  cd ${name}`);
  console.log(
    `  deno task dev        (or: npm run dev / bun --watch main.ts)\n`,
  );
  return 0;
}
