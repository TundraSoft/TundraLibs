/**
 * Dependency-injection decorators for `@tundralibs/doctor` — {@link Vial}
 * registers a class with the container. Injection itself is done with
 * `inject()` (field or constructor-default initializers), not a
 * decorator: decorators here RECORD, they never SUPPLY VALUES, because
 * value-supplying member decorators are miscompiled by Bun when a file
 * contains more than one decorated class
 * (https://github.com/oven-sh/bun/issues/30326).
 *
 * @module
 */
export { Vial, type VialDecorator } from './Vial.ts';
export type {
  Vial as VialClass,
  VialModes,
  VialOptions,
} from '../types/mod.ts';
