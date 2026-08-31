/**
 * @fileoverview `fingerprintAssets` — build the content-keyed version
 * map `app.ui({ assets })` consumes and `view.asset()` reads: every file
 * under a directory, keyed by its URL path, valued by a djb2 hash of its
 * bytes (the same cheap content-keying the served runtime's ETag uses).
 * Call it once at boot, BEFORE `app.ui()`; pair with
 * `serveStatic({ fingerprint: true })` so the versioned URLs come back
 * `immutable`.
 *
 * Filesystem-backed by design — a helper for the server runtimes that
 * also `serveStatic` their assets. On a runtime with no filesystem
 * (Workers, browser) the compat file layer rejects with its typed
 * error; an app there has no static directory to fingerprint anyway.
 *
 * @module
 */

import { readDir, readFile } from '@tundralibs/compat/file';
import * as path from '@tundralibs/compat/path';

/** djb2 over bytes — cheap, sync, content-keyed (not cryptographic). */
const hashBytes = (bytes: Uint8Array): string => {
  let hash = 5381;
  for (let i = 0; i < bytes.length; i++) {
    hash = ((hash << 5) + hash + bytes[i]!) >>> 0;
  }
  return hash.toString(16);
};

/**
 * Hash every file under `root` (recursively; symlinks are skipped, so a
 * link can neither loop nor escape) into a `URL path → version` map.
 * Keys always use `/` separators and are prefixed with
 * `options.prefix` — mirror the `serveStatic` mount so the keys ARE the
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
 * const assets = await fingerprintAssets('./public');
 * app.ui({ assets });
 * app.use(serveStatic({ root: './public', fingerprint: true }));
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
        out[`${prefix}${childRel}`] = hashBytes(await readFile(entry.path));
      }
    }
  };
  await walk(path.resolve(root), '');
  return out;
}
