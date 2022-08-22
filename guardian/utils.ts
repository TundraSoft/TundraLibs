import {
  FunctionParameters,
  FunctionType,
  GuardianProxy,
  MergeParameters,
  ObjectPath,
  ObjectProperty,
  PathError,
  StructOptions,
  StructParameters,
  StructResolveType,
  StructValidatorFunction,
  Typeof,
} from "./types.ts";

import { Guardian } from "./Guardians/UnknownGuardian.ts";
import { ValidationError } from "./Error.ts";
import type { ErrorLike } from "./Error.ts";

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
      throw makeError(error || `Expect value to be of type "${type}"`, ...args);
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
      throw makeError(error || `Expect value to be an array`, ...args);
    }
    return args[0] as R;
  };

  if (len === null) {
    return isArray;
  }

  return (...args: P): R => {
    const arr = isArray(...args);

    if (arr.length !== len) {
      throw makeError(error || `Expect array length to be ${len}`, ...args);
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
      throw makeError(
        error || `Expect array length to be ${expected}`,
        ...args,
      );
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
      throw makeError(
        error || `Expect value to be one of ${expected.join(", ")}`,
        ...args,
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
      throw makeError(error || `Validation test failed`, ...args);
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

//#region Struct - TODO - Refactor
export function makeError<P extends FunctionParameters>(
  error: ErrorLike<P>,
  ...args: P
): ValidationError {
  if (typeof error === "string") {
    return new ValidationError(error);
  } else if (typeof error === "function") {
    return makeError(error(...args));
  }
  return error;
}

export function pathErrors(errors: ErrorLike, path: ObjectPath): PathError[] {
  const error = makeError(errors);
  if (Array.isArray(error.path)) {
    path = error.path;
  }
  if (error.validations?.length) {
    return ([] as PathError[]).concat(
      ...error.validations.map((e) =>
        pathErrors(e.error, [...path, ...e.path])
      ),
    );
  }
  return [{ error, path }];
}

export function createValidationError<P extends FunctionParameters>(
  errors: PathError[],
  error: ErrorLike<P> | null | undefined,
  ...args: P
): ValidationError {
  if (!error) {
    if (errors[0]) {
      const { path, error: err } = errors[0];
      const message = String((err && err.message) || err);

      error = path ? `${path.join(".")}: ${message}` : message;
    } else {
      error = "Unknown Validation Error";
    }
  }

  const err: ValidationError = makeError(error?.toString() || error, ...args);
  err.validations = errors;

  return err;
}

export function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return !!value && typeof (value as PromiseLike<unknown>).then === "function";
}

/**
 * Composes a guardian for the provided value.
 * Modes - (valid for struct)
 * STRICT - Definition must match the provided, i.e Only defined keys allowed. Any "extra" keys will throw an error.
 * DEFINED - Only defined keys will be processed, any "extra" keys will be ignored.
 * PARTIAL - This will only validate values which are present (irrespective of they are defined as mandatory or optional). Will only return defined keys
 * ALL - Most loosely typed of the lot, will validate for properties for which definition is there, if defined but no value then it will ignore. Any junk will be passed as is
 *
 * @param struct
 * @param options
 * @returns : StructValidatorFunction<S>
 */
export function compile<S>(struct: S, options?: Partial<StructOptions>) {
  const defOptions = {
    mode: "STRICT",
    path: [],
    message: "Validation Error",
  };
  const opts = { ...defOptions, ...options } as StructOptions,
    { mode, path, message } = opts;
  if (typeof struct === "bigint") {
    return Guardian.bigint() as unknown as StructValidatorFunction<S>;
  } else if (typeof struct === "number") {
    return Guardian.number() as unknown as StructValidatorFunction<S>;
  } else if (typeof struct === "string") {
    return Guardian.string() as unknown as StructValidatorFunction<S>;
  } else if (typeof struct === "boolean") {
    return Guardian.boolean() as unknown as StructValidatorFunction<S>;
  } else if (struct instanceof RegExp) {
    return Guardian.string().pattern(
      struct,
    ) as unknown as StructValidatorFunction<S>;
  } else if (struct instanceof Date) {
    return Guardian.date() as unknown as StructValidatorFunction<S>;
  } else if (struct instanceof Array) {
    const ar = Guardian.array();
    if (struct.length > 0) {
      ar.of(compile(struct[0], { message: "Array type validation error" }));
    }
    return ar as unknown as StructValidatorFunction<S>;
  } else if (struct instanceof Function) {
    return struct as unknown as StructValidatorFunction<S>;
  } else if (typeof struct === "object") {
    // Ok, now we have to do the magic
    const structKeys: Set<string> = new Set(Object.keys(struct)),
      // deno-lint-ignore no-explicit-any
      validators: { [K in ObjectProperty]: GuardianProxy<any> } = {};
    structKeys.forEach((key) => {
      validators[key] = compile(struct[key as keyof S], {
        mode: opts.mode,
        path: [...opts.path, key],
        message: `Validating failed for key: ${key}`,
      });
    });
    // Return a function that will validate the value
    return ((
      ...objs: StructParameters<S>
    ): StructResolveType<S> | Promise<StructResolveType<S>> => {
      const retObj: Record<string, unknown> = {},
        obj = objs[0];
      // We inject defined keys which are not passed. This helps validate optional keys.
      // Properties defined but not passed needs to be handled for strict
      if (mode !== "PARTIAL") {
        const tempKeys = new Set(Object.keys(obj));
        structKeys.forEach((key) => {
          if (!tempKeys.has(key)) {
            obj[key] = undefined;
          }
        });
      }
      // if (mode === "STRICT" || mode === 'DEFINED') {
      //   structKeys.forEach((key) => {
      //     if (!objKeys.has(key)) {
      //       errors.push({
      //         error: makeError(`Missing property "${key}"`),
      //         path: [...path, key],
      //       });
      //     }
      //   });
      // }
      const objKeys: Set<string> = new Set(Object.keys(obj)),
        errors: PathError[] = [],
        // errors: {error: string, path: ObjectPath}[] = [],
        promises: Promise<unknown>[] = [];
      objKeys.forEach((key) => {
        try {
          // If it is Strict or Partial, only defined properties are allowed
          if (mode === "STRICT" && !structKeys.has(key)) {
            // pathErrors(`${key} is not a valid property`, [...opts.path, key]);
            throw makeError(`Unknown property passed "${key}"`);
          }
          if (structKeys.has(key) || mode === "ALL") {
            const retVal = (validators[key] !== undefined)
              ? validators[key](obj[key])
              : obj[key];
            if (isPromiseLike(retVal)) {
              promises.push(retVal as Promise<unknown>);
              retVal.then((v) => retObj[key] = v, (e) => {
                // const err = makeError(e)
                errors.push({
                  error: e,
                  path: [...path, key],
                });
              });
            } else {
              retObj[key] = retVal;
            }
          }
        } catch (e) {
          // errors.push(...toPathErrors(error as Error, path));
          // errors.push({ error: e, path: [...path, key] });
          // errors.push(...pathErrors(e, [...path, key]));
          errors.push({
            error: e,
            path: [...path, key],
          });
        }
      });
      // Done Now we return
      if (promises.length === 0) {
        // No promises found, so return
        if (errors.length > 0) {
          throw createValidationError(errors, message, ...objs);
        }
        return retObj as StructResolveType<S>;
      }

      return Promise.all(promises).then(() => {
        if (errors.length > 0) {
          throw createValidationError(errors, message, ...objs);
        }
        return retObj as StructResolveType<S>;
      }) as StructResolveType<S>;
    });
  }

  throw makeError(`Unsupported ${typeof struct} type`);
}

//#endregion Struct
