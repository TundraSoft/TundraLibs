import { Validator } from "./BaseValidator.ts";
import { type } from "./utils.ts";
import type { FunctionType, ValidatorProxy, FunctionParameters } from "./types.ts";

export class NumberValidator<
  P extends FunctionParameters = [number],
> extends Validator<FunctionType<number, P>> {

  //#region Validators
  float(message?: string): ValidatorProxy<this>  {
    return this.test((num: number) => Number.isFinite(num), message || "Expect number to be a float");
  }

  integer(message?: string): ValidatorProxy<this>  {
    return this.test((num: number) => Number.isInteger(num), message || "Expect number to be an integer");
  }

  min(len: number, message?: string): ValidatorProxy<this>  {
    return this.test((num: number) => num >= len, message || `Expect number to be at least ${len}`);
  }

  max(len: number, message?: string): ValidatorProxy<this>  {
    return this.test((num: number) => num <= len, message || `Expect number to be at most ${len}`);
  }

  gte = this.min;

  lte = this.max;
  
  gt(len: number, message?: string): ValidatorProxy<this>  {
    return this.test((num: number) => num > len, message || `Expect number to be greater than ${len}`);
  }

  lt(len: number, message?: string): ValidatorProxy<this>  {
    return this.test((num: number) => num < len, message || `Expect number to be less than ${len}`);
  }

  between(min: number, max: number, message?: string): ValidatorProxy<this>  {
    return this.test((num: number) => num >= min && num <= max, message || `Expect number to be between ${min} and ${max}`);
  }
  //#endregion Validators
}

export const NumberType = new NumberValidator(type('number')).proxy();