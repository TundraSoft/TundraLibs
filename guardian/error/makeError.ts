import type {
  ErrorLike,
  FunctionParameters,
  ObjectPath,
} from "../types/mod.ts";

import { GuardianError } from "./GuardianError.ts";

export function makeError<P extends FunctionParameters>(
  error: ErrorLike<P>,
  path?: ObjectPath,
  ...args: P
): GuardianError {
  if (error instanceof GuardianError) {
    // console.log(error.children.length)
    if(error.path) {
      if(!path)
        path = [];
      path = [...path, ...error.path.split('.')];
    }
    return new GuardianError(error.message, path, error.children)
    // return error;
  } else if (error instanceof Error) {
    return new GuardianError(error.message, path)
  } else if (typeof error === "string") {
    return new GuardianError(error, path);
  } else if (typeof error === "function") {
    return makeError(error(...args), path);
  }
  return error;
}
