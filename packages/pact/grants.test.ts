/**
 * @fileoverview Tests for the serialized-grants codec.
 * @module
 */
import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { deserializeGrants, serializeGrants } from './grants.ts';
import { PactError } from './errors/mod.ts';

describe('grants codec', () => {
  it('should round-trip per-module masks through the storage form', () => {
    const grants = deserializeGrants(
      serializeGrants({ Post: 5n, Billing: 0n }),
    );
    asserts.assertStrictEquals(grants.Post, 5n);
    asserts.assertStrictEquals(grants.Billing, 0n);
  });

  it('should reject a negative or non-bigint mask on serialize', () => {
    asserts.assertThrows(
      () => serializeGrants({ Post: -1n }),
      PactError,
      'non-negative',
    );
    asserts.assertThrows(
      // deno-lint-ignore no-explicit-any
      () => serializeGrants({ Post: 5 as any }),
      PactError,
    );
  });

  it('should drop prototype-chain keys from poisoned stored records', () => {
    const hostile = deserializeGrants(
      '{"__proto__":"1","constructor":"2","prototype":"3","Post":"2"}',
    );
    asserts.assertStrictEquals(hostile.Post, 2n);
    asserts.assertEquals(Object.keys(hostile), ['Post']);
  });

  it('should throw INVALID_GRANTS for malformed input', () => {
    for (
      const bad of [
        'not json',
        '[1]',
        'null',
        '{"Post": 2}', // number, not a decimal string
        '{"Post": "-2"}', // negative
        `{"Post": "${'9'.repeat(101)}"}`, // over the 100-digit parse cap
      ]
    ) {
      const error = asserts.assertThrows(
        () => deserializeGrants(bad),
        PactError,
      );
      asserts.assertStrictEquals(error.code, 'INVALID_GRANTS');
    }
  });

  it('should accept a mask at the 100-digit cap', () => {
    const big = '9'.repeat(100);
    asserts.assertStrictEquals(
      deserializeGrants(`{"Post":"${big}"}`).Post,
      BigInt(big),
    );
  });
});
