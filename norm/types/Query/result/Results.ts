import { QueryExecute } from '../result/Execute.ts';

export type QueryResults<
  R extends Record<string, unknown> = Record<string, unknown>,
> = QueryExecute & {
  count: number;
  data: R[];
};
