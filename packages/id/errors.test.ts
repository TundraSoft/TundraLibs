import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import {
  cuid2,
  getTimestamp,
  IDError,
  InvalidOptionError,
  InvalidULIDError,
  monotonicFactory,
  MonotonicOverflowError,
  nanoID,
  ObjectID,
  sequenceID,
  simpleID,
  ulid,
} from './mod.ts';

describe('id.errors', () => {
  it('argument validation throws InvalidOptionError with typed context', () => {
    // One representative throw per generator; all share the class and carry
    // a `generator`/`option` discriminator on `error.context`.
    const cases: Array<[() => unknown, string, string]> = [
      [() => ObjectID(-1), 'ObjectID', 'counter'],
      [() => ObjectID(0, undefined, 0), 'ObjectID', 'machineIdLength'],
      [() => nanoID(0), 'nanoID', 'size'],
      [() => nanoID(10, ''), 'nanoID', 'base'],
      [() => cuid2(23), 'cuid2', 'length'],
      [() => simpleID(0, 0), 'simpleID', 'minLen'],
      [() => sequenceID(-1), 'sequenceID', 'counter'],
      [() => ulid(-1), 'ulid', 'timestamp'],
    ];
    for (const [fn, generator, option] of cases) {
      const err = asserts.assertThrows(fn, InvalidOptionError);
      asserts.assert(err instanceof IDError);
      asserts.assertEquals(err.context.generator, generator);
      asserts.assertEquals(err.context.option, option);
    }
  });

  it('sequenceID counter override throws InvalidOptionError', () => {
    const seq = sequenceID();
    const err = asserts.assertThrows(() => seq(-1), InvalidOptionError);
    asserts.assertEquals(err.context.generator, 'sequenceID');
  });

  it('getTimestamp throws InvalidULIDError on a malformed ULID', () => {
    const lenErr = asserts.assertThrows(
      () => getTimestamp('TOOSHORT'),
      InvalidULIDError,
    );
    asserts.assert(lenErr instanceof IDError);
    asserts.assertEquals(lenErr.context.reason, 'length');
    asserts.assertEquals(lenErr.context.expected, 26);

    const charErr = asserts.assertThrows(
      () => getTimestamp('U0000000000000000000000000'), // U excluded from Base32
      InvalidULIDError,
    );
    asserts.assertEquals(charErr.context.reason, 'character');
    asserts.assertEquals(charErr.context.character, 'U');
  });

  it('monotonic overflow throws MonotonicOverflowError', () => {
    const originalGetRandomValues = crypto.getRandomValues;
    try {
      // deno-lint-ignore no-explicit-any
      (crypto as any).getRandomValues = (arr: Uint8Array) => {
        arr.fill(0xFF);
        return arr;
      };
      const gen = monotonicFactory();
      const time = 4242;
      gen(time); // seeds lastRandom = FF..FF
      const err = asserts.assertThrows(
        () => gen(time), // increment FF..FF -> carry-out overflow
        MonotonicOverflowError,
      );
      asserts.assert(err instanceof IDError);
      asserts.assertEquals(err.context.timestamp, time);
    } finally {
      crypto.getRandomValues = originalGetRandomValues;
    }
  });
});
