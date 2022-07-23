import { BaseGuardian } from "./BaseGuardian.ts";
import { compileStruct } from "./utils.ts";
import type { GuardianProxy, StructValidatorFunction } from "./types.ts";

/**
 * Struct
 *
 * Creates the validator for structured objects.
 *
 * @param struct object The Structured Object to process
 * @param message string The message to display if the validation fails
 * @returns GuardianProxy
 */
export const Struct = function <S>(
  struct: S,
  message?: string,
): GuardianProxy<BaseGuardian<StructValidatorFunction<S>>> {
  return new BaseGuardian(compileStruct(struct, message)).proxy();
};
