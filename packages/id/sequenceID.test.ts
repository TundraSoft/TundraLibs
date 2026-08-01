import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { sequenceID } from './mod.ts';
import { InvalidOptionError } from './errors/mod.ts';
import { getProcessId } from '@tundralibs/compat/runtime';

describe('id.sequenceId', () => {
  it('ensure the values are in sequence', () => {
    for (let i = 0; i < 100; i++) {
      const seq = sequenceID();
      const res1 = seq(),
        res2 = seq();
      asserts.assertEquals(res2 - res1, 1n);
    }
  });

  it('ensure the sequence is getting overridden', () => {
    const seq = sequenceID();
    const res1 = seq(),
      res2 = seq(3251);
    asserts.assertNotEquals(res2, res1 + 1n);
  });

  it('check for collission on sample set of 100000', () => {
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
  it('handle very large override values', () => {
    const largeNumber = Number.MAX_SAFE_INTEGER;
    const seq = sequenceID(largeNumber);
    const id = seq();
    asserts.assertEquals(typeof id, 'bigint');
    const nextId = seq();
    asserts.assertEquals(nextId - id, 1n);
  });

  it('handle zero as override value', () => {
    const seq = sequenceID(0);
    const id = seq();
    asserts.assertEquals(typeof id, 'bigint');
    asserts.assertEquals(id >= 0n, true);
  });

  it('verify sequence persistence after multiple calls', () => {
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

  it('test cross-instance collision resistance', () => {
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

  it('test negative counter value', () => {
    asserts.assertThrows(
      () => sequenceID(-1),
      Error,
      'Counter cannot be negative',
    );
    const d = sequenceID(10);
    asserts.assertThrows(() => d(-1), Error, 'Counter cannot be negative');
  });

  it('rejects NaN / non-integer counters with a typed error (F1)', () => {
    // Regression: NaN and fractional counters passed the `< 0` check, then
    // BigInt() threw a raw RangeError on the FIRST generation call — far from
    // the bad input and invisible to `instanceof InvalidOptionError` handlers.
    // Realistic trigger: `sequenceID(Number(process.env.SEED))` when unset.
    for (const bad of [NaN, 2.5, Infinity, -Infinity]) {
      asserts.assertThrows(
        () => sequenceID(bad),
        InvalidOptionError,
        bad < 0 ? 'Counter cannot be negative' : 'Counter must be an integer',
      );
    }
    // Construction must not defer the crash to generation time.
    const seq = sequenceID();
    asserts.assertThrows(
      () => seq(2.5),
      InvalidOptionError,
      'Counter must be an integer',
    );
    asserts.assertThrows(
      () => seq(NaN),
      InvalidOptionError,
      'Counter must be an integer',
    );
    // Valid integer overrides still work after a rejected one.
    asserts.assertEquals(typeof seq(7), 'bigint');
  });

  it('bit-field extraction and validation', () => {
    const gen = sequenceID();
    const id1 = gen();
    const id2 = gen();
    const extract = (v: bigint) => {
      const serverId = (v >> 56n) & 0xFFn;
      const startupTime = (v >> 24n) & 0xFFFFFFFFn;
      const counter = v & 0xFFFFFFn; // 24-bit counter
      return { serverId, startupTime, counter };
    };
    const a = extract(id1);
    const b = extract(id2);
    // server id matches pid % 256 (full 8-bit range)
    asserts.assertEquals(a.serverId, BigInt((getProcessId() ?? 0) % 256));
    asserts.assertEquals(b.serverId, a.serverId);
    // startup time seconds close to now
    const nowSecs = Math.floor(Date.now() / 1000);
    asserts.assert(Math.abs(Number(a.startupTime) - nowSecs) < 5);
    asserts.assertEquals(b.startupTime, a.startupTime); // constant per generator
    // counter increments by 1
    asserts.assertEquals(b.counter - a.counter, 1n);
  });

  it('counter does not overflow across the documented safe range', () => {
    // The 24-bit counter (max 16,777,215) should never spill into the
    // startup-time bits within its safe range. Probe at the boundary
    // values to lock in the layout.
    const gen = sequenceID();
    const first = gen();
    const startupTime0 = (first >> 24n) & 0xFFFFFFFFn;

    // Advance the counter to within 1 of the 24-bit limit and confirm
    // the upper bits remain unchanged.
    const nearMax = gen(0xFFFFFE); // 2^24 - 2
    const startupTimeNear = (nearMax >> 24n) & 0xFFFFFFFFn;
    asserts.assertEquals(startupTimeNear, startupTime0);
    asserts.assertEquals(nearMax & 0xFFFFFFn, 0xFFFFFEn);

    const atMax = gen();
    asserts.assertEquals((atMax >> 24n) & 0xFFFFFFFFn, startupTime0);
    asserts.assertEquals(atMax & 0xFFFFFFn, 0xFFFFFFn);

    // Past the limit the counter spills into the startup-time bits —
    // documented as outside the safe range. This assertion documents
    // that behaviour so future refactors don't silently regress.
    const overflow = gen();
    asserts.assertEquals((overflow >> 24n) & 0xFFFFFFFFn, startupTime0 + 1n);
    asserts.assertEquals(overflow & 0xFFFFFFn, 0n);
  });

  it('override counter semantics', () => {
    const gen = sequenceID();
    const first = gen();
    const overridden = gen(200);
    const after = gen();
    const extractCounter = (v: bigint) => v & 0xFFFFFFn; // 24-bit counter
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

  it('multiple overrides progression', () => {
    const gen = sequenceID();
    gen(); // burn one
    const a = gen(10);
    const b = gen();
    const c = gen(5);
    const d = gen();
    const counter = (v: bigint) => v & 0xFFFFFFn; // 24-bit counter
    asserts.assertEquals(counter(a), 10n);
    asserts.assertEquals(counter(b), 11n);
    asserts.assertEquals(counter(c), 5n);
    asserts.assertEquals(counter(d), 6n);
  });
});
