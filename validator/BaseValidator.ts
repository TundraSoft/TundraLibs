import type { ValidationFunction, Validators } from "./types.ts";

export class BaseValidator<T> {
  protected _tests: Array<Validators<T>> = [];

  public run(value: T | unknown) {
    // First check if its valid type
    value = value as T;
    this._tests.forEach(async (test) => {
      let op = false;
      try {
        op = await test.cb.apply(null, [value as T]);
      } catch {
        op = false;
      }
      if (op === false) {
        throw new Error(test.message);
      }
    });
  }

  protected _addTest(cb: ValidationFunction<T>, message: string) {
    this._tests.push({
      cb: cb,
      message: message,
    });
  }
}
