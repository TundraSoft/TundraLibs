/**
 * @fileoverview Configuration/programmer error for `@tundralibs/pact`.
 * @module
 */

import { PactError } from './Base.ts';

/**
 * A configuration/programmer error — a malformed permission registry, an
 * unknown module, a bad option, or a capability used without its hook
 * wired. Signals a bug in how Pact was set up, not a runtime outcome.
 */
export class PactDefinitionError<
  M extends Record<string, unknown> = Record<string, unknown>,
> extends PactError<M> {}
