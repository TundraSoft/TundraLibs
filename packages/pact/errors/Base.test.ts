/**
 * @fileoverview Tests for PactError and the auth-failure code set.
 * @module
 */
import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { PACT_AUTH_FAILURE_CODES, PactError } from './mod.ts';

describe('PactError', () => {
  it('should render bigint template variables and keep raw context', () => {
    const error = new PactError('DUPLICATE_BIT', {
      existing: 'READ',
      permission: 'VIEW',
      bit: 2n,
    });
    asserts.assertStrictEquals(
      error.message,
      "Permissions 'READ' and 'VIEW' share bit 2",
    );
    asserts.assertStrictEquals(typeof error.context.bit, 'bigint');
  });

  it('should serialize to JSON with the code and stringified bigints', () => {
    const error = new PactError('DUPLICATE_BIT', {
      existing: 'READ',
      permission: 'VIEW',
      bit: 2n,
    });
    const json = JSON.stringify(error.toJSON());
    asserts.assertStringIncludes(json, '"bit":"2"');
    asserts.assertStringIncludes(json, '"code":"DUPLICATE_BIT"');
  });

  it('should carry a cause through', () => {
    const cause = new Error('backend down');
    const error = new PactError('CACHE_INIT_FAILED', { engine: 'X' }, cause);
    asserts.assertStrictEquals(error.cause, cause);
  });
});

describe('PACT_AUTH_FAILURE_CODES', () => {
  it('should contain exactly the codes an adapter maps to 401', () => {
    for (
      const code of [
        'INVALID_CREDENTIALS',
        'NOT_ACTIVE',
        'SESSION_EXPIRED',
        'REFRESH_REUSED',
      ] as const
    ) {
      asserts.assert(
        PACT_AUTH_FAILURE_CODES.has(code),
        `${code} missing from the 401 set`,
      );
    }
  });

  it('should exclude config/storage failures from the 401 set', () => {
    asserts.assertFalse(PACT_AUTH_FAILURE_CODES.has('MISSING_HOOK' as never));
    asserts.assertFalse(
      PACT_AUTH_FAILURE_CODES.has('PERMISSION_DENIED' as never),
    );
  });
});
