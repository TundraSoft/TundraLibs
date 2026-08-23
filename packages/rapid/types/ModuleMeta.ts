/**
 * @fileoverview {@link RapidModuleMeta} — the class-level metadata
 * `@Module` records, read by the mount tier when an instance carrying
 * it is registered via `app.module()`.
 *
 * @module
 */

/**
 * Metadata recorded by `@Module` against a class constructor. Only
 * `name` is required — a class with no `@Module` at all is still
 * mountable (empty defaults throughout), `@Module` lets it opt into
 * an identity, a path prefix, a namespace, a default version, and the
 * OpenAPI grouping its routes inherit.
 */
export type RapidModuleMeta = {
  /**
   * The module's identity — mount-time diagnostics and the DEFAULT
   * OpenAPI tag for every route in the class. Does not affect routing.
   * Absent for a `RapidModule` subclass — its `name` field is canonical.
   */
  name?: string;
  /**
   * Joined onto every SOCKET command and JOB name declared in the
   * class, `{namespace}.{command|name}` — sockets/jobs are otherwise
   * FLAT namespaces (unlike HTTP paths, which nest structurally), so
   * this is their collision-avoidance mechanism, mirroring what
   * `prefix` already gives HTTP paths. HTTP paths ignore it. In the
   * OpenAPI document it is the module's TAG GROUP (`x-tagGroups`): the
   * namespace is the parent, `name` the sub-module within it.
   */
  namespace?: string;
  /**
   * Joined onto every `@GET`/`@POST`/… path declared in the class,
   * HTTP ONLY (socket commands and job names use {@link namespace}
   * instead). Radrouter normalizes the join (`/api` + `/users` or
   * `/api/` + `/users` both become `/api/users`), so any leading/
   * trailing slash combination is safe.
   */
  prefix?: string;
  /**
   * Default `version` for every `@GET`/`@POST`/… in the class that
   * doesn't declare its own — an explicit per-method `version` always
   * wins.
   */
  version?: string;
  /** Describes the module's tag in the document's top-level `tags` list. */
  description?: string;
  /**
   * OpenAPI tags every route in the class carries (the route's own are
   * merged on top). Defaults to `[name]`; an explicit `[]` opts the module
   * out of a default tag.
   */
  tags?: readonly string[];
  /**
   * Default security-scheme names for every route in the class; a route's
   * own `security` (including `[]` = public) wins.
   */
  security?: readonly string[];
};
