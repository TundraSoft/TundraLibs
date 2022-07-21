import { Validator } from "./BaseValidator.ts";
import { type } from "./utils.ts";
import type { FunctionType, ValidatorProxy, FunctionParameters } from "./types.ts";

export class BigintValidator<
  P extends FunctionParameters = [bigint],
> extends Validator<FunctionType<bigint, P>> {

  //#region Validators
  min(len: bigint, message?: string): ValidatorProxy<this>  {
    return this.test((num: bigint) => num >= len, message || `Expect number to be at least ${len}`);
  }
  
  max(len: bigint, message?: string): ValidatorProxy<this>  {
    return this.test((num: bigint) => num <= len, message || `Expect number to be at most ${len}`);
  }

  between(min: bigint, max: bigint, message?: string): ValidatorProxy<this>  {
    return this.test((num: bigint) => num >= min && num <= max, message || `Expect number to be between ${min} and ${max}`);
  }

  gte = this.min;

  lte = this.max;

  gt(len: bigint, message?: string): ValidatorProxy<this>  {
    return this.test((num: bigint) => num > len, message || `Expect number to be greater than ${len}`);
  }

  lt(len: bigint, message?: string): ValidatorProxy<this>  {
    return this.test((num: bigint) => num < len, message || `Expect number to be less than ${len}`);
  }

  //#endregion Validators
}

export const BigintType = new BigintValidator(type('bigint')).proxy();