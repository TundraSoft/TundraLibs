/**
 * @fileoverview Tests for utils/validated.ts — wrapping a validator's
 * `.parse` so a rejection becomes a 400 (RAPID_VALIDATION_FAILED): success
 * passthrough, RapidError identity, guardian per-field detail, any-other
 * throw carrying its message, and `this` preservation.
 * @module
 */
import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { validated } from './validated.ts';
import { RapidError } from '../errors/mod.ts';

/** Guardian-shaped Error — recognized only by its `leafErrors()` method. */
class FakeGuardianError extends Error {
  constructor(
    private readonly leaves: Array<{ path: unknown[]; message: string }>,
  ) {
    super('validation failed');
    this.name = 'GuardianError';
  }
  leafErrors(): Iterable<{ path: unknown[]; error: { message: string } }> {
    return this.leaves.map((l) => ({
      path: l.path,
      error: { message: l.message },
    }));
  }
}

describe('rapid.utils.validated', () => {
  it('returns the parsed value on success', () => {
    const parsed = validated({ parse: (v) => `parsed:${v as string}` })('x');
    asserts.assertEquals(parsed, 'parsed:x');
  });

  it('rethrows a thrown RapidError unchanged (identity, not reclassified)', () => {
    const original = new RapidError('RAPID_ACCESS_DENIED');
    const guard = validated({
      parse: () => {
        throw original;
      },
    });
    const thrown = asserts.assertThrows(() => guard('x'), RapidError);
    asserts.assertStrictEquals(thrown, original);
    asserts.assertEquals(thrown.code, 'RAPID_ACCESS_DENIED');
  });

  it('turns a guardian-shaped throw into a 400 with per-field detail', () => {
    const guard = validated({
      parse: () => {
        throw new FakeGuardianError([{ path: ['name'], message: 'required' }]);
      },
    });
    const err = asserts.assertThrows(() => guard('x'), RapidError);
    asserts.assertEquals(err.code, 'RAPID_VALIDATION_FAILED');
    asserts.assertEquals(err.status, 400);
    asserts.assertEquals(err.context.details, { fields: { name: 'required' } });
  });

  it('turns a plain Error throw into a 400 carrying the message, with the error as cause', () => {
    const boom = new Error('zod says no');
    const guard = validated({
      parse: () => {
        throw boom;
      },
    });
    const err = asserts.assertThrows(() => guard('x'), RapidError);
    asserts.assertEquals(err.code, 'RAPID_VALIDATION_FAILED');
    asserts.assertEquals(err.status, 400);
    asserts.assertEquals(err.context.details, { message: 'zod says no' });
    asserts.assertStrictEquals(err.cause, boom);
  });

  it('turns a non-Error throw into a 400 with String(value) and no cause', () => {
    const guard = validated({
      parse: () => {
        throw 'raw rejection';
      },
    });
    const err = asserts.assertThrows(() => guard('x'), RapidError);
    asserts.assertEquals(err.code, 'RAPID_VALIDATION_FAILED');
    asserts.assertEquals(err.context.details, { message: 'raw rejection' });
    asserts.assertStrictEquals(err.cause, undefined);
  });

  it('preserves `this` — calls parse as a method so it can read sibling fields', () => {
    const schema = {
      prefix: 'BAR',
      parse(value: unknown): string {
        return `${this.prefix}:${value as string}`;
      },
    };
    asserts.assertEquals(validated(schema)('x'), 'BAR:x');
  });
});
