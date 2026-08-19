/**
 * @fileoverview {@link RapidModuleMeta} — the class-level metadata
 * `@Module` records, read by the mount tier when an instance carrying
 * it is registered via `app.module()`.
 *
 * @module
 */

/**
 * Metadata recorded by `@Module` against a class constructor. Optional
 * in every field — a class with no `@Module` at all is still
 * mountable (empty defaults), `@Module` only lets it opt into a
 * prefix.
 */
export type RapidModuleMeta = {
  /**
   * Joined onto every `@GET`/`@POST`/… path declared in the class,
   * HTTP ONLY (socket commands and job names are flat namespaces).
   * Radrouter normalizes the join (`/api` + `/users` or `/api/` +
   * `/users` both become `/api/users`), so any leading/trailing slash
   * combination is safe.
   */
  prefix?: string;
};
