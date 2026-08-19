/**
 * @fileoverview `parsePaging` — pagination-window resolution from
 * ordered candidate sources, decoupled for independent testing.
 *
 * Dual-source on HTTP: the configured paging HEADERS are the base,
 * `page`/`pagelimit`/`limit` query params OVERRIDE them. Sockets feed
 * their frame params through the same resolver, jobs resolve pure
 * defaults — one nomenclature everywhere.
 *
 * Resolution is FORGIVING, never throwing: an invalid candidate
 * (non-numeric, zero, negative, fractional) is IGNORED in favour of the
 * next source down / the default, and an oversized `size` is CLAMPED to
 * the configured maximum. The result is therefore always valid — see
 * {@link RapidContextPaging}.
 *
 * @module
 */

import type { RapidContextPaging } from '../types/mod.ts';

/** Resolution config — mirrors the `server.paging` option group. */
export type ParsePagingOptions = {
  /** Header carrying the 1-based page number. @default 'x-page-number' */
  pageHeader?: string;
  /** Header carrying the page size. @default 'x-page-size' */
  sizeHeader?: string;
  /** Page size when no source supplies one. @default 10 */
  defaultSize?: number;
  /** Hard size ceiling — larger candidates are CLAMPED. @default 1000 */
  maxSize?: number;
  /** Hard page-number ceiling — larger candidates are CLAMPED. @default 1000 */
  maxPage?: number;
};

/** One source's raw (unvalidated) paging candidates. */
export type PagingCandidates = {
  page?: unknown;
  size?: unknown;
};

/** Plain DECIMAL digits only — see {@link positiveInt}. */
const DECIMAL_DIGITS = /^\d+$/;

/**
 * A positive integer from a string/number candidate, else undefined.
 *
 * Strings must be plain decimal digits: `Number()` alone would accept
 * `0x10` (→ 16), `0b11`, `0o17` and `1e3`, so `?page=0x10` silently
 * meant page 16. Numbers (from a socket frame's JSON) are checked
 * structurally.
 */
function positiveInt(value: unknown): number | undefined {
  if (typeof value === 'number') {
    return Number.isInteger(value) && value > 0 ? value : undefined;
  }
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!DECIMAL_DIGITS.test(trimmed)) return undefined;
  const numeric = Number(trimmed);
  return Number.isSafeInteger(numeric) && numeric > 0 ? numeric : undefined;
}

/** Candidates from the configured paging headers. */
export function pagingFromHeaders(
  headers: Headers,
  options: ParsePagingOptions = {},
): PagingCandidates {
  return {
    page: headers.get(options.pageHeader ?? 'x-page-number') ?? undefined,
    size: headers.get(options.sizeHeader ?? 'x-page-size') ?? undefined,
  };
}

/** Candidates from `page`/`pagelimit`/`limit` query params. */
export function pagingFromQuery(
  searchParams: URLSearchParams,
): PagingCandidates {
  return {
    page: searchParams.get('page') ?? undefined,
    size: searchParams.get('pagelimit') ?? searchParams.get('limit') ??
      undefined,
  };
}

/**
 * Candidates from a params record (socket frames) — reads the same
 * `page`/`pagelimit`/`limit` names as the query source. NON-DESTRUCTIVE:
 * the record is only read; the keys stay visible in `args.params`.
 */
export function pagingFromRecord(
  params: Readonly<Record<string, unknown>>,
): PagingCandidates {
  return {
    page: params['page'],
    size: params['pagelimit'] ?? params['limit'],
  };
}

/**
 * Resolve the paging window from `sources`, LATER SOURCES OVERRIDING
 * earlier ones per key (HTTP passes `[headers, query]` — query wins).
 * Invalid candidates are skipped, size is clamped to `maxSize`, and
 * defaults (`page: 1`, `size: defaultSize`) fill whatever remains.
 */
export function parsePaging(
  options: ParsePagingOptions = {},
  ...sources: PagingCandidates[]
): RapidContextPaging {
  const defaultSize = options.defaultSize ?? 10;
  const maxSize = options.maxSize ?? 1000;
  const maxPage = options.maxPage ?? 1000;
  let page: number | undefined;
  let size: number | undefined;
  for (const source of sources) {
    page = positiveInt(source.page) ?? page;
    size = positiveInt(source.size) ?? size;
  }
  return {
    // BOTH are clamped: an unbounded page is an unbounded OFFSET
    // downstream, which is the same denial-of-service shape an
    // unbounded size is.
    page: Math.min(page ?? 1, maxPage),
    size: Math.min(size ?? defaultSize, maxSize),
  };
}
