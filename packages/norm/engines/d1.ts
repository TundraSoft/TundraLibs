/**
 * @module
 *
 * Registers the `d1` dialect — SQLite over Cloudflare D1's REST API.
 * Import for its side effect:
 *
 * ```ts
 * import '@tundralibs/norm/engines/d1';
 * import { Norm } from '@tundralibs/norm/core';
 *
 * const norm = new Norm({
 *   database: {
 *     dialect: 'd1',
 *     accountId: env.CF_ACCOUNT_ID,
 *     databaseId: env.D1_DATABASE_ID,
 *     apiToken: env.CF_API_TOKEN,
 *   },
 * });
 * ```
 *
 * Edge-safe: `fetch()` only, no native SQLite binding. The engine reuses
 * the SQLite OQL translator, so norm's SQL generation is identical to the
 * `sqlite` dialect; only the transport differs (one-shot REST, so no
 * pooling and no transactions).
 *
 * @since 1.2.0
 */

import { D1Engine } from '@tundralibs/drivers/d1';
import { registerEngine } from './registry.ts';

registerEngine(
  'd1',
  (name: string, options: ConstructorParameters<typeof D1Engine>[1]) =>
    new D1Engine(name, options),
);
