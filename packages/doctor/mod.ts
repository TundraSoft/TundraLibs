/**
 * @fileoverview Public entry point — re-exports every class, type,
 * decorator, and error the package exposes.
 *
 * @module
 */

export { Doctor } from './Doctor.ts';
export { inject, type VialRegistry } from './inject.ts';
export { Dose, Inoculate, Vial } from './decorators/mod.ts';

export {
  type CircularDependencyContext,
  CircularDependencyError,
  DoctorError,
  type DuplicateVialContext,
  DuplicateVialError,
  type MissingDesignTypeContext,
  MissingDesignTypeError,
  MissingMetadataError,
  type ScopeRequiredContext,
  ScopeRequiredError,
  type UnregisteredVialContext,
  UnregisteredVialError,
} from './errors/mod.ts';

export type {
  Prescription,
  Vial as VialClass,
  VialModes,
  VialOptions,
} from './types/mod.ts';
