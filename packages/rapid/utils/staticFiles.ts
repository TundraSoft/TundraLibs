/**
 * @fileoverview The config-driven static file engine — `server.static`
 * normalized to mounts and served framework-side at a FIXED position
 * (route miss, before the 404), so routes always win a collision and
 * every outer middleware (secureHeaders, cors, compress, logging)
 * applies. Path traversal is blocked two ways (lexical + symlink
 * guards); conditional (weak-ETag 304), single-range (206/416), and
 * fingerprinted-immutable serving included. (The djb2 content hash
 * `view.asset()`'s lazy versioning uses lives in `utils/hash.ts`.)
 *
 * @module
 */

import {
  type FileInfo,
  readFileStream,
  realPath,
  stat,
} from '@tundralibs/compat/file';
import * as path from '@tundralibs/compat/path';
import { contentTypeFor, parseRange } from '@tundralibs/compat/http';
import { RapidError } from '../errors/mod.ts';
import { ifNoneMatch } from './ifNoneMatch.ts';
import type { HTTPContext } from '../context/HTTPContext.ts';
import type {
  RapidApplicationStaticConfig,
  RapidContextState,
} from '../types/mod.ts';

/** One normalized static mount, in declaration order. */
export type StaticMount = {
  /** The boundary-matched URL prefix (trailing slashes stripped). */
  prefix: string;
  /** Absolute root directory. */
  root: string;
  index: string | false;
  cacheControl?: string;
  fingerprint: boolean;
  /** The resolved (symlink-followed) root, cached on first serve. */
  realRoot?: string;
};

/** The Cache-Control a fingerprinted URL earns (1 year, immutable). */
const IMMUTABLE_CACHE = 'public, max-age=31536000, immutable';

/**
 * The closed key set a `server.static` entry accepts — a YAML typo
 * (`fingerprnt:`) silently no-oping would lose the feature with no hint,
 * against the "config fails as loudly as code" contract.
 */
const STATIC_ENTRY_KEYS = new Set(['root', 'index', 'maxAge', 'fingerprint']);

/**
 * Normalize (and boot-validate) a `server.static` stanza into ordered
 * mounts. A relative root resolves against `baseDir` (the config
 * directory for config-driven apps) so a deployment's YAML means the
 * same thing from any working directory.
 *
 * @throws {RapidError} RAPID_CONFIG on a prefix not starting with `/`,
 *   an unknown entry key, an empty root, or a mistyped
 *   `index`/`maxAge`/`fingerprint`.
 */
export function normalizeStaticConfig(
  config: RapidApplicationStaticConfig,
  baseDir?: string,
): StaticMount[] {
  const mounts: StaticMount[] = [];
  for (const [prefix, value] of Object.entries(config)) {
    if (!prefix.startsWith('/')) {
      throw new RapidError('RAPID_CONFIG', {
        message: `server.static: prefix '${prefix}' must start with '/'`,
      });
    }
    const entry = typeof value === 'string' ? { root: value } : value;
    if (typeof value !== 'string') {
      for (const key of Object.keys(value)) {
        if (!STATIC_ENTRY_KEYS.has(key)) {
          throw new RapidError('RAPID_CONFIG', {
            message:
              `server.static['${prefix}']: unknown key '${key}' (valid: ${
                [...STATIC_ENTRY_KEYS].join(', ')
              })`,
          });
        }
      }
    }
    if (typeof entry.root !== 'string' || entry.root === '') {
      throw new RapidError('RAPID_CONFIG', {
        message: `server.static['${prefix}']: root must be a directory path`,
      });
    }
    if (
      entry.index !== undefined && entry.index !== false &&
      typeof entry.index !== 'string'
    ) {
      throw new RapidError('RAPID_CONFIG', {
        message:
          `server.static['${prefix}']: index must be a filename or false`,
      });
    }
    if (
      entry.maxAge !== undefined &&
      (typeof entry.maxAge !== 'number' || Number.isNaN(entry.maxAge) ||
        entry.maxAge < 0)
    ) {
      throw new RapidError('RAPID_CONFIG', {
        message: `server.static['${prefix}']: maxAge must be a number >= 0`,
      });
    }
    if (
      entry.fingerprint !== undefined && typeof entry.fingerprint !== 'boolean'
    ) {
      // `fingerprint: "true"` from YAML would otherwise leave hashing
      // (and immutable caching) silently off.
      throw new RapidError('RAPID_CONFIG', {
        message: `server.static['${prefix}']: fingerprint must be a boolean`,
      });
    }
    const root = path.isAbsolute(entry.root)
      ? path.resolve(entry.root)
      : path.resolve(baseDir ?? '.', entry.root);
    mounts.push({
      prefix: prefix.replace(/\/+$/, ''),
      root,
      index: entry.index === undefined ? 'index.html' : entry.index,
      ...(entry.maxAge !== undefined
        ? { cacheControl: `public, max-age=${Math.floor(entry.maxAge)}` }
        : {}),
      fingerprint: entry.fingerprint === true,
    });
  }
  return mounts;
}

/**
 * Try to serve `ctx`'s request from `mount`. Returns `true` when it
 * answered (200/206/304/416 — `ctx.response` set), `false` when the
 * request is not this mount's to serve (wrong prefix, missing file,
 * traversal/symlink denial) — the caller falls through to the next
 * mount, then the 404. GET/HEAD gating is the caller's.
 */
export async function serveStaticFile<S extends RapidContextState>(
  ctx: HTTPContext<S>,
  mount: StaticMount,
): Promise<boolean> {
  let pathname: string;
  let fingerprinted = false;
  try {
    // `new URL().pathname` normalizes literal dot-segments; decoding
    // can REINTRODUCE `..` (from `%2e%2e`), which the guard below
    // re-checks after joining.
    const url = new URL(ctx.url);
    pathname = decodeURIComponent(url.pathname);
    fingerprinted = mount.fingerprint && url.searchParams.has('v');
  } catch {
    return false; // malformed percent-encoding
  }
  if (
    mount.prefix !== '' && pathname !== mount.prefix &&
    !pathname.startsWith(mount.prefix + '/')
  ) {
    return false;
  }

  let rel = pathname.slice(mount.prefix.length);
  if (rel === '' || rel.endsWith('/')) {
    if (mount.index === false) return false;
    rel += mount.index;
  }

  // Lexical guard: `join` collapses `..`; the result must be inside
  // `root` (or be `root` itself).
  const filePath = path.join(mount.root, rel);
  if (
    filePath !== mount.root && !filePath.startsWith(mount.root + path.SEPARATOR)
  ) {
    return false;
  }

  // Symlink guard: resolve the real path and require it inside the
  // RESOLVED root, so a symlink under `root` pointing elsewhere can't
  // leak an out-of-tree file (a consistently symlinked tree still works).
  let real: string;
  try {
    real = await realPath(filePath);
  } catch {
    return false; // missing / unreadable
  }
  if (mount.realRoot === undefined) {
    try {
      mount.realRoot = await realPath(mount.root);
    } catch {
      mount.realRoot = mount.root;
    }
  }
  if (
    real !== mount.realRoot &&
    !real.startsWith(mount.realRoot + path.SEPARATOR)
  ) {
    return false; // escapes the resolved root — deny without leaking
  }

  let info: FileInfo;
  try {
    info = await stat(real);
  } catch {
    return false;
  }
  if (!info.isFile) return false; // directory / special → not ours

  // A WEAK ETag from size + mtime — an unchanged file answers 304
  // without ever reading the bytes.
  const mtimeMs = info.mtime?.getTime() ?? 0;
  const etag = `W/"${info.size.toString(16)}-${mtimeMs.toString(16)}"`;
  const headers: Record<string, string> = {
    'content-type': contentTypeFor(real),
    etag,
  };
  if (mtimeMs > 0) headers['last-modified'] = new Date(mtimeMs).toUTCString();
  if (fingerprinted) headers['cache-control'] = IMMUTABLE_CACHE;
  else if (mount.cacheControl !== undefined) {
    headers['cache-control'] = mount.cacheControl;
  }

  const inm = ctx.headers.get('if-none-match');
  if (inm !== null && ifNoneMatch(inm, etag)) {
    ctx.response = { status: 304, content: '', headers };
    return true;
  }

  // Range requests (RFC 7233, single byte range only).
  headers['accept-ranges'] = 'bytes';
  const range = parseRange(ctx.headers.get('range'), info.size);
  if (range === 'unsatisfiable') {
    headers['content-range'] = `bytes */${info.size}`;
    ctx.response = { status: 416, content: '', headers };
    return true;
  }

  // STREAM the file (or the requested slice) — never buffered.
  const slice = range === undefined ? undefined : range;
  headers['content-length'] = String(
    slice === undefined ? info.size : slice.end - slice.start + 1,
  );
  if (slice !== undefined) {
    headers['content-range'] = `bytes ${slice.start}-${slice.end}/${info.size}`;
  }
  let body: ReadableStream<Uint8Array>;
  try {
    body = await readFileStream(real, slice);
  } catch {
    return false; // unreadable → not ours; the 404 handles it
  }
  ctx.response = {
    status: slice === undefined ? 200 : 206,
    content: body,
    headers,
  };
  return true;
}
