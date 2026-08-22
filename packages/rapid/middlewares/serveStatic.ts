/**
 * @fileoverview `serveStatic` — middleware that serves files from a
 * directory. HTTP-only, GET/HEAD only; falls through (`next()`) for any
 * request it doesn't handle, so routes and the 404 still work. Uses the
 * same `mimeTypeFor` resolver as `ctx.serve()`.
 *
 * @module
 */

import { type FileInfo, realPath, stat } from '@tundralibs/compat/file';
import * as path from '@tundralibs/compat/path';
import { fileStream, mimeTypeFor } from '../utils/mod.ts';
import type { RapidMiddleware } from '../types/mod.ts';
import { MIDDLEWARE_SCOPE } from './scope.ts';

/** Strip a weak-validator prefix for RFC 7232 weak comparison. */
const stripWeak = (tag: string): string => tag.trim().replace(/^W\//, '');

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
};

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
 * matching `If-None-Match` with `304` WITHOUT reading the file. Still reads
 * whole files into memory and does no `Range` handling — that follow-up waits
 * on the streaming response model.
 */
export function serveStatic(options: ServeStaticOptions): RapidMiddleware {
  const root = path.resolve(options.root);
  const prefix = options.prefix ?? '/';
  const index = options.index === undefined ? 'index.html' : options.index;
  const cacheControl = options.maxAge === undefined
    ? undefined
    : `public, max-age=${Math.floor(options.maxAge)}`;
  // The resolved root, computed once (lazily — `root` may not exist at
  // construction). If it can't resolve, fall back to the lexical root; no
  // file will resolve under a non-existent root anyway.
  let realRoot: string | undefined;

  const middleware: RapidMiddleware = async (ctx, next) => {
    if (ctx.type !== 'HTTP') return next();
    if (ctx.method !== 'GET' && ctx.method !== 'HEAD') return next();

    let pathname: string;
    try {
      // `new URL().pathname` normalizes literal dot-segments; decoding
      // can REINTRODUCE `..` (from `%2e%2e`), which the guard below
      // re-checks after joining.
      pathname = decodeURIComponent(new URL(ctx.url).pathname);
    } catch {
      return next(); // malformed percent-encoding
    }
    if (!pathname.startsWith(prefix)) return next();

    let rel = pathname.slice(prefix.length);
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
      'content-type': mimeTypeFor(real),
      etag,
    };
    if (mtimeMs > 0) headers['last-modified'] = new Date(mtimeMs).toUTCString();
    if (cacheControl !== undefined) headers['cache-control'] = cacheControl;

    // Conditional request: If-None-Match (weak) → 304, no read.
    const inm = ctx.headers.get('if-none-match');
    if (inm !== null && ifNoneMatch(inm, etag)) {
      ctx.response = { status: 304, content: '', headers };
      return;
    }

    // STREAM the file — never buffered. `content-length` comes from the stat
    // (the transport can't infer it from a stream), so HEAD and clients see
    // the real size.
    headers['content-length'] = String(info.size);
    let body: ReadableStream<Uint8Array>;
    try {
      body = await fileStream(real);
    } catch {
      // Unreadable → not ours; let routing (or the 404) handle it.
      return next();
    }
    ctx.response = { content: body, headers };
    // Served — do NOT call next(): short-circuit the chain.
  };
  return Object.assign(middleware, { [MIDDLEWARE_SCOPE]: ['HTTP'] });
}
