/**
 * @fileoverview Error thrown when a SCOPED vial is resolved without
 * a caller-supplied scope.
 *
 * @module
 */

import { DoctorError } from './Base.ts';

/**
 * Structured context for {@link ScopeRequiredError}.
 */
export type ScopeRequiredContext = {
  vialName: string;
};

/**
 * Thrown by `Doctor.dispense` (and so by any `inject()` running
 * during construction, or under `Doctor.resolve`) when a SCOPED vial
 * or label needs to be instantiated but no scope was supplied.
 *
 * SCOPED vials require a caller-controlled lifetime — the
 * registry refuses to invent one on the caller's behalf.
 */
export class ScopeRequiredError extends DoctorError<ScopeRequiredContext> {}
