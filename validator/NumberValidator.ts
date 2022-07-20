import { BaseValidator } from "./BaseValidator.ts";

import { IN_MOBILE_REGEX } from "./constants.ts";

export class NumberValidator extends BaseValidator<number> {
  isInteger(message: string) {
    this._addTest((value: number) => Number.isInteger(value), message);
  }
  min(len: number, message: string) {
    this._addTest((value: number) => value >= len, message);
    return this;
  }
  max(len: number, message: string) {
    this._addTest((value: number) => value <= len, message);
    return this;
  }
  between(from: number, to: number, message: string) {
    this._addTest((value: number) => value >= from && value <= to, message);
    return this;
  }
  mobile(format = IN_MOBILE_REGEX, message: string) {
    this._addTest((value: number) => format.test(value.toString()), message);
    return this;
  }
}
