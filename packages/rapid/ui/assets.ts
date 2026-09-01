/**
 * @fileoverview `fingerprintAssets` — build the content-keyed version
 * map the `ui.assets` option consumes and `view.asset()` reads — the
 * MANIFEST path (a bundler build, Workers). Every file under a
 * directory, keyed by its URL path, valued by a djb2 hash of its bytes.
 * With `server.static` + `fingerprint: true`, none of this is needed:
 * `view.asset()` lazily hashes referenced files itself.
 *
 * Filesystem-backed by design — a boot-time helper for server
 * runtimes. On a runtime with no filesystem
 * (Workers, browser) the compat file layer rejects with its typed
 * error; an app there has no static directory to fingerprint anyway.
 *
 * @module
 */

import { readDir, readFile } from '@tundralibs/compat/file';
import * as path from '@tundralibs/compat/path';
import { djb2 } from '../utils/hash.ts';

/**
 * Hash every file under `root` (recursively; symlinks are skipped, so a
 * link can neither loop nor escape) into a `URL path → version` map.
 * Keys always use `/` separators and are prefixed with
 * `options.prefix` — mirror the serving prefix so the keys ARE the
 * request paths: `root: './public', prefix: '/static'` maps
 * `./public/app.css` to `'/static/app.css'`.
 *
 * @throws Whatever the compat file layer throws for a missing/unreadable
 *   `root` or an unsupported runtime — boot-time, loud by design.
 *
 * @example
 * ```ts ignore
 * import { fingerprintAssets } from '@tundralibs/rapid/ui';
 *
 * // a build step, or a Workers app with a bundled manifest:
 * const assets = await fingerprintAssets('./public');
 * const app = await Application.initialize({ name: 'x', ui: { assets } });
 * // a template: html`<link rel="stylesheet" href="${view.asset('/style.css')}">`
 * ```
 */
export async function fingerprintAssets(
  root: string,
  options: { prefix?: string } = {},
): Promise<Record<string, string>> {
  const prefix = (options.prefix ?? '').replace(/\/+$/, '');
  const out: Record<string, string> = {};
  const walk = async (dir: string, rel: string): Promise<void> => {
    for await (const entry of readDir(dir)) {
      if (entry.isSymlink) continue;
      const childRel = `${rel}/${entry.name}`;
      if (entry.isDirectory) {
        await walk(entry.path, childRel);
      } else if (entry.isFile) {
        out[`${prefix}${childRel}`] = djb2(await readFile(entry.path));
      }
    }
  };
  await walk(path.resolve(root), '');
  return out;
}
