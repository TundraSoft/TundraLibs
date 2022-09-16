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
    return error;
  } else if (typeof error === "string") {
    return new GuardianError(error, path);
  } else if (typeof error === "function") {
    return makeError(error(...args), path);
  }
  return error;
}
