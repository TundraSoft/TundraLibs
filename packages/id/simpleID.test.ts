import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { simpleID } from './mod.ts';
import { InvalidOptionError } from './errors/mod.ts';

describe('id.simpleId', () => {
  it('Must generate unique ids', () => {
    const id = simpleID(),
      iterations = 100000, // The number of parallel executions to simulate
      generatedIds = new Set<bigint>(); // Set to store the generated IDs
    for (let i = 0; i < iterations; i++) {
      generatedIds.add(id()); // Add the ID to the set
    }
    asserts.assertEquals(generatedIds.size, iterations); // Ensure the ID is unique
  });

  it('Ensure the ID is in sequence', () => {
    const id = simpleID(),
      res1 = id(),
      res2 = id();
    asserts.assertEquals(res2 - res1, 1n); // Ensure the ID is in sequence
  });

  it('Change seed and length', () => {
    const id = simpleID(3251, 6),
      res1 = id();
    asserts.assertEquals(res1.toString().length, 14);
    asserts.assertEquals(res1.toString().substring(8), '003252');
  });

  // Additional test cases
  it('Test minimum length padding with different values', () => {
    // Test with minLen = 2
    const id1 = simpleID(5, 2);
    asserts.assertEquals(id1().toString().substring(8), '06');

    // Test with minLen = 10
    const id2 = simpleID(42, 10);
    asserts.assertEquals(id2().toString().substring(8), '0000000043');
  });

  it('Test with zero as seed value', () => {
    const id = simpleID(0, 3);
    const result = id();
    asserts.assertEquals(result.toString().substring(8), '001');
  });

  it('Test date portion formatting', () => {
    const id = simpleID();
    const result = id().toString();
    const datePart = result.substring(0, 8);

    const today = new Date();
    const expectedDatePart = `${today.getFullYear()}${
      String(today.getMonth() + 1).padStart(2, '0')
    }${String(today.getDate()).padStart(2, '0')}`;

    asserts.assertEquals(datePart, expectedDatePart);
  });

  it('Test consecutive calls with same date', () => {
    const id = simpleID(100, 5);
    const results = [id(), id(), id(), id(), id()];

    // Check that the date part stays the same
    const datePart = results[0]!.toString().substring(0, 8);
    for (const result of results) {
      asserts.assertEquals(result.toString().substring(0, 8), datePart);
    }

    // Check sequential counter values
    for (let i = 1; i < results.length; i++) {
      asserts.assertEquals(results[i]! - results[i - 1]!, 1n);
    }
  });

  it('Test if the counter resets on a new day', () => {
    // Save original Date constructor
    const OriginalDate = Date;

    try {
      const OriginalDate = Date;
      const dt = new Date(2023, 0, 2, 12, 0, 0);

      // @ts-ignore: Mocking Date for testing
      globalThis.Date = class extends OriginalDate {
        constructor() {
          super();
          return dt; // NOSONAR - Spoofing
        }
      };

      const id = simpleID(0, 4);

      asserts.assertEquals(id(), 202301020001n);

      globalThis.Date = OriginalDate;

      // Check that the date part changed and seed reset
      asserts.assertNotEquals(id(), 202301020002n);
    } finally {
      // Restore original Date constructor
      globalThis.Date = OriginalDate;
    }
  });

  it('Test with microseconds', () => {
    const id = simpleID(0, 4, true);
    asserts.assert(id().toString().length > 14); // Check if the ID length is greater than 14
  });
  it('Error: minLen < 1 should throw', () => {
    asserts.assertThrows(
      () => simpleID(0, 0),
      Error,
      'Minimum length must be at least 1',
    );
  });

  it('rejects NaN / non-integer seeds with a typed error (F1)', () => {
    // Regression: NaN and fractional seeds survived the Math.max clamp and
    // rendered into the digit string ('NaN', '3.5'), so BigInt() threw a raw
    // SyntaxError on the FIRST generation call instead of the documented
    // InvalidOptionError at construction.
    for (const bad of [NaN, 2.5, Infinity, -Infinity]) {
      asserts.assertThrows(
        () => simpleID(bad),
        InvalidOptionError,
        'Seed must be an integer',
      );
    }
    // A negative INTEGER seed is still clamped to 0 (not thrown): first ID
    // ends in the padded counter '0001'.
    const clamped = simpleID(-5, 4);
    asserts.assertEquals(clamped().toString().substring(8), '0001');
  });

  it('rejects NaN / non-integer / oversized minLen with a typed error (F1 sibling)', () => {
    // Incomplete-fix sibling of the seed guard three lines below it: the F1
    // NaN/non-integer hole was closed on `seed` but left open on `minLen`.
    // - NaN slipped past `minLen < 1` (NaN compares false both ways) and
    //   silently emitted a below-minimum 1-digit counter.
    // - A fractional value passed `< 1` too and silently emitted a
    //   below-minimum counter (e.g. minLen 3.7 -> 3 digits).
    // - Infinity / a finite-but-huge integer passed `< 1` and then leaked a
    //   raw RangeError out of `padStart` on the FIRST generation call,
    //   bypassing the documented InvalidOptionError contract.
    for (const bad of [NaN, 3.7, Infinity]) {
      asserts.assertThrows(
        () => simpleID(0, bad),
        InvalidOptionError,
        'Minimum length must be an integer',
      );
    }
    // Finite-but-oversized integer -> typed error, NOT a raw RangeError from
    // padStart deferred to generation time.
    asserts.assertThrows(
      () => simpleID(0, 1e10),
      InvalidOptionError,
      'Minimum length must not exceed',
    );
    asserts.assertThrows(
      () => simpleID(0, 257),
      InvalidOptionError,
      'Minimum length must not exceed',
    );
    // Boundary: the documented maximum (256) is accepted and generates a
    // 256-digit padded counter without throwing.
    const maxed = simpleID(0, 256);
    asserts.assertEquals(maxed().toString().substring(8).length, 256);
    // -Infinity is still caught by the pre-existing `< 1` check.
    asserts.assertThrows(
      () => simpleID(0, -Infinity),
      InvalidOptionError,
      'Minimum length must be at least 1',
    );
  });

  it('Microseconds component length & variability', () => {
    const gen = simpleID(0, 3, true);
    let a = gen().toString();
    let b = gen().toString();
    // Structure: YYYYMMDD (8) + micro(6) + counter(>=3)
    asserts.assertEquals(a.length >= 8 + 6 + 3, true);
    let microA = a.substring(8, 14);
    let microB = b.substring(8, 14);
    asserts.assertMatch(microA, /^\d{6}$/);
    asserts.assertMatch(microB, /^\d{6}$/);

    // If microseconds are the same, try a few more times to get different values
    // This handles timing issues on heavily loaded systems
    let attempts = 0;
    while (microA === microB && attempts < 5) {
      const c = gen().toString();
      const microC = c.substring(8, 14);
      // If the new value is different from at least one previous, we're done
      if (microC !== microA || microC !== microB) {
        return;
      }
      // Otherwise, keep trying
      microA = microB;
      microB = microC;
      attempts++;
    }

    // At least one pair should be different after retries
    asserts.assertNotEquals(microA, microB);
  });

  it('minLen is a floor: counter width grows past minLen digits', () => {
    // Seed so the very first emitted counter is already wider than minLen.
    // minLen = 2 but seed makes the counter 100 (3 digits) -> width grows.
    const id = simpleID(99, 2);
    const first = id().toString();
    const datePart = first.substring(0, 8);
    asserts.assertEquals(first.substring(8), '100'); // 3 digits, not padded to 2
    asserts.assertEquals(first.length, datePart.length + 3);

    // Boundary: minLen=4, seed=9998 -> counter 9999 stays 4 wide, then 10000
    // overflows to 5 digits (the documented floor-not-fixed-width behaviour).
    const wrap = simpleID(9998, 4);
    asserts.assertEquals(wrap().toString().substring(8), '9999'); // 4 digits
    asserts.assertEquals(wrap().toString().substring(8), '10000'); // grows to 5
  });
});
