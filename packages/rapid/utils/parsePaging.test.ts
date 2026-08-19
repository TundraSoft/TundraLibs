/**
 * @fileoverview parsePaging — dual-source pagination resolution:
 * precedence, validation-by-skipping, and the size clamp.
 * @module
 */
import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import {
  pagingFromHeaders,
  pagingFromQuery,
  pagingFromRecord,
  parsePaging,
} from './parsePaging.ts';

const h = (init: Record<string, string> = {}) => new Headers(init);
const q = (query: string) => new URLSearchParams(query);

describe('rapid.parsePaging', () => {
  it('pure defaults when no source supplies anything', () => {
    asserts.assertEquals(parsePaging({}), { page: 1, size: 10 });
    asserts.assertEquals(
      parsePaging({ defaultSize: 25 }),
      { page: 1, size: 25 },
    );
  });

  it('headers resolve through the CONFIGURED names', () => {
    const candidates = pagingFromHeaders(
      h({ 'x-pg': '3', 'x-sz': '20' }),
      { pageHeader: 'x-pg', sizeHeader: 'x-sz' },
    );
    asserts.assertEquals(parsePaging({}, candidates), { page: 3, size: 20 });
  });

  it('default header names are x-page-number / x-page-size', () => {
    const candidates = pagingFromHeaders(
      h({ 'x-page-number': '2', 'x-page-size': '5' }),
    );
    asserts.assertEquals(parsePaging({}, candidates), { page: 2, size: 5 });
  });

  it('query params OVERRIDE headers (later source wins per key)', () => {
    const r = parsePaging(
      {},
      pagingFromHeaders(h({ 'x-page-number': '2', 'x-page-size': '5' })),
      pagingFromQuery(q('page=7')),
    );
    // page overridden by the query; size still from the header.
    asserts.assertEquals(r, { page: 7, size: 5 });
  });

  it('query reads page + pagelimit/limit (pagelimit preferred)', () => {
    asserts.assertEquals(
      parsePaging({}, pagingFromQuery(q('page=2&pagelimit=30&limit=99'))),
      { page: 2, size: 30 },
    );
    asserts.assertEquals(
      parsePaging({}, pagingFromQuery(q('limit=15'))),
      { page: 1, size: 15 },
    );
  });

  it('invalid candidates are SKIPPED, not zeroed', () => {
    for (const bad of ['abc', '0', '-2', '1.5', '']) {
      const r = parsePaging(
        {},
        pagingFromHeaders(h({ 'x-page-number': '4' })),
        pagingFromQuery(q(`page=${bad}`)),
      );
      // The bad query candidate falls back to the header, not to 1.
      asserts.assertEquals(r.page, 4, `page=${bad} should fall back`);
    }
  });

  it('size is CLAMPED to maxSize, never rejected', () => {
    const r = parsePaging(
      { maxSize: 100 },
      pagingFromQuery(q('limit=5000')),
    );
    asserts.assertEquals(r.size, 100);
  });

  it('record source (socket frames) reads the query nomenclature', () => {
    const r = parsePaging(
      {},
      pagingFromRecord({ page: 3, limit: 40, other: 'x' }),
    );
    asserts.assertEquals(r, { page: 3, size: 40 });
    // Numbers AND numeric strings both resolve.
    asserts.assertEquals(
      parsePaging({}, pagingFromRecord({ page: '2', pagelimit: '8' })),
      { page: 2, size: 8 },
    );
  });

  it('R2-L3: non-decimal literals are REJECTED, not silently converted', () => {
    // `Number('0x10')` is 16, so ?page=0x10 used to mean page 16.
    // NOTE: `%2B` — a bare `+` in a query string decodes to a SPACE,
    // so `page=+5` is legitimately " 5" and parses as 5.
    for (const bad of ['0x10', '0b11', '0o17', '1e3', '12%203', '%2B5']) {
      asserts.assertEquals(
        parsePaging({}, pagingFromQuery(q(`page=${bad}`))).page,
        1,
        `page=${bad} must be rejected`,
      );
    }
    // Plain decimals (with surrounding space) still work.
    asserts.assertEquals(
      parsePaging({}, pagingFromQuery(q('page=%2012%20'))).page,
      12,
    );
  });

  it('R2-L3: page is CLAMPED to maxPage (default 1000)', () => {
    asserts.assertEquals(
      parsePaging({}, pagingFromQuery(q('page=1000000000000000'))).page,
      1000,
    );
    asserts.assertEquals(
      parsePaging({ maxPage: 5 }, pagingFromQuery(q('page=99'))).page,
      5,
    );
  });

  it('record source ignores non-numeric junk safely', () => {
    const r = parsePaging(
      { defaultSize: 10 },
      pagingFromRecord({ page: { evil: true }, limit: [50] }),
    );
    asserts.assertEquals(r, { page: 1, size: 10 });
  });
});
