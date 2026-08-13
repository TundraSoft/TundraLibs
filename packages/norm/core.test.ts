/**
 * The two entry points. `@tundralibs/norm` (root barrel) and
 * `@tundralibs/norm/core` must expose the SAME surface — the only
 * difference is that the root barrel also imports the seven
 * `engines/<dialect>` side-effect modules. That is what makes the split
 * non-breaking: an existing consumer's import keeps every export AND
 * every dialect.
 */

import { describe, it } from '@tundralibs/compat/test';
import * as asserts from '@std/asserts';
import * as core from './core.ts';
import * as barrel from './mod.ts';

describe('norm.core (edge entry point)', () => {
  it('exports the same surface as the root barrel', () => {
    const coreKeys = Object.keys(core).sort();
    const barrelKeys = Object.keys(barrel).sort();
    asserts.assertEquals(barrelKeys, coreKeys);
    asserts.assertEquals(coreKeys.length > 40, true);
  });

  it('exports the SAME Norm class object, not a copy', () => {
    asserts.assertStrictEquals(core.Norm, barrel.Norm);
    asserts.assertStrictEquals(core.NormDb, barrel.NormDb);
    asserts.assertStrictEquals(core.NormError, barrel.NormError);
  });

  it('re-exports the registry so a consumer can register its own engine', () => {
    asserts.assertEquals(typeof core.registerEngine, 'function');
    asserts.assertEquals(typeof core.resolveEngineFactory, 'function');
  });

  it('constructs an edge Norm from core + one engine module', async () => {
    // Exactly what a Workers consumer writes: the core entry point plus
    // the single dialect it uses. No other driver is in the graph.
    await import('./engines/d1.ts');
    const norm = new core.Norm({
      database: {
        dialect: 'd1',
        accountId: 'acct',
        databaseId: 'db',
        apiToken: 'tok',
      },
    });
    asserts.assertEquals(norm instanceof barrel.Norm, true);
    // The engine really was built by the D1 factory: SQLite dialect, and
    // one-shot REST means no transactions.
    const db = norm.use(core.Schema('S', {
      Users: core.Entity('users', { id: core.Column.integer() }, {
        pk: ['id'],
      }),
    }));
    await asserts.assertRejects(
      () => db.transaction(() => Promise.resolve(1)),
      core.NormUnsupportedError,
    );
  });
});
