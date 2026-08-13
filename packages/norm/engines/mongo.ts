/**
 * @module
 *
 * Registers the `mongo` dialect. Import for its side effect:
 *
 * ```ts
 * import '@tundralibs/norm/engines/mongo';
 * import { Norm } from '@tundralibs/norm/core';
 *
 * const norm = new Norm({ database: { dialect: 'mongo', host, database } });
 * ```
 *
 * The root `@tundralibs/norm` barrel already imports this module.
 *
 * Pulls the MongoDB driver and its TCP transport — NOT edge-safe.
 *
 * @since 1.2.0
 */

import { MongoEngine } from '@tundralibs/drivers/mongo';
import { registerEngine } from './registry.ts';

registerEngine(
  'mongo',
  (name: string, options: ConstructorParameters<typeof MongoEngine>[1]) =>
    new MongoEngine(name, options),
);
