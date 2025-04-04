import * as asserts from '$asserts';
import { ObjectID } from './mod.ts';

Deno.test('id.objectId', async (t) => {
  await t.step('Must generate unique ids', () => {
    const id = ObjectID(),
      iterations = 100000, // The number of parallel executions to simulate
      generatedIds = new Set<string>(); // Set to store the generated IDs
    for (let i = 0; i < iterations; i++) {
      generatedIds.add(id()); // Add the ID to the set
    }
    asserts.assertEquals(generatedIds.size, iterations); // Ensure the ID is unique
  });

  await t.step('Ensure the ID is in sequence', () => {
    const id = ObjectID(),
      res1 = id(),
      res2 = id();
    asserts.assertEquals(
      parseInt(res2.substring(res2.length - 1)) -
        parseInt(res1.substring(res1.length - 1)),
      1,
    ); // Ensure the ID is in sequence
  });

  await t.step('Change seed and length', () => {
    const id = ObjectID(3251),
      res1 = id();
    asserts.assertEquals(res1.endsWith('3252'), true);
  });

  await t.step('Custom machine ID', () => {
    const id = ObjectID(0, 'aaa'),
      res1 = id();
    asserts.assertEquals(res1.substring(11, 14), 'aaa');
  });

  // Additional test cases
  await t.step('Timestamp portion should reflect current time', () => {
    const id = ObjectID();
    const result = id();
    const timestampHex = result.substring(0, 8);
    const timestamp = parseInt(timestampHex, 16);

    // The timestamp should be close to the current time
    const currentTime = Math.floor(Date.now() / 1000);
    asserts.assert(Math.abs(timestamp - currentTime) < 5); // Within 5 seconds
  });

  await t.step('Process ID portion should be consistent', () => {
    const id = ObjectID(0, 'xyz');
    const result1 = id();
    const result2 = id();

    // Extract the process ID portion (after machine ID)
    const processId1 = result1.substring(11, result1.length - 1);
    const processId2 = result2.substring(11, result2.length - 1);

    asserts.assertEquals(processId1, processId2);

    // Process ID should be related to Deno.pid
    const expectedProcessId = (Deno.pid % 65535).toString(16);
    asserts.assertEquals(processId1.includes(expectedProcessId), true);
  });

  await t.step('Multiple instances should have different machine IDs', () => {
    // Create two ObjectID generators without specifying machine ID
    const id1 = ObjectID();
    const id2 = ObjectID();

    const result1 = id1();
    const result2 = id2();

    // Machine IDs should be different when not explicitly set
    const machineId1 = result1.substring(11, 14);
    const machineId2 = result2.substring(11, 14);

    // This test could occasionally fail if random machine IDs happen to be the same
    // But it's very unlikely with a 3-character alphanumeric ID
    asserts.assertNotEquals(machineId1, machineId2);
  });

  await t.step('Counter should wrap correctly for consecutive calls', () => {
    const id = ObjectID(999);
    const results = [];

    // Generate several IDs and extract the counter portion
    for (let i = 0; i < 5; i++) {
      results.push(id());
    }

    // Test the sequence increments correctly starting from 999
    for (let i = 0; i < results.length - 1; i++) {
      const counter1 = parseInt(results[i]!.substring(results[i]!.length - 4));
      const counter2 = parseInt(
        results[i + 1]!.substring(results[i + 1]!.length - 4),
      );
      asserts.assertEquals(counter2 - counter1, 1);
    }
  });

  await t.step(
    'must throw if machineIdLength is less than 1 characters',
    () => {
      asserts.assertThrows(
        () => {
          ObjectID(0, 'a', 0);
        },
        Error,
        'Machine ID length must be at least 1',
      );
    },
  );
});
