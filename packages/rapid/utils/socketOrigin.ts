/**
 * @fileoverview WebSocket upgrade origin policy. Browsers send `Origin`
 * on every upgrade and never let a page suppress it, so the header is
 * the one reliable line between "our page" and "any other site holding
 * the user's cookies" — cross-site WebSocket hijacking. Non-browser
 * clients send no `Origin` and pass.
 * @module
 */

/**
 * Whether `request` may upgrade: no `Origin` (a non-browser client), an
 * `Origin` whose host is the request's own host, or one listed in
 * `allowed` (serialized origins, as validated at boot). The opaque
 * origin `null` (a sandboxed frame, a `file:` page) is refused.
 */
export function isSocketOriginAllowed(
  request: Request,
  allowed: ReadonlySet<string>,
): boolean {
  const origin = request.headers.get('origin');
  if (origin === null) return true;
  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    return false;
  }
  if (parsed.origin === 'null') return false;
  if (allowed.has(parsed.origin)) return true;
  // Normalise the request's own host under the origin's scheme so a
  // default port written out on either side (`:443`) still compares equal.
  const host = request.headers.get('host') ?? new URL(request.url).host;
  try {
    return new URL(`${parsed.protocol}//${host.trim()}`).host === parsed.host;
  } catch {
    return false;
  }
}
