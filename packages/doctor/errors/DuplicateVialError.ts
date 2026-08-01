/**
 * @fileoverview Error thrown when a class is registered with `@Vial`
 * (or `Doctor.prescribe`) more than once.
 *
 * @module
 */

import { DoctorError } from './Base.ts';

/**
 * Structured context for {@link DuplicateVialError}.
 */
export type DuplicateVialContext = {
  vialName: string;
};

/**
 * Thrown by `Doctor.prescribe` (and the `@Vial` decorator
 * that wraps it) when the same class is being registered a second
 * time. Catch this only if you intend to deduplicate — it almost
 * always points to a setup bug like a hot-reload that re-evaluated
 * a module.
 */
export class DuplicateVialError extends DoctorError<DuplicateVialContext> {}
