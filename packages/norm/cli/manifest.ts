/**
 * @fileoverview Merge norm's dependency + task requirements into an
 * existing `deno.json`/`package.json`, or write a fresh one from a
 * skeleton when neither exists yet. Real `JSON.parse`/`stringify` — JSON
 * carries no comments to lose, so there's no reason for the regex-patch
 * approach `rapid upgrade` uses on a version string. Only ever ADDS keys
 * that aren't already present; an existing key (norm's own or anything
 * else in the file) is never rewritten.
 * @module
 */
import {
  pathExists,
  readTextFile,
  writeTextFile,
} from '@tundralibs/compat/file';

/** What to ensure is present in one manifest file. */
export type ManifestSpec = {
  /** `imports` for deno.json, `dependencies` for package.json. */
  depsKey: 'imports' | 'dependencies';
  deps: Record<string, string>;
  /** `tasks` for deno.json, `scripts` for package.json. */
  tasksKey: 'tasks' | 'scripts';
  tasks: Record<string, string>;
};

/**
 * Write `path` from `skeleton` if it doesn't exist yet; otherwise parse it
 * and add whichever of `spec`'s deps/tasks are missing.
 *
 * @returns `'created'`, `'merged'` (something was added), or `'unchanged'`.
 */
export async function ensureManifest(
  path: string,
  skeleton: string,
  spec: ManifestSpec,
): Promise<'created' | 'merged' | 'unchanged'> {
  if (!(await pathExists(path))) {
    await writeTextFile(path, skeleton);
    return 'created';
  }

  const manifest = JSON.parse(await readTextFile(path)) as Record<
    string,
    unknown
  >;
  let changed = false;

  const deps = (manifest[spec.depsKey] ??= {}) as Record<string, string>;
  for (const [key, value] of Object.entries(spec.deps)) {
    if (!(key in deps)) {
      deps[key] = value;
      changed = true;
    }
  }

  const tasks = (manifest[spec.tasksKey] ??= {}) as Record<string, string>;
  for (const [key, value] of Object.entries(spec.tasks)) {
    if (!(key in tasks)) {
      tasks[key] = value;
      changed = true;
    }
  }

  if (!changed) return 'unchanged';
  await writeTextFile(path, `${JSON.stringify(manifest, null, 2)}\n`);
  return 'merged';
}
