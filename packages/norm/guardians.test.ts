/**
 * Generated-Guardian unit tests: per-type cell guardians (validators
 * mapped from specs), default rehydration, write-guardian composition
 * and batch-error paths — direct, no repo pipeline.
 */

import { describe, it } from '@tundralibs/compat/test';
import * as asserts from '@std/asserts';
import { Column, Entity } from './mod.ts';
import {
  buildCellGuardian,
  buildWriteGuardians,
  rehydrateDefault,
  validateRows,
} from './guardians.ts';
import type { ColumnSpec } from './definition/mod.ts';
import { NormValidationError } from './errors/mod.ts';

/** Emit specs through the public definition layer. */
const Specs = Entity('specs', {
  vc: Column.varchar(5).minLength(2),
  txt: Column.text().maxLength(4),
  patterned: Column.text().pattern(/^[a-z]+$/),
  slov: Column.varchar(8).lov(['on', 'off']),
  int: Column.integer().min(1).max(10),
  ilov: Column.integer().lov([1, 2, 3]),
  dec: Column.decimal(6, 2).min(0.5).max(9.5),
  dlov: Column.decimal(4, 1).lov([1.5, 2.5]),
  big: Column.bigint().min(10n).max(100n),
  blov: Column.bigint().lov([1n, 2n]),
  when: Column.timestamp()
    .min(new Date('2020-01-01T00:00:00Z'))
    .max(new Date('2030-01-01T00:00:00Z')),
  flag: Column.boolean(),
}, { pk: ['vc'] }).columns;

describe('norm.guardians (cell guardians + validateRows)', () => {
  it('string: length caps, minLength, pattern, lov', () => {
    asserts.assertEquals(buildCellGuardian(Specs.vc).parse('abc'), 'abc');
    asserts.assertThrows(() => buildCellGuardian(Specs.vc).parse('a')); // minLength
    asserts.assertThrows(() => buildCellGuardian(Specs.vc).parse('toolong'));
    asserts.assertEquals(buildCellGuardian(Specs.txt).parse('abcd'), 'abcd');
    asserts.assertThrows(() => buildCellGuardian(Specs.txt).parse('abcde')); // maxLength
    asserts.assertEquals(
      buildCellGuardian(Specs.patterned).parse('abc'),
      'abc',
    );
    asserts.assertThrows(() => buildCellGuardian(Specs.patterned).parse('AB'));
    asserts.assertEquals(buildCellGuardian(Specs.slov).parse('on'), 'on');
    asserts.assertThrows(() => buildCellGuardian(Specs.slov).parse('maybe'));
  });

  it('integer + decimal: range and lov', () => {
    asserts.assertEquals(buildCellGuardian(Specs.int).parse(5), 5);
    asserts.assertThrows(() => buildCellGuardian(Specs.int).parse(0));
    asserts.assertThrows(() => buildCellGuardian(Specs.int).parse(11));
    asserts.assertThrows(() => buildCellGuardian(Specs.int).parse(1.5)); // integer()
    asserts.assertEquals(buildCellGuardian(Specs.ilov).parse(2), 2);
    asserts.assertThrows(() => buildCellGuardian(Specs.ilov).parse(9));
    asserts.assertEquals(buildCellGuardian(Specs.dec).parse(1.25), 1.25);
    asserts.assertThrows(() => buildCellGuardian(Specs.dec).parse(0.1));
    asserts.assertThrows(() => buildCellGuardian(Specs.dec).parse(9.9));
    asserts.assertEquals(buildCellGuardian(Specs.dlov).parse(2.5), 2.5);
    asserts.assertThrows(() => buildCellGuardian(Specs.dlov).parse(3.5));
  });

  it('bigint: range and lov (bounds stored as strings, rehydrated)', () => {
    asserts.assertEquals(buildCellGuardian(Specs.big).parse(50n), 50n);
    asserts.assertThrows(() => buildCellGuardian(Specs.big).parse(5n));
    asserts.assertThrows(() => buildCellGuardian(Specs.big).parse(500n));
    asserts.assertEquals(buildCellGuardian(Specs.blov).parse(1n), 1n);
    asserts.assertThrows(() => buildCellGuardian(Specs.blov).parse(3n));
  });

  it('date: min/max bounds (stored as ISO strings)', () => {
    const g = buildCellGuardian(Specs.when);
    const ok = new Date('2025-06-01T00:00:00Z');
    asserts.assertEquals(g.parse(ok), ok);
    asserts.assertThrows(() => g.parse(new Date('2010-01-01T00:00:00Z')));
    asserts.assertThrows(() => g.parse(new Date('2031-01-01T00:00:00Z')));
  });

  it('boolean + unrecognised types', () => {
    asserts.assertEquals(buildCellGuardian(Specs.flag).parse(true), true);
    asserts.assertEquals(buildCellGuardian(Specs.flag).parse(false), false);
    // Hand-built spec with a type the definition layer never emits —
    // defensively passes anything through.
    const weird = { type: 'GEOMETRY' } as unknown as ColumnSpec;
    asserts.assertEquals(
      buildCellGuardian(weird).parse('anything'),
      'anything',
    );
  });

  it('rehydrateDefault: bigint-as-string, ISO date, function passthrough, others verbatim', () => {
    const bigSpec = Specs.big;
    asserts.assertEquals(rehydrateDefault(bigSpec, '42'), 42n);
    const d = rehydrateDefault(Specs.when, '2024-05-06T07:08:09.000Z');
    asserts.assertEquals(d instanceof Date, true);
    asserts.assertEquals((d as Date).toISOString(), '2024-05-06T07:08:09.000Z');
    const fn = () => 7;
    asserts.assertEquals(rehydrateDefault(Specs.int, fn), fn);
    asserts.assertEquals(rehydrateDefault(Specs.int, 7), 7);
  });

  it('validateRows: batch failures prefix the row index; parsed rows carry defaults', () => {
    const def = Entity('rows', {
      id: Column.integer(),
      status: Column.varchar(8).lov(['a', 'b']).default('a'),
    }, { pk: ['id'] });
    const { insert } = buildWriteGuardians(
      def.columns as unknown as Record<string, ColumnSpec>,
    );

    const parsed = validateRows(
      insert,
      [{ id: 1 }, { id: 2, status: 'b' }],
      { model: 'rows', op: 'insert' },
      true,
    );
    asserts.assertEquals(parsed, [
      { id: 1, status: 'a' }, // guardian filled the default
      { id: 2, status: 'b' },
    ]);

    const err = asserts.assertThrows(
      () =>
        validateRows(
          insert,
          [{ id: 1 }, { id: 2, status: 'zzz' }],
          { model: 'rows', op: 'insert' },
          true,
        ),
      NormValidationError,
    );
    asserts.assertEquals(
      err.context.issues.some((i) => i.path.startsWith('[1].')),
      true,
    );

    // Strict mode: unknown keys become one addressable issue per key.
    const unknown = asserts.assertThrows(
      () =>
        validateRows(
          insert,
          [{ id: 1, ghost: true, phantom: 1 }],
          { model: 'rows', op: 'insert' },
          false,
        ),
      NormValidationError,
    );
    const paths = unknown.context.issues.map((i) => i.path);
    asserts.assertEquals(paths.includes('ghost'), true);
    asserts.assertEquals(paths.includes('phantom'), true);
  });

  it('update guardians: everything optional, defaultOnUpdate auto-fills', () => {
    const def = Entity('u', {
      id: Column.integer(),
      name: Column.varchar(20),
      rev: Column.integer().defaultOnUpdate(() => 3),
    }, { pk: ['id'] });
    const { update } = buildWriteGuardians(
      def.columns as unknown as Record<string, ColumnSpec>,
    );
    // Sparse payload validates; the update-slot default fills.
    asserts.assertEquals(update.parse({ name: 'n' }), { name: 'n', rev: 3 });
    asserts.assertEquals(update.parse({}), { rev: 3 });
  });
});
