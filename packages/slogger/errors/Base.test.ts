/**
 * @fileoverview Tests for the package base error and derived errors.
 * @module
 */

import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { BaseError } from '@tundralibs/utils';
import {
  SloggerConfigError,
  SloggerError,
  SloggerFinalizeError,
  SloggerHandlerError,
} from './mod.ts';

describe('slogger.errors', () => {
  describe('SloggerError', () => {
    it('should be a subclass of BaseError and Error', () => {
      const err = new SloggerError('boom', { foo: 'bar' });
      asserts.assert(err instanceof SloggerError);
      asserts.assert(err instanceof BaseError);
      asserts.assert(err instanceof Error);
      asserts.assertEquals(err.name, 'SloggerError');
      asserts.assertEquals(err.message, 'boom');
      asserts.assertEquals(err.context.foo, 'bar');
    });
  });

  describe('SloggerConfigError', () => {
    it('should derive from SloggerError and carry key/value context', () => {
      const err = new SloggerConfigError('bad option', {
        key: 'batchSize',
        value: -1,
      });
      asserts.assert(err instanceof SloggerConfigError);
      asserts.assert(err instanceof SloggerError);
      asserts.assertEquals(err.name, 'SloggerConfigError');
      asserts.assertEquals(err.context.key, 'batchSize');
      asserts.assertEquals(err.context.value, -1);
    });
  });

  describe('SloggerHandlerError', () => {
    it('should derive from SloggerError, require `handler`, and chain a cause', () => {
      const cause = new Error('ECONNREFUSED');
      const err = new SloggerHandlerError(
        'send failed',
        { handler: 'http-main', url: 'http://x/logs' },
        cause,
      );
      asserts.assert(err instanceof SloggerHandlerError);
      asserts.assert(err instanceof SloggerError);
      asserts.assertEquals(err.name, 'SloggerHandlerError');
      asserts.assertEquals(err.context.handler, 'http-main');
      asserts.assertStrictEquals(err.cause, cause);
      asserts.assertStrictEquals(err.getRootCause(), cause);
    });
  });

  describe('SloggerFinalizeError', () => {
    it('should aggregate per-handler failures and expose them', () => {
      const causeA = new Error('endpoint down');
      const err = new SloggerFinalizeError([
        { handler: 'http-main', error: causeA },
        { handler: 'tcp-side', error: 'string reason' },
      ]);
      asserts.assert(err instanceof SloggerFinalizeError);
      asserts.assert(err instanceof SloggerError);
      asserts.assertEquals(err.name, 'SloggerFinalizeError');
      asserts.assertEquals(
        err.message,
        "finalize() failed for 2 handler(s): 'http-main', 'tcp-side'",
      );
      asserts.assertEquals(err.failures.length, 2);
      asserts.assertEquals(err.failures, err.context.failures);
      asserts.assertEquals(err.failures[0]!.handler, 'http-main');
      // The first Error-typed failure is chained as `cause`.
      asserts.assertStrictEquals(err.cause, causeA);
    });

    it('leaves `cause` unset when the first failure is not an Error', () => {
      const err = new SloggerFinalizeError([
        { handler: 'weird', error: 42 },
      ]);
      asserts.assertEquals(err.cause, undefined);
      asserts.assertEquals(err.failures[0]!.error, 42);
    });
  });
});
