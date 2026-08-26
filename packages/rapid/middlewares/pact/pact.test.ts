/**
 * @fileoverview Tests for `pact(options)` — the one-time init.
 * @module
 */
import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { Doctor, inject } from '@tundralibs/doctor';
import { Pact } from '@tundralibs/pact';
import { PACT, pact } from './pact.ts';

describe('rapid.middlewares.pact.pact', () => {
  it('creates the Pact instance and returns it', () => {
    Doctor.revoke(PACT);
    const instance = pact({ bits: { READ: 1n }, bearer: {} });
    asserts.assert(instance instanceof Pact);
  });

  it('stocks the instance + resolved schemes under PACT for inject()', () => {
    Doctor.revoke(PACT);
    const instance = pact({
      bits: { READ: 1n },
      bearer: {},
      apiKey: { header: 'x-key' },
    });
    const bundle = inject(PACT);
    asserts.assertStrictEquals(bundle.pact, instance);
    asserts.assertExists(bundle.schemes.BEARER);
    asserts.assertExists(bundle.schemes.APIKEY);
    asserts.assertEquals(bundle.schemes.BASIC, undefined);
    asserts.assertEquals(bundle.schemes.HMAC, undefined);
    asserts.assertEquals(bundle.schemes.TOKEN, undefined);
  });

  it('throws RAPID_CONFIG when no scheme is configured', () => {
    Doctor.revoke(PACT);
    const err = asserts.assertThrows(() => pact({ bits: { READ: 1n } }));
    asserts.assertEquals((err as { code?: string }).code, 'RAPID_CONFIG');
  });

  it('refuses a second call — Doctor.stock does not allow re-registration', () => {
    Doctor.revoke(PACT);
    pact({ bits: { READ: 1n }, bearer: {} });
    asserts.assertThrows(() => pact({ bits: { READ: 1n }, bearer: {} }));
  });
});
