import type { ExecuteResult } from './ExecuteResult.ts';

export type QueryResult<
  ResultType extends Record<string, unknown> = Record<string, unknown>,
> = ExecuteResult & {
  count: number;
  rows: ResultType[];
};
