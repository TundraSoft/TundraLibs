/**
 * @fileoverview Configuration/programmer error for `@tundralibs/pact`.
 * @module
 */

import { PactError } from './Base.ts';

/**
 * A configuration/programmer error — a malformed permission registry, an
 * unknown module, a bad option, or a permission used where it does not
 * apply. Signals a bug in how PACT was set up, not a runtime outcome.
 */
export class PactDefinitionError<
  M extends Record<string, unknown> = Record<string, unknown>,
> extends PactError<M> {}
