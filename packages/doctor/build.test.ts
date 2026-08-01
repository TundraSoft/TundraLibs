/**
 * @fileoverview Tests for the `build` codegen — scanning `@Vial` classes and
 * rendering the `VialRegistry` augmentation.
 *
 * @module
 */

import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { build, relativeImport, render, scan } from './build.ts';

describe({
  name: 'build',
  // The `build` codegen scans source with Deno.readDir/stat/readTextFile and
  // writeTextFile and is documented as Deno-only; Bun and Node have no `Deno`
  // global, so this suite runs on Deno only.
  bun: false,
  node: false,
  fn: () => {
    describe('relativeImport', () => {
      it('resolves a sibling file', () => {
        asserts.assertEquals(
          relativeImport('a/registry.ts', 'a/Config.ts'),
          './Config.ts',
        );
      });

      it('resolves a nested file', () => {
        asserts.assertEquals(
          relativeImport('a/registry.ts', 'a/b/Config.ts'),
          './b/Config.ts',
        );
      });

      it('resolves a file in a parent directory', () => {
        asserts.assertEquals(
          relativeImport('a/b/registry.ts', 'a/Config.ts'),
          '../Config.ts',
        );
      });
    });

    describe('scan', () => {
      it('finds @Vial classes by class name, including factory options', async () => {
        const dir = await Deno.makeTempDir();
        try {
          await Deno.writeTextFile(
            `${dir}/Config.ts`,
            `@Vial('SINGLETON')\nexport class Config {}\n`,
          );
          await Deno.writeTextFile(
            `${dir}/Db.ts`,
            `@Vial({ mode: 'SCOPED', factory: () => new Db('x') })\nexport class Db {}\n`,
          );
          await Deno.writeTextFile(
            `${dir}/plain.ts`,
            `export class NotAVial {}\n`,
          );
          const tokens = (await scan([dir])).map((s) => s.token).sort();
          asserts.assertEquals(tokens, ['Config', 'Db']);
        } finally {
          await Deno.remove(dir, { recursive: true });
        }
      });

      it('ignores @Vial in comments, strings, and JSDoc examples', async () => {
        const dir = await Deno.makeTempDir();
        try {
          await Deno.writeTextFile(
            `${dir}/Mixed.ts`,
            [
              `// TODO: add @Vial('SINGLETON') here later`,
              `export class Helper {}`,
              `/**`,
              ` * @example`,
              ` * @Vial('SINGLETON')`,
              ` * class DocOnly {}`,
              ` */`,
              `const note = "@Vial('TRANSIENT') class Stringy {}";`,
              `const tpl = \`@Vial('SCOPED') class Templated {}\`;`,
              `@Vial('SINGLETON')`,
              `export class Real {}`,
              ``,
            ].join('\n'),
          );
          const tokens = (await scan([dir])).map((s) => s.token);
          asserts.assertEquals(tokens, ['Real']);
        } finally {
          await Deno.remove(dir, { recursive: true });
        }
      });

      it('does not bind a stray @Vial( across unrelated code to a later class', async () => {
        const dir = await Deno.makeTempDir();
        try {
          // A `@Vial(...)` not directly followed by a class declaration
          // (only other decorators / export / default / abstract may
          // intervene) must not swallow code and claim the next class.
          await Deno.writeTextFile(
            `${dir}/Gap.ts`,
            [
              `const ref = [@Vial('SINGLETON')];`,
              `export class Bystander {}`,
              ``,
            ].join('\n'),
          );
          asserts.assertEquals(await scan([dir]), []);
        } finally {
          await Deno.remove(dir, { recursive: true });
        }
      });

      it('tolerates stacked decorators, keywords, and nested factory parens', async () => {
        const dir = await Deno.makeTempDir();
        try {
          await Deno.writeTextFile(
            `${dir}/Stacked.ts`,
            [
              `@Vial({ mode: 'SCOPED', factory: () => new Db(getUrl()) })`,
              `@Other('x')`,
              `export abstract class Db {}`,
              ``,
            ].join('\n'),
          );
          const tokens = (await scan([dir])).map((s) => s.token);
          asserts.assertEquals(tokens, ['Db']);
        } finally {
          await Deno.remove(dir, { recursive: true });
        }
      });

      it('excludes *.test.ts and *.bench.ts files from the walk', async () => {
        const dir = await Deno.makeTempDir();
        try {
          await Deno.writeTextFile(
            `${dir}/Real.ts`,
            `@Vial('SINGLETON')\nexport class Real {}\n`,
          );
          await Deno.writeTextFile(
            `${dir}/Fixture.test.ts`,
            `@Vial('SINGLETON')\nexport class TestOnly {}\n`,
          );
          await Deno.writeTextFile(
            `${dir}/Fixture.bench.ts`,
            `@Vial('SINGLETON')\nexport class BenchOnly {}\n`,
          );
          const tokens = (await scan([dir])).map((s) => s.token);
          asserts.assertEquals(tokens, ['Real']);
        } finally {
          await Deno.remove(dir, { recursive: true });
        }
      });

      it('skips the output file itself', async () => {
        const dir = await Deno.makeTempDir();
        try {
          const out = `${dir}/vial-registry.ts`;
          await Deno.writeTextFile(
            `${dir}/Config.ts`,
            `@Vial('SINGLETON')\nexport class Config {}\n`,
          );
          // A stale registry that mentions `@Vial(` in a comment must not
          // re-feed itself.
          await Deno.writeTextFile(
            out,
            `// generated for @Vial( class Ghost {}\n`,
          );
          const tokens = (await scan([dir], out)).map((s) => s.token);
          asserts.assertEquals(tokens, ['Config']);
        } finally {
          await Deno.remove(dir, { recursive: true });
        }
      });
    });

    describe('render', () => {
      it('emits a sorted, deduped VialRegistry augmentation', () => {
        const out = render(
          [
            { token: 'Logger', className: 'Logger', file: 'src/Logger.ts' },
            { token: 'Config', className: 'Config', file: 'src/Config.ts' },
          ],
          'src/registry.ts',
          '@tundralibs/doctor',
        );
        asserts.assertStringIncludes(
          out,
          `import type { Config } from './Config.ts';`,
        );
        asserts.assertStringIncludes(
          out,
          `import type { Logger } from './Logger.ts';`,
        );
        asserts.assertStringIncludes(
          out,
          `declare module '@tundralibs/doctor'`,
        );
        asserts.assertStringIncludes(out, `interface VialRegistry`);
        // Sorted: Config before Logger.
        asserts.assert(
          out.indexOf('Config: Config;') < out.indexOf('Logger: Logger;'),
        );
      });

      it('honours a custom module specifier', () => {
        const out = render(
          [{ token: 'Config', className: 'Config', file: 'a/Config.ts' }],
          'a/registry.ts',
          '../mod.ts',
        );
        asserts.assertStringIncludes(out, `declare module '../mod.ts'`);
      });
    });

    describe('build', () => {
      it('writes the registry file and returns the discovered sites', async () => {
        const dir = await Deno.makeTempDir();
        try {
          await Deno.writeTextFile(
            `${dir}/Config.ts`,
            `@Vial('SINGLETON')\nexport class Config {}\n`,
          );
          const out = `${dir}/vial-registry.ts`;
          const sites = await build({ roots: [dir], out });
          asserts.assertEquals(sites.map((s) => s.token), ['Config']);
          const written = await Deno.readTextFile(out);
          asserts.assertStringIncludes(written, 'Config: Config;');
          asserts.assertStringIncludes(written, `import type { Config }`);
        } finally {
          await Deno.remove(dir, { recursive: true });
        }
      });
    });
  },
});
