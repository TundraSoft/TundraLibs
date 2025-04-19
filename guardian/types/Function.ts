// deno-lint-ignore-file no-explicit-any
export type FunctionParameters = unknown[];

export type FunctionType<R = any, P extends FunctionParameters = any[]> = (
  ...args: P
) => R;
