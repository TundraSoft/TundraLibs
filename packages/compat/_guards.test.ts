/**
 * @fileoverview Tests for the internal assertBuiltin guard.
 * @module
 */

import { describe, it } from './test.ts';
import * as asserts from '@std/asserts';
import { assertBuiltin } from './_guards.ts';
import { UnsupportedRuntimeError } from './Error.ts';

describe('assertBuiltin', () => {
  it('does nothing when the builtin is present', () => {
    // A present builtin (any non-null value) must not throw.
    assertBuiltin({}, 'node:fs', 'readFile');
    assertBuiltin(() => {}, 'node:net', 'connect');
  });

  it('throws UnsupportedRuntimeError when the builtin is undefined', () => {
    const err = asserts.assertThrows(
      () => assertBuiltin(undefined, 'node:http', 'WebServer.start'),
      UnsupportedRuntimeError,
      'node:http is unavailable in this runtime',
    ) as UnsupportedRuntimeError;
    asserts.assertEquals(err.operation, 'WebServer.start');
  });

  it('throws when the builtin is null', () => {
    asserts.assertThrows(
      () => assertBuiltin(null, 'node:dgram', 'udpSocket'),
      UnsupportedRuntimeError,
    );
  });
});
