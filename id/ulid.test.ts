import * as asserts from '$asserts';
import { getTimestamp, monotonicUlid, ulid } from './ulid.ts';

Deno.test('id.ulid', async (t) => {
  await t.step('Basic ULID format test', () => {
    const id = ulid();
    // ULID should be 26 characters long
    asserts.assertEquals(id.length, 26);
    // ULID should contain only Crockford Base32 characters
    asserts.assertMatch(id, /^[0123456789ABCDEFGHJKMNPQRSTVWXYZ]{26}$/);
  });

  await t.step('ULID timestamp extraction', () => {
    // Test with a known timestamp
    const now = Date.now();
    const id = ulid(now);
    const extractedTime = getTimestamp(id);
    asserts.assertEquals(extractedTime, now);
  });

  await t.step('ULID with custom timestamp', () => {
    const timestamp = 1628000000000; // August 3, 2021
    const id = ulid(timestamp);
    const extractedTime = getTimestamp(id);
    asserts.assertEquals(extractedTime, timestamp);
  });

  await t.step('Lexicographical ordering by timestamp', () => {
    const id1 = ulid(1000); // 1 second after epoch
    const id2 = ulid(2000); // 2 seconds after epoch

    asserts.assert(
      id1 < id2,
      'ULIDs should be lexicographically ordered by timestamp',
    );
  });

  await t.step('Monotonic ULID generation', () => {
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

  await t.step('Uniqueness test', () => {
    const count = 10000;
    const ids = new Set<string>();

    for (let i = 0; i < count; i++) {
      ids.add(ulid());
    }

    asserts.assertEquals(ids.size, count, 'All ULIDs should be unique');
  });

  await t.step('Error handling', () => {
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

  await t.step('Monotonic ULID edge cases', () => {
    // Test monotonic behavior with undefined timestamp (should use current time)
    const mono1 = monotonicUlid();
    const mono2 = monotonicUlid();
    asserts.assertEquals(mono1.length, 26);
    asserts.assertEquals(mono2.length, 26);

    // Test that different timestamps reset monotonic counter
    const time1 = 1000;
    const time2 = 2000;

    const id1a = monotonicUlid(time1);
    const id1b = monotonicUlid(time1);
    const id2a = monotonicUlid(time2);
    const id2b = monotonicUlid(time2);

    // Same timestamp should be monotonic
    asserts.assert(id1a < id1b);
    asserts.assert(id2a < id2b);

    // Different timestamps should properly extract
    asserts.assertEquals(getTimestamp(id1a), time1);
    asserts.assertEquals(getTimestamp(id2a), time2);
  });

  await t.step('ULID format validation', () => {
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

  await t.step('Timestamp boundary tests', () => {
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

  await t.step('Monotonic overflow simulation', () => {
    // Test extreme case where monotonic counter might overflow
    // This tests the incrementRandom function behavior
    const sameTime = 12345;
    const ids: string[] = [];

    // Generate many monotonic ULIDs with same timestamp
    for (let i = 0; i < 100; i++) {
      const id = monotonicUlid(sameTime);
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

  await t.step('Case insensitive timestamp extraction', () => {
    // Test that getTimestamp handles lowercase characters properly
    const id = ulid();
    const lowerCaseId = id.toLowerCase();

    // Should extract same timestamp from lowercase version
    const originalTime = getTimestamp(id);
    const lowerTime = getTimestamp(lowerCaseId);
    asserts.assertEquals(originalTime, lowerTime);
  });

  await t.step('Monotonic large sample ordering & reset', () => {
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
    asserts.assert(list[list.length - 1]! < firstLater);
  });
});
