/**
 * Standalone `use()` validates reverse-relation names — the MarketMaker
 * field report's F6. A reverse-name collision that only threw at
 * instance-level `norm.use()` (via `buildReverseMap`) is now caught at the
 * composed `use()` surface too, so a schema-only package validates itself
 * with no engine.
 */

import { describe, it } from '@tundralibs/compat/test';
import * as asserts from '@std/asserts';
import { Column, Entity, Schema, use } from '../mod.ts';
import { NormDefinitionError } from '../errors/mod.ts';

describe('norm.definition use() reverse-name validation (field report F6)', () => {
  it('rejects a derived reverse that collides with a target FK alias', () => {
    // Bot.ActiveConfig -> ConfigVersion; its derived reverse on
    // ConfigVersion is the bare source key 'Bot', which collides with
    // ConfigVersion's own 'Bot' FK alias (FK aliases resolve first).
    const Bot = Entity('Bot', {
      id: Column.integer(),
      cvId: Column.integer(),
    }, {
      pk: ['id'],
      fk: { ActiveConfig: { model: 'ConfigVersion', on: { cvId: 'id' } } },
    });
    const ConfigVersion = Entity('ConfigVersion', {
      id: Column.integer(),
      botId: Column.integer(),
    }, { pk: ['id'], fk: { Bot: { model: 'Bot', on: { botId: 'id' } } } });

    const err = asserts.assertThrows(
      () => use(Schema('MM', { Bot, ConfigVersion })),
      NormDefinitionError,
    );
    asserts.assertMatch(String(err), /reverse name 'Bot'/);
  });

  it('rejects an explicit reverseAs that collides with a target column', () => {
    const Post = Entity('Post', {
      id: Column.integer(),
      authorId: Column.integer(),
    }, {
      pk: ['id'],
      fk: {
        Author: { model: 'User', on: { authorId: 'id' }, reverseAs: 'name' },
      },
    });
    const User = Entity('User', {
      id: Column.integer(),
      name: Column.varchar(120),
    }, { pk: ['id'] });

    asserts.assertThrows(
      () => use(Schema('Blog', { Post, User })),
      NormDefinitionError,
    );
  });

  it('accepts a valid schema — no false positives', () => {
    const Item = Entity('Item', {
      id: Column.integer(),
      ownerId: Column.integer(),
    }, {
      pk: ['id'],
      fk: {
        Owner: { model: 'Owner', on: { ownerId: 'id' }, reverseAs: 'Items' },
      },
    });
    const Owner = Entity('Owner', { id: Column.integer() }, { pk: ['id'] });

    // 'Items' is free on Owner — must not throw.
    use(Schema('Store', { Item, Owner }));
  });

  it('Schema() alone (partial graph) does not run the reverse check', () => {
    const Bot = Entity('Bot', {
      id: Column.integer(),
      cvId: Column.integer(),
    }, {
      pk: ['id'],
      fk: { ActiveConfig: { model: 'ConfigVersion', on: { cvId: 'id' } } },
    });
    const ConfigVersion = Entity('ConfigVersion', {
      id: Column.integer(),
      botId: Column.integer(),
    }, { pk: ['id'], fk: { Bot: { model: 'Bot', on: { botId: 'id' } } } });
    // Constructing the schema is fine; the collision surfaces at use().
    Schema('MM', { Bot, ConfigVersion });
  });
});
