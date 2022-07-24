import { BaseGuardian } from "../BaseGuardian.ts";
import { type } from "../utils.ts";
import type { FunctionParameters, FunctionType } from "../types.ts";

/**
 * ObjectGuardian
 *
 * Guardian class for Object data type
 *
 * @class ObjectGuardian
 */
export class ObjectGuardian<
  // deno-lint-ignore ban-types
  P extends FunctionParameters = [object],
> // deno-lint-ignore ban-types
  extends BaseGuardian<FunctionType<object, P>> {
}

export const objectGuard = new ObjectGuardian(type("object")).proxy();
