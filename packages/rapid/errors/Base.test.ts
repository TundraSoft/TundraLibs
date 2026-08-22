/**
 * @fileoverview Tests for errors/Base.ts — RapidError (registry defaults,
 * status mapping, DEVELOPMENT/PRODUCTION payload disclosure, `from`
 * normalization) and the structural guardian recognizer `asValidationError`.
 * @module
 */
import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { asValidationError, RapidError, type RapidErrorCode } from './mod.ts';

/** An Error shaped like `@tundralibs/guardian`'s GuardianError — the only
 * thing rapid recognizes is a `leafErrors()` method (NO guardian import). */
class FakeGuardianError extends Error {
  constructor(
    message: string,
    private readonly leaves: Array<{ path?: unknown[]; message?: string }>,
  ) {
    super(message);
    this.name = 'GuardianError';
  }
  leafErrors(): Iterable<{ path?: unknown[]; error?: { message?: string } }> {
    return this.leaves.map((l) => ({
      path: l.path,
      error: l.message === undefined ? undefined : { message: l.message },
    }));
  }
}

/** A guardian-shaped Error whose `leafErrors()` itself throws. */
class ThrowingGuardianError extends Error {
  leafErrors(): Iterable<unknown> {
    throw new Error('leafErrors blew up');
  }
}

/** An Error carrying a `context.code` but NOT `instanceof RapidError` —
 * models a RapidError that crossed a realm/re-import boundary. */
class ForeignRapidLike extends Error {
  constructor(
    message: string,
    public readonly context: {
      code: string;
      details?: Record<string, unknown>;
      debug?: Record<string, unknown>;
    },
  ) {
    super(message);
  }
}

describe('rapid.errors.RapidError', () => {
  it('defaults the message from the registry and maps each code → its status', () => {
    const cases: Array<[RapidErrorCode, number, string]> = [
      ['RAPID_NOT_FOUND', 404, 'Not found'],
      ['RAPID_ACCESS_DENIED', 403, 'Access denied'],
      ['RAPID_VALIDATION_FAILED', 400, 'Request validation failed'],
      ['RAPID_TIMEOUT', 504, 'Request timed out'],
    ];
    for (const [code, status, message] of cases) {
      const err = new RapidError(code);
      asserts.assertEquals(err.code, code);
      asserts.assertEquals(err.status, status);
      asserts.assertEquals(err.message, message);
    }
  });

  it('carries an explicit message, details, debug, and cause override', () => {
    const cause = new Error('upstream');
    const err = new RapidError('RAPID_CONFIG', {
      message: 'bad knob',
      details: { field: 'port' },
      debug: { raw: -1 },
      cause,
    });
    asserts.assertEquals(err.message, 'bad knob');
    asserts.assertEquals(err.context.details, { field: 'port' });
    asserts.assertEquals(err.context.debug, { raw: -1 });
    asserts.assertStrictEquals(err.cause, cause);
  });

  it('DEVELOPMENT payload renders code, true message, details, and debug', () => {
    const err = new RapidError('RAPID_ACCESS_DENIED', {
      message: 'no entry',
      details: { field: 'role' },
      debug: { principal: 'anon' },
    });
    asserts.assertEquals(err.payload('DEVELOPMENT'), {
      code: 'RAPID_ACCESS_DENIED',
      message: 'no entry',
      details: { field: 'role' },
      debug: { principal: 'anon' },
    });
  });

  it('DEVELOPMENT payload omits details/debug when they are absent', () => {
    const err = new RapidError('RAPID_NOT_FOUND');
    asserts.assertEquals(err.payload('DEVELOPMENT'), {
      code: 'RAPID_NOT_FOUND',
      message: 'Not found',
    });
  });

  it('PRODUCTION collapses a 5xx to the opaque default and drops message/details/debug', () => {
    const err = new RapidError('RAPID_TIMEOUT', {
      message: 'took 31s on /report',
      details: { deadlineMs: 30000 },
      debug: { handler: 'report' },
    });
    // Overridden message, details, and debug all vanish; only the registry
    // default message survives.
    asserts.assertEquals(err.payload('PRODUCTION'), {
      code: 'RAPID_TIMEOUT',
      message: 'Request timed out',
    });
  });

  it('PRODUCTION keeps a 4xx message + details but never debug', () => {
    const err = new RapidError('RAPID_ACCESS_DENIED', {
      message: 'you cannot see this',
      details: { field: 'role' },
      debug: { secret: 'leak' },
    });
    asserts.assertEquals(err.payload('PRODUCTION'), {
      code: 'RAPID_ACCESS_DENIED',
      message: 'you cannot see this',
      details: { field: 'role' },
    });
  });

  it('from() returns the same instance for a RapidError', () => {
    const original = new RapidError('RAPID_RATE_LIMITED');
    asserts.assertStrictEquals(RapidError.from(original), original);
  });

  it('from() duck-types a non-instanceof error whose context.code is registered', () => {
    const foreign = new ForeignRapidLike('cross-realm denied', {
      code: 'RAPID_ACCESS_DENIED',
      details: { field: 'scope' },
      debug: { note: 'other realm' },
    });
    const err = RapidError.from(foreign);
    asserts.assertInstanceOf(err, RapidError);
    asserts.assertNotStrictEquals(err, foreign as unknown as RapidError);
    asserts.assertEquals(err.code, 'RAPID_ACCESS_DENIED');
    asserts.assertEquals(err.status, 403);
    asserts.assertEquals(err.message, 'cross-realm denied');
    asserts.assertEquals(err.context.details, { field: 'scope' });
    asserts.assertEquals(err.context.debug, { note: 'other realm' });
    asserts.assertStrictEquals(err.cause, foreign);
  });

  it('from() maps a guardian-shaped error to RAPID_VALIDATION_FAILED (400) with per-field detail', () => {
    const err = RapidError.from(
      new FakeGuardianError('invalid', [
        { path: ['user', 'email'], message: 'expected string' },
      ]),
    );
    asserts.assertEquals(err.code, 'RAPID_VALIDATION_FAILED');
    asserts.assertEquals(err.status, 400);
    asserts.assertEquals(err.context.details, {
      fields: { 'user.email': 'expected string' },
    });
  });

  it('from() wraps a plain Error as RAPID_UNHANDLED with the original in debug and cause', () => {
    const boom = new Error('kaboom');
    const err = RapidError.from(boom);
    asserts.assertEquals(err.code, 'RAPID_UNHANDLED');
    asserts.assertEquals(err.status, 500);
    asserts.assertEquals(
      (err.context.debug as { message: string }).message,
      'kaboom',
    );
    asserts.assertStrictEquals(err.cause, boom);
  });

  it('from() wraps a non-Error throw as RAPID_UNHANDLED with String(value) in debug and no cause', () => {
    const err = RapidError.from('just a string');
    asserts.assertEquals(err.code, 'RAPID_UNHANDLED');
    asserts.assertEquals(
      (err.context.debug as { message: string; stack?: string }).message,
      'just a string',
    );
    asserts.assertEquals(
      (err.context.debug as { stack?: string }).stack,
      undefined,
    );
    asserts.assertStrictEquals(err.cause, undefined);
  });
});

describe('rapid.errors.asValidationError', () => {
  it('returns undefined for a non-guardian value (plain Error or non-Error)', () => {
    asserts.assertEquals(asValidationError(new Error('nope')), undefined);
    asserts.assertEquals(asValidationError('a string'), undefined);
    asserts.assertEquals(asValidationError(undefined), undefined);
  });

  it('keys each leaf by path.join(".") and falls back to (root) for an empty/absent path', () => {
    const err = asValidationError(
      new FakeGuardianError('bad', [
        { path: ['address', 'zip'], message: 'expected number' },
        { path: [], message: 'root problem' },
        { path: undefined, message: 'no path either' },
      ]),
    );
    asserts.assertInstanceOf(err, RapidError);
    asserts.assertEquals(err.code, 'RAPID_VALIDATION_FAILED');
    // The empty-path and absent-path leaves both key to (root); the later
    // one wins the collision.
    asserts.assertEquals(err.context.details, {
      fields: {
        'address.zip': 'expected number',
        '(root)': 'no path either',
      },
    });
  });

  it('defaults a leaf with no message to "Invalid value"', () => {
    const err = asValidationError(
      new FakeGuardianError('bad', [{ path: ['name'] }]),
    );
    asserts.assertEquals(err!.context.details, {
      fields: { name: 'Invalid value' },
    });
  });

  it('falls back to a single (root) = error.message when leafErrors() throws', () => {
    const err = asValidationError(new ThrowingGuardianError('outer message'));
    asserts.assertInstanceOf(err, RapidError);
    asserts.assertEquals(err.context.details, {
      fields: { '(root)': 'outer message' },
    });
  });
});
