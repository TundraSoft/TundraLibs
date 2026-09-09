/**
 * @fileoverview {@link RapidContextPaging} — the resolved pagination window
 * carried in `ctx.args.paging`.
 *
 * @module
 */

/**
 * The resolved pagination window — ALWAYS present and ALWAYS valid:
 * sources are validated and clamped during resolution, defaults fill
 * the gaps, so consumers never re-validate.
 */
export type RapidContextPaging = {
  /** 1-based page number. */
  page: number;
  /** Page size, clamped to the configured maximum. */
  size: number;
};
