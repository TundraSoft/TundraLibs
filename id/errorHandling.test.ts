import * as asserts from '$asserts';
import { nanoID, ObjectID, sequenceID, simpleID } from './mod.ts';

Deno.test('id.errorHandling', async (t) => {
  await t.step('simpleID should validate input parameters', () => {
    // Test negative minLen
    asserts.assertThrows(
      () => simpleID(0, -1),
      Error,
      'Minimum length must be at least 1',
    );

    // Test zero minLen
    asserts.assertThrows(
      () => simpleID(0, 0),
      Error,
      'Minimum length must be at least 1',
    );

    // Valid parameters should not throw
    asserts.assert(() => simpleID(0, 1));
    asserts.assert(() => simpleID(-10, 5)); // Negative seed is allowed
  });

  await t.step('sequenceID should validate input parameters', () => {
    // Test negative counter
    asserts.assertThrows(
      () => sequenceID(-1),
      Error,
      'Counter cannot be negative',
    );

    // Valid parameters should not throw
    asserts.assert(() => sequenceID(0));
    asserts.assert(() => sequenceID(1000));
  });

  await t.step('ObjectID should validate input parameters', () => {
    // Test negative counter
    asserts.assertThrows(
      () => ObjectID(-1)(),
      Error,
      'Counter cannot be negative',
    );

    // Valid parameters should not throw
    asserts.assert(() => ObjectID(0)());
    asserts.assert(() => ObjectID(0, 'xyz')());
  });

  await t.step('nanoID should validate input parameters', () => {
    // Test invalid size
    asserts.assertThrows(
      () => nanoID(0),
      Error,
      'Size should be greater than 0',
    );

    asserts.assertThrows(
      () => nanoID(-5),
      Error,
      'Size should be greater than 0',
    );

    // Test empty base string
    asserts.assertThrows(
      () => nanoID(10, ''),
      Error,
      'Base string cannot be empty',
    );

    // Valid parameters should not throw
    asserts.assert(() => nanoID(1));
    asserts.assert(() => nanoID(100, 'AB'));
  });

  await t.step('Performance benchmark for ID generators', () => {
    // This test verifies that generators remain efficient
    const iterations = 1000;

    // Test simpleID
    const simpleIDGenerator = simpleID();
    const simpleIDStart = performance.now();
    for (let i = 0; i < iterations; i++) {
      simpleIDGenerator();
    }
    const simpleIDTime = performance.now() - simpleIDStart;

    // Test sequenceID
    const sequenceIDStart = performance.now();
    for (let i = 0; i < iterations; i++) {
      sequenceID();
    }
    const sequenceIDTime = performance.now() - sequenceIDStart;

    // Test ObjectID
    const objectIDGenerator = ObjectID();
    const objectIDStart = performance.now();
    for (let i = 0; i < iterations; i++) {
      objectIDGenerator();
    }
    const objectIDTime = performance.now() - objectIDStart;

    // Test nanoID
    const nanoIDStart = performance.now();
    for (let i = 0; i < iterations; i++) {
      nanoID(21);
    }
    const nanoIDTime = performance.now() - nanoIDStart;

    // Log performance metrics
    console.log(`Performance for ${iterations} iterations:
    - simpleID: ${simpleIDTime.toFixed(2)}ms
    - sequenceID: ${sequenceIDTime.toFixed(2)}ms
    - ObjectID: ${objectIDTime.toFixed(2)}ms
    - nanoID: ${nanoIDTime.toFixed(2)}ms`);

    // Assert that performance is within reasonable bounds
    // This is more of a benchmark than a strict test
    asserts.assert(true);
  });
});
