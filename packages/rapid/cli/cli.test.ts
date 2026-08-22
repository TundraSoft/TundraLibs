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
  it('scaffold() maps files by the toggles — ONE config file, by runtime', () => {
    const full = scaffold(
      {
        name: 'demo',
        module: true,
        norm: true,
        runtime: 'bun',
        docker: true,
        github: true,
        ai: false,
      },
      '1.2.3',
    );
    for (
      const f of [
        'main.ts',
        'configs/Application.yaml',
        'package.json',
        'modules/Greeter.ts',
        'models/mod.ts',
        'db.ts',
        'Dockerfile',
        '.dockerignore',
        '.github/workflows/ci.yml',
      ]
    ) {
      asserts.assert(f in full, `missing ${f}`);
    }
    // A bun project is NOT a deno project: no deno.json alongside.
    asserts.assert(
      !('deno.json' in full),
      'bun scaffold must not emit deno.json',
    );
    asserts.assertStringIncludes(full['Dockerfile']!, 'FROM tundrasoft/bun:');
    // S6-image contract: the app is started from ENV, never a CMD/ENTRYPOINT.
    asserts.assertStringIncludes(full['Dockerfile']!, 'ENV SCRIPT=start');
    asserts.assert(
      !/^(CMD|ENTRYPOINT)/m.test(full['Dockerfile']!),
      'no CMD/ENTRYPOINT',
    );
    asserts.assertStringIncludes(
      full['package.json']!,
      '"dev": "bun --watch main.ts"',
    );
    asserts.assertStringIncludes(
      full['package.json']!,
      'tundralibs__rapid@^1.2.3',
    );
    asserts.assertStringIncludes(
      full['.github/workflows/ci.yml']!,
      'oven-sh/setup-bun',
    );
    asserts.assertStringIncludes(full['main.ts']!, 'app.modules');

    const minimal = scaffold(
      {
        name: 'bare',
        module: false,
        norm: false,
        runtime: 'deno',
        docker: false,
        github: false,
        ai: false,
      },
      '1.0.0',
    );
    asserts.assert('deno.json' in minimal);
    asserts.assert(
      !('package.json' in minimal),
      'deno scaffold must not emit package.json',
    );
    asserts.assert(!('modules/Greeter.ts' in minimal));
    asserts.assert(!('Dockerfile' in minimal));
    asserts.assert(!('.github/workflows/ci.yml' in minimal));
    asserts.assertStringIncludes(
      minimal['deno.json']!,
      '@tundralibs/rapid@^1.0.0',
    );
    asserts.assertStringIncludes(minimal['main.ts']!, "app.get('/'");
  });

  it('scaffold() for deno Docker sets the TASK + ALLOW_* env contract', () => {
    const f = scaffold(
      {
        name: 'd',
        module: false,
        norm: false,
        runtime: 'deno',
        docker: true,
        github: true,
        ai: false,
      },
      '1.0.0',
    );
    asserts.assertStringIncludes(f['Dockerfile']!, 'FROM tundrasoft/deno:');
    asserts.assertStringIncludes(f['Dockerfile']!, 'TASK=start');
    asserts.assertStringIncludes(f['Dockerfile']!, 'ALLOW_NET=1');
    asserts.assertStringIncludes(
      f['.github/workflows/ci.yml']!,
      'denoland/setup-deno',
    );
    asserts.assertStringIncludes(
      f['.github/workflows/ci.yml']!,
      'deno test -A',
    );
  });

  it('scaffold() for node pins the image major tundrasoft/node actually publishes', () => {
    // tundrasoft/node builds the 5 newest LTS (all 24.x); only the newest gets
    // the <major> tag, so `:22` will never exist — a Dockerfile pinning it
    // would fail to pull. Pin 24, and keep setup-node in step.
    const f = scaffold(
      {
        name: 'n',
        module: false,
        norm: false,
        runtime: 'node',
        docker: true,
        github: true,
        ai: false,
      },
      '1.0.0',
    );
    asserts.assertStringIncludes(f['Dockerfile']!, 'FROM tundrasoft/node:24');
    asserts.assert(
      !f['Dockerfile']!.includes('node:22'),
      'the :22 tag is never published',
    );
    asserts.assertStringIncludes(
      f['.github/workflows/ci.yml']!,
      'node-version: 24',
    );
  });

  it('scaffold() --ai emits ONE AGENTS.md source + two pointers, runtime- and module-aware', () => {
    const f = scaffold(
      {
        name: 'aiapp',
        module: true,
        norm: false,
        runtime: 'bun',
        docker: false,
        github: false,
        ai: true,
      },
      '1.0.0',
    );
    for (
      const p of ['AGENTS.md', 'CLAUDE.md', '.github/copilot-instructions.md']
    ) {
      asserts.assert(p in f, `missing ${p}`);
    }
    const agents = f['AGENTS.md']!;
    // Single source: the pointers name AGENTS.md and carry no duplicated guidance.
    asserts.assertStringIncludes(f['CLAUDE.md']!, 'AGENTS.md');
    asserts.assertStringIncludes(
      f['.github/copilot-instructions.md']!,
      '/AGENTS.md',
    );
    asserts.assert(
      !f['CLAUDE.md']!.includes('colon-wrapped'),
      'pointer must not duplicate the guide',
    );
    // True for THIS project: its runtime commands, its name, its module layout.
    asserts.assertStringIncludes(agents, 'running on **bun**');
    asserts.assertStringIncludes(agents, 'bun run dev');
    asserts.assertStringIncludes(agents, '# aiapp');
    asserts.assertStringIncludes(agents, '## Modules');
    asserts.assertStringIncludes(agents, 'modules/Greeter.ts');
    // And rapid's real API facts, not generic advice.
    asserts.assertStringIncludes(agents, '/users/:id:');
    asserts.assertStringIncludes(agents, 'Application.initialize');
    asserts.assertStringIncludes(agents, 'validated()');
    asserts.assert(
      !agents.includes('deno task'),
      'bun project must not show deno commands',
    );
    // Package lookup is NEED-first (the names aren't self-describing): a table
    // row maps the job to the full specifier, and each shape leads with the job.
    asserts.assertMatch(
      agents,
      /\| Validate input[^|]*\| `@tundralibs\/guardian`/,
    );
    asserts.assertMatch(agents, /\| Authentication[^|]*\| `@tundralibs\/pact`/);
    asserts.assertStringIncludes(
      agents,
      '**Validation — `@tundralibs/guardian`.**',
    );
    asserts.assert(
      !agents.includes('- **guardian** —'),
      'shapes must lead with the job, not the bare package name',
    );

    // No module system → no Modules section; deno → deno commands; --ai off → no files.
    const plain = scaffold(
      {
        name: 'p',
        module: false,
        norm: false,
        runtime: 'deno',
        docker: false,
        github: false,
        ai: true,
      },
      '1.0.0',
    );
    asserts.assert(!plain['AGENTS.md']!.includes('## Modules'));
    asserts.assertStringIncludes(plain['AGENTS.md']!, 'deno task test');
    const off = scaffold(
      {
        name: 'o',
        module: true,
        norm: false,
        runtime: 'deno',
        docker: false,
        github: false,
        ai: false,
      },
      '1.0.0',
    );
    asserts.assert(!('AGENTS.md' in off) && !('CLAUDE.md' in off));
  });

  it('scaffold() for workers emits wrangler.toml + worker.ts, never a Dockerfile', () => {
    const f = scaffold(
      {
        name: 'edge',
        module: true,
        norm: false,
        runtime: 'workers',
        docker: true,
        github: true,
        ai: false,
      },
      '1.0.0',
    );
    asserts.assert('wrangler.toml' in f);
    asserts.assert('worker.ts' in f);
    asserts.assert(!('main.ts' in f), 'workers uses worker.ts, not main.ts');
    asserts.assert(
      !('Dockerfile' in f),
      'no container for workers, even with docker:true',
    );
    asserts.assertStringIncludes(
      f['worker.ts']!,
      'fetch: (request: Request) => app.fetch(request)',
    );
    asserts.assertStringIncludes(
      f['worker.ts']!,
      'app.modules({ modules: [modules] })',
    );
    asserts.assertStringIncludes(f['wrangler.toml']!, 'name = "edge"');
    asserts.assertStringIncludes(f['package.json']!, '"wrangler"');
    asserts.assertStringIncludes(
      f['.github/workflows/ci.yml']!,
      'wrangler deploy --dry-run',
    );
  });

  it('initCommand writes the project tree under a base dir (no cwd juggling)', async () => {
    const base = await makeTempDir({ prefix: 'rapid-init-' });
    try {
      const code = await initCommand(
        {
          _: ['sample'],
          module: true,
          norm: false,
          runtime: 'deno',
          docker: false,
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

  it('initCommand refuses to overwrite an existing project', async () => {
    const base = await makeTempDir({ prefix: 'rapid-init-dup-' });
    try {
      const args = { _: ['twice'], yes: true };
      asserts.assertEquals(await initCommand(args, base), 0);
      // Second run into the same base with the same name hits the guard.
      asserts.assertEquals(await initCommand(args, base), 1);
    } finally {
      await removeDir(base, { recursive: true });
    }
  });

  it('initCommand rejects a name with path separators (no escape write)', async () => {
    const base = await makeTempDir({ prefix: 'rapid-init-esc-' });
    try {
      asserts.assertEquals(
        await initCommand({ _: ['../escape'], yes: true }, base),
        1,
      );
      // The guard fires before any write — base stays empty of the escape.
      asserts.assert(!(await pathExists(`${base}/../escape`)));
    } finally {
      await removeDir(base, { recursive: true });
    }
  });

  it('initCommand rejects an empty name (would write to the filesystem root)', async () => {
    const base = await makeTempDir({ prefix: 'rapid-init-empty-' });
    try {
      // A bare `""` positional skips the default and, unguarded, makes `root`
      // empty → writes at `/`. The guard must reject it.
      asserts.assertEquals(
        await initCommand({ _: [''], yes: true }, base),
        1,
      );
    } finally {
      await removeDir(base, { recursive: true });
    }
  });
});

describe('rapid.cli health', () => {
  it('reports 0 for a healthy app, 1 for a bad path', async () => {
    const app = await Application.initialize({
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

  it('returns 1 when the app is unreachable (fetch throws)', async () => {
    // Nothing listens on port 1 — the fetch rejects, hitting the catch.
    asserts.assertEquals(
      await healthCommand('http://127.0.0.1:1', { path: '/health' }),
      1,
    );
  });
});
