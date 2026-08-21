/**
 * @fileoverview Tests for `label()` — the typed handle behind
 * `Doctor.stock` / `inject(label)`.
 *
 * @module
 */

import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { Doctor, inject, label } from './mod.ts';

describe('label', () => {
  it('should carry the name it was made with', () => {
    asserts.assertEquals(label<number>('Answer').name, 'Answer');
  });

  it('should pin the stocked value to the label type at compile time', () => {
    Doctor.reset();
    // @ts-expect-error — a string is not a number
    Doctor.stock(label<number>('n'), 'str');
    // A subtype is fine: the label names the contract, not the exact shape.
    const Db = label<{ q(): number }>('Db');
    const impl = { q: () => 1, extra: true };
    Doctor.stock(Db, impl);
    asserts.assertEquals(inject(Db).q(), 1);
  });
});
