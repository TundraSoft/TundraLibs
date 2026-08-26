/**
 * @fileoverview Extract the API version from a request per the configured
 * versioning `mode` — the ONE place the three modes (header / accept /
 * path) are read. Returns the version (or `undefined` — the router applies
 * its default → unversioned fallback) and, for `path` mode, the pathname
 * with the version segment stripped so everything downstream sees a clean
 * path.
 *
 * @module
 */

/** The versioning config slice the resolver reads. */
export type VersioningConfig = {
  mode?: 'header' | 'accept' | 'path';
  identifier?: string;
  default?: string;
};

/** Escape a string for safe embedding in a `RegExp` literal. */
export const escapeRegExp = (s: string) =>
  s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Version patterns come from config (constant per app), so compile each
// distinct source string ONCE and reuse it — the resolver runs per request.
// The cache is bounded by the number of distinct configs in the process.
const __patterns = new Map<string, RegExp>();
const compile = (source: string): RegExp => {
  let re = __patterns.get(source);
  if (re === undefined) {
    re = new RegExp(source);
    __patterns.set(source, re);
  }
  return re;
};

// The default `path`-mode pattern: a leading `/vN` that is a WHOLE segment
// (the lookahead stops `/v1beta` or `/v1x` from being read as `v1`).
const DEFAULT_PATH_PATTERN = '^/(v[0-9]+)(?=/|$)';

/**
 * Resolve the request's version and the pathname to route on.
 *
 * @param headers - The request headers.
 * @param pathname - The request pathname (already normalised).
 * @param config - `server.versioning`. In `path` mode a custom `identifier`
 *   regex should anchor with `^` and capture the version in group 1; the
 *   matched span (from its own start index) is stripped from the pathname.
 */
export function resolveVersion(
  headers: Headers,
  pathname: string,
  config: VersioningConfig,
): { version: string | undefined; pathname: string } {
  const mode = config.mode ?? 'header';

  if (mode === 'accept') {
    const vendor = config.identifier ?? '';
    const accept = headers.get('accept') ?? '';
    const match = vendor === ''
      ? null
      : compile(`vnd\\.${escapeRegExp(vendor)}\\.([^+;\\s]+)`).exec(accept);
    return { version: match?.[1], pathname };
  }

  if (mode === 'path') {
    const match = compile(config.identifier ?? DEFAULT_PATH_PATTERN)
      .exec(pathname);
    if (match?.[1] !== undefined) {
      // Strip from the match's OWN start index (a non-anchored custom
      // pattern may match mid-path), not from position 0.
      const rest = pathname.slice(match.index + match[0].length);
      return {
        version: match[1],
        pathname: rest === '' ? '/' : rest.startsWith('/') ? rest : `/${rest}`,
      };
    }
    return { version: undefined, pathname };
  }

  // header (default)
  return {
    version: headers.get(config.identifier ?? 'x-api-version') ?? undefined,
    pathname,
  };
}
