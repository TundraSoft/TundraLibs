/**
 * @fileoverview Error thrown when resolving a vial that was never
 * registered with `@Vial`.
 *
 * @module
 */

import { DoctorError } from './Base.ts';

/**
 * Structured context for {@link UnregisteredVialError}.
 *
 * `vialName` is the constructor name of the missing vial, carried
 * for diagnostics. It is not the lookup key — Doctor keys its
 * registry by class identity (the constructor itself); only the
 * token-based `inject` / `dispenseByName` path looks up by name.
 */
export type UnregisteredVialContext = {
  vialName: string;
};

/**
 * Thrown by `Doctor.dispense` (and transitively by
 * `Doctor.inoculate` for required dependencies) when no `@Vial`
 * decorator has registered the requested class.
 */
export class UnregisteredVialError
  extends DoctorError<UnregisteredVialContext> {}
