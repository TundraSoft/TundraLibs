/**
 * @fileoverview The wiki page map — which repo markdown becomes a wiki page,
 * and under what name.
 *
 * Shared by `wiki-sync.ts`, which emits the pages, and `doc-links.ts`, which
 * points package-README links at them. The two must agree exactly: a README
 * link to a page the sync never emits is a 404 on JSR, on GitHub, and on the
 * wiki at once, so the mapping lives here rather than in either script.
 *
 * @module
 */

import * as path from 'node:path';

/**
 * Package directory → wiki page name, from the workspace metadata file
 * maintained by `workspace.ts`. The wiki name cannot be derived
 * mechanically (id → ID, oql → OQL, metro-man → MetroMan), and READMEs of
 * unmapped packages fail the sync, so the map cannot silently go stale.
 */
export const PACKAGES: Record<string, string> = (JSON.parse(
  Deno.readTextFileSync('.github/workspace-meta.json'),
) as { packages: Record<string, string> }).packages;

/** Recursively list every file under `dir` (repo-relative paths). */
export const walk = (dir: string): string[] => {
  const out: string[] = [];
  for (const entry of Deno.readDirSync(dir)) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const p = path.join(dir, entry.name);
    if (entry.isDirectory) out.push(...walk(p));
    else out.push(p);
  }
  return out;
};

/** True when `file` exists and is a directory; false for a missing path. */
export const kindOf = (file: string): 'file' | 'dir' | undefined => {
  try {
    const stat = Deno.statSync(file);
    return stat.isDirectory ? 'dir' : 'file';
  } catch {
    return undefined;
  }
};

/**
 * Source path → wiki page file name (`Compat-Runtime.md`). The root README
 * is `Home.md`, a package README is `{WikiName}.md`, and any
 * `{WikiName}-{Topic}.md` under the package keeps its own file name.
 *
 * The prefix match is CASE-INSENSITIVE on purpose. The documented naming
 * convention capitalises the prefix (`Compat-Runtime.md`) while four
 * packages carry a lowercase wiki name (`compat`, `crypt`, `drivers`,
 * `utils`) and two differ in casing (`RPC` vs `Rpc-…`, `RESTler` vs
 * `Restler-…`). Matching case-sensitively dropped every one of those
 * packages' sub-docs from the wiki silently — the pages simply never
 * appeared.
 */
export const wikiPages = (): Map<string, string> => {
  const pages = new Map<string, string>();
  if (kindOf('README.md') === 'file') pages.set('README.md', 'Home.md');

  for (const entry of Deno.readDirSync('packages')) {
    if (!entry.isDirectory) continue;
    const dir = entry.name;
    const wikiName = PACKAGES[dir];
    if (!wikiName) continue;

    const readme = path.join('packages', dir, 'README.md');
    if (kindOf(readme) === 'file') pages.set(readme, `${wikiName}.md`);

    const prefix = `${wikiName.toLowerCase()}-`;
    for (const file of walk(path.join('packages', dir))) {
      const base = path.basename(file);
      if (base.toLowerCase().startsWith(prefix) && base.endsWith('.md')) {
        pages.set(file, base);
      }
    }
  }
  return pages;
};

/**
 * Packages that have a README but no wiki-name mapping — the sync fails on
 * these rather than dropping a package's documentation without a word.
 */
export const unmappedPackages = (): string[] => {
  const missing: string[] = [];
  for (const entry of Deno.readDirSync('packages')) {
    if (!entry.isDirectory) continue;
    if (PACKAGES[entry.name]) continue;
    if (kindOf(path.join('packages', entry.name, 'README.md')) === 'file') {
      missing.push(entry.name);
    }
  }
  return missing;
};
