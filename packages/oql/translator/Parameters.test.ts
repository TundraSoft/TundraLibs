import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { Parameters } from './Parameters.ts';

describe('oql.translator.Parameters', () => {
  it('allocates sequential names', () => {
    const p = new Parameters();
    asserts.assertEquals(p.add(1), 'p_0');
    asserts.assertEquals(p.add(2), 'p_1');
    asserts.assertEquals(p.add('foo'), 'p_2');
  });

  it('dedupes equal primitives', () => {
    const p = new Parameters();
    asserts.assertEquals(p.add(42), 'p_0');
    asserts.assertEquals(p.add(42), 'p_0');
    asserts.assertEquals(p.add('foo'), 'p_1');
    asserts.assertEquals(p.add('foo'), 'p_1');
    asserts.assertEquals(p.size, 2);
  });

  it('dedupes equal Date instances by epoch ms', () => {
    const p = new Parameters();
    asserts.assertEquals(p.add(new Date(0)), 'p_0');
    asserts.assertEquals(p.add(new Date(0)), 'p_0');
    asserts.assertEquals(p.size, 1);
  });

  it('dedupes equal bigints', () => {
    const p = new Parameters();
    asserts.assertEquals(p.add(100n), 'p_0');
    asserts.assertEquals(p.add(100n), 'p_0');
    asserts.assertEquals(p.size, 1);
  });

  it('asRecord materialises original values', () => {
    const p = new Parameters();
    p.add('foo');
    p.add(42);
    p.add(new Date(1000));
    p.add(100n);
    const record = p.asRecord();
    asserts.assertEquals(record.p_0, 'foo');
    asserts.assertEquals(record.p_1, 42);
    asserts.assertEquals((record.p_2 as Date).getTime(), 1000);
    asserts.assertEquals(record.p_3, 100n);
  });

  it('keeps strings that look like an internal dedup key as strings', () => {
    // The dedup key for a Date/bigint is a tagged string. A user value
    // that happens to look like one must NOT be reconstructed as a
    // Date/BigInt on the way out.
    const p = new Parameters();
    const lookalikes = [
      '__date__1000',
      '__bigint__5',
      'date:1000',
      'bigint:5',
      'string:x',
    ];
    for (const s of lookalikes) p.add(s);
    const record = p.asRecord();
    for (let i = 0; i < lookalikes.length; i++) {
      const value = record[`p_${i}`];
      asserts.assertEquals(typeof value, 'string');
      asserts.assertEquals(value, lookalikes[i]);
    }
  });

  it('gives a Date and a key-lookalike string distinct placeholders', () => {
    // Previously both keyed as `__date__1000`, so they deduped onto one
    // placeholder and one of the two bound with the wrong type.
    const p = new Parameters();
    const date = new Date(1000);
    asserts.assertEquals(p.add(date), 'p_0');
    asserts.assertEquals(p.add('__date__1000'), 'p_1');
    asserts.assertEquals(p.add('date:1000'), 'p_2');
    asserts.assertEquals(p.size, 3);
    const record = p.asRecord();
    asserts.assertInstanceOf(record.p_0, Date);
    asserts.assertEquals((record.p_0 as Date).getTime(), 1000);
    asserts.assertEquals(record.p_1, '__date__1000');
    asserts.assertEquals(record.p_2, 'date:1000');
  });

  it('gives a bigint and a key-lookalike string distinct placeholders', () => {
    const p = new Parameters();
    asserts.assertEquals(p.add(5n), 'p_0');
    asserts.assertEquals(p.add('__bigint__5'), 'p_1');
    asserts.assertEquals(p.add('bigint:5'), 'p_2');
    asserts.assertEquals(p.size, 3);
    const record = p.asRecord();
    asserts.assertEquals(typeof record.p_0, 'bigint');
    asserts.assertEquals(record.p_0, 5n);
    asserts.assertEquals(record.p_1, '__bigint__5');
    asserts.assertEquals(record.p_2, 'bigint:5');
  });

  it('does not collapse a number and its string form', () => {
    const p = new Parameters();
    asserts.assertEquals(p.add(5), 'p_0');
    asserts.assertEquals(p.add('5'), 'p_1');
    const record = p.asRecord();
    asserts.assertEquals(record.p_0, 5);
    asserts.assertEquals(record.p_1, '5');
  });

  it('preserves non-primitive values verbatim', () => {
    const p = new Parameters();
    const bytes = new Uint8Array([1, 2, 3]);
    p.add(bytes);
    p.add(null);
    const record = p.asRecord();
    // Identity, not a copy — the binder hands the driver what it was given.
    asserts.assertStrictEquals(record.p_0, bytes);
    asserts.assertEquals(record.p_1, null);
  });

  it('honours custom prefix', () => {
    const p = new Parameters('arg');
    asserts.assertEquals(p.add('x'), 'arg_0');
  });

  it('appends trailing _ to prefix if missing', () => {
    const p = new Parameters('foo');
    asserts.assertEquals(p.add('x'), 'foo_0');
  });
});
