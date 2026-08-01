/**
 * Unit coverage for {@link AbstractTranslator}'s `_resolveColumnRef` —
 * the column-reference resolver shared by projection, GROUP BY, ORDER BY,
 * and join-ON rendering. Exercised through a thin test subclass because the
 * method is `protected` and the public query path validates refs to at most
 * two segments.
 *
 * @module translator/ResolveColumnRef.test
 */

import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { SQLiteTranslator } from './SQLiteTranslator.ts';
import { OqlError } from '../errors/mod.ts';

/** Exposes the protected resolver for direct assertion. */
class TestTranslator extends SQLiteTranslator {
  public resolve(ref: string, hasJoins: boolean): string {
    return this._resolveColumnRef(ref, hasJoins);
  }
}

const t = new TestTranslator();

describe('oql.translator._resolveColumnRef', () => {
  it('quotes a bare column', () => {
    asserts.assertEquals(t.resolve('@id', false), '"id"');
  });

  it('prefixes a bare column with the base alias when joins are present', () => {
    asserts.assertEquals(t.resolve('@id', true), '__base__."id"');
  });

  it('quotes both the alias and column of a 2-segment ref', () => {
    // Defence-in-depth: the join alias is quoted just like the column.
    asserts.assertEquals(t.resolve('@Profile.@bio', true), '"Profile"."bio"');
  });

  it('keeps every segment of a 3-segment nested ref', () => {
    // Previously `split('.@')` dropped trailing segments, emitting
    // `Profile."meta"` and silently losing `@city`.
    asserts.assertEquals(
      t.resolve('@Profile.@meta.@city', true),
      '"Profile"."meta"."city"',
    );
  });

  it('keeps every segment of a 4-segment nested ref', () => {
    asserts.assertEquals(
      t.resolve('@a.@b.@c.@d', false),
      '"a"."b"."c"."d"',
    );
  });

  it('throws when the ref does not start with @', () => {
    const err = asserts.assertThrows(
      () => t.resolve('id', false),
      OqlError,
    );
    asserts.assertEquals((err as OqlError).code, 'INVALID_COLUMN_REF');
  });
});
