/**
 * @fileoverview binders — descriptor shapes and the generic typing
 * that threads validator outputs into parameter types.
 * @module
 */
import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import type { RapidBinder } from '../types/mod.ts';
import {
  connection,
  header,
  paging,
  param,
  payload,
  query,
} from './binders.ts';

describe('rapid.decorators.binders', () => {
  it('factories produce pure descriptors (source/name/validate)', () => {
    asserts.assertEquals(param('id'), {
      source: 'param',
      name: 'id',
      validate: undefined,
    });
    asserts.assertEquals(payload().source, 'payload');
    asserts.assertEquals(query().source, 'query');
    asserts.assertEquals(paging(), { source: 'paging' });
    asserts.assertEquals(header('x-k').name, 'x-k');
    asserts.assertEquals(connection().source, 'connection');
  });

  it('payload(Schema) keeps the schema for documentation and calls parse as a METHOD', () => {
    const schema = {
      prefix: 'u:',
      parse(value: unknown): string {
        return `${this.prefix}${value as string}`; // reads `this` — must survive
      },
      toOpenAPI: () => ({ type: 'object' }),
    };
    const binder = payload(schema);
    asserts.assertStrictEquals(binder.schema, schema);
    asserts.assertEquals(binder.validate!('ada'), 'u:ada');
    // A bare validator function carries NO schema — it cannot document.
    asserts.assertEquals(payload((v) => v).schema, undefined);
  });

  it('validators ride along untouched — nothing executes here', () => {
    let calls = 0;
    const binder = param('n', (value) => {
      calls++;
      return Number(value);
    });
    asserts.assertEquals(calls, 0); // decoration time runs NOTHING
    asserts.assertEquals(binder.validate!('42'), 42);
    asserts.assertEquals(calls, 1);
  });

  it('the validator output types the binder (compile-time thread)', () => {
    // param without validator → RapidBinder<string>; with a numeric
    // validator → RapidBinder<number>. Assignments prove inference:
    const plain: RapidBinder<string> = param('id');
    const numeric: RapidBinder<number> = param('n', (v) => Number(v));
    void plain;
    void numeric;
  });
});
