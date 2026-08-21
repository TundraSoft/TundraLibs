/**
 * @fileoverview Error thrown when resolving a vial that was never
 * registered with `@Vial`, or a label nothing was stocked under.
 *
 * @module
 */

import { DoctorError } from './Base.ts';

/**
 * Structured context for {@link UnregisteredVialError}.
 *
 * `vialName` is the constructor name of the missing vial — or the
 * missing label's name — carried for diagnostics. For classes it is
 * not the lookup key (Doctor keys them by identity; only the
 * token-based `inject` / `dispenseByName` path looks up by name);
 * for labels the name IS the key.
 */
export type UnregisteredVialContext = {
  vialName: string;
};

/**
 * Thrown by `Doctor.dispense` / `Doctor.dispenseByName` (and so by
 * any `inject()` during construction) when no `@Vial` decorator or
 * `prescribe` call has registered the requested class, or nothing is
 * stocked under the requested label.
 */
export class UnregisteredVialError
  extends DoctorError<UnregisteredVialContext> {}
