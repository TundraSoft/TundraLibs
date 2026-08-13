/**
 * @module
 *
 * Registers the `sqlite` dialect (native, file-backed). Import for its
 * side effect:
 *
 * ```ts
 * import '@tundralibs/norm/engines/sqlite';
 * import { Norm } from '@tundralibs/norm/core';
 *
 * const norm = new Norm({ database: { dialect: 'sqlite', path: './data' } });
 * ```
 *
 * The root `@tundralibs/norm` barrel already imports this module.
 *
 * Pulls a NATIVE SQLite binding (`bun:sqlite`, `@db/sqlite`,
 * `better-sqlite3`, `node:sqlite`) — this is the module that made norm
 * unbundleable for edge runtimes before the registry existed, and it is
 * still the one you must not import there. Cloudflare's `unenv` polyfill
 * resolves `node:sqlite` and even exposes `DatabaseSync`, but
 * constructing one throws `Illegal constructor` on workerd, so a native
 * SQLite build would fail in production rather than at build time. On the
 * edge use `d1` or `turso` (both SQLite over HTTP) instead.
 *
 * @since 1.2.0
 */

import { SQLiteEngine } from '@tundralibs/drivers/sqlite';
import { registerEngine } from './registry.ts';

registerEngine(
  'sqlite',
  (name: string, options: ConstructorParameters<typeof SQLiteEngine>[1]) =>
    new SQLiteEngine(name, options),
);
