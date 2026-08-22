/**
 * @fileoverview `@Use(...middleware)` — the invoke-time onion of a module
 * method. Runs ONLY through `invoke` (never on a plain call or an event
 * delivery); source order is execution order.
 *
 * @module
 */

import type {
  RapidModuleInvokeMiddleware,
  RapidModuleMethodDecorator,
} from '../types/mod.ts';
import { assertMethodContext, recordUse } from './registry.ts';

/**
 * Attach invoke-middleware to a module method. Guards belong here
 * (`@Use(requireRole('admin'))`); a plain method call bypasses them —
 * `@Use` is request-boundary policy, not an in-process security boundary.
 *
 * @throws {RapidError} RAPID_CONFIG at mount when stacked on an `@On`
 *   handler (events run no middleware).
 */
export function Use(
  ...middleware: RapidModuleInvokeMiddleware[]
): RapidModuleMethodDecorator {
  return (_target, context) => {
    assertMethodContext(context, 'Use');
    recordUse(context, middleware);
  };
}
