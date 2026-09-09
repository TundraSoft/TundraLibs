/**
 * @fileoverview Tests for the norm CLI — the manifest/markdown merge
 * helpers and the `init` scaffold end to end, against real temp
 * directories (no mocking @tundralibs/compat/file).
 * @module
 */
import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import {
  makeDir,
  makeTempDir,
  pathExists,
  readTextFile,
  removeDir,
  writeTextFile,
} from '@tundralibs/compat/file';
import { ensureManifest } from './manifest.ts';
import { ensureSection } from './markdown.ts';
import { render } from './templates.ts';
import { initCommand } from './commands/init.ts';
import { pingCommand } from './commands/ping.ts';
import { upgradeCommand } from './commands/upgrade.ts';
import { run } from './mod.ts';

const withTempDir = async (
  fn: (dir: string) => Promise<void>,
): Promise<void> => {
  const dir = await makeTempDir({ prefix: 'norm-cli-' });
  try {
    await fn(dir);
  } finally {
    await removeDir(dir, { recursive: true });
  }
};

describe('norm.cli render', () => {
  it('replaces every {{token}} from vars', () => {
    asserts.assertEquals(
      render('hello {{name}}, v{{version}}', { name: 'norm', version: '1' }),
      'hello norm, v1',
    );
  });

  it('replaces an unmatched token with an empty string', () => {
    asserts.assertEquals(render('{{missing}}x', {}), 'x');
  });
});

describe('norm.cli manifest merge', () => {
  const spec = {
    depsKey: 'imports' as const,
    deps: { '@tundralibs/norm': 'jsr:@tundralibs/norm@^1' },
    tasksKey: 'tasks' as const,
    tasks: { test: 'deno test -A' },
  };

  it('writes the skeleton when the manifest does not exist', async () => {
    await withTempDir(async (dir) => {
      const path = `${dir}/deno.json`;
      const status = await ensureManifest(path, '{"name":"skeleton"}', spec);
      asserts.assertEquals(status, 'created');
      asserts.assertEquals(
        JSON.parse(await readTextFile(path)),
        { name: 'skeleton' },
      );
    });
  });

  it('adds only the missing deps/tasks, leaving unrelated keys untouched', async () => {
    await withTempDir(async (dir) => {
      const path = `${dir}/deno.json`;
      await writeTextFile(
        path,
        JSON.stringify(
          { name: 'existing', imports: { other: 'jsr:@x/other@^2' } },
          null,
          2,
        ),
      );
      const status = await ensureManifest(path, 'unused', spec);
      asserts.assertEquals(status, 'merged');
      const manifest = JSON.parse(await readTextFile(path));
      asserts.assertEquals(manifest.name, 'existing');
      asserts.assertEquals(manifest.imports.other, 'jsr:@x/other@^2');
      asserts.assertEquals(
        manifest.imports['@tundralibs/norm'],
        'jsr:@tundralibs/norm@^1',
      );
      asserts.assertEquals(manifest.tasks.test, 'deno test -A');
    });
  });

  it('leaves the file untouched when every dep/task is already present', async () => {
    await withTempDir(async (dir) => {
      const path = `${dir}/deno.json`;
      const original = JSON.stringify({
        name: 'existing',
        imports: { '@tundralibs/norm': 'jsr:@tundralibs/norm@^9.9.9' },
        tasks: { test: 'a custom test command' },
      });
      await writeTextFile(path, original);
      const status = await ensureManifest(path, 'unused', spec);
      asserts.assertEquals(status, 'unchanged');
      // Never rewrites an existing value, even one that differs from `spec`.
      asserts.assertEquals(await readTextFile(path), original);
    });
  });
});

describe('norm.cli markdown merge', () => {
  it('writes a fresh wrapped section when the file does not exist', async () => {
    await withTempDir(async (dir) => {
      const path = `${dir}/CLAUDE.md`;
      const status = await ensureSection(path, 'norm guide');
      asserts.assertEquals(status, 'created');
      const content = await readTextFile(path);
      asserts.assertStringIncludes(content, '<!-- norm:start -->');
      asserts.assertStringIncludes(content, 'norm guide');
      asserts.assertStringIncludes(content, '<!-- norm:end -->');
    });
  });

  it('appends the section to existing content without disturbing it', async () => {
    await withTempDir(async (dir) => {
      const path = `${dir}/CLAUDE.md`;
      await writeTextFile(path, '# My project\n\nHand-written notes.\n');
      const status = await ensureSection(path, 'norm guide');
      asserts.assertEquals(status, 'appended');
      const content = await readTextFile(path);
      asserts.assertStringIncludes(content, 'Hand-written notes.');
      asserts.assertStringIncludes(content, '<!-- norm:start -->');
    });
  });

  it('does not append a second copy on rerun', async () => {
    await withTempDir(async (dir) => {
      const path = `${dir}/CLAUDE.md`;
      await ensureSection(path, 'norm guide');
      const status = await ensureSection(path, 'norm guide');
      asserts.assertEquals(status, 'unchanged');
      const content = await readTextFile(path);
      asserts.assertEquals(
        content.split('<!-- norm:start -->').length - 1,
        1,
      );
    });
  });
});

describe('norm.cli init', () => {
  it('scaffolds a fresh project: models, dialect-agnostic db.ts/config, both manifests, AI guides', async () => {
    await withTempDir(async (dir) => {
      asserts.assertEquals(
        await initCommand({ _: [], yes: true }, dir),
        0,
      );

      asserts.assert(await pathExists(`${dir}/models/Users.ts`));
      asserts.assert(await pathExists(`${dir}/models/mod.ts`));

      const normYaml = await readTextFile(`${dir}/configs/Norm.yaml`);
      asserts.assertStringIncludes(normYaml, 'dialect: sqlite');
      asserts.assertStringIncludes(normYaml, 'NORM_DB:');

      const db = await readTextFile(`${dir}/db.ts`);
      asserts.assertStringIncludes(db, 'loadConfig({ path: configDir');
      asserts.assertStringIncludes(db, "config.get('norm.NORM_DB')");
      // db.ts is dialect-agnostic — never mentions a specific dialect.
      asserts.assert(!db.includes('postgres'));

      const denoJson = JSON.parse(await readTextFile(`${dir}/deno.json`));
      asserts.assertEquals(denoJson.name, 'my-norm-project');
      asserts.assert('@tundralibs/norm' in denoJson.imports);
      asserts.assertEquals(denoJson.tasks.check, 'deno check db.ts');

      const packageJson = JSON.parse(
        await readTextFile(`${dir}/package.json`),
      );
      asserts.assert('@tundralibs/norm' in packageJson.dependencies);
      asserts.assertEquals(
        packageJson.scripts.test,
        'node --import tsx --test',
      );

      asserts.assertStringIncludes(
        await readTextFile(`${dir}/CLAUDE.md`),
        '<!-- norm:start -->',
      );
      asserts.assertStringIncludes(
        await readTextFile(`${dir}/AGENTS.md`),
        '<!-- norm:start -->',
      );
    });
  });

  it('never overwrites an existing configs/Norm.yaml', async () => {
    await withTempDir(async (dir) => {
      await makeDir(`${dir}/configs`, { recursive: true });
      const customYaml = 'NORM_DB:\n  dialect: postgres\n  host: prod-db\n';
      await writeTextFile(`${dir}/configs/Norm.yaml`, customYaml);

      await initCommand({ _: [], yes: true }, dir);

      asserts.assertEquals(
        await readTextFile(`${dir}/configs/Norm.yaml`),
        customYaml,
      );
    });
  });

  it('never overwrites an existing db.ts or models file', async () => {
    await withTempDir(async (dir) => {
      await writeTextFile(`${dir}/db.ts`, '// hand-wired connection\n');
      await makeDir(`${dir}/models`, { recursive: true });
      await writeTextFile(
        `${dir}/models/Users.ts`,
        '// hand-written entity\n',
      );

      await initCommand({ _: [], yes: true }, dir);

      asserts.assertEquals(
        await readTextFile(`${dir}/db.ts`),
        '// hand-wired connection\n',
      );
      asserts.assertEquals(
        await readTextFile(`${dir}/models/Users.ts`),
        '// hand-written entity\n',
      );
    });
  });

  it('picks up the project name from an existing manifest instead of prompting', async () => {
    await withTempDir(async (dir) => {
      await writeTextFile(
        `${dir}/package.json`,
        JSON.stringify({ name: 'acme-schema', dependencies: {} }, null, 2),
      );

      await initCommand({ _: [], yes: true }, dir);

      const packageJson = JSON.parse(
        await readTextFile(`${dir}/package.json`),
      );
      asserts.assertEquals(packageJson.name, 'acme-schema');
      asserts.assertEquals(packageJson.dependencies.tsx, '^4');
      // deno.json didn't exist yet — still gets created, with the SAME name.
      const denoJson = JSON.parse(await readTextFile(`${dir}/deno.json`));
      asserts.assertEquals(denoJson.name, 'acme-schema');
    });
  });

  it('is idempotent — a second run adds nothing further', async () => {
    await withTempDir(async (dir) => {
      await initCommand({ _: [], yes: true }, dir);
      const before = await readTextFile(`${dir}/CLAUDE.md`);

      await initCommand({ _: [], yes: true }, dir);

      asserts.assertEquals(await readTextFile(`${dir}/CLAUDE.md`), before);
    });
  });
});

describe('norm.cli upgrade', () => {
  it('bumps a deno.json @tundralibs/* version to the latest release', async () => {
    await withTempDir(async (dir) => {
      const path = `${dir}/deno.json`;
      await writeTextFile(
        path,
        JSON.stringify({
          imports: { '@tundralibs/norm': 'jsr:@tundralibs/norm@^0.0.1' },
        }),
      );
      asserts.assertEquals(await upgradeCommand(dir), 0);
      const after = await readTextFile(path);
      // 0.0.1 predates every real release — a real bump moves off it.
      asserts.assert(!after.includes('@^0.0.1'));
    });
  });

  it('bumps a package.json npm-style @tundralibs/* version too', async () => {
    await withTempDir(async (dir) => {
      const path = `${dir}/package.json`;
      await writeTextFile(
        path,
        JSON.stringify({
          dependencies: {
            '@tundralibs/utils': 'npm:@jsr/tundralibs__utils@^0.0.1',
          },
        }),
      );
      asserts.assertEquals(await upgradeCommand(dir), 0);
      asserts.assert(!(await readTextFile(path)).includes('@^0.0.1'));
    });
  });

  it('reports success with nothing to change when neither manifest exists', async () => {
    await withTempDir(async (dir) => {
      asserts.assertEquals(await upgradeCommand(dir), 0);
    });
  });
});

describe('norm.cli ping', () => {
  it('exits 1 with a clear message when configs/Norm.yaml is missing', async () => {
    await withTempDir(async (dir) => {
      asserts.assertEquals(await pingCommand(dir), 1);
    });
  });

  it('exits 1 without a real network attempt when required fields are missing', async () => {
    await withTempDir(async (dir) => {
      await makeDir(`${dir}/configs`, { recursive: true });
      // postgres requires host/username/database — none supplied, so this
      // must fail fast at validation, never dial a socket.
      await writeTextFile(
        `${dir}/configs/Norm.yaml`,
        'NORM_DB:\n  dialect: postgres\n',
      );
      asserts.assertEquals(await pingCommand(dir), 1);
    });
  });

  it('connects and disconnects cleanly for a valid sqlite config', async () => {
    await withTempDir(async (dir) => {
      await makeDir(`${dir}/configs`, { recursive: true });
      await writeTextFile(
        `${dir}/configs/Norm.yaml`,
        `NORM_DB:\n  dialect: sqlite\n  path: ${dir}/data\n`,
      );
      asserts.assertEquals(await pingCommand(dir), 0);
    });
  });
});

describe('norm.cli dispatcher', () => {
  it('prints help and exits 0 for a bare/help invocation', async () => {
    asserts.assertEquals(await run({ _: [] }), 0);
    asserts.assertEquals(await run({ _: ['help'] }), 0);
  });

  it('exits 1 for an unknown command', async () => {
    asserts.assertEquals(await run({ _: ['nope'] }), 1);
  });

  it('dispatches upgrade and ping to their commands', async () => {
    await withTempDir(async (dir) => {
      asserts.assertEquals(await run({ _: ['upgrade'], dir }), 0);
      asserts.assertEquals(await run({ _: ['ping', dir] }), 1);
    });
  });
});
