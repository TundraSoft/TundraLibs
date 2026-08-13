/**
 * @module
 *
 * Registers the `postgres` dialect. Import for its side effect:
 *
 * ```ts
 * import '@tundralibs/norm/engines/postgres';
 * import { Norm } from '@tundralibs/norm/core';
 *
 * const norm = new Norm({ database: { dialect: 'postgres', host, database, username } });
 * ```
 *
 * The root `@tundralibs/norm` barrel already imports this module.
 *
 * Pulls the Postgres TCP wire stack — NOT edge-safe; use `neon` there.
 *
 * @since 1.2.0
 */

import { PostgresEngine } from '@tundralibs/drivers/postgres';
import { registerEngine } from './registry.ts';

registerEngine(
  'postgres',
  (name: string, options: ConstructorParameters<typeof PostgresEngine>[1]) =>
    new PostgresEngine(name, options),
);
