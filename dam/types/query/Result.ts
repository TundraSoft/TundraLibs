export type QueryResult<
  R extends Record<string, unknown> = Record<string, unknown>,
> = {
  type: string;
  time: number;
  count: number;
  data: R[];
};
