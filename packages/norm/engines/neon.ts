/**
 * @module
 *
 * Registers the `neon` dialect — Postgres over Neon's HTTP query API.
 * Import for its side effect:
 *
 * ```ts
 * import '@tundralibs/norm/engines/neon';
 * import { Norm } from '@tundralibs/norm/core';
 *
 * declare const env: Record<string, string>;
 *
 * const norm = new Norm({
 *   database: { dialect: 'neon', host: env.NEON_HOST, connectionString: env.NEON_URL },
 * });
 * ```
 *
 * Edge-safe: `fetch()` only, no TCP, no native binding. The engine reuses
 * the Postgres OQL translator, so norm's SQL generation is identical to
 * the `postgres` dialect; only the transport differs (one-shot HTTP, so
 * no pooling and no transactions — `executor.capabilities` reports that
 * honestly).
 *
 * @since 1.2.0
 */

import { NeonHttpEngine } from '@tundralibs/drivers/neon';
import { registerEngine } from './registry.ts';

registerEngine(
  'neon',
  (name: string, options: ConstructorParameters<typeof NeonHttpEngine>[1]) =>
    new NeonHttpEngine(name, options),
);
