import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { cuid } from './cuid.ts';

describe('id.cuid', () => {
  it('produces a 25-character string', () => {
    const id = cuid();
    asserts.assertEquals(id.length, 25);
  });

  it('starts with `c` and is lowercase alphanumeric', () => {
    const id = cuid();
    asserts.assertMatch(id, /^c[a-z0-9]{24}$/);
  });

  it('does not collide on 10000 sequential generations', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 10_000; i++) {
      const id = cuid();
      asserts.assertFalse(seen.has(id), `Duplicate cuid: ${id}`);
      seen.add(id);
    }
  });

  it('IDs generated close together sort by creation order', () => {
    const ids: string[] = [];
    for (let i = 0; i < 100; i++) {
      ids.push(cuid());
    }
    const sorted = [...ids].sort();
    // Timestamp segment is the dominant high-order component; counter
    // breaks ties within a millisecond. So same-process generations
    // should be lexicographically ordered.
    asserts.assertEquals(ids, sorted);
  });

  it('random tail is unbiased (rejection sampling)', () => {
    // The trailing 8 chars are the crypto-random segment. A naive `byte % 36`
    // favours digits "0123"; rejection sampling removes that bias. Sample the
    // tail across many IDs and assert each base36 symbol stays near uniform.
    const ALPHA = '0123456789abcdefghijklmnopqrstuvwxyz';
    const RANDOM_LEN = 8;
    const counts = new Map<string, number>();
    for (const ch of ALPHA) counts.set(ch, 0);

    const idCount = 50_000;
    let total = 0;
    for (let i = 0; i < idCount; i++) {
      const tail = cuid().slice(-RANDOM_LEN);
      for (const ch of tail) {
        counts.set(ch, (counts.get(ch) ?? 0) + 1);
        total++;
      }
    }

    const expected = total / ALPHA.length;
    for (const ch of ALPHA) {
      const c = counts.get(ch)!;
      asserts.assert(c > 0, `symbol "${ch}" never appeared`);
      const deviation = Math.abs(c - expected) / expected;
      asserts.assert(
        deviation < 0.15,
        `symbol "${ch}" deviates ${(deviation * 100).toFixed(1)}% from uniform`,
      );
    }
  });
});
