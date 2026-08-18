/**
 * @fileoverview `@tundralibs/doctor` — decorator-driven dependency
 * injection: register classes as vials with SINGLETON / SCOPED /
 * TRANSIENT lifecycles (`@Vial`), inject them through typed tokens
 * (`inject`, as a field or constructor-default initializer), and
 * resolve per-request instances with `Doctor.resolve`.
 *
 * @module
 */

export { Doctor } from './Doctor.ts';
export { inject, type VialRegistry } from './inject.ts';
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

export type { Vial as VialClass, VialModes, VialOptions } from './types/mod.ts';
