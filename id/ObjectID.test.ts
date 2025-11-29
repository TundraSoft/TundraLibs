import * as asserts from '$asserts';
import { ObjectID } from './mod.ts';

// Component lengths (default machineIdLength = 3)
const DEFAULT_TOTAL_LENGTH = 26; // 8 + 3 + 3 + 4 + 2 + 6

Deno.test('id.objectId', async (t) => {
  await t.step('basic uniqueness and length', () => {
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

  await t.step('segment parsing & sequence', () => {
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
    const expectedProcess = (Deno.pid % 65535).toString(16).padStart(4, '0');
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

  await t.step(
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

  await t.step('explicit machineId ignores machineIdLength parameter', () => {
    const gen = ObjectID(0, 'xyz', 10); // length param should not alter explicit machineId
    const id = gen();
    asserts.assertEquals(id.substring(11, 14), 'xyz');
    asserts.assertEquals(id.length, DEFAULT_TOTAL_LENGTH); // remains default 26
  });

  await t.step('counter wrap near MAX_SAFE_INTEGER', () => {
    const start = Number.MAX_SAFE_INTEGER - 2; // start so first emission is MAX_SAFE_INTEGER -1
    const gen = ObjectID(start);
    const first = gen(); // counter becomes start+1 = MAX_SAFE_INTEGER -1
    const second = gen(); // counter wraps to 0
    const c1 = Number(first.substring(20));
    const c2 = Number(second.substring(20));
    asserts.assertEquals(c1, Number.MAX_SAFE_INTEGER - 1);
    asserts.assertEquals(c2, 0);
    asserts.assert(c2 < c1);
  });

  await t.step('negative counter should throw', () => {
    asserts.assertThrows(
      () => ObjectID(-1),
      Error,
      'Counter cannot be negative',
    );
  });

  await t.step('machineIdLength validation', () => {
    asserts.assertThrows(
      () => ObjectID(0, 'a', 0),
      Error,
      'Machine ID length must be at least 1',
    );
  });

  await t.step('multi-instance differing workerIds', () => {
    const g1 = ObjectID();
    const g2 = ObjectID();
    const w1 = g1().substring(18, 20);
    const w2 = g2().substring(18, 20);
    // worker ids likely differ (collision extremely unlikely)
    asserts.assertNotEquals(w1, w2);
  });
});
