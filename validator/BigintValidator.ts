import { BaseValidator } from "./BaseValidator.ts";

import { IN_MOBILE_REGEX } from "./constants.ts";

export class BigintValidator extends BaseValidator<bigint> {
  isInteger(message: string) {
    this._addTest((value: bigint) => Number.isInteger(value), message);
  }
  min(len: number, message: string) {
    this._addTest((value: bigint) => value >= len, message);
    return this;
  }
  max(len: number, message: string) {
    this._addTest((value: bigint) => value <= len, message);
    return this;
  }
  between(from: number, to: number, message: string) {
    this._addTest((value: bigint) => value >= from && value <= to, message);
    return this;
  }
  mobile(format = IN_MOBILE_REGEX, message: string) {
    this._addTest((value: bigint) => format.test(value.toString()), message);
    return this;
  }
}
