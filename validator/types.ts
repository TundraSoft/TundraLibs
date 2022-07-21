export type ObjectProperty = string | number | symbol;

export type Primitive =
  | string
  | number
  | bigint
  | symbol
  | boolean
  | null
  | undefined
  | void
  | bigint
  | Date;

export type Typeof = {
  string: string;
  number: number;
  // deno-lint-ignore ban-types
  object: object;
  boolean: boolean;
  symbol: symbol;
  bigint: bigint;
  date: Date;
  undefined: undefined;
  array: Array<any>;
};

// export type ValidationFunction<T> = (...args: T[]) => boolean;

// export type Validators<T extends Typeof> = {
//   cb: (...args: T[]) => boolean;
//   message: string;
// };

export type FunctionParameters = unknown[];

// deno-lint-ignore no-explicit-any
export type FunctionType<R = any, P extends FunctionParameters = any[]> = (
  ...args: P
) => R;

export type ValidatorProxy<
  V extends { validator: FunctionType },
  F extends FunctionType = V["validator"],
> = Omit<V, "validator" | "proxy"> & { validator: F } & F;
