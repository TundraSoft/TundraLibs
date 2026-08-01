import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { ObjectID } from './mod.ts';
import { getProcessId } from '@tundralibs/compat/runtime';

// Component lengths (default machineIdLength = 3)
const DEFAULT_TOTAL_LENGTH = 26; // 8 + 3 + 3 + 4 + 2 + 6

describe('id.objectId', () => {
  it('basic uniqueness and length', () => {
    const idGen = ObjectID();
    const iterations = 10000; // reduced for runtime yet meaningful
    const set = new Set<string>();
    for (let i = 0; i < iterations; i++) {
      const v = idGen();
      asserts.assertEquals(v.length, DEFAULT_TOTAL_LENGTH);
      set.add(v);
    }
    asserts.assertEquals(set.size, iterations);
  });

  it('segment parsing & sequence', () => {
    const startCounter = 123;
    const machine = 'mch';
    const gen = ObjectID(startCounter, machine); // first emitted counter becomes 124
    const id1 = gen();
    const id2 = gen();
    // Parse segments
    const timestampHex = id1.substring(0, 8);
    const msPart = id1.substring(8, 11);
    const machineId = id1.substring(11, 14);
    const processId = id1.substring(14, 18);
    const workerId = id1.substring(18, 20);
    const counterStr1 = id1.substring(20);
    const counterStr2 = id2.substring(20);

    asserts.assertEquals(machineId, machine);
    asserts.assertEquals(id1.length, DEFAULT_TOTAL_LENGTH);
    // timestamp sanity
    const tsSeconds = Number.parseInt(timestampHex, 16);
    const nowSeconds = Math.floor(Date.now() / 1000);
    asserts.assert(Math.abs(nowSeconds - tsSeconds) < 5);
    // ms part numeric and 3 digits
    asserts.assertMatch(msPart, /^\d{3}$/);
    // process id matches pid modulus
    const expectedProcess = ((getProcessId() ?? 0) % 65536).toString(16)
      .padStart(4, '0');
    asserts.assertEquals(processId, expectedProcess);
    // worker id is stable across calls
    const workerId2 = id2.substring(18, 20);
    asserts.assertEquals(workerId, workerId2);
    // counter increases correctly (full 6 digit field)
    asserts.assertEquals(Number(counterStr2) - Number(counterStr1), 1);
    asserts.assertEquals(
      counterStr1,
      (startCounter + 1).toString().padStart(6, '0'),
    );
  });

  it(
    'custom machineIdLength affects total length & randomness',
    () => {
      const length = 5;
      const gen = ObjectID(0, undefined, length);
      const a = gen();
      const b = gen();
      const expectedLen = 8 + 3 + length + 4 + 2 + 6;
      asserts.assertEquals(a.length, expectedLen);
      asserts.assertEquals(b.length, expectedLen);
      const machineA = a.substring(11, 11 + length);
      const machineB = b.substring(11, 11 + length);
      // machine id stable per generator
      asserts.assertEquals(machineA, machineB);
      // different generators produce different machine IDs
      const gen2 = ObjectID(0, undefined, length);
      const c = gen2();
      const machineC = c.substring(11, 11 + length);
      asserts.assertNotEquals(machineA, machineC);
    },
  );

  it('explicit machineId ignores machineIdLength parameter', () => {
    const gen = ObjectID(0, 'xyz', 10); // length param should not alter explicit machineId
    const id = gen();
    asserts.assertEquals(id.substring(11, 14), 'xyz');
    asserts.assertEquals(id.length, DEFAULT_TOTAL_LENGTH); // remains default 26
  });

  it('counter wraps at the 6-digit field width, keeping ID length fixed', () => {
    // Regression: the counter must wrap at 1_000_000 so the 6-char field —
    // and therefore the total ID length — never grows. (It previously wrapped
    // at MAX_SAFE_INTEGER, letting the segment reach 16 digits and pushing the
    // ID past its documented width; the old test asserted that broken output
    // and never checked the length.)
    const gen = ObjectID(999_998); // first emission → 999999
    const first = gen();
    const second = gen(); // wraps 999999 -> 000000
    const third = gen();

    asserts.assertEquals(first.substring(20), '999999');
    asserts.assertEquals(second.substring(20), '000000');
    asserts.assertEquals(third.substring(20), '000001');

    // The invariant the old test missed: length stays fixed across the wrap.
    asserts.assertEquals(first.length, DEFAULT_TOTAL_LENGTH);
    asserts.assertEquals(second.length, DEFAULT_TOTAL_LENGTH);
    asserts.assertEquals(third.length, DEFAULT_TOTAL_LENGTH);
  });

  it('timestamp segment stays 8 chars past the 2106 epoch-seconds rollover', () => {
    // Regression: the timestamp hex segment is width-bounded, not just padded.
    // Once epoch-seconds exceed 0xFFFFFFFF (2106-02-07) an un-truncated
    // `toString(16)` renders 9 hex chars and widens the whole ID past its
    // fixed width — the same invariant the counter wrap protects. Freeze the
    // clock one second past the 32-bit unsigned max and assert the width holds.
    const originalNow = Date.now;
    try {
      // 0x1_0000_0000 seconds → 9 hex digits without truncation.
      Date.now = () => 0x1_0000_0000 * 1000;
      const gen = ObjectID();
      const id = gen();
      asserts.assertEquals(id.length, DEFAULT_TOTAL_LENGTH);
      // Timestamp segment is the low 32 bits, rendered as 8 hex chars.
      asserts.assertMatch(id.substring(0, 8), /^[0-9a-f]{8}$/);
    } finally {
      Date.now = originalNow;
    }
  });

  it('negative counter should throw', () => {
    asserts.assertThrows(
      () => ObjectID(-1),
      Error,
      'Counter cannot be negative',
    );
  });

  it('machineIdLength is validated on the auto-generate path', () => {
    // The `< 1` and integer guards apply only when the machine ID is
    // auto-generated (no explicit machineId), because
    // `machineId || nanoID(machineIdLength, ...)` never consumes
    // machineIdLength when an explicit machineId is supplied.
    asserts.assertThrows(
      () => ObjectID(0, undefined, 0),
      Error,
      'Machine ID length must be at least 1',
    );
    for (const bad of [NaN, 2.5, Infinity]) {
      asserts.assertThrows(
        () => ObjectID(0, undefined, bad),
        Error,
        'Machine ID length must be an integer',
      );
    }
  });

  it('explicit machineId ignores an invalid machineIdLength (does not throw)', () => {
    // Regression: the round-4 integer / `< 1` guards ran unconditionally, so an
    // explicit machineId paired with an invalid machineIdLength threw even
    // though the JSDoc documents machineIdLength as "ignored when an explicit
    // machineId is given". machineIdLength is genuinely unused on this path
    // (short-circuited away by `machineId || …`), so these must construct fine
    // and emit the explicit machine segment at the default total length.
    for (const ignored of [0, -5, 2.5, NaN, Infinity, -Infinity]) {
      const gen = ObjectID(0, 'srv', ignored);
      const id = gen();
      asserts.assertEquals(id.substring(11, 14), 'srv');
      asserts.assertEquals(id.length, DEFAULT_TOTAL_LENGTH);
    }
  });

  it('multi-instance differing workerIds', () => {
    const g1 = ObjectID();
    const g2 = ObjectID();
    const w1 = g1().substring(18, 20);
    const w2 = g2().substring(18, 20);
    // worker ids likely differ (collision extremely unlikely)
    asserts.assertNotEquals(w1, w2);
  });
});
