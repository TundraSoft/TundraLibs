import type { ValidationFunction, Validators } from "./types.ts";
// export type Typeof = {
//   "string": string;
//   "number": number;
//   // deno-lint-ignore ban-types
//   "object": object;
//   "boolean": boolean;
//   "symbol": symbol;
//   "bigint": bigint;
//   "date": Date;
//   "undefined": undefined;
//   "unknown": unknown;
// };

type Typed =
  | string
  | number
  | object
  | boolean
  | symbol
  | bigint
  | Date
  | undefined
  | unknown;
export class BaseValidator<T extends Typed> {
  protected _tests: Array<Validators<T>> = [];

  public run(value: unknown) {
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
