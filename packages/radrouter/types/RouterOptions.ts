/**
 * Constructor options for {@link RadRouter}.
 */
export type RouterOptions = {
  /**
   * The version string treated as the "current" version. When set,
   * lookups for this version OR for an undefined version both
   * resolve to the same handlers — see the three-tier fallback in
   * {@link RadRouter.find}.
   */
  defaultVersion?: string;
  /**
   * When true (default), paths match case-sensitively per RFC 3986
   * and the convention of Express / Fastify / Koa. Set to false
   * for forgiving matching where `/Users` and `/users` resolve to
   * the same route — useful for legacy migrations or human-typed
   * URLs, at a small lookup-throughput cost. Captured param values
   * preserve the request's original case regardless of this flag.
   */
  caseSensitive?: boolean;
};
