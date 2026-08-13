/**
 * @module
 *
 * Registers the `turso` dialect — SQLite over Turso / libSQL's Hrana-v3
 * HTTP API. Import for its side effect:
 *
 * ```ts
 * import '@tundralibs/norm/engines/turso';
 * import { Norm } from '@tundralibs/norm/core';
 *
 * const norm = new Norm({
 *   database: { dialect: 'turso', url: env.TURSO_URL, token: env.TURSO_TOKEN },
 * });
 * ```
 *
 * Edge-safe: `fetch()` only, no native SQLite binding. The engine reuses
 * the SQLite OQL translator, so norm's SQL generation is identical to the
 * `sqlite` dialect; only the transport differs (one-shot HTTP, so no
 * pooling and no transactions).
 *
 * @since 1.2.0
 */

import { TursoEngine } from '@tundralibs/drivers/turso';
import { registerEngine } from './registry.ts';

registerEngine(
  'turso',
  (name: string, options: ConstructorParameters<typeof TursoEngine>[1]) =>
    new TursoEngine(name, options),
);
