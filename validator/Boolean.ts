import { Validator } from "./BaseValidator.ts";
import { type } from "./utils.ts";
import type { FunctionType, FunctionParameters } from "./types.ts";

export class BooleanValidator<
  P extends FunctionParameters = [boolean],
> extends Validator<FunctionType<boolean, P>> {
}

export const BigintType = new BooleanValidator(type('boolean')).proxy();