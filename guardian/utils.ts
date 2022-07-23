import {
  FunctionParameters,
  FunctionType,
  GuardianProxy,
  MergeParameters,
  ObjectProperty,
  StructParameters,
  StructResolveType,
  StructValidatorFunction,
  StructValues,
  Typeof,
} from "./types.ts";

import { Guardian } from "./UnknownGuardian.ts";

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
      throw new Error(error || `Expect value to be of type ${type}`);
    }
    return args[0] as Typeof[T];
  };
}

/**
 * array
 *
 * Builds a generic validator to confirm if the value is an array.
 *
 * @param len number | null The expected length of the array
 * @param error string Message to show when the length is not valid
 * @returns FunctionType<Array<unknown>, FunctionParameters> The array validator
 */
export function array<
  R extends Array<unknown>,
  P extends FunctionParameters = [R],
>(len: number | null = null, error?: string): FunctionType<R, P> {
  const isArray = (...args: P): R => {
    if (!Array.isArray(args[0])) {
      throw new Error(error || `Expecting value to be an array`);
    }
    return args[0] as R;
  };

  if (len === null) {
    return isArray;
  }

  return (...args: P): R => {
    const arr = isArray(...args);

    if (arr.length !== len) {
      throw new Error(
        error || `Expected array length ${len} (given: ${arr.length})`,
      );
    }
    return arr;
  };
}

/**
 * equals
 *
 * Checks if the data is equal to the expected value.
 *
 * @param expected T The expected value
 * @param error string Message to show when the value is not valid
 * @returns FunctionType<T> The function
 */
export function equals<T, P extends FunctionParameters = [T]>(
  expected: T,
  error?: string,
): FunctionType<T, P> {
  return (...args: P): T => {
    if (args[0] !== expected) {
      throw new Error(error || `Expect value to be equal to ${expected}`);
    }
    return args[0] as T;
  };
}

/**
 * oneOf
 *
 * Check if the value of the item is one of the expected values.
 *
 * @param expected T[] List of items to check if the value is included in the list
 * @param error string Message to show when the value is not valid
 * @returns FunctionType<T, P> Function to check if value is in list
 */
export function oneOf<T, P extends FunctionParameters = [T]>(
  expected: T[],
  error?: string,
): FunctionType<T, P> {
  return (...args: P): T => {
    if (!expected.includes(args[0] as T)) {
      throw new Error(
        error || `Expect value to be one of ${expected.join(", ")}`,
      );
    }
    return args[0] as T;
  };
}

/**
 * test
 *
 * Wrapper for generic testing.
 *
 * @param fn FunctionType<T, P> The function to call
 * @param error string Message to show when the value is not valid
 * @returns FunctionType The function
 */
export function test<P extends FunctionParameters>(
  fn: FunctionType<unknown, P>,
  error?: string,
): FunctionType<P[0], P> {
  return (...args: P): unknown => {
    if (!fn(...args)) {
      throw new Error(error || `Expect value to pass test`);
    }
    return args[0];
  };
}

export function optional<F extends FunctionType, R = undefined>(
  guardian: F,
  defaultValue?: R,
): FunctionType<
  ReturnType<F> | R,
  MergeParameters<Parameters<F> | [(undefined | null)?]>
> {
  return (
    ...args: MergeParameters<Parameters<F> | [(undefined | null)?]>
  ): ReturnType<F> | R => {
    if (args[0] == null || args[0] === "") {
      return defaultValue as R;
    }
    return guardian(...args);
  };
}

export function compileStruct<S extends { [key: string]: StructValues | S }>(
  schema: S,
  error?: string,
) {
  // ensure it is of type object
  const keys = Object.keys(schema);
  // deno-lint-ignore no-explicit-any
  const validators: { [K in ObjectProperty]: GuardianProxy<any> } = {};
  for (const key of keys) {
    const val = schema[key];
    // Detect the type of the value
    if (val instanceof Function && val.guardian !== undefined) {
      // Its a validator
      validators[key] = val;
    } else if (val instanceof Date) {
      validators[key] = Guardian.date();
    } else if (val instanceof Array || Array.isArray(val)) {
      // Since this is an array, we check the contents (first element) and then set it to this
      const innerType = compileStruct(val[0]);
      validators[key] = Guardian.array().of(innerType);
    } else if (typeof val === "object") {
      // It looks like a sub object, so send it to struct function
      validators[key] = compileStruct(val, error);
    } else if (typeof val === "bigint") {
      validators[key] = Guardian.bigint();
    } else if (typeof val === "number") {
      validators[key] = Guardian.number();
    } else if (typeof val === "string") {
      validators[key] = Guardian.string();
    } else if (typeof val === "boolean") {
      validators[key] = Guardian.boolean();
    } else {
      throw new Error(error || `Invalid type for ${key}`);
    }
  }

  return ((
    ...obj: StructParameters<S>
  ): StructResolveType<S> | Promise<StructResolveType<S>> => {
    const retObj: Record<string, unknown> = {};
    const o = obj[0];
    for (const key of keys) {
      retObj[key] = validators[key](o[key]);
      // Do not create a property if it is undefined
      if (retObj[key] === undefined) {
        delete retObj[key];
      }
    }
    return retObj as StructResolveType<S>;
  }) as StructValidatorFunction<S>;
}
