/**
 * @fileoverview `serveStatic` — middleware that serves files from a
 * directory. HTTP-only, GET/HEAD only; falls through (`next()`) for any
 * request it doesn't handle, so routes and the 404 still work. Uses the
 * same `contentTypeFor` resolver as `ctx.serve()`.
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
import { contentTypeFor } from '@tundralibs/compat/http';
import type { RapidMiddleware } from '../types/mod.ts';
import { MIDDLEWARE_SCOPE } from './scope.ts';

/** Strip a weak-validator prefix for RFC 7232 weak comparison. */
const stripWeak = (tag: string): string => tag.trim().replace(/^W\//, '');

/**
 * Parse a single-range `Range: bytes=start-end` header against a file of
 * `size` bytes. Returns the INCLUSIVE byte slice to serve, `undefined` when
 * there is no (or an unparseable / multi-range) header — serve the whole
 * file with 200 — or `'unsatisfiable'` when the range lies wholly outside
 * the file (→ 416). Forms: `a-b` (clamped to the file), `a-` (to EOF), `-n`
 * (the last n bytes). Multi-range and non-byte units are ignored (200), the
 * RFC-permitted lenient response.
 */
const parseRange = (
  header: string | null,
  size: number,
): { start: number; end: number } | 'unsatisfiable' | undefined => {
  if (header === null) return undefined;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (m === null || size === 0) return undefined;
  const [, a, b] = m;
  let start: number;
  let end: number;
  if (a === '' && b === '') return undefined;
  if (a === '') {
    // Suffix form `-n`: the last n bytes.
    const n = Number(b);
    if (n === 0) return 'unsatisfiable';
    start = Math.max(0, size - n);
    end = size - 1;
  } else {
    start = Number(a);
    end = b === '' ? size - 1 : Math.min(Number(b), size - 1);
  }
  if (start >= size || start > end) return 'unsatisfiable';
  return { start, end };
};

/** Whether an `If-None-Match` header matches `etag` (weak comparison). */
const ifNoneMatch = (header: string, etag: string): boolean => {
  if (header.trim() === '*') return true;
  const target = stripWeak(etag);
  return header.split(',').some((t) => stripWeak(t) === target);
};

/** Options for {@link serveStatic}. */
export type ServeStaticOptions = {
  /** Directory to serve from. */
  root: string;
  /**
   * URL prefix these files live under; stripped before resolving against
   * `root`. A request outside the prefix falls through.
   * @default '/'
   */
  prefix?: string;
  /**
   * File served for a directory request (path ends in `/`). `false`
   * disables the index (a directory request falls through).
   * @default 'index.html'
   */
  index?: string | false;
  /**
   * When set, adds `Cache-Control: public, max-age=<seconds>` to served
   * files.
   */
  maxAge?: number;
  /**
   * Serve fingerprinted requests — a URL carrying the `v` query param,
   * as emitted by `view.asset()` over a `fingerprintAssets()` map — with
   * `Cache-Control: public, max-age=31536000, immutable` (overriding
   * `maxAge` for those requests). The content is keyed by the URL, so a
   * changed file gets a new URL and the old one may cache forever.
   * @default false
   */
  fingerprint?: boolean;
};

/** The Cache-Control a fingerprinted URL earns (1 year, immutable). */
const IMMUTABLE_CACHE = 'public, max-age=31536000, immutable';

/**
 * Serve static files from `options.root`. Register with `app.use(...)`.
 * Path traversal is blocked two ways: a LEXICAL guard (the joined path must
 * stay inside `root`, encoded `..` included) AND a SYMLINK guard — the file
 * is `realPath`-resolved and must stay inside the RESOLVED root, so a
 * symlink under `root` pointing elsewhere can't leak an out-of-tree file.
 * Comparing against the resolved root keeps a consistently symlinked tree
 * (e.g. a `public → releases/vN` deploy) working; only an escaping symlink
 * is denied. Either failure falls through (`next()`).
 *
 * Emits a weak `ETag` (size + mtime) and `Last-Modified`, and answers a
 * matching `If-None-Match` with `304` WITHOUT reading the file. Bodies are
 * STREAMED (compat `readFileStream`), and a `Range` request is honored with a
 * `206`/`416` (see {@link parseRange}).
 */
export function serveStatic(options: ServeStaticOptions): RapidMiddleware {
  const root = path.resolve(options.root);
  const prefix = options.prefix ?? '/';
  // Match on a path BOUNDARY, not a raw prefix, so `/static` cannot swallow
  // `/staticfoo`. Trailing slashes stripped → `''` for a root mount (which
  // then matches every path).
  const mountAt = prefix.replace(/\/+$/, '');
  const index = options.index === undefined ? 'index.html' : options.index;
  const cacheControl = options.maxAge === undefined
    ? undefined
    : `public, max-age=${Math.floor(options.maxAge)}`;
  const fingerprint = options.fingerprint === true;
  // The resolved root, computed once (lazily — `root` may not exist at
  // construction). If it can't resolve, fall back to the lexical root; no
  // file will resolve under a non-existent root anyway.
  let realRoot: string | undefined;

  const middleware: RapidMiddleware = async (ctx, next) => {
    if (ctx.type !== 'HTTP') return next();
    if (ctx.method !== 'GET' && ctx.method !== 'HEAD') return next();

    let pathname: string;
    let fingerprinted = false;
    try {
      // `new URL().pathname` normalizes literal dot-segments; decoding
      // can REINTRODUCE `..` (from `%2e%2e`), which the guard below
      // re-checks after joining.
      const url = new URL(ctx.url);
      pathname = decodeURIComponent(url.pathname);
      fingerprinted = fingerprint && url.searchParams.has('v');
    } catch {
      return next(); // malformed percent-encoding
    }
    if (
      mountAt !== '' && pathname !== mountAt &&
      !pathname.startsWith(mountAt + '/')
    ) {
      return next();
    }

    let rel = pathname.slice(mountAt.length);
    if (rel === '' || rel.endsWith('/')) {
      if (index === false) return next();
      rel += index;
    }

    // Lexical guard: `join` collapses `..`; the result must be inside
    // `root` (or be `root` itself).
    const filePath = path.join(root, rel);
    if (filePath !== root && !filePath.startsWith(root + path.SEPARATOR)) {
      return next();
    }

    // Symlink guard: resolve the real path and require it inside the
    // RESOLVED root. `realPath` throws for a missing path (→ next). Done
    // BEFORE readFile so a symlink's target is never read.
    let real: string;
    try {
      real = await realPath(filePath);
    } catch {
      return next(); // missing / unreadable
    }
    if (realRoot === undefined) {
      try {
        realRoot = await realPath(root);
      } catch {
        realRoot = root;
      }
    }
    if (real !== realRoot && !real.startsWith(realRoot + path.SEPARATOR)) {
      return next(); // escapes the resolved root — deny without leaking
    }

    // Metadata for conditional serving: a WEAK ETag from size + mtime, so an
    // unchanged file answers 304 without ever reading the bytes.
    let info: FileInfo;
    try {
      info = await stat(real);
    } catch {
      return next();
    }
    if (!info.isFile) return next(); // directory / special → not ours

    const mtimeMs = info.mtime?.getTime() ?? 0;
    const etag = `W/"${info.size.toString(16)}-${mtimeMs.toString(16)}"`;
    const headers: Record<string, string> = {
      'content-type': contentTypeFor(real),
      etag,
    };
    if (mtimeMs > 0) headers['last-modified'] = new Date(mtimeMs).toUTCString();
    if (fingerprinted) headers['cache-control'] = IMMUTABLE_CACHE;
    else if (cacheControl !== undefined) {
      headers['cache-control'] = cacheControl;
    }

    // Conditional request: If-None-Match (weak) → 304, no read.
    const inm = ctx.headers.get('if-none-match');
    if (inm !== null && ifNoneMatch(inm, etag)) {
      ctx.response = { status: 304, content: '', headers };
      return;
    }

    // Range requests (RFC 7233, single byte range only). Advertised on every
    // file response so clients know they may resume/seek.
    headers['accept-ranges'] = 'bytes';
    const range = parseRange(ctx.headers.get('range'), info.size);
    if (range === 'unsatisfiable') {
      // 416: the range lies entirely outside the file. Content-Range carries
      // the real size (`bytes */size`) so the client can recover.
      headers['content-range'] = `bytes */${info.size}`;
      ctx.response = { status: 416, content: '', headers };
      return;
    }

    // STREAM the file (or the requested slice) — never buffered.
    // `content-length` comes from the stat / range, since the transport can't
    // infer it from a stream; HEAD and clients see the real size.
    const slice = range === undefined ? undefined : range;
    headers['content-length'] = String(
      slice === undefined ? info.size : slice.end - slice.start + 1,
    );
    if (slice !== undefined) {
      headers['content-range'] =
        `bytes ${slice.start}-${slice.end}/${info.size}`;
    }
    let body: ReadableStream<Uint8Array>;
    try {
      body = await readFileStream(real, slice);
    } catch {
      // Unreadable → not ours; let routing (or the 404) handle it.
      return next();
    }
    ctx.response = {
      status: slice === undefined ? 200 : 206,
      content: body,
      headers,
    };
    // Served — do NOT call next(): short-circuit the chain.
  };
  return Object.assign(middleware, { [MIDDLEWARE_SCOPE]: ['HTTP'] });
}
