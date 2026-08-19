/**
 * @fileoverview buildState — the CLONE / PROTOTYPE / SHARE per-invocation
 * state factory.
 * @module
 */
import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { buildState } from './buildState.ts';

describe('rapid.buildState', () => {
  it('SHARE returns the template instance (writes are shared)', () => {
    const template = { n: 0 };
    const a = buildState(template, 'SHARE');
    const b = buildState(template, 'SHARE');
    asserts.assert(a === template && b === template);
    a.n = 5;
    asserts.assertEquals(b.n, 5);
  });

  it('PROTOTYPE: reads fall through, top-level writes shadow', () => {
    const template = { n: 1, name: 'x' };
    const s = buildState(template, 'PROTOTYPE');
    asserts.assertEquals(s.n, 1); // inherited
    s.n = 9; // shadows
    asserts.assertEquals(s.n, 9);
    asserts.assertEquals(template.n, 1); // template untouched
  });

  it('CLONE: deep copy — nested writes do NOT touch the template', () => {
    const template = { user: { id: 1 } };
    const s = buildState(template, 'CLONE');
    s.user.id = 2;
    asserts.assertEquals(template.user.id, 1);
    asserts.assert(s.user !== template.user);
  });

  it('CLONE: clonables are deep-copied, unclonables kept by reference', () => {
    const fn = () => 42; // NOT structuredClone-able → reference kept
    const map = new Map([['k', 'v']]); // IS clonable → deep-copied
    const template = { fn, map, plain: { a: 1 } };
    const s = buildState(template, 'CLONE');
    asserts.assert(s.fn === fn); // unclonable → same reference (never dropped)
    asserts.assert(s.map !== map); // clonable → a distinct copy
    asserts.assertEquals([...s.map], [['k', 'v']]); // ...with the same content
    asserts.assert(s.plain !== template.plain); // plain object deep-cloned
  });

  it('CLONE of a truly-unclonable value keeps the reference', () => {
    const fn = () => {};
    const s = buildState({ cb: fn }, 'CLONE');
    asserts.assert(s.cb === fn);
  });
});
