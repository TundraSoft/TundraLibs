/**
 * @fileoverview Options-form configuration accepted by `@Vial(...)`
 * and `Doctor.prescribe(...)`.
 *
 * @module
 */

import type { VialModes } from './VialModes.ts';

/**
 * Long-form configuration for a vial. The short form `@Vial('SINGLETON')`
 * expands to `{ mode: 'SINGLETON' }`. Pass `factory` when the class
 * needs constructor arguments — Doctor cannot call a bare
 * `new Klass()` in that case.
 */
export type VialOptions = {
  mode: VialModes;
  /**
   * Custom constructor. Called every time Doctor needs a fresh
   * instance (once for SINGLETON, once per scope for SCOPED, every
   * resolution for TRANSIENT). The returned instance wires itself
   * while constructing, like any other.
   */
  factory?: () => unknown;
};
