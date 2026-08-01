/**
 * @fileoverview Error thrown when a vial's dependency graph contains
 * a cycle that resolution cannot satisfy.
 *
 * @module
 */

import { DoctorError } from './Base.ts';

/**
 * Structured context for {@link CircularDependencyError}.
 *
 * `vialName` is the constructor name of the vial whose resolution
 * re-entered while it was already being resolved — the point at
 * which the cycle was detected.
 */
export type CircularDependencyContext = {
  vialName: string;
};

/**
 * Thrown by `Doctor.dispense` when resolving a vial re-enters the
 * resolution of a vial that is already in flight, i.e. the
 * dependency graph contains a cycle the registry cannot break.
 *
 * SINGLETON and SCOPED cycles are tolerated where possible — those
 * instances are cached before their properties are injected, so two
 * vials that depend on each other can each hold a (partially built)
 * reference to the other. A TRANSIENT vial, by contrast, is never
 * cached, so a cycle through one can never terminate and always
 * surfaces as this error instead of overflowing the stack.
 */
export class CircularDependencyError
  extends DoctorError<CircularDependencyContext> {}
