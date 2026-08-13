/**
 * Engine registry: registration, lookup, and the two failure modes
 * (`unknown dialect` vs `known dialect, module never imported`). Plus the
 * invariant the whole registry exists for — nothing in `core.ts`'s
 * RUNTIME import graph reaches a native database binding.
 */

import { describe, it } from '@tundralibs/compat/test';
import * as asserts from '@std/asserts';
import { NormError } from '../errors/mod.ts';
import {
  type NormDialect,
  registerEngine,
  resolveEngineFactory,
} from './registry.ts';

const ALL_DIALECTS: readonly NormDialect[] = [
  'postgres',
  'maria',
  'sqlite',
  'mongo',
  'neon',
  'turso',
  'd1',
];

/**
 * A registry instance nothing else has touched. Test files share module
 * state inside one runner process, and any file that imports the root
 * barrel registers all seven dialects — so the "not registered" paths are
 * exercised on a fresh module instance, obtained with a cache-busting
 * query string. `../errors/mod.ts` is imported WITHOUT the query, so the
 * fresh copy throws the same `NormError` class.
 */
function freshRegistry(): Promise<typeof import('./registry.ts')> {
  const nonce = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return import(`./registry.ts?case=${nonce}`) as Promise<
    typeof import('./registry.ts')
  >;
}

/** Minimal stand-in with the one member the registry's factory
 * constraint requires. */
const fakeEngine = (label: string) => ({ Engine: label });

describe('norm.engines.registry', () => {
  it('a known dialect with no engine module imported throws an actionable NormError', async () => {
    const { resolveEngineFactory: resolve } = await freshRegistry();
    const err = asserts.assertThrows(
      () => resolve('d1'),
      NormError,
    ) as NormError;
    asserts.assertEquals(err.code, 'ENGINE_NOT_REGISTERED');
    // The message must name the exact import that fixes it — this is the
    // whole point of failing loudly instead of resolving a driver that
    // cannot run on the target runtime.
    asserts.assertStringIncludes(err.message, `'d1'`);
    asserts.assertStringIncludes(
      err.message,
      '@tundralibs/norm/engines/d1',
    );
    asserts.assertStringIncludes(err.message, '@tundralibs/norm');
    asserts.assertEquals(
      (err.context as { dialect?: string }).dialect,
      'd1',
    );
  });

  it('every dialect reports its own engine module in the error', async () => {
    const { resolveEngineFactory: resolve } = await freshRegistry();
    for (const dialect of ALL_DIALECTS) {
      const err = asserts.assertThrows(
        () => resolve(dialect),
        NormError,
      ) as NormError;
      asserts.assertEquals(err.code, 'ENGINE_NOT_REGISTERED');
      asserts.assertStringIncludes(
        err.message,
        `@tundralibs/norm/engines/${dialect}`,
      );
    }
  });

  it('a dialect that does not exist at all keeps the original message', async () => {
    const { resolveEngineFactory: resolve } = await freshRegistry();
    const err = asserts.assertThrows(
      () => resolve('oracle'),
      NormError,
    ) as NormError;
    asserts.assertEquals(err.code, 'INVALID_ENGINE_CONFIG');
    asserts.assertStringIncludes(err.message, `unknown dialect 'oracle'`);
  });

  it('a registered factory is returned and receives name + options', async () => {
    const { registerEngine: register, resolveEngineFactory: resolve } =
      await freshRegistry();
    const seen: Array<[string, unknown]> = [];
    register('turso', (name: string, options: { url: string }) => {
      seen.push([name, options]);
      return fakeEngine('TURSO');
    });
    const factory = resolve('turso');
    const engine = factory('norm-7', { url: 'libsql://x' });
    asserts.assertEquals(seen, [['norm-7', { url: 'libsql://x' }]]);
    asserts.assertEquals(
      (engine as unknown as { Engine: string }).Engine,
      'TURSO',
    );
    // Registering one dialect must not register any other.
    asserts.assertThrows(() => resolve('neon'), NormError);
  });

  it('re-registering a dialect replaces the previous factory', async () => {
    const { registerEngine: register, resolveEngineFactory: resolve } =
      await freshRegistry();
    register('neon', () => fakeEngine('FIRST'));
    register('neon', () => fakeEngine('SECOND'));
    const engine = resolve('neon')('norm-1', {});
    asserts.assertEquals(
      (engine as unknown as { Engine: string }).Engine,
      'SECOND',
    );
  });

  it('the root barrel registers all seven dialects', async () => {
    // The shared (statically imported) registry — importing the root
    // barrel is exactly what an existing consumer does.
    await import('../mod.ts');
    for (const dialect of ALL_DIALECTS) {
      asserts.assertEquals(
        typeof resolveEngineFactory(dialect),
        'function',
        `${dialect} should be registered by the root barrel`,
      );
    }
  });

  it('registerEngine is exported for callers registering their own engine', () => {
    asserts.assertEquals(typeof registerEngine, 'function');
  });
});

describe({
  name: 'norm.engines.registry - core.ts import graph',
  // `deno info` is the graph oracle; Bun/Node have no equivalent.
  deno: true,
  bun: false,
  node: false,
  fn: () => {
    it('core.ts reaches no native database binding at runtime', async () => {
      const entry = new URL('../core.ts', import.meta.url).href;
      const { stdout, code } = await new Deno.Command('deno', {
        args: ['info', '--json', entry],
        stdout: 'piped',
        stderr: 'piped',
      }).output();
      asserts.assertEquals(code, 0, '`deno info --json core.ts` failed');
      const info = JSON.parse(new TextDecoder().decode(stdout)) as {
        roots: string[];
        modules: Array<
          {
            specifier: string;
            dependencies?: Array<{ code?: { specifier?: string } }>;
          }
        >;
      };
      // Walk CODE edges only: `import type` edges are erased by the TS ->
      // JS compile and never reach a bundler, which is exactly why
      // `Norm.ts` may keep type-only imports of the engine option types.
      const bySpec = new Map(info.modules.map((m) => [m.specifier, m]));
      const reachable = new Set<string>([info.roots[0]!]);
      const queue = [info.roots[0]!];
      while (queue.length) {
        for (const dep of bySpec.get(queue.shift()!)?.dependencies ?? []) {
          const next = dep.code?.specifier;
          if (!next || reachable.has(next)) continue;
          reachable.add(next);
          queue.push(next);
        }
      }
      const forbidden = [...reachable].filter((spec) =>
        /^bun:sqlite$/.test(spec) ||
        /@db\/sqlite/.test(spec) || /\bsqlite_deno\b/.test(spec) ||
        /better-sqlite3/.test(spec) ||
        /(^|\/)mariadb(@|\/|$)/.test(spec) ||
        /(^|\/)mongodb(@|\/|$)/.test(spec)
      );
      asserts.assertEquals(
        forbidden,
        [],
        `@tundralibs/norm/core must not pull a database driver into the ` +
          `runtime graph — a value import crept back into the barrel`,
      );
      // Sanity: the walk actually visited the package.
      asserts.assertEquals(reachable.size > 10, true);
    });
  },
});
