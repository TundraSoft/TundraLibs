import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { cuid2 } from './cuid2.ts';

describe('id.cuid2', () => {
  it('produces a 24-character string by default', () => {
    const id = cuid2();
    asserts.assertEquals(id.length, 24);
  });

  it('honours the length argument', () => {
    asserts.assertEquals(cuid2(24).length, 24);
    asserts.assertEquals(cuid2(32).length, 32);
    asserts.assertEquals(cuid2(28).length, 28);
  });

  it('rejects lengths outside the 24..32 range', () => {
    asserts.assertThrows(() => cuid2(23));
    asserts.assertThrows(() => cuid2(33));
    asserts.assertThrows(() => cuid2(0));
    asserts.assertThrows(() => cuid2(-1));
    asserts.assertThrows(() => cuid2(3.5));
  });

  it('starts with a letter, body is lowercase alphanumeric', () => {
    for (let i = 0; i < 100; i++) {
      const id = cuid2();
      asserts.assertMatch(id, /^[a-z][a-z0-9]{23}$/);
    }
  });

  it('refills the random batch when it is exhausted by rejections', () => {
    const real = crypto.getRandomValues.bind(crypto);
    let calls = 0;
    // First draw returns all 0xFF — every byte is >= both rejection limits
    // (234 for the leading letter, 252 for the body), so the whole initial
    // batch is rejected and the refill branch fires. Later draws delegate to
    // the real CSPRNG so generation terminates. A broken refill would splice
    // `undefined` bytes into the id and fail the format assertion below.
    crypto.getRandomValues = ((array: Uint8Array) => {
      calls++;
      if (calls === 1) return array.fill(0xff);
      return real(array);
    }) as typeof crypto.getRandomValues;
    try {
      const id = cuid2();
      asserts.assertMatch(id, /^[a-z][a-z0-9]{23}$/);
      asserts.assert(
        calls >= 2,
        'refill draw did not fire after batch exhaustion',
      );
    } finally {
      crypto.getRandomValues = real;
    }
  });

  it('does not collide on 10000 sequential generations', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 10_000; i++) {
      const id = cuid2();
      asserts.assertFalse(seen.has(id), `Duplicate cuid2: ${id}`);
      seen.add(id);
    }
  });

  it('matches the cuid2 format pattern across lengths', () => {
    // The validator pattern is `/^[a-z][a-z0-9]{23,}$/`. Generator
    // output must satisfy it at every length in the supported range.
    for (const len of [24, 25, 28, 30, 32]) {
      const pattern = new RegExp(`^[a-z][a-z0-9]{${len - 1}}$`);
      const id = cuid2(len);
      asserts.assertMatch(id, pattern);
    }
  });

  it('body characters are unbiased (rejection sampling)', () => {
    // With a naive `byte % 36`, residues 0..3 (digits "0123") would be
    // favoured by ~1.6% over the other 32 symbols. Rejection sampling
    // removes that. Collect a large body-char sample and assert no symbol
    // strays far from the uniform expectation.
    const ALPHA = '0123456789abcdefghijklmnopqrstuvwxyz';
    const counts = new Map<string, number>();
    for (const ch of ALPHA) counts.set(ch, 0);

    const idCount = 20_000;
    let total = 0;
    for (let i = 0; i < idCount; i++) {
      const id = cuid2(32);
      // Skip index 0 (the leading letter, drawn from a different alphabet).
      for (let j = 1; j < id.length; j++) {
        const ch = id[j]!;
        counts.set(ch, (counts.get(ch) ?? 0) + 1);
        total++;
      }
    }

    const expected = total / ALPHA.length;
    // Every symbol must appear, and within +/-15% of the uniform mean. A
    // biased %36 would push the four favoured digits ~12.5% above the others
    // (their relative frequency would be 9/256 vs 7/256), so the favoured/
    // disfavoured gap (~25%) cannot both fit inside this band.
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
