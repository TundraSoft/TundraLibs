/**
 * @module
 *
 * The dialect → engine-factory registry behind `new Norm({ database })`.
 *
 * `Norm.ts` used to `import { PostgresEngine, MariaEngine, SQLiteEngine,
 * MongoEngine }` and switch on `database.dialect`. Those four value
 * imports put every driver — including the NATIVE SQLite adapter, which
 * loads `bun:sqlite` / `@db/sqlite` / `better-sqlite3` — in the runtime
 * graph of anyone who imported norm at all, so bundling norm for an edge
 * runtime (Cloudflare Workers, Vite) failed to resolve those specifiers
 * before a single line ran.
 *
 * Now the switch is a `Map` lookup and each dialect's engine class lives
 * in its own side-effect module (`engines/<dialect>.ts`) that registers a
 * factory when — and only when — it is imported. The root `mod.ts` imports
 * all seven, so every existing consumer is unaffected;
 * `@tundralibs/norm/core` imports none, so an edge consumer pulls in
 * exactly the engine it asked for.
 *
 * @since 1.2.0
 */

import { NormError } from '../errors/mod.ts';
import type { AnySQLEngine } from '../executor.ts';
import type { MongoEngine } from '@tundralibs/drivers/mongo';

/**
 * Every dialect `new Norm({ database })` understands. Mirrors the
 * `dialect` discriminant of `DatabaseConfig` in `Norm.ts`; a dialect
 * listed here still has to be REGISTERED (by importing its
 * `engines/<dialect>.ts` module) before it can be constructed.
 *
 * Edge/Workers reach, by mechanism — three different reasons, not one:
 * `neon`, `turso` and `d1` are fetch-only (HTTP, no sockets needed at
 * all); `postgres` is TCP over `@tundralibs/compat/net`, which now has
 * a real Workers backend (`cloudflare:sockets`); `maria` wraps the
 * third-party `mariadb` driver directly, bypassing `compat` entirely,
 * and has worked on Workers independently of any of this. `sqlite`
 * needs a native binding on every runtime and is the one dialect the
 * root barrel does not register eagerly (see `mod.ts`). `mongo`'s
 * Workers behavior is unverified — treat it as unsupported until
 * someone checks.
 */
export type NormDialect =
  | 'postgres'
  | 'maria'
  | 'sqlite'
  | 'mongo'
  | 'neon'
  | 'turso'
  | 'd1';

/**
 * Builds a driver engine from the `database` config minus its `dialect`
 * key. Registered per dialect by the `engines/<dialect>.ts` modules; the
 * options are re-typed to the concrete engine's option type there.
 */
export type NormEngineFactory = (
  name: string,
  options: Record<string, unknown>,
) => AnySQLEngine | MongoEngine;

/** Module-private — the only mutable state in the registry. */
const ENGINE_FACTORIES: Map<string, NormEngineFactory> = new Map();

/** Import specifier that registers each dialect, quoted in the error. */
const ENGINE_MODULES: Readonly<Record<NormDialect, string>> = {
  postgres: '@tundralibs/norm/engines/postgres',
  maria: '@tundralibs/norm/engines/maria',
  sqlite: '@tundralibs/norm/engines/sqlite',
  mongo: '@tundralibs/norm/engines/mongo',
  neon: '@tundralibs/norm/engines/neon',
  turso: '@tundralibs/norm/engines/turso',
  d1: '@tundralibs/norm/engines/d1',
};

/**
 * Register the engine constructor for `dialect`. Called for its side
 * effect by each `engines/<dialect>.ts` module; re-registering a dialect
 * replaces the previous factory (importing a module twice is a no-op —
 * module evaluation is cached).
 *
 * Both type parameters are inferred from `factory`, so a registration
 * module names the concrete engine's own option type and never casts:
 * `O` from its options parameter, `E` from the engine it returns.
 *
 * `E` is constrained on the `Engine` label every driver engine carries
 * rather than on `AnySQLEngine | MongoEngine`, because the pool-free HTTP
 * engines (`NeonHttpEngine`, `TursoEngine`, `D1Engine`) narrow the
 * protected `_processOption` generic to their own options type and so are
 * not structurally assignable to any single instantiation of their own
 * base class. They ARE the right shape at runtime — norm drives them
 * through the same public surface as every other engine — so the
 * dialect-erasing cast below is where that gap is absorbed, once, instead
 * of in each edge registration module.
 *
 * @param dialect - The {@link NormDialect} this factory builds.
 * @param factory - Builds the engine from a Norm-generated instance name
 *   and the `database` config with `dialect` stripped.
 */
export function registerEngine<O, E extends { readonly Engine: string }>(
  dialect: NormDialect,
  factory: (name: string, options: O) => E,
): void {
  // The stored signature is dialect-erased; the call site in `Norm.ts`
  // hands over the `DatabaseConfig` branch that matches `dialect`, which
  // IS `O` by construction of the discriminated union.
  ENGINE_FACTORIES.set(dialect, factory as unknown as NormEngineFactory);
}

/**
 * Look up the factory for `dialect`.
 *
 * @param dialect - The `database.dialect` value, unvalidated.
 * @returns The registered {@link NormEngineFactory}.
 * @throws {NormError} `INVALID_ENGINE_CONFIG` when `dialect` is not one
 *   of the {@link NormDialect} values at all.
 * @throws {NormError} `ENGINE_NOT_REGISTERED` when `dialect` is valid but
 *   its engine module has not been imported — naming the exact import to
 *   add. This is what turns an edge build's silent, deploy-time failure
 *   ("`node:sqlite` polyfilled but `new DatabaseSync()` throws `Illegal
 *   constructor`") into an actionable error at construction.
 */
export function resolveEngineFactory(dialect: string): NormEngineFactory {
  const factory = ENGINE_FACTORIES.get(dialect);
  if (factory !== undefined) return factory;
  const known = Object.hasOwn(ENGINE_MODULES, dialect);
  if (!known) {
    throw new NormError(
      `new Norm({ database }): unknown dialect '${dialect}'`,
      { code: 'INVALID_ENGINE_CONFIG' },
    );
  }
  throw new NormError(
    `new Norm({ database }): dialect '${dialect}' has no registered ` +
      `engine — import '${
        ENGINE_MODULES[dialect as NormDialect]
      }' (or the root '@tundralibs/norm' barrel, which registers every ` +
      `dialect) before constructing Norm.`,
    { code: 'ENGINE_NOT_REGISTERED', dialect },
  );
}
