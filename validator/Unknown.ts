import { ValidatorProxy } from "./types.ts";
import { Validator } from "./BaseValidator.ts";
import { StringValidator } from "./StringValidator.ts";
import { NumberValidator } from "./NumberValidator.ts";
import { BigintValidator } from "./BigintValidator.ts";
import { DateValidator } from "./DateValidator.ts"
import { BooleanValidator } from "./Boolean.ts";

import { type } from "./utils.ts";
import type { FunctionType, FunctionParameters } from "./types.ts";

const BooleanMap = {
  true: true, 
  false: false, 
  t: true, 
  f: false, 
  yes: true,
  no: false, 
  y: true, 
  n: false, 
  1: true, 
  0: false,
}

class UnknownValidator<
  P extends FunctionParameters = [unknown],
> extends Validator<FunctionType<unknown, P>> {

  string(message?: string): ValidatorProxy<StringValidator<P>> {
    return this.transform((input) => {
      if(typeof input === 'string') {
        return input;
      }
      // deno-lint-ignore ban-types
      if(input === null || (typeof input === 'object' && (input as unknown as object).toString === Object.prototype.toString)) {
        throw new Error(message || `Expect value to be a string`);
      };
      return String(input);
    }, StringValidator)
  }

  number(message?: string): ValidatorProxy<NumberValidator<P>> {
    return this.transform((input) => {
      if(typeof input === 'number') {
        return input;
      }
      const value = Number(input);

      if (isNaN(value) && (input as unknown) !== 'NaN') {
        throw new Error(message || `Expect value to be a number`);
      }

      return value;
    }, NumberValidator)
  }

  bigint(message?: string): ValidatorProxy<BigintValidator<P>> {
    return this.transform((input) => {
      if(typeof input === 'bigint') {
        return input;
      }
      const value = BigInt(String(input));

      if ((input as unknown) !== 'NaN') {
        throw new Error(message || `Expect value to be a BigInt`);
      }

      return value;
    }, BigintValidator)
  }

  date(message?: string): ValidatorProxy<DateValidator<P>> {
    return this.transform((input) => {
      if (input instanceof Date) {
        return input;
      }
      if (typeof input === 'number' || typeof input === 'string') {
        const value = new Date(input);

        if (!isNaN(value.getTime())) {
          return value;
        }
      }
      throw new Error(message || `Expect value to be a date`);
    }, DateValidator)
  }

  boolean(message?: string): ValidatorProxy<BooleanValidator<P>> {
    return this.transform((input) => {
      if (typeof input === 'boolean') {
        return input;
      }
      const key = String(input).trim().toLowerCase(), 
        value = BooleanMap[key as keyof typeof BooleanMap];
      if(value == null) {
        throw new Error(message || `Expect value to be a boolean`);
      }
      return value;
    }, BooleanValidator)
  }
  
}

export const UnknownType = new UnknownValidator((input: unknown): unknown => input).proxy();

const a = UnknownType.number();
a('1')
