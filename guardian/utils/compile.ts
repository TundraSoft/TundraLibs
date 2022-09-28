import {
  GuardianProxy,
  ObjectProperty,
  StructOptions,
  StructParameters,
  StructResolveType,
  StructValidatorFunction,
} from "../types/mod.ts";

import { GuardianError, makeError } from "../error/mod.ts";

import { Guardian } from "../Guardians/mod.ts";
import { isPromiseLike } from "./isPromiseLike.ts";

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
 * @returns StructValidatorFunction<S>
 */
export function compile<S>(struct: S, options?: Partial<StructOptions>) {
  const defOptions = {
    mode: "STRICT",
    path: [],
    message: "Validation failed",
  };
  if (options?.message === undefined || options.message === null) {
    delete options?.message;
  }
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
      ar.of(compile(struct[0], { message: "Array type validation failed" }));
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
        message: `${key} contains elements which are not valid`,
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
      // Add DEFINED also to this list.
      if (mode !== "PARTIAL") {
        const tempKeys = new Set(Object.keys(obj));
        structKeys.forEach((key) => {
          if (!tempKeys.has(key)) {
            obj[key] = undefined;
          }
        });
      }

      const objKeys: Set<string> = new Set(Object.keys(obj)),
        // errors: PathError[] = [],
        errors: GuardianError[] = [],
        // errors: {error: string, path: ObjectPath}[] = [],
        promises: Promise<unknown>[] = [];
      objKeys.forEach((key) => {
        try {
          // If it is Strict or Partial, only defined properties are allowed
          if (mode === "STRICT" && !structKeys.has(key)) {
            // pathErrors(`${key} is not a valid property`, [...opts.path, key]);
            // console.log(path, key)
            throw makeError(`Unknown property passed "${key}"`, [...path, key]);
          }
          if (structKeys.has(key) || mode === "ALL") {
            const retVal = (validators[key] !== undefined)
              ? validators[key](obj[key])
              : obj[key];
            if (isPromiseLike(retVal)) {
              promises.push(retVal as Promise<unknown>);
              retVal.then((v) => retObj[key] = v, (e) => {
                // const err = makeError(e)
                // errors.push({
                //   error: e,
                //   path: [...path, key],
                // });
                // console.log([...path, ...key])
                errors.push(makeError(e, [...path, key]));
              });
            } else {
              retObj[key] = retVal;
            }
          }
        } catch (e) {
          // errors.push({
          //   error: e,
          //   path: [...path, key],
          // });
          // console.log([...path, key])
          errors.push(makeError(e, [...path, key]));
        }
      });
      // Done Now we return
      if (promises.length === 0) {
        // No promises found, so return
        if (errors.length > 0) {
          // throw createValidationError(errors, message, ...objs);
          // console.log(message, errors)
          // const a = new GuardianError(message || defOptions.message, undefined, errors);
          // console.log(a.children)
          throw new GuardianError(
            message || defOptions.message,
            undefined,
            errors,
          );
        }
        // Remove all undefined
        if (mode === "DEFINED" || mode === "PARTIAL") {
          Object.keys(retObj).forEach((key) => {
            if (retObj[key] === undefined) {
              delete retObj[key];
            }
          });
        }
        return retObj as StructResolveType<S>;
      }

      return Promise.all(promises).then(() => {
        if (errors.length > 0) {
          // throw createValidationError(errors, message, ...objs);
          // console.log(message)
          throw new GuardianError(
            message || defOptions.message,
            undefined,
            errors,
          );
        }
        return retObj as StructResolveType<S>;
      }) as StructResolveType<S>;
    });
  }

  throw makeError(`Unsupported ${typeof struct} type`);
}
