/**
 * Envelope primitives: ulid shape/ordering, coerceCount dialect
 * tolerance, and makeResult's conditional `data` key.
 */

import { describe, it } from '@tundralibs/compat/test';
import * as asserts from '@std/asserts';
import { coerceCount, ulid } from './mod.ts';
import { makeResult } from './result.ts';

describe('norm.result (ulid + coerceCount + makeResult)', () => {
  it('ulid: 26 Crockford chars, time-prefixed, unique per call', () => {
    const a = ulid();
    const b = ulid();
    asserts.assertMatch(a, /^[0-9A-HJKMNP-TV-Z]{26}$/);
    asserts.assertNotEquals(a, b);
    // Same timestamp → same 10-char time prefix, different randomness.
    const t = 1_700_000_000_000;
    const x = ulid(t);
    const y = ulid(t);
    asserts.assertEquals(x.slice(0, 10), y.slice(0, 10));
    asserts.assertNotEquals(x.slice(10), y.slice(10));
    // Later timestamp sorts lexicographically after.
    asserts.assertEquals(ulid(t + 60_000) > x, true);
  });

  it('coerceCount: number / bigint / numeric string / junk', () => {
    asserts.assertEquals(coerceCount(7), 7);
    asserts.assertEquals(coerceCount(9007199254740993n), 9007199254740992); // Number() rounding
    asserts.assertEquals(coerceCount('42'), 42);
    asserts.assertEquals(coerceCount(''), 0);
    asserts.assertEquals(coerceCount(undefined), 0);
    asserts.assertEquals(coerceCount(null), 0);
    asserts.assertEquals(coerceCount({ Count: 1 }), 0);
  });

  it('makeResult: data key exists only when supplied; txId/total only when set', () => {
    const bare = makeResult({ op: 'COUNT', count: 3, time: 1, isSlow: false });
    asserts.assertEquals('data' in bare, false);
    asserts.assertEquals('txId' in bare, false);
    asserts.assertEquals('total' in bare, false);
    asserts.assertEquals(bare.id.length, 26);

    const full = makeResult<string[]>({
      op: 'SELECT',
      count: 2,
      time: 5,
      isSlow: true,
      txId: 'tx-1',
      total: 10,
      data: ['a', 'b'],
      id: 'FIXED-ID-0000000000000000',
    });
    asserts.assertEquals(full.data, ['a', 'b']);
    asserts.assertEquals(full.txId, 'tx-1');
    asserts.assertEquals(full.total, 10);
    asserts.assertEquals(full.id, 'FIXED-ID-0000000000000000');

    // data: undefined EXPLICITLY passed still creates the key ('data'
    // in fields) — the no-data path must OMIT the property instead.
    const explicit = makeResult<undefined>({
      op: 'SELECT',
      count: 0,
      time: 1,
      isSlow: false,
      data: undefined,
    });
    asserts.assertEquals('data' in explicit, true);
  });
});
