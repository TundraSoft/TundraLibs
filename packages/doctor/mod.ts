/**
 * @fileoverview `@tundralibs/doctor` — decorator-driven dependency
 * injection: register classes as vials with SINGLETON / SCOPED /
 * TRANSIENT lifecycles (`@Vial`), stock ready-made values and labelled
 * factories under typed labels (`label`, `Doctor.stock`), inject them
 * through typed tokens (`inject`, as a field or constructor-default
 * initializer), and resolve per-request instances with
 * `Doctor.resolve`.
 *
 * @module
 */

export { Doctor } from './Doctor.ts';
export { inject } from './inject.ts';
export { label } from './label.ts';
export { Vial, type VialDecorator } from './decorators/mod.ts';

export {
  type CircularDependencyContext,
  CircularDependencyError,
  DoctorError,
  type DuplicateVialContext,
  DuplicateVialError,
  type ScopeRequiredContext,
  ScopeRequiredError,
  type UnregisteredVialContext,
  UnregisteredVialError,
} from './errors/mod.ts';

export type {
  DoctorContainer,
  Label,
  StockOptions,
  Vial as VialClass,
  VialModes,
  VialOptions,
} from './types/mod.ts';
