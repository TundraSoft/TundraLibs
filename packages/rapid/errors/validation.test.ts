/**
 * @fileoverview validation → 400 wiring: `asValidationError` /
 * `RapidError.from` recognizing a guardian-shaped throw structurally (NO
 * guardian import — a fake with `leafErrors()` proves the duck-typing), and
 * the generic `validated()` wrapper for any other validator.
 * @module
 */
import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { asValidationError, RapidError } from './mod.ts';
import { validated } from '../utils/validated.ts';
import { Application } from '../Application.ts';

/** An Error shaped like a `@tundralibs/guardian` GuardianError — the only
 * thing rapid recognizes structurally is the `leafErrors()` method. */
class FakeGuardianError extends Error {
  constructor(
    private readonly leaves: { path: unknown[]; message: string }[],
  ) {
    super('validation failed');
    this.name = 'GuardianError';
  }
  *leafErrors(): Iterable<{ path: unknown[]; error: { message: string } }> {
    for (const l of this.leaves) {
      yield { path: l.path, error: { message: l.message } };
    }
  }
}

describe('rapid.errors validation → 400', () => {
  it('asValidationError: guardian-shaped → 400 with per-field detail; else undefined', () => {
    const err = asValidationError(
      new FakeGuardianError([
        { path: ['email'], message: 'expected string' },
        { path: [], message: 'root problem' },
      ]),
    );
    asserts.assert(err instanceof RapidError);
    asserts.assertEquals(err!.code, 'RAPID_VALIDATION_FAILED');
    asserts.assertEquals(err!.status, 400);
    asserts.assertEquals(err!.context.details, {
      fields: { email: 'expected string', '(root)': 'root problem' },
    });
    // A plain error is NOT guardian-shaped:
    asserts.assertEquals(asValidationError(new Error('nope')), undefined);
    asserts.assertEquals(asValidationError('a string'), undefined);
  });

  it('RapidError.from: guardian → 400, plain → 500, RapidError → passthrough', () => {
    asserts.assertEquals(
      RapidError.from(new FakeGuardianError([{ path: ['x'], message: 'bad' }]))
        .code,
      'RAPID_VALIDATION_FAILED',
    );
    asserts.assertEquals(
      RapidError.from(new Error('boom')).code,
      'RAPID_UNHANDLED',
    );
    const original = new RapidError('RAPID_ACCESS_DENIED');
    asserts.assertStrictEquals(RapidError.from(original), original);
  });

  it('validated(): any validator throw → 400; guardian keeps fields; RapidError passes through', () => {
    // guardian-shaped throw → fields preserved
    const guard = validated({
      parse: () => {
        throw new FakeGuardianError([{ path: ['name'], message: 'required' }]);
      },
    });
    const g = asserts.assertThrows(() => guard('x'), RapidError) as RapidError;
    asserts.assertEquals(g.code, 'RAPID_VALIDATION_FAILED');
    asserts.assertEquals(g.context.details, { fields: { name: 'required' } });

    // a NON-guardian validator (zod/custom) → 400 with the message
    const other = validated({
      parse: () => {
        throw new Error('zod says no');
      },
    });
    const o = asserts.assertThrows(() => other('x'), RapidError) as RapidError;
    asserts.assertEquals(o.code, 'RAPID_VALIDATION_FAILED');
    asserts.assertEquals(o.context.details, { message: 'zod says no' });

    // an explicit RapidError is respected (not reclassified to 400)
    const custom = validated({
      parse: () => {
        throw new RapidError('RAPID_ACCESS_DENIED');
      },
    });
    asserts.assertEquals(
      (asserts.assertThrows(() => custom('x'), RapidError) as RapidError).code,
      'RAPID_ACCESS_DENIED',
    );

    // success passes the value through untouched
    asserts.assertEquals(validated({ parse: (v) => v })('ok'), 'ok');
  });

  it('end-to-end: a handler throwing a guardian-shaped error 400s (not 500s)', async () => {
    const app = await Application.initialize({
      name: 'g1',
      server: { port: 0, hostname: '127.0.0.1' },
    });
    app.get('/x', () => {
      throw new FakeGuardianError([{
        path: ['id'],
        message: 'must be a uuid',
      }]);
    });
    const res = await app.fetch(new Request('http://app/x'));
    asserts.assertEquals(res.status, 400);
    const body = await res.json();
    asserts.assertEquals(body.code, 'RAPID_VALIDATION_FAILED');
    asserts.assertEquals(body.details.fields.id, 'must be a uuid');
  });
});
