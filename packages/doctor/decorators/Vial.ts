/**
 * @fileoverview `@Vial(mode | options)` — class decorator that
 * registers a class with the {@link Doctor} registry under the
 * given lifecycle.
 *
 * @module
 */

import { Doctor } from '../Doctor.ts';
import type { VialModes, VialOptions } from '../types/mod.ts';

/**
 * Register the decorated class as a vial.
 *
 * Short form takes the mode literal; long form takes a
 * {@link VialOptions} object with an optional `factory` for
 * classes that need constructor arguments.
 *
 * @returns A class decorator that calls
 *   `Doctor.prescribe(class, mode | options)` at decoration time.
 *
 * @throws {@link DuplicateVialError} Propagated from `prescribe`
 *   when the class is registered twice.
 *
 * @example
 * ```typescript
 * @Vial('SINGLETON')
 * class Logger { ... }
 *
 * @Vial({ mode: 'SCOPED', factory: () => new Db(env.DB_URL) })
 * class Db {
 *   constructor(public url: string) {}
 * }
 * ```
 */
export function Vial(mode: VialModes): ClassDecorator;
export function Vial(options: VialOptions): ClassDecorator;
export function Vial(arg: VialModes | VialOptions): ClassDecorator {
  // deno-lint-ignore no-explicit-any
  return function (target: any) {
    Doctor.prescribe(target, arg as VialModes);
  };
}
