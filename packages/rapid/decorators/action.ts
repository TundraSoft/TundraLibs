/**
 * @fileoverview `@Action` — declare a `RapidModule` method that has NO
 * route, command or job (it is reached only through `invoke()`) and give
 * it an `access` string. METADATA-ONLY (TC39 standard). Without it an
 * unrouted method is still invokable — public to every caller, which is
 * the right default for a module's own service methods; `@Action({
 * access })` is for the ones only some callers may run (a verified
 * webhook, a job).
 *
 * @module
 */

import type { RapidModuleMethodDecorator } from '../types/mod.ts';
import {
  assertAccess,
  assertMethodContext,
  recordAccess,
  recordAction,
} from './registry.ts';

/** Options for {@link Action}. */
export type ActionDecoratorOptions = {
  /**
   * Who may `invoke()` this method, in the app's auth binding's grammar
   * (`'Billing:WRITE'`, `'system|system:webhook:dodo'`). Judged by the
   * binding's `authorize` against the CALLER's `ctx.auth` on every
   * invoke. Absent: anyone in the process may invoke it.
   */
  access?: string;
};

/**
 * Declare the decorated method an invoke-only action, optionally guarded.
 *
 * ```typescript
 * import { Action, RapidModule, reply } from '@tundralibs/rapid';
 *
 * class Billing extends RapidModule {
 *   readonly name = 'Billing';
 *   readonly namespace = 'billing';
 *   protected readonly events = {};
 *
 *   @Action({ access: 'system|system:webhook:dodo' })
 *   applyPayment(org: string): ReturnType<typeof reply> {
 *     return reply(200, { org });
 *   }
 * }
 * ```
 *
 * @throws {RapidError} RAPID_CONFIG at decoration time under legacy
 *   decorator compilation, on a non-method/static/private target, on an
 *   empty `access`, or when another decoration on the method declares a
 *   different `access`.
 */
export function Action(
  options: ActionDecoratorOptions = {},
): RapidModuleMethodDecorator {
  if (options.access !== undefined) assertAccess('@Action', options.access);
  return (_target, context) => {
    assertMethodContext(context, 'Action');
    recordAction(context);
    if (options.access !== undefined) {
      recordAccess(context, options.access, 'Action');
    }
  };
}
