import type { Prescription } from '../types/mod.ts';

/**
 * Decorator function used to mark a property as injectable.
 *
 * @returns A function that takes the target object and property key as parameters.
 */
export function Dose() {
  // deno-lint-ignore no-explicit-any
  return function (target: any, key: string) {
    const type = Reflect.getMetadata('design:type', target, key);
    if (!Reflect.hasMetadata('design:injectable', target.constructor)) {
      Reflect.defineMetadata('design:injectable', [], target.constructor);
    }
    const injectables: Prescription[] = Reflect.getMetadata(
      'design:injectable',
      target.constructor,
    );
    injectables.push({ key, type });
  };
}
