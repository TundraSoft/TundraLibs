import type { VialModes } from '../types/mod.ts';
import { Vaccine } from '../Vaccine.ts';

/**
 * Decorator function that marks a class as a "vial" for dependency injection.
 * @param type The type of vial (e.g., "singleton", "transient", etc.).
 * @returns A decorator function that adds the decorated class as a vial to the Vaccine.
 */
export function Vial(type: VialModes) {
  // deno-lint-ignore no-explicit-any
  return function (target: any) {
    Vaccine.addPrescription(target, type);
  };
}
