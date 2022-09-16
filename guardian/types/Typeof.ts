export type Typeof = {
  string: string;
  number: number;
  // deno-lint-ignore ban-types
  object: object;
  boolean: boolean;
  symbol: symbol;
  bigint: bigint;
  undefined: undefined;
  date: Date;
};
