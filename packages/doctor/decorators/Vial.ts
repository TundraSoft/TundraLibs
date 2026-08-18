/**
 * @fileoverview `@Vial(mode | options)` — class decorator that
 * registers a class with the {@link Doctor} registry under the
 * given lifecycle.
 *
 * @module
 */

import { Doctor } from '../Doctor.ts';
import type {
  Vial as VialClass,
  VialModes,
  VialOptions,
} from '../types/mod.ts';

/**
 * The decorator {@link Vial} returns. Registration needs only the
 * class itself, so the decorator works under both TC39 standard
 * decorators (which pass a context second) and the legacy
 * `experimentalDecorators` convention (which doesn't) — the context
 * is simply ignored.
 */
export type VialDecorator = (
  target: VialClass,
  context?: ClassDecoratorContext,
) => void;

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
export function Vial(mode: VialModes): VialDecorator;
/** Register the class with explicit {@link VialOptions}. */
export function Vial(options: VialOptions): VialDecorator;
export function Vial(arg: VialModes | VialOptions): VialDecorator {
  return function (target: VialClass): void {
    Doctor.prescribe(target, arg as VialModes);
  };
}
