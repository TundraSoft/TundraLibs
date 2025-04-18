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
    // Invalid timestamp
    asserts.assertThrows(
      () => ulid(-1),
      Error,
      'Time must be between 0 and 281474976710655',
    );

    // Invalid ULID for timestamp extraction (wrong length)
    asserts.assertThrows(
      () => getTimestamp('TOOSHORT'),
      Error,
      'Invalid ULID: incorrect length',
    );

    // Invalid ULID character
    asserts.assertThrows(
      () => getTimestamp('U0000000000000000000000000'),
      Error,
      'Invalid ULID timestamp character',
    );
  });
});
