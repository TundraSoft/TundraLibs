import * as asserts from '$asserts';
import { sequenceID } from './mod.ts';

Deno.test('id.sequenceId', async (t) => {
  await t.step('ensure the values are in sequence', () => {
    for (let i = 0; i < 100; i++) {
      const seq = sequenceID();
      const res1 = seq(),
        res2 = seq();
      asserts.assertEquals(res2 - res1, 1n);
    }
  });

  await t.step('ensure the sequence is getting overridden', () => {
    const seq = sequenceID();
    const res1 = seq(),
      res2 = seq(3251);
    asserts.assertNotEquals(res2, res1 + 1n);
  });

  await t.step('check for collission on sample set of 100000', () => {
    const iterations = 100000; // The number of parallel executions to simulate
    const generatedIds = new Set<bigint>(); // Set to store the generated IDs
    const seq = sequenceID();
    // Run the parallel executions
    const promises = new Array(iterations).fill(null).map(async () => {
      generatedIds.add(seq()); // Add the ID to the set
    });

    // Wait for all parallel executions to complete
    return Promise.all(promises)
      .then(() => {
        asserts.assertEquals(generatedIds.size, iterations);
      });
  });

  // Additional test cases
  await t.step('handle very large override values', () => {
    const largeNumber = Number.MAX_SAFE_INTEGER;
    const seq = sequenceID(largeNumber);
    const id = seq();
    asserts.assertEquals(typeof id, 'bigint');
    const nextId = seq();
    asserts.assertEquals(nextId - id, 1n);
  });

  await t.step('handle zero as override value', () => {
    const seq = sequenceID(0);
    const id = seq();
    asserts.assertEquals(typeof id, 'bigint');
    asserts.assertEquals(id >= 0n, true);
  });

  await t.step('verify sequence persistence after multiple calls', () => {
    const seq = sequenceID();
    const startId = seq();
    const calls = 10;
    let lastId = startId;

    for (let i = 0; i < calls; i++) {
      const currentId = seq();
      asserts.assertEquals(currentId - lastId, 1n);
      lastId = currentId;
    }

    asserts.assertEquals(lastId - startId, BigInt(calls));
  });

  await t.step('test cross-instance collision resistance', () => {
    // Create multiple sequences at the same time
    const sequences = [];
    const count = 100;
    const seq = sequenceID();
    for (let i = 0; i < count; i++) {
      sequences.push(seq());
    }

    // Check for uniqueness
    const uniqueSequences = new Set(sequences.map((id) => id.toString()));
    asserts.assertEquals(uniqueSequences.size, count);
  });

  await t.step('test negative counter value', () => {
    asserts.assertThrows(
      () => sequenceID(-1),
      Error,
      'Counter cannot be negative',
    );
    const d = sequenceID(10);
    asserts.assertThrows(() => d(-1), Error, 'Counter cannot be negative');
  });

  await t.step('bit-field extraction and validation', () => {
    const gen = sequenceID();
    const id1 = gen();
    const id2 = gen();
    const extract = (v: bigint) => {
      const serverId = (v >> 56n) & 0xFFn;
      const startupTime = (v >> 24n) & 0xFFFFFFFFn;
      const randomComponent = (v >> 8n) & 0xFFFFn;
      const counter = v & 0xFFn;
      return { serverId, startupTime, randomComponent, counter };
    };
    const a = extract(id1);
    const b = extract(id2);
    // server id matches pid % 255
    asserts.assertEquals(a.serverId, BigInt(Deno.pid % 255));
    asserts.assertEquals(b.serverId, a.serverId);
    // startup time seconds close to now
    const nowSecs = Math.floor(Date.now() / 1000);
    asserts.assert(Math.abs(Number(a.startupTime) - nowSecs) < 5);
    asserts.assertEquals(b.startupTime, a.startupTime); // constant per generator
    // random component constant for same generator
    asserts.assertEquals(b.randomComponent, a.randomComponent);
    // counter increments by 1
    asserts.assertEquals(b.counter - a.counter, 1n);
  });

  await t.step('random component differs across generators', () => {
    const g1 = sequenceID();
    const g2 = sequenceID();
    const id1 = g1();
    const id2 = g2();
    const rand1 = (id1 >> 8n) & 0xFFFFn;
    const rand2 = (id2 >> 8n) & 0xFFFFn;
    // Extremely small chance of equality (1/65536); assertNotEquals is acceptable
    asserts.assertNotEquals(rand1.toString(), rand2.toString());
  });

  await t.step('override counter semantics', () => {
    const gen = sequenceID();
    const first = gen();
    const overridden = gen(200);
    const after = gen();
    const extractCounter = (v: bigint) => v & 0xFFn;
    const c1 = extractCounter(first);
    const cOverride = extractCounter(overridden);
    const cAfter = extractCounter(after);
    // override sets current value exactly to provided number
    asserts.assertEquals(cOverride, 200n);
    // next increments
    asserts.assertEquals(cAfter - cOverride, 1n);
    // initial sequence not necessarily related to override value
    asserts.assertNotEquals(c1, cOverride);
  });

  await t.step('multiple overrides progression', () => {
    const gen = sequenceID();
    gen(); // burn one
    const a = gen(10);
    const b = gen();
    const c = gen(5);
    const d = gen();
    const counter = (v: bigint) => v & 0xFFn;
    asserts.assertEquals(counter(a), 10n);
    asserts.assertEquals(counter(b), 11n);
    asserts.assertEquals(counter(c), 5n);
    asserts.assertEquals(counter(d), 6n);
  });
});
