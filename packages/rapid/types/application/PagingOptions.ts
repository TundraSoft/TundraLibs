/**
 * @fileoverview {@link RapidApplicationPagingOptions} — pagination-resolution
 * configuration (part of the `server` group).
 *
 * @module
 */

/**
 * Pagination-resolution configuration. Paging is dual-source on HTTP:
 * the configured HEADERS are read first, then `page`/`pagelimit`/
 * `limit` QUERY PARAMS override them. Every key is optional at the type
 * level; the rAPId constructor fills defaults so the group is always
 * complete at runtime.
 */
export type RapidApplicationPagingOptions = {
  /**
   * Header carrying the 1-based page number.
   * @default 'x-page-number'
   */
  pageHeader?: string;
  /**
   * Header carrying the page size.
   * @default 'x-page-size'
   */
  sizeHeader?: string;
  /**
   * Page size when no source supplies one.
   * @default 10
   */
  defaultSize?: number;
  /**
   * Hard page-size ceiling — larger requests are CLAMPED to this, not
   * rejected.
   * @default 1000
   */
  maxSize?: number;
  /**
   * Hard PAGE-NUMBER ceiling — larger requests are CLAMPED to this.
   * Without it `?page=1e15` resolves verbatim and becomes an
   * astronomical OFFSET in whatever the consumer queries.
   * @default 1000
   */
  maxPage?: number;
};
