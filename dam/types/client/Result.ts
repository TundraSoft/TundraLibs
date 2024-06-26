export type ClientResult<
  R extends Record<string, unknown> = Record<string, unknown>,
> = {
  time: number;
  count: number;
  data: Array<R>;
};
