/**
 * @fileoverview Tests for _tls.ts TLS error detection helper.
 * @module
 */

import { describe, it } from '@tundralibs/compat/test';
import * as asserts from '@std/asserts';
import { looksLikeTlsRuntimeError } from './tls.ts';

// =============================================================================
// Test Suites
// =============================================================================

describe('drivers.tls', () => {
  describe('looksLikeTlsRuntimeError()', () => {
    it('should return false for non-Error values', () => {
      asserts.assertStrictEquals(looksLikeTlsRuntimeError(null), false);
      asserts.assertStrictEquals(looksLikeTlsRuntimeError(undefined), false);
      asserts.assertStrictEquals(looksLikeTlsRuntimeError('string'), false);
      asserts.assertStrictEquals(looksLikeTlsRuntimeError(42), false);
      asserts.assertStrictEquals(looksLikeTlsRuntimeError({}), false);
    });

    it('should return false for generic non-TLS errors', () => {
      asserts.assertStrictEquals(
        looksLikeTlsRuntimeError(new Error('connection refused')),
        false,
      );
      asserts.assertStrictEquals(
        looksLikeTlsRuntimeError(new Error('ECONNREFUSED')),
        false,
      );
      asserts.assertStrictEquals(
        looksLikeTlsRuntimeError(new Error('timeout')),
        false,
      );
    });

    it('should return true for errors with "certificate" in message', () => {
      asserts.assertStrictEquals(
        looksLikeTlsRuntimeError(new Error('invalid certificate')),
        true,
      );
      asserts.assertStrictEquals(
        looksLikeTlsRuntimeError(new Error('certificate expired')),
        true,
      );
      asserts.assertStrictEquals(
        looksLikeTlsRuntimeError(new Error('self signed Certificate')),
        true,
      );
    });

    it('should return true for errors with "TLS" in message', () => {
      asserts.assertStrictEquals(
        looksLikeTlsRuntimeError(new Error('TLS handshake failed')),
        true,
      );
      asserts.assertStrictEquals(
        looksLikeTlsRuntimeError(new Error('bad TLS record')),
        true,
      );
    });

    it('should return true for errors with "SSL" in message', () => {
      asserts.assertStrictEquals(
        looksLikeTlsRuntimeError(new Error('SSL error occurred')),
        true,
      );
      asserts.assertStrictEquals(
        looksLikeTlsRuntimeError(new Error('invalid SSL certificate')),
        true,
      );
    });

    it('should return true for errors with "handshake" in message', () => {
      asserts.assertStrictEquals(
        looksLikeTlsRuntimeError(new Error('handshake failed')),
        true,
      );
      asserts.assertStrictEquals(
        looksLikeTlsRuntimeError(new Error('Handshake timeout')),
        true,
      );
    });

    it('should return true for errors with ERR_TLS_* code', () => {
      const err = new Error('TLS error');
      // deno-lint-ignore no-explicit-any
      (err as any).code = 'ERR_TLS_CERT_ALTNAME_INVALID';
      asserts.assertStrictEquals(looksLikeTlsRuntimeError(err), true);
    });

    it('should return false for errors with non-TLS code', () => {
      const err = new Error('connection failed');
      // deno-lint-ignore no-explicit-any
      (err as any).code = 'ECONNREFUSED';
      asserts.assertStrictEquals(looksLikeTlsRuntimeError(err), false);
    });

    it('should return false for errors where code is not a string', () => {
      const err = new Error('some error');
      // deno-lint-ignore no-explicit-any
      (err as any).code = 404;
      asserts.assertStrictEquals(looksLikeTlsRuntimeError(err), false);
    });
  });
});
