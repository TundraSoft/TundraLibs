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

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Resolve the request's version and the pathname to route on.
 *
 * @param headers - The request headers.
 * @param pathname - The request pathname (already normalised).
 * @param config - `server.versioning`.
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
      : new RegExp(`vnd\\.${escapeRegExp(vendor)}\\.([^+;\\s]+)`).exec(accept);
    return { version: match?.[1], pathname };
  }

  if (mode === 'path') {
    const pattern = config.identifier ?? '^/(v[0-9]+)';
    const match = new RegExp(pattern).exec(pathname);
    if (match?.[1] !== undefined) {
      const rest = pathname.slice(match[0].length);
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
