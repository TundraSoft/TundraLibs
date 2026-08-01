import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { nanoID, ObjectID, sequenceID, simpleID } from './mod.ts';
import { InvalidOptionError } from './errors/mod.ts';

describe('id.errorHandling', () => {
  it('simpleID should validate input parameters', () => {
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

    // NaN / non-integer minLen must be a typed error, not silent wrong output
    // (NaN -> 1-digit counter) nor a raw RangeError deferred to generation.
    for (const bad of [NaN, 3.5, Infinity]) {
      asserts.assertThrows(
        () => simpleID(0, bad),
        InvalidOptionError,
        'Minimum length must be an integer',
      );
    }

    // Valid parameters construct + generate without throwing.
    asserts.assertEquals(typeof simpleID(0, 1)(), 'bigint');
    asserts.assertEquals(typeof simpleID(-10, 5)(), 'bigint'); // seed clamped to 0
  });

  it('sequenceID should validate input parameters', () => {
    // Test negative counter
    asserts.assertThrows(
      () => sequenceID(-1),
      Error,
      'Counter cannot be negative',
    );

    // Valid parameters construct + generate without throwing.
    asserts.assertEquals(typeof sequenceID(0)(), 'bigint');
    asserts.assertEquals(typeof sequenceID(1000)(), 'bigint');
  });

  it('ObjectID should validate input parameters', () => {
    // Test negative counter
    asserts.assertThrows(
      () => ObjectID(-1)(),
      Error,
      'Counter cannot be negative',
    );

    // NaN / non-integer counter must be a typed error, not a silent "...000NaN"
    // (or "...0004.7") counter segment.
    for (const bad of [NaN, 3.5, Infinity]) {
      asserts.assertThrows(
        () => ObjectID(bad),
        InvalidOptionError,
        'Counter must be an integer',
      );
    }

    // NaN / non-integer machineIdLength must be a typed error, not a silently
    // shortened/empty machine segment.
    for (const bad of [NaN, 3.5, Infinity]) {
      asserts.assertThrows(
        () => ObjectID(0, undefined, bad),
        InvalidOptionError,
        'Machine ID length must be an integer',
      );
    }

    // Valid parameters construct + generate without throwing.
    asserts.assertEquals(typeof ObjectID(0)(), 'string');
    asserts.assertEquals(typeof ObjectID(0, 'xyz')(), 'string');
  });

  it('nanoID should validate input parameters', () => {
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

    // NaN / non-integer size must be a typed error, not a silent empty ("") or
    // truncated ID.
    for (const bad of [NaN, 3.5, Infinity]) {
      asserts.assertThrows(
        () => nanoID(bad),
        InvalidOptionError,
        'Size must be an integer',
      );
    }

    // Test empty base string
    asserts.assertThrows(
      () => nanoID(10, ''),
      Error,
      'Base string cannot be empty',
    );

    // Valid parameters produce a string of the requested length.
    asserts.assertEquals(nanoID(1).length, 1);
    asserts.assertEquals(nanoID(100, 'AB').length, 100);
  });
});
