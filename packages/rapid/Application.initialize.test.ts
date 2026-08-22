/**
 * @fileoverview `Application.initialize` — the single entry point. Programmatic
 * (plain options, empty config) vs config-driven (options from the `Application`
 * set, sibling sets loaded into `app.config`), and the runtime brand guard that
 * rejects a construction bypassing the private constructor.
 * @module
 */
import { describe, it } from '@tundralibs/compat/test';
import * as asserts from '@std/asserts';
import { makeTempDir, removeDir, writeTextFile } from '@tundralibs/compat/file';
import { Application } from './Application.ts';

describe('Application.initialize', () => {
  it('programmatic shape: uses options verbatim, config is empty', async () => {
    const app = await Application.initialize({
      name: 'prog',
      mode: 'DEVELOPMENT',
    });
    asserts.assertEquals(app.option('name'), 'prog');
    asserts.assertEquals(app.config.has('database'), false);
  });

  it('config-driven: sources options from Application.yaml AND loads sibling sets', async () => {
    const dir = await makeTempDir({ prefix: 'rapid-init-' });
    try {
      await writeTextFile(
        `${dir}/Application.yaml`,
        'name: from-config\nmode: DEVELOPMENT\n',
      );
      await writeTextFile(
        `${dir}/Database.yaml`,
        'host: db.example.com\nport: 5432\n',
      );
      const app = await Application.initialize(dir);
      // Options came from the Application set...
      asserts.assertEquals(app.option('name'), 'from-config');
      // ...and the sibling Database set is readable — the whole point.
      asserts.assertEquals(app.config.get('database.host'), 'db.example.com');
    } finally {
      await removeDir(dir, { recursive: true });
    }
  });

  it('rejects a direct construction that bypasses the private constructor', () => {
    // Reach past the compile-time private modifier — the runtime brand still guards.
    const Ctor = Application as unknown as new (...args: unknown[]) => unknown;
    asserts.assertThrows(
      () => new Ctor('not-the-brand', { name: 'x' }),
      Error,
      'Application.initialize',
    );
  });
});
