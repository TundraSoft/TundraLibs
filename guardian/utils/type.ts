import { FunctionParameters, FunctionType, Typeof } from "../types/mod.ts";

import { makeError } from "../error/mod.ts";
/**
 * type
 *
 * Builds a generic validator to confirm if the type of value is the same as the type of the expected value.
 * Works only with String, Number, Boolean, Symbol, Null, Undefined, Void, BigInt.
 *
 * @param type string | number | symbol | boolean | null | undefined | void | bigint
 * @param error string Message to show when the type is not valid
 * @returns Typeof[type] The type
 */
export function type<
  T extends keyof Typeof,
  P extends FunctionParameters = [Typeof[T]],
>(type: T, error?: string): FunctionType<Typeof[T], P> {
  return (...args: P): Typeof[T] => {
    if (typeof args[0] !== type || args[0] === null) {
      throw makeError(error || `Expect value to be of type "${type}"`);
    }
    return args[0] as Typeof[T];
  };
}

