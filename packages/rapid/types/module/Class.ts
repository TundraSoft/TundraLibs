/**
 * @fileoverview {@link RapidModuleClass} — a module class reference, the
 * `target` of `invoke` (abstract bases are allowed as a TYPE target).
 *
 * @module
 */

/** A module class reference. */
export type RapidModuleClass<T> = abstract new (...args: never[]) => T;
