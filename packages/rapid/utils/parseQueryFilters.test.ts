/**
 * @fileoverview parseQueryFilters — the query grammar: operator
 * normalisation, the colon fixes, sort ordering, and structural caps.
 * @module
 */
import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { RapidError } from '../errors/mod.ts';
import { parseQueryFilters } from './parseQueryFilters.ts';

const q = (query: string) => new URLSearchParams(query);

describe('rapid.parseQueryFilters', () => {
  it('bare values normalise to $eq (one shape for every filter)', () => {
    const r = parseQueryFilters(q('code=abc'));
    asserts.assertEquals(r.filters, { code: { $eq: 'abc' } });
  });

  it('keys are lowercased and trimmed; empty keys are skipped', () => {
    const r = parseQueryFilters(q('CoDe=x&%20Name%20=y&=z'));
    asserts.assertEquals(Object.keys(r.filters).sort(), ['code', 'name']);
  });

  it('an empty value is an honest empty-string match', () => {
    const r = parseQueryFilters(q('code='));
    asserts.assertEquals(r.filters, { code: { $eq: '' } });
  });

  it('every operator maps to its $op object', () => {
    const r = parseQueryFilters(q(
      'a=eq:1&b=ne:2&c=gt:3&d=gte:4&e=lt:5&f=lte:6&g=like:x&h=ilike:y' +
        '&i=null:true&j=null:false&k=in:1,2&l=nin:3,4',
    ));
    asserts.assertEquals(r.filters, {
      a: { $eq: '1' },
      b: { $ne: '2' },
      c: { $gt: 3 },
      d: { $gte: 4 },
      e: { $lt: 5 },
      f: { $lte: 6 },
      g: { $like: '%x%' },
      h: { $ilike: '%y%' },
      i: { $null: true },
      j: { $null: false },
      k: { $in: ['1', '2'] },
      l: { $nin: ['3', '4'] },
    });
  });

  it('comparison values coerce ONLY when numeric-looking', () => {
    const r = parseQueryFilters(q('a=gt:10&b=gt:2026-01-01&c=lte:1.5'));
    asserts.assertEquals(r.filters['a'], { $gt: 10 });
    asserts.assertEquals(r.filters['b'], { $gt: '2026-01-01' });
    asserts.assertEquals(r.filters['c'], { $lte: 1.5 });
  });

  it('coerces only PLAIN decimals — hex/exp/binary stay strings (consistent with parsePaging)', () => {
    // `Number()` would turn these into 31 / 1000 / 3 — a silent, surprising
    // comparison. They must remain the literal strings the client sent.
    const r = parseQueryFilters(q('a=gt:0x1F&b=gt:1e3&c=gt:0b11&d=gt:-5'));
    asserts.assertEquals(r.filters['a'], { $gt: '0x1F' });
    asserts.assertEquals(r.filters['b'], { $gt: '1e3' });
    asserts.assertEquals(r.filters['c'], { $gt: '0b11' });
    asserts.assertEquals(r.filters['d'], { $gt: -5 }); // negatives are legit
  });

  it('COLON FIX: the value is everything after the FIRST colon', () => {
    // The ancestral split(':', 2) silently discarded ':30' here.
    const r = parseQueryFilters(q('start=gte:2026-01-01T10:30'));
    asserts.assertEquals(r.filters['start'], { $gte: '2026-01-01T10:30' });
  });

  it('COLON FIX: an unknown operator prefix is an exact match, not a drop', () => {
    const r = parseQueryFilters(q('website=https://example.com&x=word:rest'));
    asserts.assertEquals(r.filters['website'], {
      $eq: 'https://example.com',
    });
    asserts.assertEquals(r.filters['x'], { $eq: 'word:rest' });
  });

  it('a LEADING colon is a value, not an empty operator', () => {
    const r = parseQueryFilters(q('a=:justvalue'));
    asserts.assertEquals(r.filters['a'], { $eq: ':justvalue' });
  });

  it('null accepts only true/false; anything else falls back to $eq', () => {
    const r = parseQueryFilters(q('a=null:TRUE&b=null:maybe'));
    asserts.assertEquals(r.filters['a'], { $null: true });
    asserts.assertEquals(r.filters['b'], { $eq: 'null:maybe' });
  });

  it('array form [a,b,c] → $in, trimmed, empties dropped', () => {
    const r = parseQueryFilters(q('code=[a,%20b%20,,c]'));
    asserts.assertEquals(r.filters['code'], { $in: ['a', 'b', 'c'] });
  });

  it('an empty array/in list yields NO filter', () => {
    const r = parseQueryFilters(q('a=[]&b=in:,%20,'));
    asserts.assertEquals(r.filters, {});
  });

  it('duplicate keys: last wins (ancestral behaviour, kept)', () => {
    const r = parseQueryFilters(q('code=a&code=b'));
    asserts.assertEquals(r.filters['code'], { $eq: 'b' });
  });

  it('paging keys are reserved — never filters', () => {
    const r = parseQueryFilters(q('page=2&pagelimit=5&limit=9&code=x'));
    asserts.assertEquals(Object.keys(r.filters), ['code']);
  });

  it('sort/sortby parse field:direction; direction defaults ASC', () => {
    const r = parseQueryFilters(q('sort=name:desc&sortby=Age'));
    asserts.assertEquals(r.sorting, [
      { field: 'name', direction: 'DESC' },
      { field: 'age', direction: 'ASC' },
    ]);
  });

  it('sortN entries append in NUMERIC order (sort10 after sort2)', () => {
    const r = parseQueryFilters(q('sort10=c&sort2=b&sort=a'));
    asserts.assertEquals(r.sorting.map((s) => s.field), ['a', 'b', 'c']);
  });

  it('an empty sort field is skipped', () => {
    const r = parseQueryFilters(q('sort=:desc&sort=%20'));
    asserts.assertEquals(r.sorting, []);
  });

  it('CAP: too many filters → RAPID_QUERY_INVALID (400)', () => {
    const err = asserts.assertThrows(
      () => parseQueryFilters(q('a=1&b=2&c=3'), { maxFilters: 2 }),
      RapidError,
      'too many filters',
    );
    asserts.assertEquals(err.status, 400);
  });

  it('CAP: duplicate keys do not double-count against maxFilters', () => {
    const r = parseQueryFilters(q('a=1&a=2&b=3'), { maxFilters: 2 });
    asserts.assertEquals(Object.keys(r.filters).length, 2);
  });

  it('CAP: an oversized value → RAPID_QUERY_INVALID', () => {
    asserts.assertThrows(
      () => parseQueryFilters(q(`a=${'x'.repeat(11)}`), { maxValueLength: 10 }),
      RapidError,
      'too long',
    );
  });

  it('CAP: too many list items → RAPID_QUERY_INVALID', () => {
    asserts.assertThrows(
      () => parseQueryFilters(q('a=in:1,2,3'), { maxArrayItems: 2 }),
      RapidError,
      'too many list items',
    );
  });

  it('CAP: too many sorts → RAPID_QUERY_INVALID', () => {
    asserts.assertThrows(
      () => parseQueryFilters(q('sort1=a&sort2=b&sort3=c'), { maxSorts: 2 }),
      RapidError,
      'too many sort fields',
    );
  });

  it('R2-L2: the sort cap bounds the WORK — it throws mid-loop', () => {
    // Checked post-loop, a hostile ?sort1..sortN accumulated (and
    // sorted) every entry before throwing. Now the (cap+1)-th entry
    // throws, so nothing beyond it is parsed.
    let parsed = 0;
    const params = new URLSearchParams();
    for (let i = 1; i <= 50; i++) params.append(`sort${i}`, `f${i}`);
    asserts.assertThrows(
      () => {
        parseQueryFilters(params, { maxSorts: 3 });
        parsed = 1;
      },
      RapidError,
      'too many sort fields',
    );
    asserts.assertEquals(parsed, 0);
  });

  it('R2: maxSorts DEFAULTS to 5', () => {
    const five = new URLSearchParams();
    for (let i = 1; i <= 5; i++) five.append(`sort${i}`, `f${i}`);
    asserts.assertEquals(parseQueryFilters(five).sorting.length, 5);
    five.append('sort6', 'f6');
    asserts.assertThrows(
      () => parseQueryFilters(five),
      RapidError,
      'max 5',
    );
  });

  it('R2-H1: a __proto__ key cannot corrupt the filters object', () => {
    const r = parseQueryFilters(q('__proto__=eq:pwn&constructor=eq:x&ok=1'));
    // Null prototype: no setter to hit, so NOTHING is swapped and
    // nothing silently vanishes (on a plain {} this dropped the filter
    // entirely on Node and left a gadget key on Deno).
    asserts.assertEquals(Object.getPrototypeOf(r.filters), null);
    asserts.assertEquals(Object.keys(r.filters).sort(), [
      '__proto__',
      'constructor',
      'ok',
    ]);
    asserts.assertEquals(r.filters['__proto__'], { $eq: 'pwn' });
    asserts.assertEquals(r.filters['ok'], { $eq: '1' });
    // A plain object built from it stays plain (spread = define
    // semantics) — the documented safe consumption path.
    const copy = { ...r.filters };
    asserts.assertEquals(Object.getPrototypeOf(copy), Object.prototype);
  });

  it('R2-H1: dangerous keys still COUNT against maxFilters', () => {
    // `key in filters` was prototype-aware, so __proto__/constructor
    // skipped the cap check entirely; Object.hasOwn fixes that.
    asserts.assertThrows(
      () =>
        parseQueryFilters(q('__proto__=1&constructor=2&a=3'), {
          maxFilters: 2,
        }),
      RapidError,
      'too many filters',
    );
  });

  it('an empty query yields empty filters and sorting', () => {
    const r = parseQueryFilters(q(''));
    asserts.assertEquals(Object.keys(r.filters), []);
    asserts.assertEquals(r.sorting, []);
  });
});
