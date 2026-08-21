/**
 * @fileoverview The CLI — the modules generator (static-parse), the init
 * scaffold, and health end-to-end. upgrade's network bump isn't exercised
 * here (its regex is covered indirectly).
 * @module
 */
import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import {
  makeTempDir,
  pathExists,
  readTextFile,
  removeDir,
  writeTextFile,
} from '@tundralibs/compat/file';
import { Application } from '../Application.ts';
import {
  exportedClasses,
  generateBarrel,
  modulesCommand,
} from './commands/modules.ts';
import { healthCommand } from './commands/health.ts';
import { initCommand } from './commands/init.ts';
import { scaffold } from './templates.ts';

describe('rapid.cli modules generator', () => {
  it('exportedClasses picks concrete classes and skips abstract bases', () => {
    const src = [
      'export abstract class Base extends RapidModule {}',
      'export class Users extends Base {}',
      'class Hidden {}',
      'export class Posts extends Base {}',
    ].join('\n');
    asserts.assertEquals(exportedClasses(src), ['Users', 'Posts']);
  });

  it('generateBarrel emits sorted re-exports, skipping the base, tests and mod.ts', async () => {
    const dir = await makeTempDir({ prefix: 'rapid-cli-' });
    try {
      await writeTextFile(
        `${dir}/AppModule.ts`,
        'export abstract class AppModule {}',
      );
      await writeTextFile(`${dir}/Posts.ts`, 'export class Posts {}');
      await writeTextFile(`${dir}/Users.ts`, 'export class Users {}');
      await writeTextFile(`${dir}/Users.test.ts`, 'export class Nope {}');
      await writeTextFile(`${dir}/mod.ts`, 'old');
      const barrel = await generateBarrel(dir);
      asserts.assertStringIncludes(barrel, 'do not edit by hand');
      asserts.assertEquals(
        barrel.trim().split('\n').filter((l) => l.startsWith('export')),
        [
          `export { Posts } from './Posts.ts';`,
          `export { Users } from './Users.ts';`,
        ],
      );
      // write, then --check is clean; mutate → --check fails
      asserts.assertEquals(await modulesCommand(dir), 0);
      asserts.assertEquals(await modulesCommand(dir, { check: true }), 0);
      await writeTextFile(`${dir}/New.ts`, 'export class New {}');
      asserts.assertEquals(await modulesCommand(dir, { check: true }), 1);
    } finally {
      await removeDir(dir, { recursive: true });
    }
  });
});

describe('rapid.cli init scaffold', () => {
  it('scaffold() maps files by the toggles', () => {
    const full = scaffold(
      { name: 'demo', module: true, norm: true, docker: true, runtime: 'bun' },
      '1.2.3',
    );
    for (
      const f of [
        'main.ts',
        'configs/Application.yaml',
        'deno.json',
        'package.json',
        'modules/Greeter.ts',
        'models/mod.ts',
        'db.ts',
        'Dockerfile',
        '.dockerignore',
      ]
    ) {
      asserts.assert(f in full, `missing ${f}`);
    }
    asserts.assertStringIncludes(full['Dockerfile']!, 'tundrasoft/bun');
    asserts.assertStringIncludes(
      full['deno.json']!,
      '@tundralibs/rapid@^1.2.3',
    );
    asserts.assertStringIncludes(full['main.ts']!, 'app.modules');

    const minimal = scaffold(
      {
        name: 'bare',
        module: false,
        norm: false,
        docker: false,
        runtime: 'deno',
      },
      '1.0.0',
    );
    asserts.assert(!('modules/Greeter.ts' in minimal));
    asserts.assert(!('Dockerfile' in minimal));
    asserts.assertStringIncludes(minimal['main.ts']!, "app.get('/'");
  });

  it('initCommand writes the project tree under a base dir (no cwd juggling)', async () => {
    const base = await makeTempDir({ prefix: 'rapid-init-' });
    try {
      const code = await initCommand(
        {
          _: ['sample'],
          module: true,
          norm: false,
          docker: false,
          git: false,
          yes: true,
        },
        base,
      );
      asserts.assertEquals(code, 0);
      asserts.assert(await pathExists(`${base}/sample/main.ts`));
      asserts.assert(await pathExists(`${base}/sample/modules/Greeter.ts`));
      asserts.assertStringIncludes(
        await readTextFile(`${base}/sample/configs/Application.yaml`),
        'name: sample',
      );
    } finally {
      await removeDir(base, { recursive: true });
    }
  });
});

describe('rapid.cli health', () => {
  it('reports 0 for a healthy app, 1 for a bad path', async () => {
    const app = new Application({
      name: 'cli-health',
      server: { port: 0, hostname: '127.0.0.1' },
      logger: { handlers: [] },
      uploads: { path: '/tmp/rapid-cli-health' },
    });
    app.get('/health', () => ({ content: 'ok' }));
    await app.start();
    try {
      const base = `http://127.0.0.1:${app.port}`;
      asserts.assertEquals(await healthCommand(base, { path: '/health' }), 0);
      asserts.assertEquals(await healthCommand(base, { path: '/nope' }), 1);
    } finally {
      await app.stop();
    }
  });
});
