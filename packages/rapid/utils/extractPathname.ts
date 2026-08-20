/**
 * @fileoverview `extractPathname` — the pathname of an ALREADY-absolute,
 * already-normalized request URL, without allocating a `URL`.
 *
 * By the time a request reaches the transport, its `request.url` has
 * been through the Fetch `Request`/WHATWG-URL parser: dot-segments are
 * resolved (`/a/../b` → `/b`), the authority is canonical, and path
 * percent-encoding is already in canonical form. So a substring scan of
 * that string yields EXACTLY `new URL(request.url).pathname` — verified
 * across Deno/Bun/Node on dot-segments, query/fragment stripping,
 * percent-encoding, double slashes and userinfo. Routing needs only the
 * pathname; building a whole `URL` (parsing query, hash, host) per
 * request is work the router never reads. The query IS still parsed —
 * but lazily, only if a handler reads `ctx.args.query`/`.paging`.
 *
 * @module
 */

/**
 * The pathname of an absolute URL string: the substring from the first
 * `/` after `scheme://authority` up to the query (`?`) or fragment
 * (`#`), or `/` when there is no path. Assumes an absolute URL (as
 * `request.url` always is) — this is NOT a general URL parser.
 */
export const extractPathname = (url: string): string => {
  const schemeEnd = url.indexOf('://');
  // Past `scheme://`, the authority runs to the next `/` — that `/`
  // starts the path. No `://` (defensive; request.url always has it) →
  // treat the whole string as the path portion.
  const start = schemeEnd < 0 ? 0 : url.indexOf('/', schemeEnd + 3);
  if (start < 0) return '/';
  let end = url.indexOf('?', start);
  if (end < 0) end = url.indexOf('#', start);
  return end < 0 ? url.slice(start) : url.slice(start, end);
};
