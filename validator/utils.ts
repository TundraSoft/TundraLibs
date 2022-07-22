import { FunctionParameters, FunctionType, Typeof } from "./types.ts";

export function type<
  T extends keyof Typeof,
  P extends FunctionParameters = [Typeof[T]],
>(type: T): FunctionType<Typeof[T], P> {
  return (...args: P): Typeof[T] => {
    // console.log(type, Array.isArray(args[0]));
    if (type === "array") {
      if (Array.isArray(args[0]) === false) {
        throw new Error(`Expect value to be "${type}"`);
      }
    } else if (typeof args[0] !== type || args[0] === null) {
      throw new Error(
        `Expect value to be "${type}" but got "${typeof args[0]}"`,
      );
    }

    return args[0] as Typeof[T];
  };
}

export function test<P extends FunctionParameters>(
  tester: FunctionType<unknown, P>,
  error?: string,
): FunctionType<P[0], P> {
  return (...args: P): P[0] => {
    if (!tester(...args)) {
      throw Error(error || `Validation test failed`);
    }

    return args[0];
  };
}
