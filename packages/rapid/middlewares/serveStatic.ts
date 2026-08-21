/**
 * @fileoverview `serveStatic` — middleware that serves files from a
 * directory. HTTP-only, GET/HEAD only; falls through (`next()`) for any
 * request it doesn't handle, so routes and the 404 still work. Uses the
 * same `mimeTypeFor` resolver as `ctx.serve()`.
 *
 * @module
 */

import { readFile } from '@tundralibs/compat/file';
import * as path from '@tundralibs/compat/path';
import { mimeTypeFor } from '../utils/mod.ts';
import type { RapidMiddleware } from '../types/mod.ts';
import { MIDDLEWARE_SCOPE } from './scope.ts';

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
 * Path traversal is blocked: the resolved file must stay inside `root`
 * (encoded `..` included), otherwise the request falls through.
 *
 * v1 reads whole files into memory and does no ETag/conditional/range
 * handling — those are the static-serving ROADMAP follow-ups.
 */
export function serveStatic(options: ServeStaticOptions): RapidMiddleware {
  const root = path.resolve(options.root);
  const prefix = options.prefix ?? '/';
  const index = options.index === undefined ? 'index.html' : options.index;
  const cacheControl = options.maxAge === undefined
    ? undefined
    : `public, max-age=${Math.floor(options.maxAge)}`;

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

    // Traversal guard: `join` collapses `..`; the result must be inside
    // `root` (or be `root` itself).
    const filePath = path.join(root, rel);
    if (filePath !== root && !filePath.startsWith(root + path.SEPARATOR)) {
      return next();
    }

    let bytes: Uint8Array;
    try {
      bytes = await readFile(filePath);
    } catch {
      // Missing / directory / unreadable → not ours; let routing (or the
      // 404) handle it.
      return next();
    }

    const headers: Record<string, string> = {
      'content-type': mimeTypeFor(filePath),
    };
    if (cacheControl !== undefined) headers['cache-control'] = cacheControl;
    ctx.response = { content: bytes, headers };
    // Served — do NOT call next(): short-circuit the chain.
  };
  return Object.assign(middleware, { [MIDDLEWARE_SCOPE]: ['HTTP'] });
}
