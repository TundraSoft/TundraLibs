import { Validator } from "./BaseValidator.ts";
import { type } from "./utils.ts";
import type { FunctionType, ValidatorProxy, FunctionParameters } from "./types.ts";

export class DateValidator<
  P extends FunctionParameters = [Date],
> extends Validator<FunctionType<Date, P>> {

  //#region Validators
  min(date: Date, message?: string): ValidatorProxy<this>  {
    return this.test((d: Date) => d >= date, message || `Expect date to be after ${date}`);
  }

  max(date: Date, message?: string): ValidatorProxy<this>  {
    return this.test((d: Date) => d <= date, message || `Expect date to be before ${date}`);
  }

  between(min: Date, max: Date, message?: string): ValidatorProxy<this>  {
    return this.test((d: Date) => d >= min && d <= max, message || `Expect date to be between ${min} and ${max}`);
  }

  gte = this.min;

  lte = this.max;

  gt(date: Date, message?: string): ValidatorProxy<this>  {
    return this.test((d: Date) => d > date, message || `Expect date to be after ${date}`);
  }

  lt(date: Date, message?: string): ValidatorProxy<this>  {
    return this.test((d: Date) => d < date, message || `Expect date to be before ${date}`);
  }

  //#endregion Validators
}

export const DateType = new DateValidator(type('date')).proxy();

// const d = DateType.min(new Date(), "Expect date to be after today");
// // console.log(d(new Date('2022-07-22T21:10:45.008Z')));


// function getType<T>(val: T): string {
//   const type = typeof val;
//   if(type === 'object') {
//     if(val instanceof Date) {
//       return 'date';
//     } else if(val instanceof Array) {
//       return 'array';
//     } else if (val instanceof Map) {
//       return 'map';
//     } else if (val instanceof Set) {
//       return 'set';
//     } else {
//       return 'object';
//     }
//   }
//   return typeof val;
// }


// import {StringType} from "./StringValidator.ts";
// import {NumberType} from "./NumberValidator.ts";
// const ob = {
//   name: StringType.min(10).max(100).email(), 
//   age: NumberType.optional().min(18).max(100),
// };

// ob.name('aedasd');

// console.log(getType(1111111111111111111111111111111111111111111111111111111111111111n))
// const c = new WeakSet();
// c.add([1, 2, 3]);
// console.log(c);
// console.log(getType(c));

// console.log(getType(new Date()))
// console.log(getType([1,2,3]))
// console.log(getType(true));
// console.log(getType(new Map<string, string>().set('a', 'b')));
// [1,2,3].every((val) => console.log(getType(val)));
