/**
 * @fileoverview Tests for the JSON-safe cache value carrier.
 * @module
 */
import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { decodeFromCache, encodeForCache } from './cache.ts';

describe('cache carrier', () => {
  it('should round-trip bigint and Date through JSON', () => {
    const value = {
      grants: { Post: 6n },
      seen: new Date('2026-01-01T00:00:00Z'),
      name: 'ada',
      n: 42,
    };
    const revived = decodeFromCache(
      JSON.parse(JSON.stringify(encodeForCache(value))),
    ) as typeof value;
    asserts.assertStrictEquals(revived.grants.Post, 6n);
    asserts.assert(revived.seen instanceof Date);
    asserts.assertStrictEquals(
      revived.seen.toISOString(),
      '2026-01-01T00:00:00.000Z',
    );
    asserts.assertStrictEquals(revived.name, 'ada');
    asserts.assertStrictEquals(revived.n, 42);
  });

  it('should round-trip arrays with tagged members', () => {
    const revived = decodeFromCache(
      JSON.parse(JSON.stringify(encodeForCache([1n, 'x', [2n]]))),
    ) as [bigint, string, [bigint]];
    asserts.assertStrictEquals(revived[0], 1n);
    asserts.assertStrictEquals(revived[2][0], 2n);
  });

  it('should escape a payload that carries the tag key itself', () => {
    const hostile = { $$pactEnc: 'bigint', v: '123' };
    const revived = decodeFromCache(
      JSON.parse(JSON.stringify(encodeForCache(hostile))),
    ) as Record<string, unknown>;
    // Restored verbatim as data — never revived into a bigint.
    asserts.assertStrictEquals(revived.$$pactEnc, 'bigint');
    asserts.assertStrictEquals(revived.v, '123');
  });

  it('should skip __proto__ keys in both directions', () => {
    const encoded = encodeForCache(
      JSON.parse('{"__proto__": {"polluted": true}, "ok": 1}'),
    ) as Record<string, unknown>;
    asserts.assertEquals(Object.keys(encoded), ['ok']);
    const decoded = decodeFromCache(
      JSON.parse('{"__proto__": {"polluted": true}, "ok": 1}'),
    ) as Record<string, unknown>;
    asserts.assertEquals(Object.keys(decoded), ['ok']);
    // deno-lint-ignore no-explicit-any
    asserts.assertStrictEquals(({} as any).polluted, undefined);
  });

  it('should pass primitives and null through unchanged', () => {
    asserts.assertStrictEquals(decodeFromCache(encodeForCache(null)), null);
    asserts.assertStrictEquals(decodeFromCache(encodeForCache('s')), 's');
    asserts.assertStrictEquals(decodeFromCache(encodeForCache(7)), 7);
  });
});
