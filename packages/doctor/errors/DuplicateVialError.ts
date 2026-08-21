/**
 * @fileoverview Error thrown when a class is registered with `@Vial`
 * (or `Doctor.prescribe`) more than once, or a name is contested
 * between a class and a stocked label.
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
 * time or its name is held by a stocked label, and by `Doctor.stock`
 * when the label's name is already taken. Catch this only if you
 * intend to deduplicate — it almost always points to a setup bug like
 * a hot-reload that re-evaluated a module.
 */
export class DuplicateVialError extends DoctorError<DuplicateVialContext> {}
