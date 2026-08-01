import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { getTimestamp, monotonicFactory, monotonicUlid, ulid } from './ulid.ts';
import { InvalidOptionError, InvalidULIDError } from './errors/mod.ts';

describe('id.ulid', () => {
  it('Basic ULID format test', () => {
    const id = ulid();
    // ULID should be 26 characters long
    asserts.assertEquals(id.length, 26);
    // ULID should contain only Crockford Base32 characters
    asserts.assertMatch(id, /^[0123456789ABCDEFGHJKMNPQRSTVWXYZ]{26}$/);
  });

  it('ULID timestamp extraction', () => {
    // Test with a known timestamp
    const now = Date.now();
    const id = ulid(now);
    const extractedTime = getTimestamp(id);
    asserts.assertEquals(extractedTime, now);
  });

  it('ULID with custom timestamp', () => {
    const timestamp = 1628000000000; // August 3, 2021
    const id = ulid(timestamp);
    const extractedTime = getTimestamp(id);
    asserts.assertEquals(extractedTime, timestamp);
  });

  it('Lexicographical ordering by timestamp', () => {
    const id1 = ulid(1000); // 1 second after epoch
    const id2 = ulid(2000); // 2 seconds after epoch

    asserts.assert(
      id1 < id2,
      'ULIDs should be lexicographically ordered by timestamp',
    );
  });

  it('Monotonic ULID generation', () => {
    const timestamp = Date.now();
    const count = 10;
    const ids: string[] = [];

    // Generate multiple ULIDs with the same timestamp
    for (let i = 0; i < count; i++) {
      ids.push(monotonicUlid(timestamp));
    }

    // Verify all have the same timestamp
    for (const id of ids) {
      asserts.assertEquals(getTimestamp(id), timestamp);
    }

    // Verify monotonicity (each ID is greater than the previous)
    for (let i = 1; i < count; i++) {
      asserts.assert(
        ids[i - 1]! < ids[i]!,
        `ULID ${i - 1} (${ids[i - 1]}) should be less than ULID ${i} (${
          ids[i]
        })`,
      );
    }
  });

  it('Uniqueness test', () => {
    const count = 10000;
    const ids = new Set<string>();

    for (let i = 0; i < count; i++) {
      ids.add(ulid());
    }

    asserts.assertEquals(ids.size, count, 'All ULIDs should be unique');
  });

  it('Error handling', () => {
    // Invalid timestamp - negative
    asserts.assertThrows(
      () => ulid(-1),
      Error,
      'Time must be between 0 and 281474976710655',
    );

    // Invalid timestamp - too large (exceeds 48-bit max)
    const maxTime = 0xFFFFFFFFFFFF; // 48-bit max: 281474976710655
    asserts.assertThrows(
      () => ulid(maxTime + 1),
      Error,
      'Time must be between 0 and 281474976710655',
    );

    // Test maximum valid timestamp works
    const maxValidId = ulid(maxTime);
    asserts.assertEquals(maxValidId.length, 26);
    asserts.assertEquals(getTimestamp(maxValidId), maxTime);

    // Invalid ULID for timestamp extraction (wrong length)
    asserts.assertThrows(
      () => getTimestamp('TOOSHORT'),
      Error,
      'Invalid ULID: incorrect length',
    );

    // Invalid ULID for timestamp extraction (too long)
    asserts.assertThrows(
      () => getTimestamp('TOOLONGABCDEFGHIJKLMNOPQRSTUVWXYZ'),
      Error,
      'Invalid ULID: incorrect length',
    );

    // Invalid ULID character - excluded characters
    asserts.assertThrows(
      () => getTimestamp('U0000000000000000000000000'), // U is not in Crockford Base32
      Error,
      'Invalid ULID timestamp character',
    );

    asserts.assertThrows(
      () => getTimestamp('I0000000000000000000000000'), // I is excluded
      Error,
      'Invalid ULID timestamp character',
    );

    asserts.assertThrows(
      () => getTimestamp('L0000000000000000000000000'), // L is excluded
      Error,
      'Invalid ULID timestamp character',
    );

    asserts.assertThrows(
      () => getTimestamp('O0000000000000000000000000'), // O is excluded
      Error,
      'Invalid ULID timestamp character',
    );
  });

  it('Monotonic ULID edge cases', () => {
    // Test monotonic behavior with undefined timestamp (should use current time)
    const mono1 = monotonicUlid();
    const mono2 = monotonicUlid();
    asserts.assertEquals(mono1.length, 26);
    asserts.assertEquals(mono2.length, 26);

    // Test that different timestamps reset monotonic counter. Use a FRESH
    // factory here: the process-wide `monotonicUlid` shares state across every
    // test, and now that the generator correctly clamps against clock
    // regression (see the backward-clock test below), asking the shared chain
    // for an older fixed timestamp would clamp it forward. A dedicated factory
    // gives this case deterministic, leaked-state-free timestamps.
    const gen = monotonicFactory();
    const time1 = 1000;
    const time2 = 2000;

    const id1a = gen(time1);
    const id1b = gen(time1);
    const id2a = gen(time2);
    const id2b = gen(time2);

    // Same timestamp should be monotonic
    asserts.assert(id1a < id1b);
    asserts.assert(id2a < id2b);

    // Different (forward) timestamps should properly extract
    asserts.assertEquals(getTimestamp(id1a), time1);
    asserts.assertEquals(getTimestamp(id2a), time2);
  });

  it('ULID format validation', () => {
    // Test that all characters in generated ULIDs are from Crockford Base32
    const validChars = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

    for (let i = 0; i < 100; i++) {
      const id = ulid();
      for (const char of id) {
        asserts.assert(
          validChars.includes(char),
          `Invalid character '${char}' found in ULID: ${id}`,
        );
      }
    }
  });

  it('Timestamp boundary tests', () => {
    // Test zero timestamp
    const zeroId = ulid(0);
    asserts.assertEquals(getTimestamp(zeroId), 0);

    // Test various timestamp values
    const testTimes = [
      1,
      1000,
      Date.now(),
      1640995200000, // 2022-01-01
      281474976710655, // Max 48-bit value
    ];

    for (const time of testTimes) {
      const id = ulid(time);
      asserts.assertEquals(getTimestamp(id), time);
      asserts.assertEquals(id.length, 26);
    }
  });

  it('Monotonic overflow simulation', () => {
    // Test extreme case where monotonic counter might overflow
    // This tests the incrementRandom function behavior. A fresh factory keeps
    // `sameTime` deterministic: the shared `monotonicUlid` chain would clamp
    // this fixed past timestamp forward to whatever time earlier tests left it
    // at, now that clock-regression clamping is in place.
    const gen = monotonicFactory();
    const sameTime = 12345;
    const ids: string[] = [];

    // Generate many monotonic ULIDs with same timestamp
    for (let i = 0; i < 100; i++) {
      const id = gen(sameTime);
      ids.push(id);
      asserts.assertEquals(getTimestamp(id), sameTime);
    }

    // Verify strict ordering
    for (let i = 1; i < ids.length; i++) {
      asserts.assert(
        ids[i - 1]! < ids[i]!,
        `Monotonic ordering failed at index ${i}: ${ids[i - 1]} >= ${ids[i]}`,
      );
    }
  });

  it('Case insensitive timestamp extraction', () => {
    // Test that getTimestamp handles lowercase characters properly
    const id = ulid();
    const lowerCaseId = id.toLowerCase();

    // Should extract same timestamp from lowercase version
    const originalTime = getTimestamp(id);
    const lowerTime = getTimestamp(lowerCaseId);
    asserts.assertEquals(originalTime, lowerTime);
  });

  it('monotonicFactory gives each stream an independent chain', () => {
    // Two factories generating at the same timestamp must NOT interfere:
    // each must be internally monotonic, where a single shared chain would
    // have interleaved their increments.
    const sameTime = 7777;
    const genA = monotonicFactory();
    const genB = monotonicFactory();

    const a: string[] = [];
    const b: string[] = [];
    for (let i = 0; i < 50; i++) {
      a.push(genA(sameTime));
      b.push(genB(sameTime));
    }

    // Each stream is strictly increasing on its own.
    for (let i = 1; i < a.length; i++) {
      asserts.assert(a[i - 1]! < a[i]!, `stream A not monotonic at ${i}`);
      asserts.assert(b[i - 1]! < b[i]!, `stream B not monotonic at ${i}`);
    }

    // Same timestamp on both streams.
    for (const id of [...a, ...b]) {
      asserts.assertEquals(getTimestamp(id), sameTime);
    }
  });

  it('monotonic overflow throws instead of wrapping (carry-out)', () => {
    // Force the random component to all-0xFF so the next same-millisecond
    // increment carries out of the top byte. Wrapping back to 00..00 would
    // make the next ULID sort BEFORE the previous one; the spec requires we
    // throw instead.
    const originalGetRandomValues = crypto.getRandomValues;
    try {
      // deno-lint-ignore no-explicit-any
      (crypto as any).getRandomValues = (arr: Uint8Array) => {
        arr.fill(0xFF);
        return arr;
      };

      const gen = monotonicFactory();
      const time = 4242;
      // First call seeds lastRandom = FF..FF (no increment yet).
      const first = gen(time);
      asserts.assertEquals(getTimestamp(first), time);
      // Second call at the same timestamp must increment FF..FF -> overflow.
      asserts.assertThrows(
        () => gen(time),
        Error,
        'overflowed within a millisecond',
      );
    } finally {
      crypto.getRandomValues = originalGetRandomValues;
    }
  });

  it('Monotonic large sample ordering & reset', () => {
    const sampleTime = Date.now();
    const count = 1024;
    const list: string[] = [];
    for (let i = 0; i < count; i++) {
      list.push(monotonicUlid(sampleTime));
    }
    // uniqueness
    asserts.assertEquals(new Set(list).size, count);
    // ordering
    for (let i = 1; i < list.length; i++) {
      asserts.assert(list[i - 1]! < list[i]!);
    }
    // timestamp extraction all equal
    for (const id of list) {
      asserts.assertEquals(getTimestamp(id), sampleTime);
    }
    // Reset behavior with new timestamp
    const laterTime = sampleTime + 1;
    const firstLater = monotonicUlid(laterTime);
    asserts.assert(getTimestamp(firstLater) === laterTime);
    // new timestamp should produce lexicographically greater ULIDs than previous batch
    asserts.assert(list.at(-1)! < firstLater);
  });

  // --- Round-3 regression tests ---

  it('monotonic chain stays ordered when the clock steps backward (F2)', () => {
    // Regression: previously any timestamp earlier than the last emitted one
    // took the fresh-random branch and produced a ULID that sorted BEFORE its
    // predecessor. The generator must clamp to lastTime and keep incrementing.
    const gen = monotonicFactory();
    const a = gen(5000);
    const b = gen(5000);
    const c = gen(4000); // clock stepped back 1s (NTP / VM resume)
    asserts.assert(a < b, `a (${a}) < b (${b})`);
    asserts.assert(b < c, `b (${b}) < c (${c}) after backward clock`);
    // The clamped ID keeps the last (larger) timestamp, not the requested one.
    asserts.assertEquals(getTimestamp(c), 5000);
    // A whole descending run stays strictly increasing and sortable.
    let prev = c;
    for (const t of [3000, 3000, 1, 4999, 5000]) {
      const next = gen(t);
      asserts.assert(prev < next, `regression run not monotonic at t=${t}`);
      prev = next;
    }
  });

  it('ulid() rejects NaN / fractional / Infinite timestamps (F3)', () => {
    // Regression: NaN slipped past `time < 0 || time > max` (NaN compares false
    // both ways) and minted a structurally valid epoch-0 ULID; fractional
    // values encoded lossily. All must now throw InvalidOptionError.
    for (const bad of [NaN, 1.5, Infinity, -Infinity]) {
      asserts.assertThrows(
        () => ulid(bad),
        InvalidOptionError,
        'Time must be between 0 and 281474976710655',
      );
      asserts.assertThrows(
        () => monotonicUlid(bad),
        InvalidOptionError,
        'Time must be between 0 and 281474976710655',
      );
    }
    // ulid(NaN) previously returned an epoch-0 ULID — ensure it now throws
    // rather than producing a decodable value.
    asserts.assertThrows(() => ulid(NaN), InvalidOptionError);
  });

  it('getTimestamp validates the random segment characters (F4)', () => {
    // Regression: only chars 0-9 were validated, so 16 arbitrary characters in
    // the random segment decoded without error.
    asserts.assertThrows(
      () => getTimestamp('01ARZ3NDEK!!!!!!!!!!!!!!!!'),
      InvalidULIDError,
      'Invalid ULID character',
    );
    // An excluded Crockford letter (U) in the random segment is rejected too.
    asserts.assertThrows(
      () => getTimestamp('0000000000000000000000000U'),
      InvalidULIDError,
      'Invalid ULID character',
    );
    // A valid ULID (all 26 chars legal) still decodes fine — no false positive.
    const valid = ulid(1469922850259);
    asserts.assertEquals(getTimestamp(valid), 1469922850259);
  });

  it('getTimestamp rejects timestamps above the 48-bit maximum (F4)', () => {
    // Regression: a leading char above '7' decoded to up to 2^50-1, a value
    // ulid()/encodeTime would never mint.
    asserts.assertThrows(
      () => getTimestamp('ZZZZZZZZZZ0000000000000000'),
      InvalidULIDError,
      'timestamp exceeds 48-bit maximum',
    );
    // The exact 48-bit maximum is still accepted (boundary, not over).
    const maxId = ulid(0xFFFFFFFFFFFF);
    asserts.assertEquals(getTimestamp(maxId), 0xFFFFFFFFFFFF);
  });

  // --- Round-4 regression test ---

  it('ulid(pastTimestamp, true) clamps to the shared chain (documented, not silent)', () => {
    // Contract: `ulid(ts, true)` shares the process-wide monotonic chain with
    // `monotonicUlid()`, so it inherits the clock-regression clamp. When `ts`
    // is at or before the chain's last emitted time, the returned ULID embeds
    // the clamped (last) time — NOT the requested one — and increments the
    // random component to preserve ordering. This is documented on both
    // `ulid()` and `monotonicUlid()`; the value is not silently discarded.
    //
    // Advance the shared chain to "now", then backfill an older timestamp.
    const now = Date.now();
    monotonicUlid(now);
    const past = 1609459200000; // 2021-01-01, well before `now`
    const backfilled = ulid(past, true);
    // Embedded time is the clamped (>= now) time, never the requested past one.
    asserts.assert(
      getTimestamp(backfilled) >= now,
      `expected clamp to >= ${now}, got ${getTimestamp(backfilled)}`,
    );
    asserts.assertNotEquals(getTimestamp(backfilled), past);
    // Contrast: NON-monotonic ulid(past) still honors the timestamp exactly,
    // which is the documented way to embed an arbitrary/older timestamp.
    asserts.assertEquals(getTimestamp(ulid(past)), past);
  });
});
