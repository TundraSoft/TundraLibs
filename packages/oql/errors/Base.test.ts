/**
 * `OqlError` base — extends `BaseError` from utils and exposes a guarded
 * `.code` accessor. Covers the contract the CONVENTIONS.md refactor added.
 */

import { describe, it } from '@tundralibs/compat/test';
import * as asserts from '@std/asserts';
import { BaseError } from '@tundralibs/utils';
import { DialectUnsupportedError, OqlError } from './mod.ts';

describe('oql.errors', () => {
  it('OqlError is a BaseError with typed context + ${var} substitution', () => {
    const e = new OqlError('bad column ${col}', {
      code: 'INVALID_COLUMN_REF',
      col: 'x',
    });
    asserts.assert(e instanceof BaseError);
    asserts.assert(e instanceof Error);
    asserts.assertEquals(e.name, 'OqlError');
    asserts.assertEquals(e.message, 'bad column x'); // BaseError substitution
    asserts.assertEquals(e.code, 'INVALID_COLUMN_REF');
    asserts.assertEquals(e.context.code, 'INVALID_COLUMN_REF');
  });

  it('.code falls back to UNKNOWN when unset or out-of-band', () => {
    asserts.assertEquals(new OqlError('no context').code, 'UNKNOWN');
    const oob = new OqlError('x', { code: 'NOPE' as never });
    asserts.assertEquals(oob.code, 'UNKNOWN');
  });

  it('preserves the cause chain through BaseError', () => {
    const root = new Error('root');
    const e = new OqlError('wrap', { code: 'UNKNOWN' }, root);
    asserts.assertEquals(e.cause, root);
    asserts.assertEquals(e.getRootCause(), root);
  });

  it('DialectUnsupportedError is an OqlError carrying dialect/feature + code', () => {
    const e = new DialectUnsupportedError('sqlite', 'CREATE_SCHEMA');
    asserts.assert(e instanceof OqlError);
    asserts.assertEquals(e.code, 'DIALECT_UNSUPPORTED');
    asserts.assertEquals(e.dialect, 'sqlite');
    asserts.assertEquals(e.feature, 'CREATE_SCHEMA');
    asserts.assert(e.message.includes("Dialect 'sqlite'"));
  });
});
