/**
 * @fileoverview `@tundralibs/doctor` — dependency-health checks for
 * services: declare named checks (decorator or registration API), run
 * them with timeouts and consecutive-failure tracking, and expose the
 * aggregate as readiness/liveness results.
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
