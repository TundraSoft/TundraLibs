/**
 * @fileoverview `@Use(...middleware)` — the invoke-time onion of a module
 * method. Runs ONLY through `invoke` (never on a plain call, an event
 * delivery, or a transport request); source order is execution order.
 *
 * SCOPE (important): `@Use` guards MODULE-TO-MODULE `invoke()` calls only. It
 * does NOT run on an HTTP/SOCKET/JOB request — the transport calls the method
 * directly. Stacking `@Use` on a route/command/job decorator is therefore
 * rejected at mount (it would read as a request guard but silently never run);
 * guard requests with route-scoped middleware / `guardHTTP` instead. `@Use`
 * also requires a `RapidModule` (the tier that runs it) — it is inert, and
 * rejected at mount, on a plain `@Module` class.
 *
 * @module
 */

import type {
  RapidModuleInvokeMiddleware,
  RapidModuleMethodDecorator,
} from '../types/mod.ts';
import { assertMethodContext, recordUse } from './registry.ts';

/**
 * Attach invoke-middleware to a module method — guards for `invoke()`
 * (`@Use(requireRole('admin'))`). A plain method call and, crucially, a
 * transport request bypass it (see the module scope note above), so it is an
 * INVOKE boundary, not a request or in-process one.
 *
 * @throws {RapidError} RAPID_CONFIG at mount when stacked on an `@On` handler
 *   (events run no middleware), on a route/command/job decorator (would not
 *   guard the request), or on a non-`RapidModule` class (nothing runs it).
 */
export function Use(
  ...middleware: RapidModuleInvokeMiddleware[]
): RapidModuleMethodDecorator {
  return (_target, context) => {
    assertMethodContext(context, 'Use');
    recordUse(context, middleware);
  };
}
