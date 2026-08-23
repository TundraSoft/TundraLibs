/**
 * @module
 *
 * Registers the `maria` dialect (MariaDB / MySQL). Import for its side
 * effect:
 *
 * ```ts
 * import '@tundralibs/norm/engines/maria';
 * import { Norm } from '@tundralibs/norm/core';
 *
 * declare const host: string, database: string, username: string;
 *
 * const norm = new Norm({ database: { dialect: 'maria', host, database, username } });
 * ```
 *
 * The root `@tundralibs/norm` barrel already imports this module.
 *
 * Wraps the third-party `mariadb` npm driver (not a `compat/net`-based
 * wire protocol like `postgres` — the driver manages its own sockets).
 * That means it never goes through `compat`'s runtime guards at all, and
 * it has been usable on Cloudflare Workers independently of anything
 * `compat` does: confirmed connecting over real TCP there and reaching
 * the actual MariaDB wire handshake. Needs Node globals the driver
 * assumes are present (`process`, etc.) — absent in a browser.
 *
 * @since 1.2.0
 */

import { MariaEngine } from '@tundralibs/drivers/maria';
import { registerEngine } from './registry.ts';

registerEngine(
  'maria',
  (name: string, options: ConstructorParameters<typeof MariaEngine>[1]) =>
    new MariaEngine(name, options),
);
