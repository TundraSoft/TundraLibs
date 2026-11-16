/**
 * Asserts layer — the user-facing validation surface for HAND-BUILT
 * definitions (builders/Entity() delegate to the same functions, so
 * these are the single-source rules).
 */

import { describe, it } from '@tundralibs/compat/test';
import * as asserts from '@std/asserts';
import { Column, Entity, NormDefinitionError, Schema, use } from '../mod.ts';
import type { ColumnSpec } from '../definition/mod.ts';
import { assertColumnSpec, assertDefinition, assertRegistry } from './mod.ts';

describe('norm.asserts (hand-built validation)', () => {
  it('assertColumnSpec: junk shapes are caught with aggregated issues', () => {
    asserts.assertThrows(
      () => assertColumnSpec('M', 'c', { type: '' } as ColumnSpec),
      NormDefinitionError,
      'non-empty string',
    );
    // Digest length must match the algorithm.
    asserts.assertThrows(
      () =>
        assertColumnSpec(
          'M',
          'c',
          { type: 'VARCHAR', length: 10, hashed: 'SHA-256' } as ColumnSpec,
        ),
      NormDefinitionError,
      'length must be 64',
    );
    // Mask combos.
    asserts.assertThrows(
      () =>
        assertColumnSpec(
          'M',
          'c',
          {
            type: 'VARCHAR',
            encrypt: true,
            masked: { source: 's', fn: (v: never) => String(v) },
          } as ColumnSpec,
        ),
      NormDefinitionError,
      'cannot declare',
    );
    // Valid spec passes.
    assertColumnSpec('M', 'c', Column.varchar(10).spec);
  });

  it('an insert default that reads a column of the row is refused', () => {
    const add = (date: unknown) => ({
      $$_expression: 'DATE_ADD',
      args: { date, amount: 1, unit: 'DAYS' },
    });
    asserts.assertThrows(
      () =>
        Entity('t', {
          id: Column.integer(),
          base: Column.timestamp(),
          due: Column.date().default(add('@base') as never),
        }, { pk: ['id'] }),
      NormDefinitionError,
      "t.columns.due.default.insert: an insert default cannot read a column of the row being inserted (it reads '@base')",
    );
    // The clock, and an update default, which reads the stored row.
    Entity('t', {
      id: Column.integer(),
      base: Column.timestamp(),
      due: Column.date()
        .default(add({ $$_expression: 'NOW' }) as never)
        .defaultOnUpdate(add('@base') as never),
    }, { pk: ['id'] });
  });

  it('a literal date default no calendar has is refused', () => {
    for (
      const [col, text] of [
        [Column.date(), '2026-02-30'],
        [Column.datetime(), '2026-04-31 10:00:00'],
        [Column.timestamp(), '2026-01-01T24:00:00Z'],
        [Column.timestamptz(), 'not a date'],
        [Column.date(), 'Feb 3 2026'],
      ] as const
    ) {
      for (
        const [slot, built] of [
          ['insert', col.default(text as never)],
          ['update', col.defaultOnUpdate(text as never)],
        ] as const
      ) {
        asserts.assertThrows(
          () =>
            Entity('t', { id: Column.integer(), at: built }, { pk: ['id'] }),
          NormDefinitionError,
          `t.columns.at.default.${slot}: Cannot coerce "${text}" to Date`,
        );
      }
    }
    Entity('t', {
      id: Column.integer(),
      leap: Column.date().default('2024-02-29' as never),
      at: Column.timestamp().default('2026-01-15T10:00:00+05:30' as never),
      day: Column.date().default(new Date('2026-02-28T00:00:00Z')),
    }, { pk: ['id'] });
  });

  it('assertDefinition: hand-built defs get Entity()-identical rules', () => {
    const good = Entity('t', { id: Column.integer() }, { pk: ['id'] });
    assertDefinition(good); // idempotent on validated defs

    // Forged: pk names a ghost column.
    const forged = {
      ...good,
      primaryKeys: ['ghost'],
    } as unknown as typeof good;
    asserts.assertThrows(
      () => assertDefinition(forged),
      NormDefinitionError,
      "column 'ghost' does not exist",
    );
  });

  it('assertRegistry: cross-entity rules for hand-built registries', () => {
    const A = Entity('aa', {
      id: Column.integer(),
      bid: Column.integer(),
    }, {
      pk: ['id'],
      fk: { B: { model: 'Bee', on: { bid: 'id' } } },
    });
    // Missing target: loud with the historical use() message.
    asserts.assertThrows(
      () => assertRegistry({ A } as never, { scope: 'use()' }),
      Error,
      "references entity key 'Bee'",
    );
    // Deferral mode passes (Schema()-side semantics).
    assertRegistry({ A } as never, { allowUnresolved: true });

    // Full pass, definitions included (the compile path).
    const B = Entity('bee', { id: Column.integer() }, { pk: ['id'] });
    assertRegistry(use(Schema('S', { A, Bee: B })) as never, {
      definitions: true,
    });
  });
});
