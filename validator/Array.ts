import { Validator } from "./BaseValidator.ts";
import { type } from "./utils.ts";
import type { FunctionType, ValidatorProxy, FunctionParameters } from "./types.ts";

class ArrayValidator<
  P extends FunctionParameters = [Array<any>],
> extends Validator<FunctionType<Array<any>, P>> {

  of(type: ValidatorProxy<any>): ValidatorProxy<this> {
    // console.log(type(1));
    return this.test((arr: Array<any>) => {
      // console.log(arr);
      arr.every((val) => {
        console.log(val, typeof val);
        type.apply(val);
      })
    }, `Expect array to be of type ${type}`);
  }
}

export const ArrayType = new ArrayValidator(type('array')).proxy();

import { NumberType } from "./NumberValidator.ts";

const b = NumberType.min(0);
const a = ArrayType.of(b)
a([1, 2, 3])