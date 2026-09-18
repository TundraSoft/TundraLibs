/**
 * @fileoverview Enforces the documentation link contract across the repo.
 *
 * The same markdown is rendered in three places, and one link spelling
 * cannot be right in all of them. JSR rewrites a README's relative links to
 * `github.com/<repo>/blob/HEAD/<target>` resolved against the REPOSITORY
 * root — in a monorepo that drops the `packages/<pkg>/` prefix, so every one
 * of them 404s on jsr.io. Hence two contracts:
 *
 * - **Package `README.md`** — the file JSR renders. Every link into this
 *   repo is ABSOLUTE: a wiki URL when the target is wiki-synced (see
 *   `doc-pages.ts`), a GitHub `blob`/`tree` URL otherwise.
 * - **Every other markdown** — sub-docs, the root README, example READMEs.
 *   Links into the repo stay RELATIVE, so they resolve while browsing the
 *   repo; `wiki-sync.ts` rewrites them when it publishes the wiki.
 *
 * Dead links are errors under both contracts, as is a wiki link naming a
 * page the sync will never emit. Code fences and external URLs are left
 * alone, and a relative link that already resolves is left exactly as
 * written — spelling is not normalised.
 *
 * Usage:
 *   deno run --allow-read --allow-write .github/scripts/doc-links.ts [--fix]
 *     [--repo=owner/name] [--ref=main]
 *
 * @module
 */

import * as path from 'node:path';
import { kindOf, walk, wikiPages } from './doc-pages.ts';

type Args = { fix: boolean; repo: string; ref: string };

const parseArgs = (): Args => {
  const args: Args = {
    fix: false,
    repo: Deno.env.get('GITHUB_REPOSITORY') ?? 'TundraSoft/TundraLibs',
    ref: 'main',
  };
  for (const a of Deno.args) {
    const [k, v] = a.split('=', 2);
    if (k === '--fix') args.fix = true;
    else if (k === '--repo' && v) args.repo = v;
    else if (k === '--ref' && v) args.ref = v;
  }
  return args;
};

/** `](target)` — the only link form this repo uses outside code fences. */
const LINK = /\]\(([^)\s]+)\)/g;

/** A markdown file and which of the two link contracts governs it. */
type Doc = { file: string; contract: 'absolute' | 'relative' };

/**
 * Every markdown file the contract covers: package READMEs under the
 * absolute contract, all other package and root docs under the relative
 * one. `CHANGELOG.md` is release-please's and is skipped entirely.
 */
const docs = (): Doc[] => {
  const out: Doc[] = [];
  for (const file of walk('packages')) {
    if (!file.endsWith('.md') || path.basename(file) === 'CHANGELOG.md') {
      continue;
    }
    const isPackageReadme = /^packages\/[^/]+\/README\.md$/.test(file);
    out.push({ file, contract: isPackageReadme ? 'absolute' : 'relative' });
  }
  const roots = ['README.md', 'ROADMAP.md', 'CONTRIBUTING.md', 'CONVENTIONS.md'];
  for (const root of roots) {
    if (kindOf(root) === 'file') out.push({ file: root, contract: 'relative' });
  }
  return out;
};

const main = () => {
  const { fix, repo, ref } = parseArgs();
  const pages = wikiPages();
  /** Wiki page name (no `.md`) → source path, for the relative direction. */
  const sourceOfPage = new Map<string, string>();
  for (const [src, page] of pages) {
    sourceOfPage.set(page.replace(/\.md$/, ''), src);
  }

  const base = `https://github.com/${repo}`;
  const prefix = `${base}/`;

  /** Split one of this repo's own URLs into its verb and remainder. */
  const ownUrl = (
    url: string,
  ): { verb: string; rest: string } | undefined => {
    if (!url.startsWith(prefix)) return undefined;
    const rest = url.slice(prefix.length);
    const slash = rest.indexOf('/');
    if (slash <= 0) return undefined;
    return { verb: rest.slice(0, slash), rest: rest.slice(slash + 1) };
  };

  /**
   * The repo path an own-URL points at — undefined when it is not a path
   * URL at all (an issue, a workflow badge, the bare `/wiki` link), which
   * this script deliberately leaves alone.
   */
  const repoPathOf = (url: string): string | undefined => {
    const own = ownUrl(url);
    if (!own) return undefined;
    const [target] = own.rest.split('#', 2);
    if (own.verb === 'wiki') return sourceOfPage.get(target!);
    if (own.verb !== 'blob' && own.verb !== 'tree') return undefined;
    // blob/tree carry a ref segment ahead of the repo-relative path.
    const segments = target!.split('/');
    segments.shift();
    const p = segments.join('/');
    return p.length > 0 ? p : undefined;
  };

  /** The canonical absolute URL for a repo path. */
  const absoluteFor = (
    resolved: string,
    anchor: string,
  ): string | undefined => {
    const page = pages.get(resolved);
    if (page) return `${base}/wiki/${page.replace(/\.md$/, '')}${anchor}`;
    const kind = kindOf(resolved);
    if (!kind) return undefined;
    return `${base}/${kind === 'dir' ? 'tree' : 'blob'}/${ref}/${resolved}${anchor}`;
  };

  const fixable: string[] = [];
  const fatal: string[] = [];
  let rewrites = 0;
  let touched = 0;

  for (const { file, contract } of docs()) {
    const dir = path.dirname(file);
    const lines = Deno.readTextFileSync(file).split('\n');
    let inFence = false;
    let changed = false;

    const out = lines.map((line, i) => {
      if (/^\s*```/.test(line)) {
        inFence = !inFence;
        return line;
      }
      if (inFence) return line;

      return line.replace(LINK, (match, target: string) => {
        if (target.startsWith('#')) return match;
        const isAbsolute = /^[a-z][a-z0-9+.-]*:/i.test(target);
        const own = isAbsolute ? repoPathOf(target) : undefined;

        if (isAbsolute && own === undefined) {
          // Not a link into this repo's tree. Still catch a wiki link that
          // names a page the sync will never emit — absolute and canonical
          // looking, and the exact failure this contract exists to prevent.
          const parsed = ownUrl(target);
          if (parsed?.verb === 'wiki') {
            const [page] = parsed.rest.split('#', 2);
            if (page && !sourceOfPage.has(page)) {
              fatal.push(
                `${file}:${i + 1}: wiki link '${target}' names no synced page`,
              );
            }
          }
          return match;
        }

        const [rawFile, rawAnchor] = target.split('#', 2);
        const anchor = rawAnchor ? `#${rawAnchor}` : '';
        const resolved = isAbsolute
          ? own!
          : path.normalize(path.join(dir, rawFile!)).replace(/\/$/, '');

        if (kindOf(resolved) === undefined) {
          fatal.push(`${file}:${i + 1}: dead link '${target}'`);
          return match;
        }

        // Relative contract: a relative link that resolves is already
        // correct — only an absolute link into the repo has to come back.
        if (contract === 'relative' && !isAbsolute) return match;

        const want = contract === 'absolute'
          ? absoluteFor(resolved, anchor)
          : `${path.relative(dir, resolved) || '.'}${anchor}`;
        if (want === undefined || want === target) return match;

        fixable.push(
          `${file}:${i + 1}: ${contract} contract — '${target}' should be '${want}'`,
        );
        changed = true;
        rewrites++;
        return `](${want})`;
      });
    });

    if (fix && changed) {
      Deno.writeTextFileSync(file, out.join('\n'));
      touched++;
    }
  }

  for (const f of fatal) console.error(`ERROR: ${f}`);

  if (fix) {
    console.log(`Rewrote ${rewrites} link(s) across ${touched} file(s).`);
    if (fatal.length) {
      console.error(`\n${fatal.length} problem(s) --fix cannot repair.`);
      Deno.exit(1);
    }
    return;
  }

  for (const f of fixable) console.error(`ERROR: ${f}`);
  const total = fatal.length + fixable.length;
  if (total) {
    console.error(
      `\n${total} link problem(s). Run \`deno task docs:links:fix\` for the ${fixable.length} rewritable one(s).`,
    );
    Deno.exit(1);
  }
  console.log('Documentation links OK.');
};

main();
