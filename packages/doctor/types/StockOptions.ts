/**
 * @fileoverview Factory-form options accepted by `Doctor.stock`.
 *
 * @module
 */

import type { VialModes } from './VialModes.ts';

/**
 * Factory form of `Doctor.stock(label, options)`: a non-class
 * dependency with a lifecycle. `factory` runs through the same engine
 * as class vials — once and cached for SINGLETON, once per scope name
 * for SCOPED, on every dispense for TRANSIENT.
 *
 * The factory is synchronous by design (injection runs inside field
 * initializers): `await` asynchronous setup first, then stock the
 * result as a value.
 */
export type StockOptions<T = unknown> = {
  mode: VialModes;
  factory: () => T;
};
