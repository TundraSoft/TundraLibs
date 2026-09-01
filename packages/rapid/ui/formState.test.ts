/**
 * @fileoverview formState — the validated-form round-trip: typed data on
 * success, the render-ready error arm (fields + kept values) on failure.
 * @module
 */
import { describe, it } from '@tundralibs/compat/test';
import * as asserts from '@std/asserts';
import { RapidError } from '../errors/mod.ts';
import type { RapidFormResult } from '../types/mod.ts';
import { formState } from './formState.ts';

/** A guardian-shaped failure: `leafErrors()` is what the recognizer reads. */
const guardianReject = () => {
  const err = new Error('validation failed') as Error & {
    leafErrors: () => unknown[];
  };
  err.leafErrors = () => [
    { path: ['title'], error: { message: 'must not be empty' } },
    { path: ['meta', 'tag'], error: { message: 'unknown tag' } },
  ];
  throw err;
};

describe('rapid.ui.formState', () => {
  it('a passing parse returns ok with the schema value', () => {
    const result = formState(
      { parse: (v: unknown) => ({ title: (v as { title: string }).title }) },
      { title: 'hi' },
    ) as RapidFormResult<{ title: string }>;
    asserts.assert(result.ok);
    asserts.assertEquals(result.data, { title: 'hi' });
  });

  it('a guardian-shaped failure yields per-field messages and keeps the submitted primitives', () => {
    const result = formState({ parse: guardianReject }, {
      title: '',
      qty: 3,
      draft: false,
      attachment: { path: '/tmp/x' }, // non-primitive — never echoed
      tags: ['a'],
    }) as RapidFormResult<never>;
    asserts.assertFalse(result.ok);
    asserts.assertEquals(result.error.state, 'error');
    asserts.assertEquals(result.error.message, 'must not be empty');
    asserts.assertEquals(result.error.fields, {
      'title': 'must not be empty',
      'meta.tag': 'unknown tag',
    });
    asserts.assertEquals(result.error.values, {
      title: '',
      qty: '3',
      draft: 'false',
    });
  });

  it('an UNRECOGNIZED throw rethrows — a validator bug is a 500, never a 200 form error', () => {
    // The old behavior rendered `cause.message` ("Cannot read properties
    // of undefined…") into production HTML as a user-facing form error.
    asserts.assertThrows(
      () =>
        formState({
          parse: () => {
            throw new Error('zod says no');
          },
        }, { a: 'b' }),
      Error,
      'zod says no',
    );
  });

  it("a validated()-wrapped foreign validator's throw still lands under (root)", () => {
    const result = formState({
      parse: () => {
        throw new RapidError('RAPID_VALIDATION_FAILED', {
          details: { message: 'zod says no' },
        });
      },
    }, { a: 'b' }) as RapidFormResult<never>;
    asserts.assertFalse(result.ok);
    asserts.assertEquals(result.error.fields, { '(root)': 'zod says no' });
    asserts.assertEquals(result.error.message, 'zod says no');
  });

  it('a validated()-style RapidError keeps its own field detail', () => {
    const result = formState({
      parse: () => {
        throw new RapidError('RAPID_VALIDATION_FAILED', {
          details: { fields: { email: 'not an email' } },
        });
      },
    }, { email: 'x' }) as RapidFormResult<never>;
    asserts.assertFalse(result.ok);
    asserts.assertEquals(result.error.fields, { email: 'not an email' });
  });

  it('a non-object submission keeps no values', () => {
    const result = formState(
      { parse: guardianReject },
      'raw text body',
    ) as RapidFormResult<never>;
    asserts.assertFalse(result.ok);
    asserts.assertEquals(result.error.values, {});
  });

  it('an async parse resolves ok and rejects into the same error arm', async () => {
    const ok = await formState(
      { parse: (v: unknown) => Promise.resolve(v as { n: number }) },
      { n: 1 },
    );
    asserts.assert(ok.ok);
    asserts.assertEquals(ok.data, { n: 1 });

    const bad = await formState({
      parse: () =>
        Promise.reject(
          new RapidError('RAPID_VALIDATION_FAILED', {
            details: { message: 'late no' },
          }),
        ),
    }, { n: 'x' });
    asserts.assertFalse(bad.ok);
    asserts.assertEquals(bad.error.fields, { '(root)': 'late no' });
    asserts.assertEquals(bad.error.values, { n: 'x' });

    // An async UNRECOGNIZED throw propagates as a rejection, same policy
    // as the sync path.
    await asserts.assertRejects(
      async () => {
        await formState({
          parse: () => Promise.reject(new Error('late bug')),
        }, { n: 'x' });
      },
      Error,
      'late bug',
    );
  });
});
