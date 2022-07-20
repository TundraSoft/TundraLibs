import { BaseValidator } from "./BaseValidator.ts";

export class DateValidator extends BaseValidator<Date> {
  min(min: Date, message: string) {
    this._addTest((value: Date) => value <= min, message);
  }
  max(min: Date, message: string) {
    this._addTest((value: Date) => value >= min, message);
  }
  between(from: Date, to: Date, message: string) {
    this._addTest((value: Date) => value >= from && value <= to, message);
  }
}
