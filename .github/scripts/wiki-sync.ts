/**
 * @fileoverview Generates GitHub-wiki pages from the in-repo documentation.
 *
 * Each package's main doc is its `README.md` (so JSR/npm/GitHub render it
 * natively); this script renames it to the package's wiki page name and
 * rewrites relative markdown links so they resolve on the flat wiki
 * namespace. Sub-docs (`{Package}-{Topic}.md`) keep their globally-unique
 * names. Links to repo files that are not wiki-synced are rewritten to
 * GitHub blob URLs; links to files that do not exist fail the run.
 *
 * Usage:
 *   deno run --allow-read --allow-write .github/scripts/wiki-sync.ts \
 *     [--out=wiki] [--repo=owner/name] [--ref=main]
 *
 * `--repo` defaults to the GITHUB_REPOSITORY env var; without it,
 * links to non-synced files are left untouched (with a warning).
 *
 * @module
 */

import * as path from 'node:path';

/**
 * Package directory → wiki page name, from the workspace metadata file
 * maintained by `workspace.ts` (the wiki name cannot be derived
 * mechanically: id → ID, oql → OQL, metro-man → MetroMan). READMEs of
 * unmapped packages fail the run, so the map cannot silently go stale.
 */
const PACKAGES: Record<string, string> = (JSON.parse(
  Deno.readTextFileSync('.github/workspace-meta.json'),
) as { packages: Record<string, string> }).packages;

type Args = { out: string; repo: string | undefined; ref: string };

const parseArgs = (): Args => {
  const args: Args = {
    out: 'wiki',
    repo: Deno.env.get('GITHUB_REPOSITORY') ?? undefined,
    ref: 'main',
  };
  for (const a of Deno.args) {
    const [k, v] = a.split('=', 2);
    if (k === '--out' && v) args.out = v;
    else if (k === '--repo' && v) args.repo = v;
    else if (k === '--ref' && v) args.ref = v;
  }
  return args;
};

/** Recursively list every file under `dir` (repo-relative paths). */
const walk = (dir: string): string[] => {
  const out: string[] = [];
  for (const entry of Deno.readDirSync(dir)) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const p = path.join(dir, entry.name);
    if (entry.isDirectory) out.push(...walk(p));
    else out.push(p);
  }
  return out;
};

const main = () => {
  const { out, repo, ref } = parseArgs();
  const warnings: string[] = [];
  const errors: string[] = [];

  // ---------------------------------------------------------------------
  // Collect the files to sync: source path -> wiki page name.
  // ---------------------------------------------------------------------
  const pages = new Map<string, string>();
  if (Deno.statSync('README.md').isFile) pages.set('README.md', 'Home.md');

  for (const entry of Deno.readDirSync('packages')) {
    if (!entry.isDirectory) continue;
    const dir = entry.name;
    const wikiName = PACKAGES[dir];
    const readme = path.join('packages', dir, 'README.md');
    let hasReadme = false;
    try {
      hasReadme = Deno.statSync(readme).isFile;
    } catch {
      hasReadme = false;
    }
    if (!wikiName) {
      if (hasReadme) {
        errors.push(
          `${readme}: package '${dir}' has no wiki-name mapping — add it to PACKAGES in .github/scripts/wiki-sync.ts`,
        );
      }
      continue;
    }
    if (hasReadme) pages.set(readme, `${wikiName}.md`);

    // Sub-docs anywhere under the package: {WikiName}-{Topic}.md
    const prefix = `${wikiName}-`;
    for (const file of walk(path.join('packages', dir))) {
      const base = path.basename(file);
      if (base.startsWith(prefix) && base.endsWith('.md')) {
        pages.set(file, base);
      }
    }
  }

  // Reverse index: normalized source path -> wiki page name.
  const wikiNameOf = (repoPath: string): string | undefined =>
    pages.get(path.normalize(repoPath));

  // ---------------------------------------------------------------------
  // Rewrite links and emit pages.
  // ---------------------------------------------------------------------
  Deno.mkdirSync(out, { recursive: true });
  const LINK = /\]\(([^)\s]+)\)/g;

  for (const [src, wikiPage] of pages) {
    const dir = path.dirname(src);
    const content = Deno.readTextFileSync(src).replace(
      LINK,
      (match, target: string) => {
        // Leave absolute URLs, anchors, and non-markdown targets alone.
        if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith('#')) {
          return match;
        }
        const [file, anchor] = target.split('#', 2);
        if (!file.endsWith('.md')) return match;
        const resolved = path.normalize(path.join(dir, file));
        const suffix = anchor ? `#${anchor}` : '';

        const wiki = wikiNameOf(resolved);
        // Drop the `.md`: a wiki page is served at `/wiki/<PageName>`, and a
        // markdown link that keeps the extension (`](Ambient.md)`) resolves to
        // the RAW file instead of the rendered page. Anchors still apply.
        if (wiki) return `](${wiki.replace(/\.md$/, '')}${suffix})`;

        // Exists in the repo but is not a wiki page — deep-link to GitHub.
        try {
          if (Deno.statSync(resolved).isFile) {
            if (repo) {
              return `](https://github.com/${repo}/blob/${ref}/${resolved}${suffix})`;
            }
            warnings.push(
              `${src}: link to non-wiki file '${target}' left as-is (no --repo)`,
            );
            return match;
          }
        } catch {
          // fall through to dead-link error
        }
        errors.push(`${src}: dead link '${target}'`);
        return match;
      },
    );
    Deno.writeTextFileSync(path.join(out, wikiPage), content);
    console.log(`Created: ${wikiPage} (from ${src})`);
  }

  // ---------------------------------------------------------------------
  // Sidebar: packages alphabetically, sub-pages nested by hyphen depth.
  // ---------------------------------------------------------------------
  const sidebar: string[] = ['## TundraLibs', '', '- [[Home]]', '', '### Packages', ''];
  const wikiNames = Object.values(PACKAGES).sort((a, b) => a.localeCompare(b));
  const pageNames = new Set(pages.values());
  for (const name of wikiNames) {
    if (!pageNames.has(`${name}.md`)) continue;
    sidebar.push(`- [[${name}]]`);
    const subs = [...pageNames]
      .filter((p) => p.startsWith(`${name}-`) && p.endsWith('.md'))
      .sort((a, b) => a.localeCompare(b));
    for (const sub of subs) {
      const stem = sub.slice(0, -3);
      const segments = stem.split('-');
      const indent = '  '.repeat(segments.length - 1);
      // GitHub wiki links are [[Link Text|Page Name]] (text first, page second),
      // reversed from MediaWiki. Short last segment = label, full stem = page.
      sidebar.push(`${indent}- [[${segments[segments.length - 1]}|${stem}]]`);
    }
  }
  Deno.writeTextFileSync(path.join(out, '_Sidebar.md'), sidebar.join('\n') + '\n');
  console.log('Created: _Sidebar.md');

  // ---------------------------------------------------------------------
  // Report.
  // ---------------------------------------------------------------------
  for (const w of warnings) console.warn(`WARN: ${w}`);
  if (errors.length) {
    for (const e of errors) console.error(`ERROR: ${e}`);
    console.error(`\n${errors.length} error(s) — wiki sync aborted.`);
    Deno.exit(1);
  }
  console.log(`\nSynced ${pages.size} pages to '${out}'.`);
};

main();
