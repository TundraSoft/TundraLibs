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

  it('a __proto__-named template key cannot pollute the clone (H1/H2 hole, missed here)', () => {
    // Bracket assignment (clone[key] = value) treats a key literally
    // named __proto__ as the prototype setter, not a normal own
    // property — the exact hole H1/H2 closed in parseQueryFilters/
    // parseBody via a define-semantics build. Same fix, applied here.
    const template = JSON.parse(
      '{"safe":1,"__proto__":{"polluted":true,"isAdmin":true}}',
    );
    const s = buildState(template, 'CLONE');
    // deno-lint-ignore no-explicit-any
    asserts.assertEquals((s as any).isAdmin, undefined); // no inherited pollution
    asserts.assertEquals(Object.getPrototypeOf(s), Object.prototype);
    asserts.assert(Object.hasOwn(s, '__proto__')); // survives as an own key
    asserts.assertEquals(
      // deno-lint-ignore no-explicit-any
      (s as any).__proto__.polluted,
      true,
    );
    asserts.assertEquals(Object.keys(s).sort(), ['__proto__', 'safe']);
  });
});
