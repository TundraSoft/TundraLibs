/**
 * @fileoverview binders — descriptor shapes and the generic typing
 * that threads validator outputs into parameter types.
 * @module
 */
import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import type { RapidBinder } from '../types/mod.ts';
import { RapidError } from '../errors/mod.ts';
import {
  clientAddress,
  connection,
  flatQuery,
  header,
  paging,
  param,
  payload,
  query,
  state,
  surface,
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
    asserts.assertEquals(state('tenant'), {
      source: 'state',
      name: 'tenant',
      validate: undefined,
    });
    asserts.assertEquals(surface(), { source: 'surface' });
    asserts.assertEquals(clientAddress(), { source: 'clientAddress' });
  });

  it('param(name, Schema) keeps the schema for documentation and calls parse as a METHOD', async () => {
    const schema = {
      prefix: 'id:',
      parse(value: unknown): string {
        return `${this.prefix}${value as string}`;
      },
      toOpenAPI: () => ({ type: 'string', pattern: '^[a-z]+$' }),
    };
    const binder = param('code', schema);
    asserts.assertEquals(binder.schema, schema);
    asserts.assertEquals(await binder.validate!('acme'), 'id:acme');
    asserts.assertEquals(param('code', (v) => String(v)).schema, undefined);
  });

  it('query(Schema) parses the FLATTENED query; unknown keys drop or reject by option, and need a self-describing schema', async () => {
    const q = {
      filters: {
        next: { $eq: '/users' },
        tag: { $in: ['a', 'b'] },
        deleted: { $null: true },
        extra: { $eq: 'x' },
      },
      sorting: [],
    };
    asserts.assertEquals(flatQuery(q), {
      next: '/users',
      tag: ['a', 'b'],
      deleted: true,
      extra: 'x',
    });
    const seen: unknown[] = [];
    const schema = {
      parse(value: unknown) {
        seen.push(value);
        return value;
      },
      toJSONSchema: () => ({
        type: 'object',
        properties: { next: { type: 'string' }, tag: {}, deleted: {} },
      }),
    };
    // No option: the schema sees everything (a guardian object strips on its own).
    await query(schema).validate!(q);
    asserts.assertEquals(Object.keys(seen[0] as object), [
      'next',
      'tag',
      'deleted',
      'extra',
    ]);
    await query(schema, { unknown: 'drop' }).validate!(q);
    asserts.assertEquals(Object.keys(seen[1] as object), [
      'next',
      'tag',
      'deleted',
    ]);
    // A sync schema makes the validator sync — the throw is immediate.
    const rejected = asserts.assertThrows(
      () => query(schema, { unknown: 'reject' }).validate!(q),
      RapidError,
    );
    asserts.assertEquals(rejected.code, 'RAPID_VALIDATION_FAILED');
    asserts.assertEquals(rejected.context.details, { unknown: ['extra'] });
    asserts.assertThrows(
      () => query({ parse: (v: unknown) => v }, { unknown: 'drop' }),
      RapidError,
      'needs a schema that lists its keys',
    );
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
