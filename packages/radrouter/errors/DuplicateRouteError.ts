/**
 * @fileoverview {@link DuplicateRouteError} — thrown when the
 * same `method + path + version` triple is registered more than
 * once. Different methods or versions on the same path compose
 * normally; only exact duplicates raise.
 *
 * @module
 */

import type { HTTPMethod } from '../types/mod.ts';
import { RadRouterError } from './Base.ts';

/** Metadata attached to a {@link DuplicateRouteError}. */
export type DuplicateRouteErrorMeta = {
  method: HTTPMethod;
  path: string;
  version?: string;
};

/**
 * Thrown when {@link RadRouter.addRoute} (or any of its shorthands)
 * is called twice for the same `method + path + version`. Catching
 * this is the right move in dev hot-reload paths where re-running
 * registration code shouldn't crash; in production, the throw
 * surfaces a likely programmer error at startup.
 *
 * @example
 * ```ts
 * try {
 *   router.get('/users', [mw]);
 *   router.get('/users', [mw]); // duplicate
 * } catch (e) {
 *   if (e instanceof DuplicateRouteError) {
 *     // log + continue, ignore in dev, etc.
 *   }
 * }
 * ```
 */
export class DuplicateRouteError
  extends RadRouterError<DuplicateRouteErrorMeta> {
  constructor(meta: DuplicateRouteErrorMeta, cause?: Error) {
    const versionLabel = meta.version ? ` (version "${meta.version}")` : '';
    super(
      `Duplicate route: ${meta.method} ${meta.path}${versionLabel} is already registered.`,
      meta,
      cause,
    );
  }
}
