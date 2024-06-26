// deno-lint-ignore-file no-explicit-any
import { Vaccine } from '../Vaccine.ts';

/**
 * Decorator function that injects a scope into a class constructor.
 *
 * @param scope - The scope to be injected.
 * @returns A decorator function that injects the specified scope into the class constructor.
 */
export function Innoculate(scope?: string) {
  return function (target: any) {
    const original = target;
    function construct(constructor: any, args: any[]) {
      const instance = Reflect.construct(constructor, args);
      Vaccine.innoculate(instance, scope);
      return instance;
    }
    const f: any = function (...args: any[]) {
      return construct(original, args);
    };
    f.prototype = original.prototype;
    return f;
  };
}
