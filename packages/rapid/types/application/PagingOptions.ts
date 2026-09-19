/**
 * @fileoverview {@link RapidApplicationPagingOptions} — pagination-resolution
 * configuration (part of the `server` group).
 *
 * @module
 */

/**
 * Pagination configuration. On the way IN, paging is dual-source on
 * HTTP: the configured HEADERS are read first, then `page`/`pagelimit`/
 * `limit` QUERY PARAMS override them. On the way OUT, a reply carrying
 * the `paging` key echoes the EFFECTIVE window on the same two header
 * names — whichever source it came from — and reports the row count on
 * {@link totalHeader}. Every key is optional at the type level; the
 * rAPId constructor fills defaults so the group is always complete at
 * runtime.
 */
export type RapidApplicationPagingOptions = {
  /**
   * Header carrying the 1-based page number. Read from the request;
   * echoed on a reply that sets `paging`, carrying the EFFECTIVE page
   * (defaulted and clamped), which is what the client actually got.
   * @default 'x-page-number'
   */
  pageHeader?: string;
  /**
   * Header carrying the page size. Read from the request; echoed on a
   * reply that sets `paging`, carrying the EFFECTIVE size.
   * @default 'x-page-size'
   */
  sizeHeader?: string;
  /**
   * Header carrying the total matching rows. RESPONSE-ONLY — a total
   * cannot be requested — and written only when the handler counted,
   * since counting costs a second query.
   * @default 'x-total-rows'
   */
  totalHeader?: string;
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
