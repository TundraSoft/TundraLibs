/**
 * @module
 *
 * Registers the `postgres` dialect. Import for its side effect:
 *
 * ```ts
 * import '@tundralibs/norm/engines/postgres';
 * import { Norm } from '@tundralibs/norm/core';
 *
 * declare const host: string, database: string, username: string;
 *
 * const norm = new Norm({ database: { dialect: 'postgres', host, database, username } });
 * ```
 *
 * The root `@tundralibs/norm` barrel already imports this module.
 *
 * Pulls the Postgres TCP wire stack over `@tundralibs/compat/net` —
 * genuinely usable on Cloudflare Workers since compat added real TCP
 * support there (raw sockets via `cloudflare:sockets`). SSL needs a
 * publicly-trusted server certificate: `cloudflare:sockets` has no
 * client-cert/CA hook, so a self-signed or privately-issued cert fails
 * the handshake. `neon` remains the fetch-only alternative when that
 * matters, or in a browser (no raw sockets there at all).
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
